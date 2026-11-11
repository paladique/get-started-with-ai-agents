"""The basic storefront must work without Azure configuration or network calls."""
import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))


def test_storefront_starts_and_serves_catalog_without_azure(monkeypatch):
    from api import main
    monkeypatch.setenv("ENABLE_AI_AGENT", "false")
    monkeypatch.delenv("AZURE_EXISTING_AGENT_ID", raising=False)

    def unexpected_credential():
        raise AssertionError("Storefront must never request Azure credentials")

    monkeypatch.setattr(main, "DefaultAzureCredential", unexpected_credential)
    with TestClient(main.create_app()) as client:
        page = client.get("/")
        assert page.status_code == 200
        assert "Fieldwork" in page.text
        assert page.headers["cache-control"] == "no-store"
        assert "Loading the storefront" in page.text
        assert "Reload storefront" in page.text
        assert client.get("/static/react/storefront-startup.js").status_code == 200
        response = client.get("/api/products")
        assert response.status_code == 200
        products = response.json()
        assert len(products) == 20
        assert {p["id"] for p in products} == set(range(1, 21))
        assert next(p for p in products if p["id"] == 8)["price"] == 350
        assert next(p for p in products if p["id"] == 1)["price"] is None
        assert next(p for p in products if p["id"] == 2)["price"] is None
        assert client.get("/agent").status_code == 503
        assert client.post("/chat", json={}).status_code == 503


def test_catalog_preserves_products_from_every_original_document():
    products = json.loads((ROOT / "src/api/data/catalog.json").read_text())
    assert {p["source"] for p in products} == {p.name for p in (ROOT / "src/files").iterdir()}
    assert all(p["name"] and p["brand"] and p["features"] for p in products)
