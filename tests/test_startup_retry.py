"""Exercise startup failure handling without credentials, network, or sleeping."""
import asyncio
import logging
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from azure.core.exceptions import HttpResponseError, ServiceRequestError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from util import retry_azure_startup


def http_error(status):
    error = HttpResponseError(message="test response")
    error.status_code = status
    return error


@pytest.mark.parametrize("status", [401, 403, 409, 429, 503])
def test_transient_error_recovers(status, monkeypatch):
    sleep = AsyncMock()
    monkeypatch.setattr(asyncio, "sleep", sleep)
    operation = AsyncMock(side_effect=[http_error(status), "ready"])
    result = asyncio.run(retry_azure_startup(operation, logging.getLogger(), attempts=3))
    assert result == "ready"
    assert operation.await_count == 2
    sleep.assert_awaited_once_with(10)


@pytest.mark.parametrize("error", [http_error(400), http_error(404), ValueError("bad config")])
def test_permanent_error_fails_immediately(error, monkeypatch):
    sleep = AsyncMock()
    monkeypatch.setattr(asyncio, "sleep", sleep)
    operation = AsyncMock(side_effect=error)
    with pytest.raises(type(error)):
        asyncio.run(retry_azure_startup(operation, logging.getLogger(), attempts=3))
    assert operation.await_count == 1
    sleep.assert_not_awaited()


def test_network_retries_are_bounded(monkeypatch):
    sleep = AsyncMock()
    monkeypatch.setattr(asyncio, "sleep", sleep)
    operation = AsyncMock(side_effect=ServiceRequestError("network unavailable"))
    with pytest.raises(ServiceRequestError):
        asyncio.run(retry_azure_startup(operation, logging.getLogger(), attempts=3))
    assert operation.await_count == 3
    assert sleep.await_count == 2
