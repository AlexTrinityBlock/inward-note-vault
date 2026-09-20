"""Folder tree endpoints. Nesting is a `parent_id` column on `folders`."""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from app import crud
from app.api.deps import CurrentUser, SessionDep

router = APIRouter(prefix="/folders", tags=["folders"])


class FolderRead(BaseModel):
    """A folder plus its readable path."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    parent_id: int | None
    path: str


class FolderCreate(BaseModel):
    """Payload for creating a folder."""

    name: str = Field(min_length=1, max_length=120)
    parent_id: int | None = None


class FolderUpdate(BaseModel):
    """Payload for renaming and/or moving a folder.

    `parent_id` is only applied when `move` is true, so `parent_id: null` with
    `move: true` moves the folder back to the root.
    """

    name: str | None = Field(default=None, min_length=1, max_length=120)
    parent_id: int | None = None
    move: bool = False


def _read(session: SessionDep, folder_id: int) -> FolderRead:
    folder = crud.get_folder(session, folder_id)
    if folder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    return FolderRead(
        id=folder.id,
        name=folder.name,
        parent_id=folder.parent_id,
        path=crud.folder_paths(session).get(folder.id, folder.name),
    )


@router.get("", operation_id="listFolders")
def list_folders(session: SessionDep, _user: CurrentUser) -> list[FolderRead]:
    """List every folder, flat, with its path."""
    paths = crud.folder_paths(session)
    return [
        FolderRead(
            id=folder.id, name=folder.name, parent_id=folder.parent_id, path=paths[folder.id]
        )
        for folder in crud.list_folders(session)
    ]


@router.post("", status_code=status.HTTP_201_CREATED, operation_id="createFolder")
def create_folder(payload: FolderCreate, session: SessionDep, _user: CurrentUser) -> FolderRead:
    """Create a folder, optionally inside another one."""
    if payload.parent_id is not None and crud.get_folder(session, payload.parent_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent folder not found")

    folder = crud.create_folder(session, name=payload.name.strip(), parent_id=payload.parent_id)
    return _read(session, folder.id)


@router.get("/{folder_id}", operation_id="getFolder")
def get_folder(folder_id: int, session: SessionDep, _user: CurrentUser) -> FolderRead:
    """Fetch a single folder."""
    return _read(session, folder_id)


@router.patch("/{folder_id}", operation_id="updateFolder")
def update_folder(
    folder_id: int, payload: FolderUpdate, session: SessionDep, _user: CurrentUser
) -> FolderRead:
    """Rename a folder and/or move it in the tree."""
    folder = crud.get_folder(session, folder_id)
    if folder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")

    if payload.move and payload.parent_id is not None:
        if crud.get_folder(session, payload.parent_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Parent folder not found"
            )
        if crud.is_descendant(session, folder_id, payload.parent_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A folder cannot be moved inside itself",
            )

    crud.update_folder(
        session,
        folder,
        name=payload.name.strip() if payload.name else None,
        parent_id=payload.parent_id,
        move=payload.move,
    )
    return _read(session, folder.id)


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT, operation_id="deleteFolder")
def delete_folder(folder_id: int, session: SessionDep, _user: CurrentUser) -> None:
    """Delete a folder; its notes and subfolders move up to its parent."""
    folder = crud.get_folder(session, folder_id)
    if folder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    crud.delete_folder(session, folder)
