"""Folders, tags, and the note invariants of each notebook."""

from fastapi.testclient import TestClient


def test_folder_paths_follow_parent_id(account: TestClient) -> None:
    root = account.post("/api/folders", json={"name": "Work"}).json()
    child = account.post("/api/folders", json={"name": "Clients", "parent_id": root["id"]}).json()
    leaf = account.post("/api/folders", json={"name": "Acme", "parent_id": child["id"]}).json()

    paths = {folder["path"] for folder in account.get("/api/folders").json()}

    assert leaf["path"] == "Work/Clients/Acme"
    assert paths == {"Work", "Work/Clients", "Work/Clients/Acme"}


def test_folder_cannot_be_moved_inside_itself(account: TestClient) -> None:
    parent = account.post("/api/folders", json={"name": "Parent"}).json()
    child = account.post("/api/folders", json={"name": "Child", "parent_id": parent["id"]}).json()

    response = account.patch(
        f"/api/folders/{parent['id']}", json={"parent_id": child["id"], "move": True}
    )

    assert response.status_code == 409


def test_deleting_a_folder_keeps_its_notes_and_children(account: TestClient) -> None:
    parent = account.post("/api/folders", json={"name": "Parent"}).json()
    child = account.post("/api/folders", json={"name": "Child", "parent_id": parent["id"]}).json()
    note = account.post("/api/notes", json={"title": "Filed", "folder_id": child["id"]}).json()

    assert account.delete(f"/api/folders/{child['id']}").status_code == 204

    assert account.get(f"/api/notes/{note['id']}").json()["folder_id"] == parent["id"]
    assert account.get(f"/api/folders/{parent['id']}").json()["path"] == "Parent"


def test_tags_are_shared_and_counted(account: TestClient) -> None:
    note = account.post("/api/notes", json={"title": "Tagged", "tags": ["work", "urgent"]}).json()

    assert sorted(note["tags"]) == ["urgent", "work"]

    counts = {tag["name"]: tag["note_count"] for tag in account.get("/api/tags").json()}
    assert counts == {"urgent": 1, "work": 1}

    account.patch(f"/api/notes/{note['id']}", json={"tags": ["work"]})

    counts = {tag["name"]: tag["note_count"] for tag in account.get("/api/tags").json()}
    assert counts["work"] == 1
    assert counts["urgent"] == 0


def test_duplicate_tag_names_are_rejected(account: TestClient) -> None:
    assert account.post("/api/tags", json={"name": "Idea"}).status_code == 201
    assert account.post("/api/tags", json={"name": "idea"}).status_code == 409


def test_renaming_a_tag_keeps_it_on_its_notes(account: TestClient) -> None:
    tag = account.post("/api/tags", json={"name": "Old"}).json()
    note = account.post("/api/notes", json={"title": "Note", "tags": ["Old"]}).json()

    account.patch(f"/api/tags/{tag['id']}", json={"name": "New"})

    assert account.get(f"/api/notes/{note['id']}").json()["tags"] == ["New"]


def test_plain_notes_require_a_title_and_reject_ciphertext(account: TestClient) -> None:
    assert account.post("/api/notes", json={"body": "no title"}).status_code == 422
    assert (
        account.post(
            "/api/notes", json={"title": "Plain", "ciphertext": "AAAA", "iv": "BBBB"}
        ).status_code
        == 422
    )


def test_encrypted_notes_store_only_ciphertext(account: TestClient) -> None:
    rejected = account.post(
        "/api/notes",
        json={"notebook": "encrypted", "title": "Leak", "ciphertext": "AAAA", "iv": "BBBB"},
    )
    assert rejected.status_code == 422

    missing = account.post("/api/notes", json={"notebook": "encrypted", "title": None})
    assert missing.status_code == 422

    created = account.post(
        "/api/notes",
        json={"notebook": "encrypted", "ciphertext": "ZmFrZQ==", "iv": "aXZpdml2aXZpdg=="},
    )
    assert created.status_code == 201

    note = created.json()
    assert note["title"] is None
    assert note["body"] is None
    assert note["ciphertext"] == "ZmFrZQ=="

    stored = account.get(f"/api/notes/{note['id']}").json()
    assert stored["notebook"] == "encrypted"
    assert stored["title"] is None


def test_encrypted_notes_cannot_be_updated_with_plaintext(account: TestClient) -> None:
    note = account.post(
        "/api/notes",
        json={"notebook": "encrypted", "ciphertext": "ZmFrZQ==", "iv": "aXZpdml2aXZpdg=="},
    ).json()

    response = account.patch(f"/api/notes/{note['id']}", json={"title": "Leak"})

    assert response.status_code == 422
