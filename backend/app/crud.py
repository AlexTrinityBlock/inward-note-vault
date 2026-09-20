"""Database operations for notes."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Note


def list_notes(session: Session, *, limit: int = 50, offset: int = 0) -> list[Note]:
    """Return notes, newest first."""
    statement = select(Note).order_by(Note.created_at.desc()).limit(limit).offset(offset)
    return list(session.scalars(statement))


def get_note(session: Session, note_id: int) -> Note | None:
    """Return a single note, or `None` when it does not exist."""
    return session.get(Note, note_id)


def create_note(session: Session, *, title: str, body: str = "") -> Note:
    """Insert a note and return it."""
    note = Note(title=title, body=body)
    session.add(note)
    session.commit()
    session.refresh(note)
    return note
