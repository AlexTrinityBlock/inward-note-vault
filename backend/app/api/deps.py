"""Shared FastAPI dependencies."""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session
from typesafe_sdk import AsyncTypeSafeClient

from app.core.config import Settings, get_settings
from app.core.db import get_session
from app.core.typesafe import create_typesafe_client

SessionDep = Annotated[Session, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


async def get_typesafe_client(settings: SettingsDep) -> AsyncIterator[AsyncTypeSafeClient]:
    """Yield a TypeSafe client scoped to the request."""
    async with create_typesafe_client(settings) as client:
        yield client


TypeSafeDep = Annotated[AsyncTypeSafeClient, Depends(get_typesafe_client)]
