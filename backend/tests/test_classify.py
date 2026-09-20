"""One-click classification, with a stand-in for the TypeSafe client."""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_typesafe_client
from app.core.typesafe import NO_FOLDER


class _Answer:
    """Stand-in for a Choice or Noul answer object."""

    def __init__(self, **fields: Any) -> None:
        self.__dict__.update(fields)


class _Response:
    """Stand-in for `SystemOneResponse`."""

    def __init__(self, *, folder: str, nouls: dict[str, float]) -> None:
        self.choices = {"folder": _Answer(choice=folder, confidence=0.91)}
        self.nouls = {key: _Answer(noul=value) for key, value in nouls.items()}
        self.model = "jev-test"


class FakeTypeSafeClient:
    """Records the request and answers every question that was asked.

    The real API always answers each question, so the fake does too: scripted
    probabilities for the tags named in the test, a low default for the rest.
    """

    def __init__(
        self,
        *,
        folder: str = "Work",
        tags: dict[str, float] | None = None,
        default_probability: float = 0.05,
    ) -> None:
        self.folder = folder
        self.tags = tags if tags is not None else {"Work": 0.82, "Idea": 0.31, "Task": 0.55}
        self.default_probability = default_probability
        self.calls: list[dict[str, Any]] = []

    async def system_one(
        self, *, state: Any, questions: Any, model: str | None = None, **_: Any
    ) -> _Response:
        self.calls.append({"state": state, "questions": questions, "model": model})
        nouls = {
            name: self.tags.get(name.removeprefix("tag:"), self.default_probability)
            for name in questions
            if name.startswith("tag:")
        }
        return _Response(folder=self.folder, nouls=nouls)


@pytest.fixture
def fake_typesafe(account: TestClient) -> FakeTypeSafeClient:
    """Sign in, store an API key, and swap in the fake client."""
    account.patch("/api/settings", json={"typesafe_api_key": "ts_test_key"})
    fake = FakeTypeSafeClient()
    account.app.dependency_overrides[get_typesafe_client] = lambda: fake
    return fake


def test_classify_requires_an_api_key(account: TestClient) -> None:
    note = account.post("/api/notes", json={"title": "Note", "body": "Body"}).json()

    response = account.post(f"/api/notes/{note['id']}/classify", json={})

    assert response.status_code == 400
    assert "API key" in response.json()["detail"]


def test_classify_is_rate_limited(account: TestClient, fake_typesafe: FakeTypeSafeClient) -> None:
    """Every classification costs money, so a runaway client gets a 429."""
    note = account.post("/api/notes", json={"title": "Note", "body": "Body"}).json()

    statuses = [
        account.post(f"/api/notes/{note['id']}/classify", json={}).status_code for _ in range(11)
    ]

    assert statuses[:10] == [200] * 10
    assert statuses[10] == 429
    assert len(fake_typesafe.calls) == 10


def test_classify_returns_folder_and_ranked_tags(
    account: TestClient, fake_typesafe: FakeTypeSafeClient
) -> None:
    folder = account.post("/api/folders", json={"name": "Work"}).json()
    note = account.post(
        "/api/notes", json={"title": "Standup notes", "body": "Ship the release on Friday."}
    ).json()

    response = account.post(f"/api/notes/{note['id']}/classify", json={})

    assert response.status_code == 200
    body = response.json()
    assert body["model"] == "jev-test"
    assert body["folder"] == {"folder_id": folder["id"], "path": "Work", "confidence": 0.91}
    assert body["asked_about_encrypted_content"] is False
    assert [tag["name"] for tag in body["tags"]][:3] == ["Work", "Task", "Idea"]
    assert body["tag_threshold"] == 0.5


def test_classify_sends_one_question_per_candidate(
    account: TestClient, fake_typesafe: FakeTypeSafeClient
) -> None:
    account.post("/api/folders", json={"name": "Work"})
    note = account.post("/api/notes", json={"title": "Note", "body": "Body"}).json()

    account.post(f"/api/notes/{note['id']}/classify", json={})

    call = fake_typesafe.calls[0]
    questions = call["questions"]
    assert "folder" in questions
    assert questions["folder"].criteria["Work"] is None
    assert questions["folder"].criteria[NO_FOLDER] == "No existing folder fits this note."
    assert any(key == "tag:Work" for key in questions)
    assert call["state"]["note"]["title"] == "Note"
    assert call["state"]["note"]["content"] == "Body"


def test_classify_asks_the_model_about_existing_tags_by_name(
    account: TestClient, fake_typesafe: FakeTypeSafeClient
) -> None:
    account.post("/api/tags", json={"name": "Taxes"})
    note = account.post("/api/notes", json={"title": "Note", "body": "Body"}).json()

    account.post(f"/api/notes/{note['id']}/classify", json={})

    candidates = fake_typesafe.calls[0]["state"]["tags"]
    assert candidates[0] == {"name": "Taxes", "meaning": None}


def test_encrypted_notes_need_explicit_consent(
    account: TestClient, fake_typesafe: FakeTypeSafeClient
) -> None:
    note = account.post(
        "/api/notes",
        json={"notebook": "encrypted", "ciphertext": "ZmFrZQ==", "iv": "aXZpdml2aXZpdg=="},
    ).json()

    refused = account.post(f"/api/notes/{note['id']}/classify", json={})
    assert refused.status_code == 400
    assert "Jev will see" in refused.json()["detail"]

    no_text = account.post(f"/api/notes/{note['id']}/classify", json={"consent": True})
    assert no_text.status_code == 400

    assert fake_typesafe.calls == []


def test_encrypted_notes_are_classified_without_storing_the_text(
    account: TestClient, fake_typesafe: FakeTypeSafeClient
) -> None:
    note = account.post(
        "/api/notes",
        json={"notebook": "encrypted", "ciphertext": "ZmFrZQ==", "iv": "aXZpdml2aXZpdg=="},
    ).json()

    response = account.post(
        f"/api/notes/{note['id']}/classify",
        json={"content": "Decrypted in the browser.", "consent": True},
    )

    assert response.status_code == 200
    assert response.json()["asked_about_encrypted_content"] is True
    assert fake_typesafe.calls[0]["state"]["note"]["content"] == "Decrypted in the browser."

    stored = account.get(f"/api/notes/{note['id']}").json()
    assert stored["body"] is None
    assert stored["title"] is None
