"""Application settings, read from the environment and `.env`."""

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the API."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    app_name: str = "inward-note-vault"
    environment: str = "local"
    debug: bool = False

    # SQLite lives in `<data_dir>/vault.db` unless DATABASE_URL overrides it.
    data_dir: Path = Field(
        default=Path("data"),
        validation_alias=AliasChoices("INWARD_DATA_DIR", "DATA_DIR"),
    )
    database_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("INWARD_DATABASE_URL", "DATABASE_URL"),
    )

    # Sessions are bearer cookies backed by rows in the `sessions` table.
    session_ttl_hours: int = 24 * 30
    cookie_name: str = "inward_session"
    cookie_secure: bool = False

    # Browser origins allowed to call the API directly (the Vite dev server).
    cors_origins: list[str] = ["http://localhost:5173"]

    # Directory holding the built SPA. `None` looks for `frontend/dist`.
    static_dir: Path | None = None

    # TypeSafe fallback for keys that have not been stored in the database.
    typesafe_api_key: str | None = None
    typesafe_model: str | None = None
    typesafe_timeout_seconds: float = 30.0

    # Safety valve: every classification is a paid TypeSafe request, so a
    # runaway client cannot be allowed to spend without bound.
    classify_requests_per_minute: int = Field(
        default=10,
        validation_alias=AliasChoices("INWARD_CLASSIFY_REQUESTS_PER_MINUTE"),
    )

    @property
    def sqlite_path(self) -> Path:
        """Filesystem location of the SQLite database."""
        return (self.data_dir / "vault.db").resolve()

    @property
    def resolved_database_url(self) -> str:
        """SQLAlchemy URL, defaulting to the bundled SQLite file."""
        if self.database_url:
            return self.database_url
        return f"sqlite+pysqlite:///{self.sqlite_path.as_posix()}"


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings instance."""
    return Settings()
