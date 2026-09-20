"""The vault's hard limits: tag size, tag count, and classification windows."""

import pytest
from fastapi.testclient import TestClient

from app.core.limits import (
    TAG_COUNT_MAX,
    TAG_NAME_MAX_CHARS,
    LimitExceeded,
    clean_tag_name,
    split_windows,
)
from tests.conftest import PASSWORD, USERNAME


def test_windows_tile_the_text_without_dropping_anything() -> None:
    assert split_windows("short", 10_000) == ["short"]
    assert split_windows("", 10_000) == [""]

    text = "a" * 25_000
    windows = split_windows(text, 10_000)

    assert [len(window) for window in windows] == [10_000, 10_000, 5_000]
    assert "".join(windows) == text


def test_window_size_of_zero_keeps_the_text_whole() -> None:
    assert split_windows("abc", 0) == ["abc"]


def test_tag_names_are_trimmed_and_bounded() -> None:
    assert clean_tag_name("  Work  ") == "Work"

    with pytest.raises(LimitExceeded):
        clean_tag_name("   ")
    with pytest.raises(LimitExceeded):
        clean_tag_name("x" * (TAG_NAME_MAX_CHARS + 1))
    # Exactly at the limit is fine, CJK included: characters, not bytes.
    assert clean_tag_name("標" * TAG_NAME_MAX_CHARS) == "標" * TAG_NAME_MAX_CHARS


def test_tag_name_length_is_enforced_by_the_api(account: TestClient) -> None:
    assert account.post("/api/tags", json={"name": "x" * TAG_NAME_MAX_CHARS}).status_code == 201

    response = account.post("/api/tags", json={"name": "y" * (TAG_NAME_MAX_CHARS + 1)})

    assert response.status_code == 422


def test_tag_name_length_is_enforced_on_notes_too(account: TestClient) -> None:
    """A note must not smuggle in a tag the tag endpoints would refuse."""
    response = account.post(
        "/api/notes", json={"title": "Note", "tags": ["z" * (TAG_NAME_MAX_CHARS + 1)]}
    )

    assert response.status_code == 422


def test_the_vault_refuses_more_tags_than_the_cap(account: TestClient) -> None:
    for index in range(TAG_COUNT_MAX):
        created = account.post("/api/tags", json={"name": f"tag-{index}"})
        assert created.status_code == 201

    overflow = account.post("/api/tags", json={"name": "one-too-many"})

    assert overflow.status_code == 409
    assert str(TAG_COUNT_MAX) in overflow.json()["detail"]
    assert len(account.get("/api/tags").json()) == TAG_COUNT_MAX


def test_notes_cannot_grow_the_vocabulary_past_the_cap(account: TestClient) -> None:
    """Adding tags through a note hits the same ceiling."""
    for index in range(TAG_COUNT_MAX):
        account.post("/api/tags", json={"name": f"tag-{index}"})

    response = account.post("/api/notes", json={"title": "Note", "tags": ["fresh"]})

    assert response.status_code == 422
    assert str(TAG_COUNT_MAX) in response.json()["detail"]


def test_existing_tags_still_work_at_the_cap(account: TestClient) -> None:
    """Being full must not stop a note from using tags that already exist."""
    for index in range(TAG_COUNT_MAX):
        account.post("/api/tags", json={"name": f"tag-{index}"})

    response = account.post("/api/notes", json={"title": "Note", "tags": ["tag-0"]})

    assert response.status_code == 201
    assert response.json()["tags"] == ["tag-0"]


def test_tag_names_are_unique_case_insensitively(account: TestClient) -> None:
    account.post("/api/tags", json={"name": "Work"})

    assert account.post("/api/tags", json={"name": "work"}).status_code == 409


def test_setup_still_works_with_the_limits_in_place(client: TestClient) -> None:
    """Guard against the limit constants leaking into unrelated paths."""
    created = client.post("/api/setup", json={"username": USERNAME, "password": PASSWORD})

    assert created.status_code == 201
