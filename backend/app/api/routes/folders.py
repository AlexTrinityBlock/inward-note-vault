"""Folder tree endpoints. Nesting is a `parent_id` column on `folders`."""

from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

from app import crud
from app.api.deps import CurrentUser, SessionDep
from app.models import NOTEBOOK_ENCRYPTED, NOTEBOOK_PLAIN, NOTEBOOKS

router = APIRouter(prefix="/folders", tags=["folders"])

Notebook = Literal["plain", "encrypted"]


class FolderRead(BaseModel):
    """A folder plus its readable path and encryption fields."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    notebook: Notebook
    name: str | None = None
    parent_id: int | None = None
    path: str = ""
    ciphertext: str | None = None
    iv: str | None = None


class FolderCreate(BaseModel):
    """Payload for creating a folder."""

    notebook: Notebook = NOTEBOOK_PLAIN
    name: str | None = Field(default=None, max_length=2000)
    ciphertext: str | None = None
    iv: str | None = None
    parent_id: int | None = None


class FolderUpdate(BaseModel):
    """Payload for renaming and/or moving a folder.

    `parent_id` is only applied when `move` is true, so `parent_id: null` with
    `move: true` moves the folder back to the root.
    """

    name: str | None = Field(default=None, max_length=2000)
    ciphertext: str | None = None
    iv: str | None = None
    parent_id: int | None = None
    move: bool = False


def _read(session: SessionDep, folder_id: int) -> FolderRead:
    folder = crud.get_folder(session, folder_id)
    if folder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    paths = crud.folder_paths(session, notebook=folder.notebook)
    return FolderRead(
        id=folder.id,
        notebook=folder.notebook,  # type: ignore[arg-type]
        name=folder.name,
        parent_id=folder.parent_id,
        path=paths.get(folder.id, folder.name or ""),
        ciphertext=folder.ciphertext,
        iv=folder.iv,
    )


@router.get("", operation_id="listFolders")
def list_folders(
    session: SessionDep,
    _user: CurrentUser,
    notebook: Annotated[Notebook | None, Query()] = None,
) -> list[FolderRead]:
    """List folders, optionally filtered by notebook."""
    folders = crud.list_folders(session, notebook=notebook)
    paths = crud.folder_paths(session, notebook=notebook)
    return [
        FolderRead(
            id=folder.id,
            notebook=folder.notebook,  # type: ignore[arg-type]
            name=folder.name,
            parent_id=folder.parent_id,
            path=paths.get(folder.id, folder.name or ""),
            ciphertext=folder.ciphertext,
            iv=folder.iv,
        )
        for folder in folders
    ]


@router.post("", status_code=status.HTTP_201_CREATED, operation_id="createFolder")
def create_folder(payload: FolderCreate, session: SessionDep, _user: CurrentUser) -> FolderRead:
    """Create a folder, optionally inside another one."""
    if payload.notebook not in NOTEBOOKS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"notebook must be one of {NOTEBOOKS}",
        )

    if payload.notebook == NOTEBOOK_PLAIN:
        if not payload.name or not payload.name.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Plain folders require a non-empty name",
            )
        if payload.ciphertext is not None or payload.iv is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Plain folders must not have ciphertext or iv",
            )
        name: str | None = payload.name.strip()
        ciphertext: str | None = None
        iv: str | None = None
    else:  # NOTEBOOK_ENCRYPTED
        if payload.name and payload.name.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Encrypted folders must not send a plaintext name",
            )
        if not payload.ciphertext or not payload.iv:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Encrypted folders require ciphertext and iv",
            )
        name = None
        ciphertext = payload.ciphertext
        iv = payload.iv

    if payload.parent_id is not None:
        parent = crud.get_folder(session, payload.parent_id)
        if parent is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Parent folder not found"
            )
        if parent.notebook != payload.notebook:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Parent folder must belong to the same notebook",
            )

    folder = crud.create_folder(
        session,
        notebook=payload.notebook,
        name=name,
        ciphertext=ciphertext,
        iv=iv,
        parent_id=payload.parent_id,
    )
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

    if folder.notebook == NOTEBOOK_PLAIN:
        if payload.ciphertext is not None or payload.iv is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Plain folders must not have ciphertext or iv",
            )
        name = payload.name.strip() if payload.name is not None else None
        ciphertext = None
        iv = None
    else:  # NOTEBOOK_ENCRYPTED
        if payload.name and payload.name.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Encrypted folders must not send a plaintext name",
            )
        if (payload.ciphertext is not None and payload.iv is None) or (
            payload.ciphertext is None and payload.iv is not None
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Encrypted folders require both ciphertext and iv when updating",
            )
        name = None
        ciphertext = payload.ciphertext
        iv = payload.iv

    if payload.move and payload.parent_id is not None:
        parent = crud.get_folder(session, payload.parent_id)
        if parent is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Parent folder not found"
            )
        if parent.notebook != folder.notebook:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Parent folder must belong to the same notebook",
            )
        if crud.is_descendant(session, folder_id, payload.parent_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A folder cannot be moved inside itself",
            )

    crud.update_folder(
        session,
        folder,
        name=name,
        ciphertext=ciphertext,
        iv=iv,
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
