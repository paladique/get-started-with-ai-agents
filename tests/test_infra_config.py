"""Offline checks of the ARM deployment graph emitted by Bicep."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = json.loads((ROOT / "infra/main.json").read_text())


def resources(template=TEMPLATE):
    for resource in template.get("resources", []):
        yield resource
        props = resource.get("properties", {})
        nested = props.get("template") if isinstance(props, dict) else None
        if nested:
            yield from resources(nested)


def of_type(name):
    return [r for r in resources() if r["type"] == name]


def test_azd_parameters_are_declared():
    supplied = json.loads((ROOT / "infra/main.parameters.json").read_text())["parameters"]
    assert supplied.keys() <= TEMPLATE["parameters"].keys()
    assert "AZURE_AI_AGENT_DEPLOYMENT_NAME=" in supplied["agentDeploymentName"]["value"]


def test_account_child_writes_are_serialized():
    project, = of_type("Microsoft.CognitiveServices/accounts/projects")
    model, = of_type("Microsoft.CognitiveServices/accounts/deployments")
    assert model["copy"]["mode"] == "serial"
    assert model["copy"]["batchSize"] == 1
    assert model["copy"]["name"] in project["dependsOn"]
    connections = of_type("Microsoft.CognitiveServices/accounts/connections")
    openai = next(r for r in connections if r["properties"]["category"] == "AzureOpenAI")
    insights = next(r for r in connections if r["properties"]["category"] == "AppInsights")
    storage = next(r for r in connections if r["properties"]["category"] == "AzureStorageAccount")
    assert any("projects" in dep for dep in openai["dependsOn"])
    assert any("aoaiConnectionName" in dep for dep in insights["dependsOn"])
    assert any("appInsightConnectionName" in dep for dep in storage["dependsOn"])
    assert "appInsightsId" in insights["condition"]


def test_container_waits_for_pull_role_and_checks_its_ingress_port():
    app, = of_type("Microsoft.App/containerApps")
    assert any("registry-access" in dep for dep in app["dependsOn"])
    container = app["properties"]["template"]["containers"][0]
    probes = container["probes"]
    # Conditional probe arrays are emitted as an ARM expression containing targetPort.
    assert "targetPort" in probes
    assert "Startup" in probes and "Readiness" in probes
    assert app["properties"]["configuration"]["ingress"].count("targetPort") >= 1


def test_runtime_environment_uses_string_values_and_matching_port():
    modules = [r for r in resources() if r["type"] == "Microsoft.Resources/deployments"]
    expression = next(r["properties"]["parameters"]["env"]["value"] for r in modules
                      if "env" in r["properties"].get("parameters", {}))
    assert "'name', 'PORT', 'value', '80'" in expression
    assert "'name', 'WEB_CONCURRENCY', 'value', '1'" in expression
    assert "'ENABLE_AZURE_MONITOR_TRACING', 'value', string(parameters('enableAzureMonitorTracing'))" in expression
    assert "'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT', 'value', string(parameters('otelInstrumentationGenAICaptureMessageContent'))" in expression
    assert "ENV PORT=80" in (ROOT / "src/Dockerfile").read_text()


def test_builtin_role_definitions_are_subscription_scoped():
    roles = of_type("Microsoft.Authorization/roleAssignments")
    assert roles
    for role in roles:
        assert "subscriptionResourceId('Microsoft.Authorization/roleDefinitions'" in role["properties"]["roleDefinitionId"] or "variables(" in role["properties"]["roleDefinitionId"]
    resolved = TEMPLATE["variables"]["resolvedPrincipalId"]
    assert "empty(parameters('principalIdOverride'))" in resolved
    assert "parameters('principalId')" in resolved
