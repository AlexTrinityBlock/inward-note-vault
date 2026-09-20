"""Application settings, read from the environment and `.env`."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the API."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "inward-note-vault"
    environment: str = "local"
    debug: bool = False

    # SQLAlchemy / Alembic connection string.
    database_url: str = "postgresql+psycopg://vault:vault@localhost:5432/vault"

    # TypeSafe credentials stay server-side; `None` falls back to the SDK's own
    # TYPESAFE_API_KEY lookup.
    typesafe_api_key: str | None = None
    typesafe_model: str | None = None
    typesafe_timeout_seconds: float = 30.0

    # Browser origins allowed to call the API (the Vite dev server by default).
    cors_origins: list[str] = ["http://localhost:5173"]


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings instance."""
    return Settings()
