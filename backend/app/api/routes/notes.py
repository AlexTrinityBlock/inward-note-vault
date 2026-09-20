"""Note endpoints."""

from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from app import crud
from app.api.deps import SessionDep

router = APIRouter(prefix="/notes", tags=["notes"])


class NoteCreate(BaseModel):
    """Payload for creating a note."""

    title: str = Field(min_length=1, max_length=200)
    body: str = ""


class NoteRead(BaseModel):
    """A stored note."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    body: str
    created_at: datetime
    updated_at: datetime


@router.get("")
def list_notes(session: SessionDep, limit: int = 50, offset: int = 0) -> list[NoteRead]:
    """List notes, newest first."""
    notes = crud.list_notes(session, limit=limit, offset=offset)
    return [NoteRead.model_validate(note) for note in notes]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_note(payload: NoteCreate, session: SessionDep) -> NoteRead:
    """Create a note."""
    note = crud.create_note(session, title=payload.title, body=payload.body)
    return NoteRead.model_validate(note)


@router.get("/{note_id}")
def get_note(note_id: int, session: SessionDep) -> NoteRead:
    """Fetch a single note."""
    note = crud.get_note(session, note_id)
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    return NoteRead.model_validate(note)
