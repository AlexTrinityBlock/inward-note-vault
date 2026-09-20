"""First-run setup, login sessions and the current-user endpoint."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from app import crud
from app.api.deps import CurrentUser, SessionDep, SettingsDep

router = APIRouter(tags=["auth"])


class SetupStatus(BaseModel):
    """Whether the vault still needs its owner account."""

    needs_setup: bool


class Credentials(BaseModel):
    """Login payload."""

    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=256)


class SetupRequest(Credentials):
    """First-run payload: the owner account plus optional TypeSafe settings."""

    typesafe_api_key: Annotated[str | None, Field(default=None)] = None
    auto_classify_enabled: bool = False


class Account(BaseModel):
    """The signed-in account."""

    username: str


@router.get("/setup/status")
def setup_status(session: SessionDep) -> SetupStatus:
    """Report whether the first-run wizard is needed."""
    return SetupStatus(needs_setup=crud.count_users(session) == 0)


@router.post("/setup", status_code=status.HTTP_201_CREATED)
def setup(payload: SetupRequest, session: SessionDep, settings: SettingsDep) -> Account:
    """Create the owner account. Only possible while the vault is empty."""
    if crud.count_users(session) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This vault already has an account",
        )

    user = crud.create_user(session, username=payload.username, password=payload.password)

    if payload.typesafe_api_key:
        crud.set_setting(session, crud.SETTING_TYPESAFE_API_KEY, payload.typesafe_api_key)
    crud.set_setting(
        session,
        crud.SETTING_AUTO_CLASSIFY,
        "true" if payload.auto_classify_enabled else "false",
    )

    return Account(username=user.username)


@router.post("/auth/login")
def login(
    payload: Credentials, response: Response, session: SessionDep, settings: SettingsDep
) -> Account:
    """Exchange credentials for a session cookie."""
    user = crud.authenticate(session, username=payload.username, password=payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    token = crud.start_session(session, user=user, ttl_hours=settings.session_ttl_hours)
    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=settings.session_ttl_hours * 3600,
        path="/",
    )
    return Account(username=user.username)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request, response: Response, session: SessionDep, settings: SettingsDep
) -> None:
    """Drop the current session and clear the cookie."""
    crud.end_session(session, request.cookies.get(settings.cookie_name))
    response.delete_cookie(key=settings.cookie_name, path="/")


@router.get("/auth/me")
def me(user: CurrentUser) -> Account:
    """The signed-in account."""
    return Account(username=user.username)
