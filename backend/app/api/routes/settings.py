"""Instance settings, including the TypeSafe API key and auto-classification."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typesafe_sdk import TypeSafeError

from app import crud
from app.api.deps import CurrentUser, SessionDep, SettingsDep, TypeSafeDep

router = APIRouter(prefix="/settings", tags=["settings"])

# Where the key Jev will use comes from: the vault's database, or the
# environment (`.env`), which is the fallback `get_typesafe_client` applies too.
KeySource = Literal["stored", "env"]


class SettingsRead(BaseModel):
    """Everything the UI needs to render the settings screen.

    The API key itself is never returned — only whether one is available, and
    where it comes from.
    """

    typesafe_configured: bool
    typesafe_source: KeySource | None
    typesafe_model: str | None
    auto_classify_enabled: bool


class SettingsUpdate(BaseModel):
    """Partial settings update."""

    typesafe_api_key: str | None = Field(default=None, min_length=1)
    clear_typesafe_api_key: bool = False
    typesafe_model: str | None = None
    auto_classify_enabled: bool | None = None


class TypeSafeCheck(BaseModel):
    """Result of validating the key against the TypeSafe API."""

    ok: bool
    models: list[str] = []
    detail: str | None = None


def resolve_api_key(
    session: SessionDep, settings: SettingsDep
) -> tuple[str | None, KeySource | None]:
    """Find the key Jev will use, and say where it came from.

    A key stored in the vault wins; otherwise the environment provides one.
    Classification resolves the key the same way, so this must not disagree
    with it.
    """
    stored = crud.get_setting(session, crud.SETTING_TYPESAFE_API_KEY)
    if stored:
        return stored, "stored"
    if settings.typesafe_api_key:
        return settings.typesafe_api_key, "env"
    return None, None


def _read(session: SessionDep, settings: SettingsDep) -> SettingsRead:
    _, source = resolve_api_key(session, settings)
    return SettingsRead(
        typesafe_configured=source is not None,
        typesafe_source=source,
        typesafe_model=crud.get_setting(session, crud.SETTING_TYPESAFE_MODEL),
        auto_classify_enabled=crud.setting_enabled(session, crud.SETTING_AUTO_CLASSIFY),
    )


@router.get("", operation_id="getSettings")
def read_settings(session: SessionDep, settings: SettingsDep, _user: CurrentUser) -> SettingsRead:
    """Read the stored settings."""
    return _read(session, settings)


@router.patch("", operation_id="updateSettings")
def update_settings(
    payload: SettingsUpdate, session: SessionDep, settings: SettingsDep, _user: CurrentUser
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

    return _read(session, settings)


@router.post("/typesafe/verify", operation_id="verifyTypesafeKey")
async def verify_typesafe(
    session: SessionDep, settings: SettingsDep, client: TypeSafeDep, _user: CurrentUser
) -> TypeSafeCheck:
    """Ask TypeSafe for the model list, proving the key Jev would use works.

    A missing key never reaches this line: `TypeSafeDep` resolves the stored key
    and the environment fallback the same way, and answers 400 when neither
    exists.
    """
    _, source = resolve_api_key(session, settings)
    try:
        response = await client.models.list()
    except TypeSafeError as error:
        return TypeSafeCheck(ok=False, detail=str(error))

    names = [getattr(model, "name", str(model)) for model in response.models]
    return TypeSafeCheck(ok=True, models=names)
