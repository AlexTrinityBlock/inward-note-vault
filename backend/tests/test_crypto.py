"""Encrypted-notebook parameters: the server stores them but cannot use them."""

import base64

from fastapi.testclient import TestClient

SALT = base64.b64encode(b"0123456789abcdef").decode()
IV = base64.b64encode(b"0123456789ab").decode()
VERIFIER = base64.b64encode(b"verifier-blob-0123456789abcdef00").decode()

VALID = {
    "kdf": "PBKDF2-SHA256",
    "salt": SALT,
    "iterations": 600_000,
    "verifier_iv": IV,
    "verifier_ciphertext": VERIFIER,
}


def test_profile_is_empty_before_first_unlock(account: TestClient) -> None:
    body = account.get("/api/crypto/profile").json()

    assert body["initialized"] is False
    assert body["salt"] is None


def test_profile_is_stored_once(account: TestClient) -> None:
    created = account.post("/api/crypto/profile", json=VALID)

    assert created.status_code == 201
    assert created.json()["initialized"] is True
    assert created.json()["salt"] == SALT

    stored = account.get("/api/crypto/profile").json()
    assert stored["iterations"] == 600_000
    assert stored["verifier_ciphertext"] == VERIFIER

    assert account.post("/api/crypto/profile", json=VALID).status_code == 409


def test_profile_rejects_weak_or_malformed_parameters(account: TestClient) -> None:
    assert account.post("/api/crypto/profile", json=VALID | {"iterations": 1000}).status_code == 422
    assert (
        account.post("/api/crypto/profile", json=VALID | {"salt": "not base64!"}).status_code == 422
    )
    assert account.post("/api/crypto/profile", json=VALID | {"salt": "c2hvcnQ="}).status_code == 422
    assert account.post("/api/crypto/profile", json=VALID | {"kdf": "MD5"}).status_code == 422
    assert (
        account.post("/api/crypto/profile", json=VALID | {"verifier_iv": "c2hvcnQ="}).status_code
        == 422
    )


def test_profile_requires_a_session(client: TestClient) -> None:
    assert client.get("/api/crypto/profile").status_code == 401
    assert client.post("/api/crypto/profile", json=VALID).status_code == 401
