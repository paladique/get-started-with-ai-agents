"""Presentation behavior and tool authorization against synthetic fixtures only."""
import json
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from api.main import create_app
from api import presentation


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("ENABLE_AI_AGENT", "false")
    monkeypatch.setenv("ENABLE_LIVE_DEMO", "false")
    monkeypatch.setenv("DEMO_EXPORT_TRACES", "false")
    with TestClient(create_app()) as client:
        yield client


@pytest.mark.parametrize("scenario,policy,passed", [
    ("product", "baseline", True), ("product", "guarded", True),
    ("own_order", "baseline", True), ("own_order", "guarded", True),
    ("out_of_scope", "baseline", False), ("out_of_scope", "guarded", True),
    ("unauthorized", "baseline", False), ("unauthorized", "guarded", True),
])
def test_replay_outcomes(client, scenario, policy, passed):
    response = client.post("/api/demo/run", json={"scenario": scenario, "policy": policy, "mode": "replay"})
    assert response.status_code == 200
    data = response.json()
    assert data["passed"] is passed
    assert data["technical_status"] == "completed"
    assert data["model_calls"] == 0
    assert data["input_tokens"] == data["output_tokens"] == 0
    assert int(data["trace_id"], 16) != 0
    assert len(data["trace_id"]) == 32
    assert data["steps"]
    assert all(s["duration_ms"] >= 0 for s in data["steps"])


def test_guard_is_enforced_in_tool_with_server_customer_context():
    run = presentation.Run(presentation.DemoRequest(scenario="unauthorized", policy="guarded"))
    result = run.tool("update_order_address", {"order_id": "FW-1002", "address": "new address", "customer_id": "customer-jamie"})
    assert result["updated"] is False
    assert result["reason"] == "not_order_owner"
    assert run.orders == presentation.ORDERS


def test_baseline_mutation_is_isolated_and_next_request_resets(client):
    original = json.dumps(presentation.ORDERS)
    baseline = client.post("/api/demo/run", json={"scenario": "unauthorized", "policy": "baseline"}).json()
    assert baseline["orders_after"][1]["address"] == "24 Pine Lane"
    assert json.dumps(presentation.ORDERS) == original
    guarded = client.post("/api/demo/run", json={"scenario": "unauthorized", "policy": "guarded"}).json()
    assert guarded["orders_after"] == guarded["orders_before"]
    assert guarded["trace_id"] != baseline["trace_id"]


def test_client_cannot_supply_customer_or_arbitrary_order_payload(client):
    response = client.post("/api/demo/run", json={"scenario": "unauthorized", "customer_id": "customer-jamie"})
    assert response.status_code == 422
    assert client.post("/api/demo/run", json={"scenario": "unknown"}).status_code == 422


def test_live_requires_explicit_operator_opt_in(client):
    response = client.post("/api/demo/run", json={"scenario": "product", "mode": "live"})
    assert response.status_code == 409
    assert "Live mode is disabled" in response.json()["detail"]


def test_live_function_call_loop_reports_actual_usage(monkeypatch):
    import asyncio
    import contextlib
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    import azure.ai.projects.aio
    import azure.identity.aio

    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
    provider = TracerProvider()
    exporter = InMemorySpanExporter()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    monkeypatch.setattr(presentation, "_provider", provider)
    monkeypatch.setenv("ENABLE_LIVE_DEMO", "true")
    monkeypatch.setenv("AZURE_EXISTING_AIPROJECT_ENDPOINT", "https://example.services.ai.azure.com/api/projects/demo")
    monkeypatch.setenv("AZURE_AI_AGENT_DEPLOYMENT_NAME", "test-deployment")
    class Call:
        type = "function_call"
        name = "update_order_address"
        arguments = '{"order_id":"FW-1002","address":"24 Pine Lane"}'
        call_id = "call-test"
        def model_dump(self, **kwargs):
            return {"type": self.type, "name": self.name, "arguments": self.arguments, "call_id": self.call_id}
    responses = AsyncMock(side_effect=[
        SimpleNamespace(id="r1", output=[Call()], output_text="", usage=SimpleNamespace(input_tokens=20, output_tokens=10)),
        SimpleNamespace(id="r2", output=[], output_text="That order does not belong to you, so I have not changed it.", usage=SimpleNamespace(input_tokens=30, output_tokens=15)),
    ])
    @contextlib.asynccontextmanager
    async def credential():
        yield object()
    @contextlib.asynccontextmanager
    async def openai_client(**kwargs):
        yield SimpleNamespace(responses=SimpleNamespace(create=responses))
    @contextlib.asynccontextmanager
    async def project(**kwargs):
        yield SimpleNamespace(get_openai_client=openai_client)
    monkeypatch.setattr(azure.identity.aio, "DefaultAzureCredential", credential)
    monkeypatch.setattr(azure.ai.projects.aio, "AIProjectClient", project)
    result = asyncio.run(presentation.run_demo(presentation.DemoRequest(scenario="unauthorized", policy="guarded", mode="live")))
    assert result["orders_after"] == presentation.ORDERS
    assert result["passed"] is True
    assert result["model_calls"] == 2
    assert result["input_tokens"] == 50
    assert result["output_tokens"] == 25
    assert result["cost_usd"] is None
    assert 'not_order_owner' in responses.call_args_list[1].kwargs["input"][-1]["output"]

    model_spans = [span for span in exporter.get_finished_spans() if span.name == "foundry.responses"]
    assert len(model_spans) == 2
    metadata = json.loads(model_spans[0].attributes["_dd.ml_obs.prompt_tracking"])
    rendered = metadata["chat_template"][0]["content"]
    for key, value in metadata["variables"].items():
        rendered = rendered.replace("{{" + key + "}}", value)
    assert rendered == responses.call_args_list[0].kwargs["instructions"]
    assert metadata["version"].endswith("-guarded")
    assert model_spans[0].attributes["gen_ai.usage.input_tokens"] == 20
    tool_messages = json.loads(model_spans[1].attributes["gen_ai.input.messages"])
    assert any(message["role"] == "tool" for message in tool_messages)
    assert all(span.attributes["gen_ai.conversation.id"] == result["session_id"] for span in exporter.get_finished_spans())
    provider.shutdown()


def test_semantic_failure_has_successful_technical_spans_and_genai_metadata(monkeypatch):
    import asyncio
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
    provider = TracerProvider()
    exporter = InMemorySpanExporter()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    monkeypatch.setattr(presentation, "_provider", provider)
    result = asyncio.run(presentation.run_demo(presentation.DemoRequest(scenario="unauthorized", policy="baseline")))
    spans = exporter.get_finished_spans()
    root = next(s for s in spans if s.name == "fieldwork.assistant")
    tool = next(s for s in spans if s.name == "update_order_address")
    assert root.attributes["evaluation.passed"] is False
    assert root.status.is_ok
    assert tool.status.is_ok
    assert root.attributes["gen_ai.operation.name"] == "invoke_agent"
    assert tool.attributes["gen_ai.operation.name"] == "execute_tool"
    assert tool.attributes["authorization.allowed"] is False
    assert json.loads(tool.attributes["gen_ai.tool.call.result"])["updated"] is True
    assert format(root.context.trace_id, "032x") == result["trace_id"]
    assert tool.context.trace_id == root.context.trace_id
    provider.shutdown()


def test_trace_message_normalization_keeps_tool_evidence_and_omits_reasoning():
    data = presentation.trace_messages([
        {"role": "user", "content": "A synthetic request"},
        {"type": "reasoning", "summary": [{"text": "private reasoning"}]},
        {"type": "function_call", "name": "lookup_product", "call_id": "c1", "arguments": '{"product_id":8}'},
        {"type": "function_call_output", "call_id": "c1", "output": '{"price":350}'},
        {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "It costs $350."}]},
    ])
    assert len(data) == 4
    assert "private reasoning" not in json.dumps(data)
    assert data[1]["parts"][0]["name"] == "lookup_product"
    assert data[2]["parts"][0]["response"] == '{"price":350}'
    assert data[3]["parts"][0]["content"] == "It costs $350."
