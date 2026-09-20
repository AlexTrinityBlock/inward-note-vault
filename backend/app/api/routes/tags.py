"""Tag endpoints. Tags are shared by plain and encrypted notes."""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app import crud
from app.api.deps import CurrentUser, SessionDep
from app.core.limits import TAG_COUNT_MAX, TAG_NAME_MAX_CHARS, LimitExceeded, clean_tag_name

router = APIRouter(prefix="/tags", tags=["tags"])


class TagRead(BaseModel):
    """A tag and how many notes carry it."""

    id: int
    name: str
    note_count: int


class TagCreate(BaseModel):
    """Payload for creating a tag."""

    name: str = Field(min_length=1, max_length=TAG_NAME_MAX_CHARS)


class TagUpdate(BaseModel):
    """Payload for renaming a tag."""

    name: str = Field(min_length=1, max_length=TAG_NAME_MAX_CHARS)


def _read_all(session: SessionDep) -> list[TagRead]:
    usage = crud.tag_usage(session)
    return [
        TagRead(id=tag.id, name=tag.name, note_count=usage.get(tag.id, 0))
        for tag in crud.list_tags(session)
    ]


@router.get("", operation_id="listTags")
def list_tags(session: SessionDep, _user: CurrentUser) -> list[TagRead]:
    """List every tag with its usage count."""
    return _read_all(session)


@router.post("", status_code=status.HTTP_201_CREATED, operation_id="createTag")
def create_tag(payload: TagCreate, session: SessionDep, _user: CurrentUser) -> TagRead:
    """Create a tag, if the name is new and the vault has room for it."""
    name = payload.name.strip()
    existing = crud.list_tags(session)

    if any(tag.name.lower() == name.lower() for tag in existing):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tag already exists")
    if len(existing) >= TAG_COUNT_MAX:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"The vault already holds the maximum of {TAG_COUNT_MAX} tags",
        )

    tag = crud.get_or_create_tag(session, name)
    session.commit()
    return TagRead(id=tag.id, name=tag.name, note_count=0)


@router.patch("/{tag_id}", operation_id="renameTag")
def rename_tag(
    tag_id: int, payload: TagUpdate, session: SessionDep, _user: CurrentUser
) -> list[TagRead]:
    """Rename a tag."""
    tag = crud.get_tag(session, tag_id)
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")

    try:
        crud.rename_tag(session, tag, clean_tag_name(payload.name))
    except LimitExceeded as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)
        ) from error
    return _read_all(session)


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT, operation_id="deleteTag")
def delete_tag(tag_id: int, session: SessionDep, _user: CurrentUser) -> None:
    """Delete a tag and remove it from every note."""
    tag = crud.get_tag(session, tag_id)
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")
    crud.delete_tag(session, tag)
