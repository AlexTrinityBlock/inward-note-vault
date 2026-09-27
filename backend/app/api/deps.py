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
    """Yield a TypeSafe client configured with the key stored in the vault.

    A key in the vault's database wins; `TYPESAFE_API_KEY` in the environment is
    the fallback, and `GET /api/settings` reports which of the two is in use.
    """
    api_key = crud.get_setting(session, crud.SETTING_TYPESAFE_API_KEY) or settings.typesafe_api_key
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "No TypeSafe API key is available: store one in settings, or set TYPESAFE_API_KEY"
            ),
        )
    async with create_typesafe_client(settings, api_key=api_key) as client:
        yield client


TypeSafeDep = Annotated[AsyncTypeSafeClient, Depends(get_typesafe_client)]

# Classification spend per user, as a sliding one-minute window of call times.
_classify_calls: dict[int, deque[float]] = defaultdict(deque)

CLASSIFY_WINDOW_SECONDS = 60.0


def reserve_classify_calls(user_id: int, count: int, limit: int) -> None:
    """Reserve `count` paid Jev requests for one account, or refuse with a 429.

    A long note is sampled in several windows, so a single classification can
    cost several requests. Reserving them up front keeps a run from stopping
    halfway through a note, and keeps a runaway client from spending without
    bound.
    """
    now = time.monotonic()
    calls = _classify_calls[user_id]

    while calls and now - calls[0] >= CLASSIFY_WINDOW_SECONDS:
        calls.popleft()

    if len(calls) + count > limit:
        remaining = max(limit - len(calls), 0)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"This note needs {count} Jev request(s) and {remaining} of the "
                f"{limit}-per-minute budget is left; try again in a moment"
            ),
        )

    calls.extend([now] * count)
