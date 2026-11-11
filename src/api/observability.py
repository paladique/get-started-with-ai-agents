"""Datadog Agent Observability transport for the existing OpenTelemetry spans.

Credentials are read only from the server environment. Nothing here is included
in frontend bundles or returned by the public presentation config endpoint.
"""
import logging
import os
from threading import Lock
import time
from urllib.parse import quote
from uuid import uuid4

import requests
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace.export import SpanExportResult

logger = logging.getLogger("azureaiapp")
DEFAULT_APP = "fieldwork-ignite-demo"
SITES = {"datadoghq.com", "us3.datadoghq.com", "us5.datadoghq.com", "datadoghq.eu", "ap1.datadoghq.com", "ap2.datadoghq.com", "uk1.datadoghq.com"}
_lock = Lock()
_delivery = {"trace_batches_accepted": 0, "trace_batches_failed": 0, "evaluation_batches_accepted": 0, "evaluation_batches_failed": 0}


def enabled():
    return os.getenv("DD_LLMOBS_ENABLED", "false").lower() in ("true", "1")


def settings():
    site = os.getenv("DD_SITE", "datadoghq.com").strip()
    # Never send an API key to an arbitrary host supplied as a site value.
    if site not in SITES:
        raise ValueError("DD_SITE must be a supported Datadog site domain.")
    app = os.getenv("DD_LLMOBS_ML_APP", DEFAULT_APP).strip() or DEFAULT_APP
    key = os.getenv("DD_API_KEY", "").strip()
    agentless = os.getenv("DD_LLMOBS_AGENTLESS_ENABLED", "true").lower() in ("true", "1")
    return {"site": site, "app": app, "api_key": key, "agentless": agentless,
            "trace_endpoint": f"https://otlp.{site}/v1/traces",
            "evaluation_endpoint": f"https://api.{site}/api/intake/llm-obs/v2/eval-metric"}


def application_url():
    config = settings()
    host = f"app.{config['site']}" if config["site"] in ("datadoghq.com", "datadoghq.eu") else config["site"]
    return f"https://{host}/llm/applications?query={quote('@ml_app:' + config['app'], safe='')}"


def public_status():
    config = settings()
    active = enabled()
    ready = active and config["agentless"] and bool(config["api_key"])
    with _lock:
        delivery = dict(_delivery)
    return {"enabled": active, "configured": ready, "site": config["site"], "ml_app": config["app"],
            "application_url": application_url(), "transport": "datadog-otlp-http" if ready else "disabled",
            **delivery}


def _record(kind, accepted):
    with _lock:
        _delivery[f"{kind}_batches_{'accepted' if accepted else 'failed'}"] += 1


class DatadogSpanExporter(OTLPSpanExporter):
    def export(self, spans):
        result = super().export(spans)
        accepted = result == SpanExportResult.SUCCESS
        _record("trace", accepted)
        logger.info("Datadog trace intake %s (%s spans).", "accepted" if accepted else "failed", len(spans))
        return result


def create_exporter():
    config = settings()
    if not config["api_key"]:
        logger.warning("Datadog export is enabled but DD_API_KEY is missing; tracing remains local.")
        return None
    if not config["agentless"]:
        logger.warning("Direct Datadog export requires DD_LLMOBS_AGENTLESS_ENABLED=true; configure the existing OTLP collector path otherwise.")
        return None
    return DatadogSpanExporter(
        endpoint=config["trace_endpoint"],
        headers={"dd-api-key": config["api_key"], "dd-otlp-source": "llmobs", "DD-LLMObs-Enabled": "true", "compute_stats": "true"},
        timeout=5,
    )


def evaluation_payload(trace_id, span_id, checks, tags=None):
    config = settings()
    metrics = []
    for check in checks:
        if check["passed"] is None:
            continue
        metrics.append({
            "id": str(uuid4()), "eval_scope": "span",
            "join_on": {"span": {"trace_id": str(int(trace_id, 16)), "span_id": str(int(span_id, 16))}},
            "ml_app": config["app"], "timestamp_ms": int(time.time() * 1000),
            "metric_type": "boolean", "label": check["name"].lower().replace(" ", "_"),
            "boolean_value": bool(check["passed"]), "assessment": "pass" if check["passed"] else "fail",
            "reasoning": check["detail"], "tags": ["source:otel", "evaluation_provider:fieldwork_rules", *(tags or [])],
        })
    return {"data": {"type": "evaluation_metric", "attributes": {"metrics": metrics}}}


def submit_evaluations(trace_id, span_id, checks, tags=None):
    if not enabled() or os.getenv("DD_LLMOBS_EVALUATIONS_ENABLED", "true").lower() not in ("true", "1"):
        return "disabled"
    config = settings()
    if not config["api_key"] or not config["agentless"]:
        return "not_configured"
    try:
        response = requests.post(config["evaluation_endpoint"], headers={"DD-API-KEY": config["api_key"]},
                                 json=evaluation_payload(trace_id, span_id, checks, tags), timeout=5)
        accepted = 200 <= response.status_code < 300
        _record("evaluation", accepted)
        # Do not log response bodies, request headers, or the credential.
        logger.info("Datadog evaluation intake HTTP %s.", response.status_code)
        return "accepted" if accepted else "failed"
    except requests.RequestException:
        _record("evaluation", False)
        logger.warning("Datadog evaluation delivery failed; the application result is unaffected.")
        return "failed"
