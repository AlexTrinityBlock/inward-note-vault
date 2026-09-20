"""TypeSafe System One client construction.

Judgment design guidance lives in `.dsh/skills/typesafe-ai/SKILL.md`, and the
live docs at https://docs.typesafe.ai are the source of truth for API details.
Credentials stay on the server: the browser only ever talks to this API.
"""

from typesafe_sdk import AsyncTypeSafeClient

from app.core.config import Settings


def create_typesafe_client(settings: Settings) -> AsyncTypeSafeClient:
    """Build an async client for the System One API from application settings.

    `None` values fall back to the SDK's own environment lookup, so
    `TYPESAFE_API_KEY` set in the process environment still works.
    """
    return AsyncTypeSafeClient(
        api_key=settings.typesafe_api_key,
        model=settings.typesafe_model,
        timeout=settings.typesafe_timeout_seconds,
    )
