"""Schema management: Alembic migrations applied at start-up."""

from pathlib import Path

from alembic.config import Config

from alembic import command
from app.core.config import Settings

BACKEND_DIR = Path(__file__).resolve().parents[2]


def alembic_config(settings: Settings) -> Config:
    """Build an Alembic config pointing at this backend and its database."""
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", settings.resolved_database_url)
    return config


def upgrade_to_head(settings: Settings) -> None:
    """Bring the database schema up to date; safe to run on every start."""
    command.upgrade(alembic_config(settings), "head")
