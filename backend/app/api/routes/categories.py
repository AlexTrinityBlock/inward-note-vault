"""Category endpoints. Categories are shared by plain and encrypted notes."""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app import crud
from app.api.deps import CurrentUser, SessionDep
from app.core.limits import (
    CATEGORY_COUNT_MAX,
    CATEGORY_NAME_MAX_CHARS,
    LimitExceeded,
    clean_category_name,
)

router = APIRouter(prefix="/categories", tags=["categories"])


class CategoryRead(BaseModel):
    """A category and how many notes carry it."""

    id: int
    name: str
    note_count: int


class CategoryCreate(BaseModel):
    """Payload for creating a category."""

    name: str = Field(min_length=1, max_length=CATEGORY_NAME_MAX_CHARS)


class CategoryUpdate(BaseModel):
    """Payload for renaming a category."""

    name: str = Field(min_length=1, max_length=CATEGORY_NAME_MAX_CHARS)


def _read_all(session: SessionDep) -> list[CategoryRead]:
    usage = crud.category_usage(session)
    return [
        CategoryRead(id=category.id, name=category.name, note_count=usage.get(category.id, 0))
        for category in crud.list_categories(session)
    ]


@router.get("", operation_id="listCategories")
def list_categories(session: SessionDep, _user: CurrentUser) -> list[CategoryRead]:
    """List every category with its usage count."""
    return _read_all(session)


@router.post("", status_code=status.HTTP_201_CREATED, operation_id="createCategory")
def create_category(
    payload: CategoryCreate, session: SessionDep, _user: CurrentUser
) -> CategoryRead:
    """Create a category, if the name is new and the vault has room for it."""
    name = payload.name.strip()
    existing = crud.list_categories(session)

    if any(category.name.lower() == name.lower() for category in existing):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Category already exists"
        )
    if len(existing) >= CATEGORY_COUNT_MAX:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"The vault already holds the maximum of {CATEGORY_COUNT_MAX} categories",
        )

    category = crud.get_or_create_category(session, name)
    session.commit()
    return CategoryRead(id=category.id, name=category.name, note_count=0)


@router.patch("/{category_id}", operation_id="renameCategory")
def rename_category(
    category_id: int, payload: CategoryUpdate, session: SessionDep, _user: CurrentUser
) -> list[CategoryRead]:
    """Rename a category."""
    category = crud.get_category(session, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    try:
        crud.rename_category(session, category, clean_category_name(payload.name))
    except LimitExceeded as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)
        ) from error
    return _read_all(session)


@router.delete(
    "/{category_id}", status_code=status.HTTP_204_NO_CONTENT, operation_id="deleteCategory"
)
def delete_category(category_id: int, session: SessionDep, _user: CurrentUser) -> None:
    """Delete a category and remove it from every note."""
    category = crud.get_category(session, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    crud.delete_category(session, category)
