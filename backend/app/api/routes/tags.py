"""Tag endpoints. Tags are shared by plain and encrypted notes."""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app import crud
from app.api.deps import CurrentUser, SessionDep

router = APIRouter(prefix="/tags", tags=["tags"])


class TagRead(BaseModel):
    """A tag and how many notes carry it."""

    id: int
    name: str
    note_count: int


class TagCreate(BaseModel):
    """Payload for creating a tag."""

    name: str = Field(min_length=1, max_length=80)


class TagUpdate(BaseModel):
    """Payload for renaming a tag."""

    name: str = Field(min_length=1, max_length=80)


def _read_all(session: SessionDep) -> list[TagRead]:
    usage = crud.tag_usage(session)
    return [
        TagRead(id=tag.id, name=tag.name, note_count=usage.get(tag.id, 0))
        for tag in crud.list_tags(session)
    ]


@router.get("")
def list_tags(session: SessionDep, _user: CurrentUser) -> list[TagRead]:
    """List every tag with its usage count."""
    return _read_all(session)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_tag(payload: TagCreate, session: SessionDep, _user: CurrentUser) -> TagRead:
    """Create a tag, if the name is new."""
    name = payload.name.strip()
    if any(tag.name.lower() == name.lower() for tag in crud.list_tags(session)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tag already exists")
    tag = crud.get_or_create_tag(session, name)
    session.commit()
    return TagRead(id=tag.id, name=tag.name, note_count=0)


@router.patch("/{tag_id}")
def rename_tag(
    tag_id: int, payload: TagUpdate, session: SessionDep, _user: CurrentUser
) -> list[TagRead]:
    """Rename a tag."""
    tag = crud.get_tag(session, tag_id)
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")
    crud.rename_tag(session, tag, payload.name)
    return _read_all(session)


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(tag_id: int, session: SessionDep, _user: CurrentUser) -> None:
    """Delete a tag and remove it from every note."""
    tag = crud.get_tag(session, tag_id)
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")
    crud.delete_tag(session, tag)
