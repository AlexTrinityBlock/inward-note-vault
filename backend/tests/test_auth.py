"""First-run setup, login and session handling."""

from fastapi.testclient import TestClient

from tests.conftest import PASSWORD, USERNAME


def test_setup_is_needed_on_a_fresh_vault(client: TestClient) -> None:
    assert client.get("/api/setup/status").json() == {"needs_setup": True}
    assert client.get("/api/auth/me").status_code == 401


def test_setup_creates_the_owner_account(client: TestClient) -> None:
    response = client.post(
        "/api/setup",
        json={
            "username": USERNAME,
            "password": PASSWORD,
            "typesafe_api_key": "ts_test_key",
            "auto_classify_enabled": True,
        },
    )

    assert response.status_code == 201
    assert response.json() == {"username": USERNAME}
    assert client.get("/api/setup/status").json() == {"needs_setup": False}

    client.post("/api/auth/login", json={"username": USERNAME, "password": PASSWORD})
    settings = client.get("/api/settings").json()
    assert settings["typesafe_configured"] is True
    assert settings["auto_classify_enabled"] is True


def test_setup_runs_once(client: TestClient) -> None:
    client.post("/api/setup", json={"username": USERNAME, "password": PASSWORD})

    again = client.post("/api/setup", json={"username": "other", "password": PASSWORD})

    assert again.status_code == 409


def test_setup_rejects_a_short_password(client: TestClient) -> None:
    response = client.post("/api/setup", json={"username": USERNAME, "password": "short"})

    assert response.status_code == 422


def test_login_rejects_a_wrong_password(client: TestClient) -> None:
    client.post("/api/setup", json={"username": USERNAME, "password": PASSWORD})

    response = client.post(
        "/api/auth/login", json={"username": USERNAME, "password": "not-the-password"}
    )

    assert response.status_code == 401


def test_session_cookie_grants_and_revokes_access(account: TestClient) -> None:
    assert account.get("/api/auth/me").json() == {"username": USERNAME}

    assert account.post("/api/auth/logout").status_code == 204

    assert account.get("/api/auth/me").status_code == 401


def test_protected_routes_require_a_session(client: TestClient) -> None:
    paths = (
        "/api/notes",
        "/api/folders",
        "/api/categories",
        "/api/settings",
        "/api/crypto/profile",
    )
    for path in paths:
        assert client.get(path).status_code == 401, path


def test_stored_api_key_is_never_returned(account: TestClient) -> None:
    account.patch("/api/settings", json={"typesafe_api_key": "ts_secret_value"})

    body = account.get("/api/settings").text

    assert "ts_secret_value" not in body
    assert account.get("/api/settings").json()["typesafe_configured"] is True
