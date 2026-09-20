"""Settings: where the TypeSafe key comes from, and what the API reports."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_typesafe_client
from app.core.config import Settings
from app.main import create_app
from tests.conftest import PASSWORD, USERNAME


class _FakeModels:
    """Stand-in for the models resource."""

    def __init__(self) -> None:
        self.calls = 0

    async def list(self) -> object:
        self.calls += 1
        return type("Response", (), {"models": [type("Model", (), {"name": "jev-test"})()]})()


class _FakeClient:
    def __init__(self) -> None:
        self.models = _FakeModels()


@pytest.fixture
def env_key_client(tmp_path: Path) -> TestClient:
    """A vault with no stored key, where only the environment provides one."""
    settings = Settings(
        _env_file=None,
        data_dir=tmp_path,
        cors_origins=[],
        static_dir=tmp_path / "no-spa",
        typesafe_api_key="ts_from_environment",
    )
    with TestClient(create_app(settings)) as client:
        client.post("/api/setup", json={"username": USERNAME, "password": PASSWORD})
        client.post("/api/auth/login", json={"username": USERNAME, "password": PASSWORD})
        yield client


def test_environment_key_counts_as_configured(env_key_client: TestClient) -> None:
    """A key from the environment works for classification, so say so."""
    body = env_key_client.get("/api/settings").json()

    assert body["typesafe_configured"] is True
    assert body["typesafe_source"] == "env"


def test_verify_accepts_the_environment_key(env_key_client: TestClient) -> None:
    """The verify endpoint must resolve the key the same way Jev does."""
    fake = _FakeClient()
    env_key_client.app.dependency_overrides[get_typesafe_client] = lambda: fake

    response = env_key_client.post("/api/settings/typesafe/verify")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "models": ["jev-test"], "detail": None}
    assert fake.models.calls == 1


def test_stored_key_wins_over_the_environment(env_key_client: TestClient) -> None:
    env_key_client.patch("/api/settings", json={"typesafe_api_key": "ts_stored"})

    body = env_key_client.get("/api/settings").json()

    assert body["typesafe_source"] == "stored"


def test_clearing_the_stored_key_falls_back_to_the_environment(
    env_key_client: TestClient,
) -> None:
    env_key_client.patch("/api/settings", json={"typesafe_api_key": "ts_stored"})

    body = env_key_client.patch("/api/settings", json={"clear_typesafe_api_key": True}).json()

    assert body["typesafe_configured"] is True
    assert body["typesafe_source"] == "env"


def test_verify_without_any_key_says_so(account: TestClient) -> None:
    """`account` has neither a stored key nor one in the environment."""
    response = account.post("/api/settings/typesafe/verify")

    assert response.status_code == 400
    assert "TYPESAFE_API_KEY" in response.json()["detail"]


def test_classify_without_any_key_says_so(account: TestClient) -> None:
    """Classification resolves the key the same way, with the same answer."""
    note = account.post("/api/notes", json={"title": "Note", "body": "Body"}).json()

    response = account.post(f"/api/notes/{note['id']}/classify", json={})

    assert response.status_code == 400
    assert "TYPESAFE_API_KEY" in response.json()["detail"]


def test_classify_and_verify_agree_on_the_key(env_key_client: TestClient) -> None:
    """Both paths resolve the environment key, so neither can drift."""
    from app.api.routes.settings import resolve_api_key  # noqa: PLC0415

    app_settings = env_key_client.app.state.settings
    with next(env_key_client.app.state.db.session()) as session:
        key, source = resolve_api_key(session, app_settings)

    assert key == "ts_from_environment"
    assert source == "env"
