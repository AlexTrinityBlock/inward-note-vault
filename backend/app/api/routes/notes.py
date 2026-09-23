"""Note endpoints.

Plain notes keep their title and body on the server. Encrypted notes keep only
ciphertext: the browser encrypts them and the API stores opaque strings, so the
server can never read an encrypted note's title or body.
"""

import asyncio
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app import crud
from app.api.deps import CurrentUser, SessionDep, SettingsDep, TypeSafeDep, reserve_classify_calls
from app.core.limits import LimitExceeded, split_windows
from app.core.typesafe import (
    CATEGORY_THRESHOLD,
    CategoryOption,
    Classification,
    FolderOption,
    average_classifications,
    classify_note,
)
from app.models import NOTEBOOK_ENCRYPTED, NOTEBOOK_PLAIN, Note

router = APIRouter(prefix="/notes", tags=["notes"])

Notebook = Literal["plain", "encrypted"]


class NoteCreate(BaseModel):
    """Payload for creating a note."""

    notebook: Notebook = NOTEBOOK_PLAIN
    title: str | None = Field(default=None, max_length=2000)
    body: str | None = None

    # Encrypted notes only: base64 AES-GCM payload and nonce from the browser.
    ciphertext: str | None = None
    iv: str | None = None

    folder_id: int | None = None
    categories: list[str] = []


class NoteUpdate(BaseModel):
    """Partial note update. `move` applies `folder_id`, including `null`."""

    title: str | None = Field(default=None, max_length=2000)
    body: str | None = None
    ciphertext: str | None = None
    iv: str | None = None
    folder_id: int | None = None
    move: bool = False
    categories: list[str] | None = None


class NoteRead(BaseModel):
    """A note as the API returns it."""

    id: int
    notebook: Notebook
    title: str | None
    body: str | None
    ciphertext: str | None
    iv: str | None
    folder_id: int | None
    categories: list[str]
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


class CategorySuggestionRead(BaseModel):
    """One of the user's categories with Jev's probability for it."""

    name: str
    probability: float


class ClassificationRead(BaseModel):
    """Suggestions from one Jev run. The user accepts or ignores them."""

    model: str | None
    folder: FolderSuggestionRead
    categories: list[CategorySuggestionRead]
    category_threshold: float
    asked_about_encrypted_content: bool
    # A long note is sampled in consecutive windows; the answers above are their
    # average. `samples_failed` counts windows Jev could not answer.
    samples: int
    samples_failed: int
    characters: int


def _read(note: Note) -> NoteRead:
    return NoteRead(
        id=note.id,
        notebook=note.notebook,  # type: ignore[arg-type]
        title=note.title,
        body=note.body,
        ciphertext=note.ciphertext,
        iv=note.iv,
        folder_id=note.folder_id,
        categories=[category.name for category in note.categories],
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


def _apply_categories(session: SessionDep, note: Note, names: list[str]) -> Note:
    """Set a note's categories, reporting a vault limit as a validation error."""
    try:
        return crud.set_note_categories(session, note, names)
    except LimitExceeded as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)
        ) from error


def _require_folder(
    session: SessionDep, folder_id: int | None, notebook: str | None = None
) -> None:
    if folder_id is not None:
        folder = crud.get_folder(session, folder_id)
        if folder is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
        if notebook is not None and folder.notebook != notebook:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Cannot place a {notebook} note in a {folder.notebook} folder",
            )


@router.get("", operation_id="listNotes")
def list_notes(
    session: SessionDep,
    _user: CurrentUser,
    notebook: Annotated[Notebook | None, Query()] = None,
    folder_id: Annotated[int | None, Query()] = None,
    category: Annotated[str | None, Query()] = None,
    q: Annotated[
        str | None,
        Query(description="Search plain notes; encrypted notes cannot be searched server-side"),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[NoteRead]:
    """List notes, newest first, with optional notebook/folder/category/search filters."""
    notes = crud.list_notes(
        session,
        notebook=notebook,
        folder_id=folder_id,
        category=category,
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
    _require_folder(session, payload.folder_id, notebook=payload.notebook)

    note = crud.create_note(
        session,
        notebook=payload.notebook,
        title=payload.title.strip() if payload.title else None,
        body=payload.body if payload.notebook == NOTEBOOK_PLAIN else None,
        ciphertext=payload.ciphertext if payload.notebook == NOTEBOOK_ENCRYPTED else None,
        iv=payload.iv if payload.notebook == NOTEBOOK_ENCRYPTED else None,
        folder_id=payload.folder_id,
    )
    if payload.categories:
        note = _apply_categories(session, note, payload.categories)
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
    """Update a note, its folder, or its categories."""
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
        _require_folder(session, payload.folder_id, notebook=note.notebook)
        fields["folder_id"] = payload.folder_id

    if fields:
        note = crud.update_note(session, note, **fields)
    if payload.categories is not None:
        note = _apply_categories(session, note, payload.categories)
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
    settings: SettingsDep,
    client: TypeSafeDep,
    _user: CurrentUser,
) -> ClassificationRead:
    """Ask Jev where a note belongs: one folder, plus candidate categories.

    Text longer than one window is sampled window by window and averaged. An
    encrypted note is only sent after the caller confirms (`consent`) that
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

    paths = crud.folder_paths(session, notebook=note.notebook)
    folders = [
        FolderOption(id=folder.id, path=paths.get(folder.id, folder.name or ""))
        for folder in crud.list_folders(session, notebook=note.notebook)
    ]

    # Candidates are the user's own categories. Jev selects from what exists; it
    # never invents a category, so an empty vault yields no category questions.
    candidates = [
        CategoryOption(name=category.name, id=category.id)
        for category in crud.list_categories(session)
    ]

    # A note longer than one window is sampled window by window — Jev never sees
    # more than `classify_window_chars` at a time — and the answers are averaged,
    # so no part of the note is dropped.
    windows = split_windows(content, settings.classify_window_chars)
    reserve_classify_calls(_user.id, len(windows), settings.classify_requests_per_minute)

    outcomes = await asyncio.gather(
        *(
            classify_note(
                client, title=title, content=window, folders=folders, categories=candidates
            )
            for window in windows
        ),
        return_exceptions=True,
    )

    samples = [outcome for outcome in outcomes if isinstance(outcome, Classification)]
    failures = [outcome for outcome in outcomes if isinstance(outcome, BaseException)]

    if not samples:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"TypeSafe request failed: {failures[0]}",
        )

    result = average_classifications(samples, folders)

    return ClassificationRead(
        model=result.model,
        folder=FolderSuggestionRead(
            folder_id=result.folder.folder_id,
            path=result.folder.path,
            confidence=result.folder.confidence,
        ),
        categories=[
            CategorySuggestionRead(name=suggestion.name, probability=suggestion.probability)
            for suggestion in result.categories
        ],
        category_threshold=CATEGORY_THRESHOLD,
        asked_about_encrypted_content=note.notebook == NOTEBOOK_ENCRYPTED,
        samples=len(samples),
        samples_failed=len(failures),
        characters=len(content),
    )
