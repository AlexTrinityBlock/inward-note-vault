"""Database engine, session factory and declarative base."""

import sqlite3
from collections.abc import Iterator

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    """Declarative base shared by every ORM model."""


class Database:
    """Owns the SQLAlchemy engine for one application instance."""

    def __init__(self, url: str, *, echo: bool = False) -> None:
        self.url = url
        self.is_sqlite = url.startswith("sqlite")
        connect_args = {"check_same_thread": False} if self.is_sqlite else {}
        self.engine = create_engine(url, echo=echo, connect_args=connect_args)
        if self.is_sqlite:
            event.listen(self.engine, "connect", _enable_sqlite_foreign_keys)

    def session(self) -> Iterator[Session]:
        """Yield a session and always close it."""
        with sessionmaker(bind=self.engine, autoflush=False, expire_on_commit=False)() as session:
            yield session

    def dispose(self) -> None:
        """Close pooled connections."""
        self.engine.dispose()


def _enable_sqlite_foreign_keys(dbapi_connection: object, _record: object) -> None:
    """SQLite ignores foreign keys unless they are switched on per connection."""
    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def create_database(url: str, *, echo: bool = False) -> Database:
    """Build a database handle for the given SQLAlchemy URL."""
    return Database(url, echo=echo)


__all__ = ["Base", "Database", "Engine", "create_database"]
