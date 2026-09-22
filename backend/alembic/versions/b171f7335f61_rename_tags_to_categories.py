"""rename tags to categories

Revision ID: b171f7335f61
Revises: d7a2510e3101
Create Date: 2026-09-23 00:41:34.031071

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b171f7335f61"
down_revision: str | None = "d7a2510e3101"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Rename `tags` to `categories`, and `note_tags` to `note_categories`.

    SQLite cannot rename the `tag_id` column of a foreign key, and it does not
    preserve constraint names across `ALTER TABLE`, so both tables are rebuilt
    rather than altered: create the new table, copy every row with its id, then
    drop the old table. Links are copied before `tags` is dropped so the
    database never holds a foreign key pointing at a missing table.
    """
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    # Explicit column lists and ids: both tables' primary keys survive as-is.
    op.execute(
        "INSERT INTO categories (id, name, created_at, updated_at) "
        "SELECT id, name, created_at, updated_at FROM tags"
    )

    op.create_table(
        "note_categories",
        sa.Column("note_id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("note_id", "category_id"),
    )
    op.execute(
        "INSERT INTO note_categories (note_id, category_id) SELECT note_id, tag_id FROM note_tags"
    )

    op.drop_table("note_tags")
    op.drop_table("tags")


def downgrade() -> None:
    """Put `tags` and `note_tags` back, with their rows and constraints."""
    op.create_table(
        "tags",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.execute(
        "INSERT INTO tags (id, name, created_at, updated_at) "
        "SELECT id, name, created_at, updated_at FROM categories"
    )

    op.create_table(
        "note_tags",
        sa.Column("note_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("note_id", "tag_id"),
    )
    op.execute(
        "INSERT INTO note_tags (note_id, tag_id) SELECT note_id, category_id FROM note_categories"
    )

    op.drop_table("note_categories")
    op.drop_table("categories")
