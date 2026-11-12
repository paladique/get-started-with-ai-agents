"""Offline configuration tests; no Azure resources or credentials required."""
import json
import os
import sys
from pathlib import Path

import pytest
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import util


@pytest.fixture
def config_root(tmp_path, monkeypatch):
    src = tmp_path / "src"
    src.mkdir()
    monkeypatch.setattr(util, "__file__", str(src / "util.py"))
    monkeypatch.delenv("RUNNING_IN_PRODUCTION", raising=False)
    return tmp_path


def test_root_env_wins_over_azd_and_working_directory(config_root, monkeypatch):
    root_env = config_root / ".env"
    root_env.write_text("DEMO_TEST_SETTING=from-file\n")
    azd = config_root / ".azure"
    (azd / "demo").mkdir(parents=True)
    (azd / "config.json").write_text(json.dumps({"defaultEnvironment": "demo"}))
    (azd / "demo" / ".env").touch()
    monkeypatch.chdir(config_root / "src")
    assert util.get_env_file_path() == str(root_env)
    monkeypatch.setenv("DEMO_TEST_SETTING", "from-process")
    load_dotenv(util.get_env_file_path())
    assert os.environ["DEMO_TEST_SETTING"] == "from-process"


def test_azd_fallback(config_root):
    azd = config_root / ".azure"
    (azd / "demo").mkdir(parents=True)
    (azd / "config.json").write_text(json.dumps({"defaultEnvironment": "demo"}))
    env = azd / "demo" / ".env"
    env.touch()
    assert util.get_env_file_path() == str(env)


def test_missing_or_malformed_azd(config_root):
    assert util.get_env_file_path() is None
    azd = config_root / ".azure"
    azd.mkdir()
    (azd / "config.json").write_text("invalid json")
    assert util.get_env_file_path() is None


def test_production_uses_default_lookup(config_root, monkeypatch):
    (config_root / ".env").touch()
    monkeypatch.setenv("RUNNING_IN_PRODUCTION", "true")
    assert util.get_env_file_path() is None


def test_missing_settings_fail_before_azure_request(monkeypatch):
    monkeypatch.setenv("ENABLE_AI_AGENT", "true")
    from fastapi.testclient import TestClient
    from api.main import create_app
    app = create_app()
    for name in ("AZURE_EXISTING_AIPROJECT_ENDPOINT", "AZURE_EXISTING_AGENT_ID",
                 "AZURE_AI_AGENT_DEPLOYMENT_NAME"):
        monkeypatch.delenv(name, raising=False)
    with pytest.raises(RuntimeError, match="Missing required configuration"):
        with TestClient(app):
            pass


@pytest.mark.parametrize("failure, expected", [
    ("authentication", "Azure authentication failed"),
    ("not_found", "Agent version was not found"),
    ("forbidden", "Permission denied"),
])
def test_agent_lookup_preserves_failure_reason(monkeypatch, failure, expected):
    monkeypatch.setenv("ENABLE_AI_AGENT", "true")
    import contextlib
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from azure.core.exceptions import ClientAuthenticationError, ResourceNotFoundError, HttpResponseError
    from fastapi.testclient import TestClient
    from api import main

    errors = {
        "authentication": ClientAuthenticationError("No credential available"),
        "not_found": ResourceNotFoundError("Missing agent"),
        "forbidden": HttpResponseError("Permission denied"),
    }
    error = errors[failure]
    get_version = AsyncMock(side_effect=error)

    @contextlib.asynccontextmanager
    async def credential():
        yield object()

    @contextlib.asynccontextmanager
    async def project(**kwargs):
        yield SimpleNamespace(agents=SimpleNamespace(get_version=get_version))

    monkeypatch.setattr(main, "DefaultAzureCredential", credential)
    monkeypatch.setattr(main, "AIProjectClient", project)
    monkeypatch.setenv("AZURE_EXISTING_AIPROJECT_ENDPOINT", "https://example.services.ai.azure.com/api/projects/test")
    monkeypatch.setenv("AZURE_EXISTING_AGENT_ID", "test-agent:1")
    monkeypatch.setenv("AZURE_AI_AGENT_DEPLOYMENT_NAME", "test-deployment")
    monkeypatch.setenv("ENABLE_AZURE_MONITOR_TRACING", "false")
    app = main.create_app()
    with pytest.raises(RuntimeError, match=expected) as raised:
        with TestClient(app):
            pass
    assert "No agent version was returned" not in str(raised.value)
    get_version.assert_awaited_once_with("test-agent", "1")


def test_initialization_saves_id_without_changing_other_settings(tmp_path, monkeypatch):
    from dotenv import dotenv_values
    monkeypatch.delenv("RUNNING_IN_PRODUCTION", raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text("# Local config\nAZURE_EXISTING_AGENT_ID=old-agent:1\nWEB_APP_PASSWORD=test-value\n")
    util.save_local_agent_id(str(env_file), "demo-assistant:2")
    values = dotenv_values(env_file)
    assert values["AZURE_EXISTING_AGENT_ID"] == "demo-assistant:2"
    assert values["WEB_APP_PASSWORD"] == "test-value"
    assert "# Local config" in env_file.read_text()


def test_production_initialization_does_not_write_env(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text("AZURE_EXISTING_AGENT_ID=old-agent:1\n")
    monkeypatch.setenv("RUNNING_IN_PRODUCTION", "true")
    util.save_local_agent_id(str(env_file), "demo-assistant:2")
    assert env_file.read_text() == "AZURE_EXISTING_AGENT_ID=old-agent:1\n"


def test_local_app_target_overrides_stale_inherited_values(config_root, monkeypatch):
    from fastapi.testclient import TestClient
    from api.main import create_app
    endpoint = 'https://current.services.ai.azure.com/api/projects/current'
    (config_root / '.env').write_text(
        'AZURE_AI_AGENT_DEPLOYMENT_NAME=gpt-6.1-terra\n'
        f'AZURE_EXISTING_AIPROJECT_ENDPOINT={endpoint}\n'
        'DEMO_TEST_SETTING=from-file\n'
    )
    monkeypatch.setenv('AZURE_AI_AGENT_DEPLOYMENT_NAME', 'gpt-6.1-terra-1')
    monkeypatch.setenv('AZURE_EXISTING_AIPROJECT_ENDPOINT', 'https://old.services.ai.azure.com/api/projects/old')
    monkeypatch.setenv('DEMO_TEST_SETTING', 'from-process')
    monkeypatch.setenv('ENABLE_AI_AGENT', 'false')
    with TestClient(create_app()) as client:
        config = client.get('/api/demo/config').json()
        assert config['live_deployment'] == 'gpt-6.1-terra'
        assert config['live_configured'] is True
        assert os.environ['AZURE_EXISTING_AIPROJECT_ENDPOINT'] == endpoint
        assert os.environ['DEMO_TEST_SETTING'] == 'from-process'


def test_production_keeps_process_model_target(config_root, monkeypatch):
    (config_root / '.env').write_text('AZURE_AI_AGENT_DEPLOYMENT_NAME=local-model\n')
    monkeypatch.setenv('RUNNING_IN_PRODUCTION', 'true')
    monkeypatch.setenv('AZURE_AI_AGENT_DEPLOYMENT_NAME', 'deployed-model')
    monkeypatch.setenv('AZURE_EXISTING_AIPROJECT_ENDPOINT', 'https://production.services.ai.azure.com/api/projects/prod')
    assert util.load_app_environment() is None
    assert os.environ['AZURE_AI_AGENT_DEPLOYMENT_NAME'] == 'deployed-model'
    assert os.environ['AZURE_EXISTING_AIPROJECT_ENDPOINT'] == 'https://production.services.ai.azure.com/api/projects/prod'


def test_empty_local_target_does_not_reuse_stale_deployment(config_root, monkeypatch):
    (config_root / '.env').write_text('AZURE_AI_AGENT_DEPLOYMENT_NAME=\n')
    monkeypatch.setenv('AZURE_AI_AGENT_DEPLOYMENT_NAME', 'stale-model')
    util.load_app_environment()
    assert os.environ['AZURE_AI_AGENT_DEPLOYMENT_NAME'] == ''
