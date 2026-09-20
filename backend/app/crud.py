"""Database operations, one function per use case."""

from datetime import timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.limits import TAG_COUNT_MAX, LimitExceeded, clean_tag_name
from app.core.security import (
    hash_password,
    hash_session_token,
    new_session_token,
    verify_password,
)
from app.models import (
    NOTEBOOK_PLAIN,
    CryptoProfile,
    Folder,
    Note,
    NoteTag,
    Setting,
    Tag,
    User,
    UserSession,
    utcnow,
)

SETTING_TYPESAFE_API_KEY = "typesafe_api_key"
SETTING_TYPESAFE_MODEL = "typesafe_model"
SETTING_AUTO_CLASSIFY = "auto_classify_enabled"


# --------------------------------------------------------------------------- #
# Accounts, sessions and settings
# --------------------------------------------------------------------------- #


def count_users(session: Session) -> int:
    """Number of accounts in the vault."""
    return session.scalar(select(func.count()).select_from(User)) or 0


def get_user_by_name(session: Session, username: str) -> User | None:
    """Look up an account by name, case-insensitively."""
    return session.scalar(select(User).where(func.lower(User.username) == username.lower()))


def create_user(session: Session, *, username: str, password: str) -> User:
    """Create the vault owner account."""
    user = User(username=username, password_hash=hash_password(password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def authenticate(session: Session, *, username: str, password: str) -> User | None:
    """Return the account when the credentials match."""
    user = get_user_by_name(session, username)
    if user is None or not verify_password(password, user.password_hash):
        return None
    user.last_login_at = utcnow()
    session.commit()
    return user


def start_session(session: Session, *, user: User, ttl_hours: int) -> str:
    """Create a login session and return the raw cookie token."""
    token = new_session_token()
    session.add(
        UserSession(
            token_hash=hash_session_token(token),
            user_id=user.id,
            expires_at=utcnow() + timedelta(hours=ttl_hours),
        )
    )
    session.commit()
    return token


def resolve_session(session: Session, token: str | None) -> User | None:
    """Return the user behind a cookie token, when the session is still valid."""
    if not token:
        return None
    record = session.scalar(
        select(UserSession)
        .options(selectinload(UserSession.user))
        .where(UserSession.token_hash == hash_session_token(token))
    )
    if record is None:
        return None
    if record.expires_at <= utcnow():
        session.delete(record)
        session.commit()
        return None
    return record.user


def end_session(session: Session, token: str | None) -> None:
    """Delete the session behind a cookie token."""
    if not token:
        return
    record = session.scalar(
        select(UserSession).where(UserSession.token_hash == hash_session_token(token))
    )
    if record is not None:
        session.delete(record)
        session.commit()


def get_setting(session: Session, key: str) -> str | None:
    """Read one instance-wide setting."""
    record = session.get(Setting, key)
    return record.value if record else None


def set_setting(session: Session, key: str, value: str) -> None:
    """Write one instance-wide setting."""
    record = session.get(Setting, key)
    if record is None:
        session.add(Setting(key=key, value=value))
    else:
        record.value = value
    session.commit()


def delete_setting(session: Session, key: str) -> None:
    """Remove one instance-wide setting."""
    record = session.get(Setting, key)
    if record is not None:
        session.delete(record)
        session.commit()


def setting_enabled(session: Session, key: str, *, default: bool = False) -> bool:
    """Read a boolean setting stored as `true`/`false`."""
    value = get_setting(session, key)
    if value is None:
        return default
    return value.lower() == "true"


# --------------------------------------------------------------------------- #
# Folders
# --------------------------------------------------------------------------- #


def list_folders(session: Session) -> list[Folder]:
    """All folders, ordered by name."""
    return list(session.scalars(select(Folder).order_by(Folder.name)))


def get_folder(session: Session, folder_id: int) -> Folder | None:
    """Look up a folder by id."""
    return session.get(Folder, folder_id)


def create_folder(session: Session, *, name: str, parent_id: int | None = None) -> Folder:
    """Create a folder, optionally nested under another."""
    folder = Folder(name=name, parent_id=parent_id)
    session.add(folder)
    session.commit()
    session.refresh(folder)
    return folder


def update_folder(
    session: Session,
    folder: Folder,
    *,
    name: str | None = None,
    parent_id: int | None = None,
    move: bool = False,
) -> Folder:
    """Rename and/or move a folder."""
    if name is not None:
        folder.name = name
    if move:
        folder.parent_id = parent_id
    session.commit()
    session.refresh(folder)
    return folder


def is_descendant(session: Session, folder_id: int, candidate_parent_id: int) -> bool:
    """True when `candidate_parent_id` sits inside `folder_id`'s subtree."""
    current: int | None = candidate_parent_id
    guard = 0
    while current is not None and guard < 1000:
        if current == folder_id:
            return True
        parent = session.get(Folder, current)
        current = parent.parent_id if parent else None
        guard += 1
    return False


def delete_folder(session: Session, folder: Folder) -> None:
    """Delete a folder, moving its notes and subfolders up to its parent."""
    session.query(Note).filter(Note.folder_id == folder.id).update(
        {Note.folder_id: folder.parent_id}, synchronize_session=False
    )
    session.query(Folder).filter(Folder.parent_id == folder.id).update(
        {Folder.parent_id: folder.parent_id}, synchronize_session=False
    )
    session.delete(folder)
    session.commit()


def folder_paths(session: Session) -> dict[int, str]:
    """Map every folder id to a readable `Parent/Child` path."""
    folders = {folder.id: folder for folder in list_folders(session)}
    paths: dict[int, str] = {}

    for folder_id in folders:
        parts: list[str] = []
        current: int | None = folder_id
        guard = 0
        while current is not None and guard < 1000:
            folder = folders.get(current)
            if folder is None:
                break
            parts.append(folder.name)
            current = folder.parent_id
            guard += 1
        paths[folder_id] = "/".join(reversed(parts))

    return paths


# --------------------------------------------------------------------------- #
# Tags
# --------------------------------------------------------------------------- #


def list_tags(session: Session) -> list[Tag]:
    """All tags, ordered by name."""
    return list(session.scalars(select(Tag).order_by(Tag.name)))


def get_tag(session: Session, tag_id: int) -> Tag | None:
    """Look up a tag by id."""
    return session.get(Tag, tag_id)


def get_or_create_tag(session: Session, name: str) -> Tag:
    """Find a tag by name or create it."""
    cleaned = name.strip()
    tag = session.scalar(select(Tag).where(func.lower(Tag.name) == cleaned.lower()))
    if tag is None:
        tag = Tag(name=cleaned)
        session.add(tag)
        session.flush()
    return tag


def rename_tag(session: Session, tag: Tag, name: str) -> Tag:
    """Rename a tag."""
    tag.name = name.strip()
    session.commit()
    session.refresh(tag)
    return tag


def delete_tag(session: Session, tag: Tag) -> None:
    """Delete a tag and its note associations."""
    session.delete(tag)
    session.commit()


def tag_usage(session: Session) -> dict[int, int]:
    """Number of notes per tag id."""
    rows = session.execute(select(NoteTag.tag_id, func.count()).group_by(NoteTag.tag_id)).all()
    return {tag_id: count for tag_id, count in rows}


def resolve_note_tags(session: Session, names: list[str]) -> list[Tag]:
    """Resolve tag names for a note, creating new ones within the vault's limits.

    Raises `LimitExceeded` when a name is too long or the vault is full, so a
    note can never smuggle in a tag the tag endpoints would refuse.
    """
    cleaned: list[str] = []
    for name in names:
        candidate = clean_tag_name(name)
        if candidate.lower() not in {seen.lower() for seen in cleaned}:
            cleaned.append(candidate)

    known = {tag.name.lower(): tag for tag in list_tags(session)}
    new_names = [name for name in cleaned if name.lower() not in known]
    if len(known) + len(new_names) > TAG_COUNT_MAX:
        raise LimitExceeded(f"The vault already holds the maximum of {TAG_COUNT_MAX} tags")

    return [
        known[name.lower()] if name.lower() in known else get_or_create_tag(session, name)
        for name in cleaned
    ]


def set_note_tags(session: Session, note: Note, names: list[str]) -> Note:
    """Replace a note's tags with the given names."""
    note.tags = resolve_note_tags(session, names)
    session.commit()
    session.refresh(note)
    return note


# --------------------------------------------------------------------------- #
# Notes
# --------------------------------------------------------------------------- #


def list_notes(
    session: Session,
    *,
    notebook: str | None = None,
    folder_id: int | None = None,
    tag: str | None = None,
    query: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[Note]:
    """List notes, newest first.

    `query` searches plain note titles and bodies. Encrypted notes cannot be
    searched by the server, so a search never returns them.
    """
    statement = select(Note).options(selectinload(Note.tags))
    if notebook is not None:
        statement = statement.where(Note.notebook == notebook)
    if folder_id is not None:
        statement = statement.where(Note.folder_id == folder_id)
    if tag is not None:
        statement = (
            statement.join(NoteTag, NoteTag.note_id == Note.id)
            .join(Tag, Tag.id == NoteTag.tag_id)
            .where(func.lower(Tag.name) == tag.lower())
        )
    if query:
        pattern = f"%{query}%"
        statement = statement.where(
            Note.notebook == NOTEBOOK_PLAIN,
            or_(Note.title.ilike(pattern), Note.body.ilike(pattern)),
        )
    statement = statement.order_by(Note.updated_at.desc()).limit(limit).offset(offset)
    return list(session.scalars(statement).unique())


def get_note(session: Session, note_id: int) -> Note | None:
    """Look up a note by id, with its tags loaded."""
    return session.scalar(select(Note).options(selectinload(Note.tags)).where(Note.id == note_id))


def create_note(session: Session, **fields: object) -> Note:
    """Insert a note. Callers validate the payload for the target notebook."""
    note = Note(**fields)
    session.add(note)
    session.commit()
    session.refresh(note)
    return note


def update_note(session: Session, note: Note, **fields: object) -> Note:
    """Update note columns; only the fields passed are touched."""
    for key, value in fields.items():
        setattr(note, key, value)
    session.commit()
    session.refresh(note)
    return note


def delete_note(session: Session, note: Note) -> None:
    """Delete a note."""
    session.delete(note)
    session.commit()


# --------------------------------------------------------------------------- #
# Encrypted-notebook profile
# --------------------------------------------------------------------------- #


def get_crypto_profile(session: Session) -> CryptoProfile | None:
    """Read the encrypted notebook's key-derivation parameters."""
    return session.scalar(select(CryptoProfile))


def create_crypto_profile(
    session: Session,
    *,
    kdf: str,
    salt: str,
    iterations: int,
    verifier_iv: str,
    verifier_ciphertext: str,
) -> CryptoProfile:
    """Store the encrypted notebook's key-derivation parameters."""
    profile = CryptoProfile(
        id=1,
        kdf=kdf,
        salt=salt,
        iterations=iterations,
        verifier_iv=verifier_iv,
        verifier_ciphertext=verifier_ciphertext,
    )
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile


def count_encrypted_notes(session: Session) -> int:
    """Number of stored encrypted notes."""
    return (
        session.scalar(
            select(func.count()).select_from(Note).where(Note.notebook != NOTEBOOK_PLAIN)
        )
        or 0
    )
