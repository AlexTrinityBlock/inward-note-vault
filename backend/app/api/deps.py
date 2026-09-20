"""Shared FastAPI dependencies."""

from collections.abc import AsyncIterator, Iterator
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from typesafe_sdk import AsyncTypeSafeClient

from app import crud
from app.core.config import Settings
from app.core.typesafe import create_typesafe_client
from app.models import User


def get_settings_dep(request: Request) -> Settings:
    """The settings this application instance was built with."""
    return request.app.state.settings


def get_session(request: Request) -> Iterator[Session]:
    """A database session scoped to the request."""
    yield from request.app.state.db.session()


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
SessionDep = Annotated[Session, Depends(get_session)]


def get_current_user(request: Request, session: SessionDep, settings: SettingsDep) -> User:
    """Resolve the signed-in user from the session cookie."""
    user = crud.resolve_session(session, request.cookies.get(settings.cookie_name))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_typesafe_client(
    session: SessionDep, settings: SettingsDep
) -> AsyncIterator[AsyncTypeSafeClient]:
    """Yield a TypeSafe client configured with the key stored in the vault."""
    api_key = crud.get_setting(session, crud.SETTING_TYPESAFE_API_KEY) or settings.typesafe_api_key
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Store a TypeSafe API key in settings before asking Jev to classify notes",
        )
    async with create_typesafe_client(settings, api_key=api_key) as client:
        yield client


TypeSafeDep = Annotated[AsyncTypeSafeClient, Depends(get_typesafe_client)]
