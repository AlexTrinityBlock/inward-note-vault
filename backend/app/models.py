"""ORM models."""

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, TypeDecorator, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

# Note notebooks: server-readable notes, and end-to-end encrypted notes whose
# title and body only ever exist as ciphertext on the server.
NOTEBOOK_PLAIN = "plain"
NOTEBOOK_ENCRYPTED = "encrypted"
NOTEBOOKS = (NOTEBOOK_PLAIN, NOTEBOOK_ENCRYPTED)


def utcnow() -> datetime:
    """Current time as an aware UTC datetime."""
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator):
    """An aware-UTC datetime column.

    SQLite drops timezone information, so values are normalised on the way in
    and re-tagged as UTC on the way out; comparisons stay aware everywhere.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, _dialect: object) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def process_result_value(self, value: datetime | None, _dialect: object) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


class TimestampMixin:
    """Created/updated bookkeeping shared by the content tables."""

    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)


class User(TimestampMixin, Base):
    """The vault owner. The schema allows more than one row; the app creates one."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime, default=None)


class UserSession(Base):
    """A logged-in browser. Only the hash of the cookie token is stored."""

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)

    user: Mapped[User] = relationship()


class Setting(TimestampMixin, Base):
    """Instance-wide key/value settings, including the TypeSafe API key."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text)


class Folder(TimestampMixin, Base):
    """A notebook folder, nested through `parent_id`.

    Plain folders store `name`. Encrypted folders store `ciphertext` and `iv`,
    so the server never learns the folder name.
    """

    __tablename__ = "folders"

    id: Mapped[int] = mapped_column(primary_key=True)
    notebook: Mapped[str] = mapped_column(String(16), default=NOTEBOOK_PLAIN, index=True)
    name: Mapped[str | None] = mapped_column(Text, default=None)

    # AES-GCM payload produced in the browser, plus its nonce. Base64.
    ciphertext: Mapped[str | None] = mapped_column(Text, default=None)
    iv: Mapped[str | None] = mapped_column(String(64), default=None)

    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("folders.id", ondelete="SET NULL"), default=None, index=True
    )

    parent: Mapped[Folder | None] = relationship(back_populates="children", remote_side=[id])
    children: Mapped[list[Folder]] = relationship(back_populates="parent")


class Category(TimestampMixin, Base):
    """A free-form category shared by plain and encrypted notes."""

    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 50 characters: a label, not a sentence. See `app.core.limits`.
    name: Mapped[str] = mapped_column(String(50), unique=True)


class NoteCategory(Base):
    """Association between notes and categories."""

    __tablename__ = "note_categories"

    note_id: Mapped[int] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True
    )
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True
    )


class Note(TimestampMixin, Base):
    """A note.

    Plain notes store `title` and `body`. Encrypted notes store neither: their
    title and body live inside `ciphertext`, which the server cannot read.
    """

    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    notebook: Mapped[str] = mapped_column(String(16), default=NOTEBOOK_PLAIN, index=True)

    title: Mapped[str | None] = mapped_column(Text, default=None)
    body: Mapped[str | None] = mapped_column(Text, default=None)

    # AES-GCM payload produced in the browser, plus its nonce. Base64.
    ciphertext: Mapped[str | None] = mapped_column(Text, default=None)
    iv: Mapped[str | None] = mapped_column(String(64), default=None)

    folder_id: Mapped[int | None] = mapped_column(
        ForeignKey("folders.id", ondelete="SET NULL"), default=None, index=True
    )

    folder: Mapped[Folder | None] = relationship()
    categories: Mapped[list[Category]] = relationship(
        secondary="note_categories", order_by="Category.name"
    )


class CryptoProfile(TimestampMixin, Base):
    """Key-derivation parameters for the encrypted notebook.

    The server stores what the browser needs to derive the key again: the salt,
    the iteration count, and a verifier blob that proves a password is correct.
    The password and the derived key are never sent here.
    """

    __tablename__ = "crypto_profiles"
    __table_args__ = (UniqueConstraint("id", name="uq_crypto_profiles_single_row"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    kdf: Mapped[str] = mapped_column(String(32), default="PBKDF2-SHA256")
    salt: Mapped[str] = mapped_column(String(64))
    iterations: Mapped[int] = mapped_column(Integer)

    verifier_iv: Mapped[str] = mapped_column(String(64))
    verifier_ciphertext: Mapped[str] = mapped_column(Text)
