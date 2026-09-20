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

    def __init__(
        self,
        *,
        folder: str,
        nouls: dict[str, float],
        folder_probabilities: dict[str, float] | None = None,
    ) -> None:
        self.choices = {
            "folder": _Answer(
                choice=folder,
                confidence=0.91,
                probabilities=folder_probabilities or {folder: 1.0},
            )
        }
        self.nouls = {key: _Answer(noul=value) for key, value in nouls.items()}
        self.model = "jev-test"


class _Scripted:
    """One window's scripted answer."""

    def __init__(
        self,
        *,
        folder: str = "Work",
        folder_probabilities: dict[str, float] | None = None,
        tags: dict[str, float] | None = None,
        error: str | None = None,
    ) -> None:
        self.folder = folder
        self.folder_probabilities = folder_probabilities
        self.tags = tags
        self.error = error


class FakeTypeSafeClient:
    """Records requests and answers every question that was asked.

    The real API always answers each question, so the fake does too: scripted
    probabilities for the tags named in the test, a low default for the rest.
    Pass `script` to answer successive calls differently, which is how the
    window-averaging tests work.
    """

    def __init__(
        self,
        *,
        folder: str = "Work",
        tags: dict[str, float] | None = None,
        default_probability: float = 0.05,
        script: list[_Scripted] | None = None,
    ) -> None:
        self.folder = folder
        self.tags = tags if tags is not None else {"Work": 0.82, "Idea": 0.31, "Task": 0.55}
        self.default_probability = default_probability
        self.script = script
        self.calls: list[dict[str, Any]] = []

    async def system_one(
        self, *, state: Any, questions: Any, model: str | None = None, **_: Any
    ) -> _Response:
        index = len(self.calls)
        self.calls.append({"state": state, "questions": questions, "model": model})

        step = (
            self.script[min(index, len(self.script) - 1)]
            if self.script
            else _Scripted(folder=self.folder, tags=self.tags)
        )
        if step.error:
            raise RuntimeError(step.error)

        scripted = step.tags if step.tags is not None else self.tags
        nouls = {
            name: scripted.get(name.removeprefix("tag:"), self.default_probability)
            for name in questions
            if name.startswith("tag:")
        }
        return _Response(
            folder=step.folder,
            nouls=nouls,
            folder_probabilities=step.folder_probabilities,
        )


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


def test_long_note_is_sampled_window_by_window_and_averaged(
    account: TestClient, fake_typesafe: FakeTypeSafeClient
) -> None:
    """A note over one window becomes several requests whose answers are averaged."""
    account.post("/api/tags", json={"name": "Work"})
    account.post("/api/tags", json={"name": "Idea"})
    fake_typesafe.script = [
        _Scripted(tags={"Work": 0.9, "Idea": 0.2}),
        _Scripted(tags={"Work": 0.6, "Idea": 0.8}),
        _Scripted(tags={"Work": 0.3, "Idea": 0.5}),
    ]

    # 25,000 characters at the default 10,000-character window: three samples.
    body = "abcdefghij" * 2_500
    note = account.post("/api/notes", json={"title": "Long", "body": body}).json()

    response = account.post(f"/api/notes/{note['id']}/classify", json={})

    assert response.status_code == 200
    body_json = response.json()
    assert body_json["samples"] == 3
    assert body_json["samples_failed"] == 0
    assert body_json["characters"] == 25_000
    assert len(fake_typesafe.calls) == 3

    # Each window is exactly one window long, and they tile the note.
    sent = [len(call["state"]["note"]["content"]) for call in fake_typesafe.calls]
    assert sent == [10_000, 10_000, 5_000]

    averages = {tag["name"]: tag["probability"] for tag in body_json["tags"]}
    assert averages["Work"] == pytest.approx((0.9 + 0.6 + 0.3) / 3)
    assert averages["Idea"] == pytest.approx((0.2 + 0.8 + 0.5) / 3)
    # Average of the two, ranked: Work 0.60 beats Idea 0.50.
    assert [tag["name"] for tag in body_json["tags"]] == ["Work", "Idea"]


def test_averaged_folder_is_the_mean_distribution(
    account: TestClient, fake_typesafe: FakeTypeSafeClient
) -> None:
    """Folders average their whole distribution before a winner is taken."""
    work = account.post("/api/folders", json={"name": "Work"}).json()
    home = account.post("/api/folders", json={"name": "Home"}).json()
    fake_typesafe.script = [
        _Scripted(folder="Work", folder_probabilities={"Work": 0.9, "Home": 0.1}),
        _Scripted(folder="Home", folder_probabilities={"Work": 0.4, "Home": 0.6}),
    ]

    note = account.post("/api/notes", json={"title": "Two windows", "body": "x" * 15_000}).json()

    body = account.post(f"/api/notes/{note['id']}/classify", json={}).json()

    assert body["samples"] == 2
    # Work averages 0.65 against Home's 0.35, even though the last window said Home.
    assert body["folder"]["folder_id"] == work["id"]
    assert body["folder"]["path"] == "Work"
    assert home["id"] is not None


def test_a_windows_failure_does_not_lose_the_rest(
    account: TestClient, fake_typesafe: FakeTypeSafeClient
) -> None:
    """One bad window is skipped and reported, not fatal."""
    account.post("/api/tags", json={"name": "Work"})
    fake_typesafe.script = [
        _Scripted(tags={"Work": 0.8}),
        _Scripted(error="upstream hiccup"),
        _Scripted(tags={"Work": 0.4}),
    ]
    note = account.post("/api/notes", json={"title": "Long", "body": "y" * 25_000}).json()

    body = account.post(f"/api/notes/{note['id']}/classify", json={}).json()

    assert body["samples"] == 2
    assert body["samples_failed"] == 1
    assert body["tags"][0]["probability"] == pytest.approx(0.6)


def test_every_window_failing_is_a_502(
    account: TestClient, fake_typesafe: FakeTypeSafeClient
) -> None:
    fake_typesafe.script = [_Scripted(error="no route to host")]
    note = account.post("/api/notes", json={"title": "Note", "body": "z" * 25_000}).json()

    response = account.post(f"/api/notes/{note['id']}/classify", json={})

    assert response.status_code == 502
    assert "TypeSafe request failed" in response.json()["detail"]


def test_classify_returns_folder_and_ranked_tags(
    account: TestClient, fake_typesafe: FakeTypeSafeClient
) -> None:
    folder = account.post("/api/folders", json={"name": "Work"}).json()
    for name in ("Work", "Task", "Idea"):
        account.post("/api/tags", json={"name": name})
    note = account.post(
        "/api/notes", json={"title": "Standup notes", "body": "Ship the release on Friday."}
    ).json()

    response = account.post(f"/api/notes/{note['id']}/classify", json={})

    assert response.status_code == 200
    body = response.json()
    assert body["model"] == "jev-test"
    assert body["folder"] == {"folder_id": folder["id"], "path": "Work", "confidence": 0.91}
    assert body["asked_about_encrypted_content"] is False
    # Only the user's own tags are candidates, ranked by probability.
    assert [tag["name"] for tag in body["tags"]] == ["Work", "Task", "Idea"]
    assert body["tag_threshold"] == 0.5


def test_classify_asks_nothing_about_tags_in_an_empty_vault(
    account: TestClient, fake_typesafe: FakeTypeSafeClient
) -> None:
    """Jev selects among existing tags; it never invents one to suggest."""
    note = account.post("/api/notes", json={"title": "Note", "body": "Body"}).json()

    body = account.post(f"/api/notes/{note['id']}/classify", json={}).json()

    assert body["tags"] == []
    assert "folder" in fake_typesafe.calls[0]["questions"]
    assert not [key for key in fake_typesafe.calls[0]["questions"] if key.startswith("tag:")]


def test_classify_sends_one_question_per_candidate(
    account: TestClient, fake_typesafe: FakeTypeSafeClient
) -> None:
    account.post("/api/folders", json={"name": "Work"})
    account.post("/api/tags", json={"name": "Work"})
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
