"""Instance settings, including the TypeSafe API key and auto-classification."""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from typesafe_sdk import TypeSafeError

from app import crud
from app.api.deps import CurrentUser, SessionDep, TypeSafeDep

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingsRead(BaseModel):
    """Everything the UI needs to render the settings screen.

    The API key itself is never returned — only whether one is stored.
    """

    typesafe_configured: bool
    typesafe_model: str | None
    auto_classify_enabled: bool


class SettingsUpdate(BaseModel):
    """Partial settings update."""

    typesafe_api_key: str | None = Field(default=None, min_length=1)
    clear_typesafe_api_key: bool = False
    typesafe_model: str | None = None
    auto_classify_enabled: bool | None = None


class TypeSafeCheck(BaseModel):
    """Result of validating the stored key against the TypeSafe API."""

    ok: bool
    models: list[str] = []
    detail: str | None = None


def _read(session: SessionDep) -> SettingsRead:
    return SettingsRead(
        typesafe_configured=bool(crud.get_setting(session, crud.SETTING_TYPESAFE_API_KEY)),
        typesafe_model=crud.get_setting(session, crud.SETTING_TYPESAFE_MODEL),
        auto_classify_enabled=crud.setting_enabled(session, crud.SETTING_AUTO_CLASSIFY),
    )


@router.get("")
def read_settings(session: SessionDep, _user: CurrentUser) -> SettingsRead:
    """Read the stored settings."""
    return _read(session)


@router.patch("")
def update_settings(
    payload: SettingsUpdate, session: SessionDep, _user: CurrentUser
) -> SettingsRead:
    """Update the stored settings."""
    if payload.clear_typesafe_api_key:
        crud.delete_setting(session, crud.SETTING_TYPESAFE_API_KEY)
    elif payload.typesafe_api_key is not None:
        crud.set_setting(session, crud.SETTING_TYPESAFE_API_KEY, payload.typesafe_api_key)

    if payload.typesafe_model is not None:
        if payload.typesafe_model:
            crud.set_setting(session, crud.SETTING_TYPESAFE_MODEL, payload.typesafe_model)
        else:
            crud.delete_setting(session, crud.SETTING_TYPESAFE_MODEL)

    if payload.auto_classify_enabled is not None:
        crud.set_setting(
            session,
            crud.SETTING_AUTO_CLASSIFY,
            "true" if payload.auto_classify_enabled else "false",
        )

    return _read(session)


@router.post("/typesafe/verify")
async def verify_typesafe(
    session: SessionDep, client: TypeSafeDep, _user: CurrentUser
) -> TypeSafeCheck:
    """Ask TypeSafe for the model list, proving the stored key works."""
    if not crud.get_setting(session, crud.SETTING_TYPESAFE_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No TypeSafe API key is stored",
        )

    try:
        response = await client.models.list()
    except TypeSafeError as error:
        return TypeSafeCheck(ok=False, detail=str(error))

    names = [getattr(model, "name", str(model)) for model in response.models]
    return TypeSafeCheck(ok=True, models=names)
