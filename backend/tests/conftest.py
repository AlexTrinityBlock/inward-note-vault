"""Shared test fixtures: a temporary vault served by TestClient."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

PASSWORD = "correct-horse-battery"
USERNAME = "owner"


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    """Settings pointing at a throwaway SQLite file and no .env values."""
    return Settings(
        _env_file=None,
        data_dir=tmp_path,
        cors_origins=[],
        static_dir=tmp_path / "no-spa",
        typesafe_api_key=None,
    )


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    """A TestClient whose lifespan has created the schema."""
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture
def account(client: TestClient) -> TestClient:
    """A client with the owner account created and signed in."""
    created = client.post("/api/setup", json={"username": USERNAME, "password": PASSWORD})
    assert created.status_code == 201

    signed_in = client.post("/api/auth/login", json={"username": USERNAME, "password": PASSWORD})
    assert signed_in.status_code == 200
    return client
