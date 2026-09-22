"""The vault's hard limits: category size, category count, and classification windows."""

import pytest
from fastapi.testclient import TestClient

from app.core.limits import (
    CATEGORY_COUNT_MAX,
    CATEGORY_NAME_MAX_CHARS,
    LimitExceeded,
    clean_category_name,
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


def test_category_names_are_trimmed_and_bounded() -> None:
    assert clean_category_name("  Work  ") == "Work"

    with pytest.raises(LimitExceeded):
        clean_category_name("   ")
    with pytest.raises(LimitExceeded):
        clean_category_name("x" * (CATEGORY_NAME_MAX_CHARS + 1))
    # Exactly at the limit is fine, CJK included: characters, not bytes.
    assert clean_category_name("標" * CATEGORY_NAME_MAX_CHARS) == "標" * CATEGORY_NAME_MAX_CHARS


def test_category_name_length_is_enforced_by_the_api(account: TestClient) -> None:
    created = account.post("/api/categories", json={"name": "x" * CATEGORY_NAME_MAX_CHARS})
    assert created.status_code == 201

    response = account.post("/api/categories", json={"name": "y" * (CATEGORY_NAME_MAX_CHARS + 1)})

    assert response.status_code == 422


def test_category_name_length_is_enforced_on_notes_too(account: TestClient) -> None:
    """A note must not smuggle in a category the category endpoints would refuse."""
    response = account.post(
        "/api/notes", json={"title": "Note", "categories": ["z" * (CATEGORY_NAME_MAX_CHARS + 1)]}
    )

    assert response.status_code == 422


def test_the_vault_refuses_more_categories_than_the_cap(account: TestClient) -> None:
    for index in range(CATEGORY_COUNT_MAX):
        created = account.post("/api/categories", json={"name": f"category-{index}"})
        assert created.status_code == 201

    overflow = account.post("/api/categories", json={"name": "one-too-many"})

    assert overflow.status_code == 409
    assert str(CATEGORY_COUNT_MAX) in overflow.json()["detail"]
    assert len(account.get("/api/categories").json()) == CATEGORY_COUNT_MAX


def test_notes_cannot_grow_the_vocabulary_past_the_cap(account: TestClient) -> None:
    """Adding categories through a note hits the same ceiling."""
    for index in range(CATEGORY_COUNT_MAX):
        account.post("/api/categories", json={"name": f"category-{index}"})

    response = account.post("/api/notes", json={"title": "Note", "categories": ["fresh"]})

    assert response.status_code == 422
    assert str(CATEGORY_COUNT_MAX) in response.json()["detail"]


def test_existing_categories_still_work_at_the_cap(account: TestClient) -> None:
    """Being full must not stop a note from using categories that already exist."""
    for index in range(CATEGORY_COUNT_MAX):
        account.post("/api/categories", json={"name": f"category-{index}"})

    response = account.post("/api/notes", json={"title": "Note", "categories": ["category-0"]})

    assert response.status_code == 201
    assert response.json()["categories"] == ["category-0"]


def test_category_names_are_unique_case_insensitively(account: TestClient) -> None:
    account.post("/api/categories", json={"name": "Work"})

    assert account.post("/api/categories", json={"name": "work"}).status_code == 409


def test_setup_still_works_with_the_limits_in_place(client: TestClient) -> None:
    """Guard against the limit constants leaking into unrelated paths."""
    created = client.post("/api/setup", json={"username": USERNAME, "password": PASSWORD})

    assert created.status_code == 201
