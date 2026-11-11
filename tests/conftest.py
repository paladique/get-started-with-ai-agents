"""Never send telemetry or evaluations from automated tests."""
import pytest


@pytest.fixture(autouse=True)
def disable_remote_observability(monkeypatch):
    monkeypatch.setenv("DD_LLMOBS_ENABLED", "false")
    monkeypatch.setenv("DD_LLMOBS_EVALUATIONS_ENABLED", "false")
    monkeypatch.setenv("DEMO_EXPORT_TRACES", "false")
