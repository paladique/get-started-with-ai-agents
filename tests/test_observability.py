"""Verify transport credentials, correlation, and non-disruptive delivery failures."""
import asyncio
import json
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest
import requests
from fastapi.testclient import TestClient
from opentelemetry.sdk.trace.export import SpanExportResult

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from api import observability, presentation
from api.main import create_app


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv('DD_LLMOBS_ENABLED', 'true')
    monkeypatch.setenv('DD_LLMOBS_AGENTLESS_ENABLED', 'true')
    monkeypatch.setenv('DD_LLMOBS_EVALUATIONS_ENABLED', 'true')
    monkeypatch.setenv('DD_SITE', 'us3.datadoghq.com')
    monkeypatch.setenv('DD_API_KEY', 'test-private-key')
    monkeypatch.setenv('DD_LLMOBS_ML_APP', 'fieldwork-test')


def test_credentials_are_server_only_and_transport_targets_us3(configured, monkeypatch):
    captured = {}
    def exporter(**kwargs):
        captured.update(kwargs)
        return object()
    monkeypatch.setattr(observability, 'DatadogSpanExporter', exporter)
    observability.create_exporter()
    assert captured['endpoint'] == 'https://otlp.us3.datadoghq.com/v1/traces'
    assert captured['headers']['dd-api-key'] == 'test-private-key'
    assert captured['headers']['DD-LLMObs-Enabled'] == 'true'
    status = observability.public_status()
    assert status['configured'] is True
    assert 'test-private-key' not in json.dumps(status)
    assert 'api_key' not in status
    assert status['application_url'] == 'https://us3.datadoghq.com/llm/applications?query=%40ml_app%3Afieldwork-test'


def test_site_cannot_redirect_credentials_to_an_arbitrary_host(configured, monkeypatch):
    monkeypatch.setenv('DD_SITE', 'attacker.example')
    with pytest.raises(ValueError, match='supported Datadog site'):
        observability.create_exporter()


@pytest.mark.parametrize('trace_id,expected_trace_id', [
    ('ffffffffffffffff1111111111111111', 'ffffffffffffffff1111111111111111'),
    ('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 'ffffffffffffffffffffffffffffffff'),
    ('000000000000000000000000000000ab', '000000000000000000000000000000ab'),
    ('12345678901234567890123456789012', '12345678901234567890123456789012'),
])
def test_evaluations_preserve_128bit_trace_and_skip_unexercised_rules(configured, trace_id, expected_trace_id):
    span_id = 'abcdef0123456789'
    payload = observability.evaluation_payload(trace_id, span_id, [
        {'name': 'Customer isolation', 'passed': False, 'detail': 'Another fixture order changed.'},
        {'name': 'Catalog grounding', 'passed': None, 'detail': 'Not exercised.'},
    ])
    metrics = payload['data']['attributes']['metrics']
    assert len(metrics) == 1
    metric = metrics[0]
    assert metric['join_on']['span'] == {'trace_id': expected_trace_id, 'span_id': str(int(span_id, 16))}
    assert metric['boolean_value'] is False
    assert metric['assessment'] == 'fail'
    assert 'source:otel' in metric['tags']
    assert 'evaluation_provider:fieldwork_rules' in metric['tags']


@pytest.mark.parametrize('status,delivery', [(202, 'accepted'), (403, 'failed'), (500, 'failed')])
def test_intake_status_is_reported_without_logging_credentials(configured, monkeypatch, caplog, status, delivery):
    def post(endpoint, **kwargs):
        assert endpoint == 'https://api.us3.datadoghq.com/api/intake/llm-obs/v2/eval-metric'
        assert kwargs['headers']['DD-API-KEY'] == 'test-private-key'
        return SimpleNamespace(status_code=status)
    monkeypatch.setattr(requests, 'post', post)
    assert observability.submit_evaluations('ab', 'cd', []) == delivery
    assert 'test-private-key' not in caplog.text


def test_telemetry_failure_preserves_assistant_result(configured, monkeypatch):
    monkeypatch.setenv('ENABLE_AI_AGENT', 'false')
    monkeypatch.setattr(observability, 'create_exporter', lambda: None)
    def unavailable(*args, **kwargs):
        raise requests.Timeout('Synthetic connection timeout')
    monkeypatch.setattr(requests, 'post', unavailable)
    with TestClient(create_app()) as client:
        response = client.post('/api/demo/run', json={'scenario': 'unauthorized', 'policy': 'baseline', 'session_id': 'rehearsal-test'})
        assert response.status_code == 200
        result = response.json()
        assert result['technical_status'] == 'completed'
        assert result['passed'] is False
        assert result['datadog_evaluation_delivery'] == 'failed'
        assert result['session_id'] == 'rehearsal-test'
        assert result['orders_after'][1]['address'] == '24 Pine Lane'
        assert 'test-private-key' not in json.dumps(client.get('/api/demo/config').json())


def test_trace_delivery_counters_follow_exporter_receipt(configured, monkeypatch):
    monkeypatch.setattr(observability.OTLPSpanExporter, 'export', lambda self, spans: SpanExportResult.SUCCESS)
    exporter = observability.create_exporter()
    before = observability.public_status()['trace_batches_accepted']
    assert exporter.export([]) == SpanExportResult.SUCCESS
    assert observability.public_status()['trace_batches_accepted'] == before + 1
    monkeypatch.setattr(observability.OTLPSpanExporter, 'export', lambda self, spans: SpanExportResult.FAILURE)
    before = observability.public_status()['trace_batches_failed']
    assert exporter.export([]) == SpanExportResult.FAILURE
    assert observability.public_status()['trace_batches_failed'] == before + 1
    exporter.shutdown()


def test_missing_key_is_distinct_from_successful_configuration(configured, monkeypatch):
    monkeypatch.setenv('DD_API_KEY', '')
    assert observability.public_status()['configured'] is False
    assert observability.create_exporter() is None
    assert observability.submit_evaluations('ab', 'cd', []) == 'not_configured'


def test_disabled_export_never_calls_intake(monkeypatch):
    def unexpected(*args, **kwargs):
        pytest.fail('Disabled telemetry must not call Datadog')
    monkeypatch.setattr(requests, 'post', unexpected)
    assert observability.submit_evaluations('ab', 'cd', []) == 'disabled'


def test_run_evaluations_reference_exported_root_span(configured, monkeypatch):
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

    monkeypatch.setenv('ENABLE_AI_AGENT', 'false')
    provider = TracerProvider()
    exporter = InMemorySpanExporter()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    monkeypatch.setattr(presentation, '_provider', provider)
    submitted = []
    def post(endpoint, **kwargs):
        submitted.append(kwargs['json'])
        return SimpleNamespace(status_code=202)
    monkeypatch.setattr(requests, 'post', post)
    with TestClient(create_app()) as client:
        response = client.post('/api/demo/run', json={'scenario': 'unauthorized', 'policy': 'guarded'})
        assert response.status_code == 200
        result = response.json()
        root, = [span for span in exporter.get_finished_spans() if span.name == 'fieldwork.assistant']
        assert result['datadog_evaluation_delivery'] == 'accepted'
        assert len(submitted) == 1
        metrics = submitted[0]['data']['attributes']['metrics']
        assert metrics
        expected = {
            'trace_id': format(root.context.trace_id, '032x'),
            'span_id': str(root.context.span_id),
        }
        assert expected['trace_id'] == result['trace_id']
        assert int(expected['span_id']) == int(result['root_span_id'], 16)
        for metric in metrics:
            assert metric['join_on']['span'] == expected
            assert len(metric['join_on']['span']['trace_id']) == 32
            assert metric['ml_app'] == 'fieldwork-test'
            assert 'source:otel' in metric['tags']
