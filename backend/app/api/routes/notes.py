"""Note endpoints.

Plain notes keep their title and body on the server. Encrypted notes keep only
ciphertext: the browser encrypts them and the API stores opaque strings, so the
server can never read an encrypted note's title or body.
"""

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from typesafe_sdk import TypeSafeError

from app import crud
from app.api.deps import ClassifyQuota, CurrentUser, SessionDep, TypeSafeDep
from app.core.typesafe import (
    TAG_THRESHOLD,
    FolderOption,
    TagOption,
    classify_note,
)
from app.models import NOTEBOOK_ENCRYPTED, NOTEBOOK_PLAIN, Note

router = APIRouter(prefix="/notes", tags=["notes"])

Notebook = Literal["plain", "encrypted"]


class NoteCreate(BaseModel):
    """Payload for creating a note."""

    notebook: Notebook = NOTEBOOK_PLAIN
    title: str | None = Field(default=None, max_length=200)
    body: str | None = None

    # Encrypted notes only: base64 AES-GCM payload and nonce from the browser.
    ciphertext: str | None = None
    iv: str | None = None

    folder_id: int | None = None
    tags: list[str] = []


class NoteUpdate(BaseModel):
    """Partial note update. `move` applies `folder_id`, including `null`."""

    title: str | None = Field(default=None, max_length=200)
    body: str | None = None
    ciphertext: str | None = None
    iv: str | None = None
    folder_id: int | None = None
    move: bool = False
    tags: list[str] | None = None


class NoteRead(BaseModel):
    """A note as the API returns it."""

    id: int
    notebook: Notebook
    title: str | None
    body: str | None
    ciphertext: str | None
    iv: str | None
    folder_id: int | None
    tags: list[str]
    created_at: datetime
    updated_at: datetime


class ClassifyRequest(BaseModel):
    """Payload for one-click classification.

    `content` is only needed for encrypted notes, where the server has no text
    to send. It is passed to TypeSafe and never stored.
    """

    content: str | None = None
    consent: bool = False


class FolderSuggestionRead(BaseModel):
    """The chosen folder, if any, and the answer's confidence."""

    folder_id: int | None
    path: str | None
    confidence: float


class TagSuggestionRead(BaseModel):
    """One of the user's tags with Jev's probability for it."""

    name: str
    probability: float


class ClassificationRead(BaseModel):
    """Suggestions from one Jev request. The user accepts or ignores them."""

    model: str | None
    folder: FolderSuggestionRead
    tags: list[TagSuggestionRead]
    tag_threshold: float
    asked_about_encrypted_content: bool


def _read(note: Note) -> NoteRead:
    return NoteRead(
        id=note.id,
        notebook=note.notebook,  # type: ignore[arg-type]
        title=note.title,
        body=note.body,
        ciphertext=note.ciphertext,
        iv=note.iv,
        folder_id=note.folder_id,
        tags=[tag.name for tag in note.tags],
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


def _validate_payload(
    notebook: str, *, title: str | None, body: str | None, ciphertext: str | None, iv: str | None
) -> None:
    """Keep the two notebooks' invariants: plaintext stored, or ciphertext stored."""
    if notebook == NOTEBOOK_ENCRYPTED:
        if title or body:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    "Encrypted notes must not send a title or body; encrypt them into `ciphertext`"
                ),
            )
        if not ciphertext or not iv:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Encrypted notes need both `ciphertext` and `iv`",
            )
    else:
        if not (title or "").strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Plain notes need a title",
            )
        if ciphertext or iv:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Plain notes store `title` and `body`, not ciphertext",
            )


def _require_folder(session: SessionDep, folder_id: int | None) -> None:
    if folder_id is not None and crud.get_folder(session, folder_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")


@router.get("", operation_id="listNotes")
def list_notes(
    session: SessionDep,
    _user: CurrentUser,
    notebook: Annotated[Notebook | None, Query()] = None,
    folder_id: Annotated[int | None, Query()] = None,
    tag: Annotated[str | None, Query()] = None,
    q: Annotated[
        str | None,
        Query(description="Search plain notes; encrypted notes cannot be searched server-side"),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[NoteRead]:
    """List notes, newest first, with optional notebook/folder/tag/search filters."""
    notes = crud.list_notes(
        session,
        notebook=notebook,
        folder_id=folder_id,
        tag=tag,
        query=q,
        limit=limit,
        offset=offset,
    )
    return [_read(note) for note in notes]


@router.post("", status_code=status.HTTP_201_CREATED, operation_id="createNote")
def create_note(payload: NoteCreate, session: SessionDep, _user: CurrentUser) -> NoteRead:
    """Create a note in either notebook."""
    _validate_payload(
        payload.notebook,
        title=payload.title,
        body=payload.body,
        ciphertext=payload.ciphertext,
        iv=payload.iv,
    )
    _require_folder(session, payload.folder_id)

    note = crud.create_note(
        session,
        notebook=payload.notebook,
        title=payload.title.strip() if payload.title else None,
        body=payload.body if payload.notebook == NOTEBOOK_PLAIN else None,
        ciphertext=payload.ciphertext if payload.notebook == NOTEBOOK_ENCRYPTED else None,
        iv=payload.iv if payload.notebook == NOTEBOOK_ENCRYPTED else None,
        folder_id=payload.folder_id,
    )
    if payload.tags:
        note = crud.set_note_tags(session, note, payload.tags)
    return _read(note)


@router.get("/{note_id}", operation_id="getNote")
def get_note(note_id: int, session: SessionDep, _user: CurrentUser) -> NoteRead:
    """Fetch a single note."""
    note = crud.get_note(session, note_id)
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    return _read(note)


@router.patch("/{note_id}", operation_id="updateNote")
def update_note(
    note_id: int, payload: NoteUpdate, session: SessionDep, _user: CurrentUser
) -> NoteRead:
    """Update a note, its folder, or its tags."""
    note = crud.get_note(session, note_id)
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    _validate_payload(
        note.notebook,
        title=payload.title if payload.title is not None else note.title,
        body=payload.body if payload.body is not None else note.body,
        ciphertext=payload.ciphertext if payload.ciphertext is not None else note.ciphertext,
        iv=payload.iv if payload.iv is not None else note.iv,
    )

    fields: dict[str, object] = {}
    if payload.title is not None:
        fields["title"] = payload.title.strip()
    if payload.body is not None:
        fields["body"] = payload.body
    if payload.ciphertext is not None:
        fields["ciphertext"] = payload.ciphertext
    if payload.iv is not None:
        fields["iv"] = payload.iv
    if payload.move:
        _require_folder(session, payload.folder_id)
        fields["folder_id"] = payload.folder_id

    if fields:
        note = crud.update_note(session, note, **fields)
    if payload.tags is not None:
        note = crud.set_note_tags(session, note, payload.tags)
    return _read(note)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT, operation_id="deleteNote")
def delete_note(note_id: int, session: SessionDep, _user: CurrentUser) -> None:
    """Delete a note."""
    note = crud.get_note(session, note_id)
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    crud.delete_note(session, note)


@router.post("/{note_id}/classify", operation_id="classifyNote")
async def classify(
    note_id: int,
    payload: ClassifyRequest,
    session: SessionDep,
    _quota: ClassifyQuota,
    client: TypeSafeDep,
    _user: CurrentUser,
) -> ClassificationRead:
    """Ask Jev where a note belongs: one folder, plus candidate tags.

    Encrypted notes are only sent after the caller confirms (`consent`) that
    TypeSafe will see the decrypted text, which the server passes through
    without storing.
    """
    note = crud.get_note(session, note_id)
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    if note.notebook == NOTEBOOK_ENCRYPTED:
        if not payload.consent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Confirm that Jev will see this note's content before classifying it",
            )
        if not payload.content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Send the decrypted note text in `content` to classify an encrypted note",
            )
        title, content = None, payload.content
    else:
        title = note.title
        content = payload.content if payload.content is not None else (note.body or "")

    paths = crud.folder_paths(session)
    folders = [
        FolderOption(id=folder.id, path=paths[folder.id]) for folder in crud.list_folders(session)
    ]

    # Candidates are the user's own tags. Jev selects from what exists; it never
    # invents a tag, so an empty vault yields no tag questions.
    candidates = [TagOption(name=tag.name, id=tag.id) for tag in crud.list_tags(session)]

    try:
        result = await classify_note(
            client, title=title, content=content, folders=folders, tags=candidates
        )
    except TypeSafeError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"TypeSafe request failed: {error}",
        ) from error

    return ClassificationRead(
        model=result.model,
        folder=FolderSuggestionRead(
            folder_id=result.folder.folder_id,
            path=result.folder.path,
            confidence=result.folder.confidence,
        ),
        tags=[
            TagSuggestionRead(name=suggestion.name, probability=suggestion.probability)
            for suggestion in result.tags
        ],
        tag_threshold=TAG_THRESHOLD,
        asked_about_encrypted_content=note.notebook == NOTEBOOK_ENCRYPTED,
    )
