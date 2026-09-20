"""Shared FastAPI dependencies."""

import time
from collections import defaultdict, deque
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

# Classification spend per user, as a sliding one-minute window of call times.
_classify_calls: dict[int, deque[float]] = defaultdict(deque)

CLASSIFY_WINDOW_SECONDS = 60.0


def enforce_classify_quota(user: CurrentUser, settings: SettingsDep) -> bool:
    """Cap how often one account may ask Jev to classify.

    Each call is a paid request, so this stops a runaway client (or a stuck
    browser tab) from spending without bound.
    """
    limit = settings.classify_requests_per_minute
    now = time.monotonic()
    calls = _classify_calls[user.id]

    while calls and now - calls[0] >= CLASSIFY_WINDOW_SECONDS:
        calls.popleft()

    if len(calls) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"At most {limit} classifications per minute; wait a moment before asking Jev again"
            ),
        )

    calls.append(now)
    return True


ClassifyQuota = Annotated[bool, Depends(enforce_classify_quota)]
