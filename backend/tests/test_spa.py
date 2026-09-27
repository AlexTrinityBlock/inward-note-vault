"""Serving the built SPA from the API, so one `uv run` serves everything."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

INDEX = "<!doctype html><html><body>vault client</body></html>"


@pytest.fixture
def spa_client(tmp_path: Path) -> Iterator[TestClient]:
    """An app whose `frontend/dist` equivalent exists."""
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text(INDEX, encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log('vault')", encoding="utf-8")

    settings = Settings(
        _env_file=None, data_dir=tmp_path / "data", cors_origins=[], static_dir=dist
    )
    with TestClient(create_app(settings)) as client:
        yield client


def test_root_serves_the_client(spa_client: TestClient) -> None:
    assert "vault client" in spa_client.get("/").text


def test_client_side_routes_fall_back_to_the_client(spa_client: TestClient) -> None:
    assert "vault client" in spa_client.get("/notes/42").text


def test_built_assets_are_served(spa_client: TestClient) -> None:
    response = spa_client.get("/assets/app.js")

    assert response.status_code == 200
    assert "vault" in response.text


def test_api_routes_are_not_shadowed(spa_client: TestClient) -> None:
    assert spa_client.get("/health").json() == {"status": "ok"}
    assert spa_client.get("/api/setup/status").json() == {"needs_setup": True}


def test_unknown_api_paths_return_json_not_html(spa_client: TestClient) -> None:
    response = spa_client.get("/api/nope")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")


def test_unbuilt_client_explains_itself(client: TestClient) -> None:
    response = client.get("/")

    assert response.status_code == 503
    assert "bun run build" in response.text
