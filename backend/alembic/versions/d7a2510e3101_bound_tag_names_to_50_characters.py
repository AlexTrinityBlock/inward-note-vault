"""bound tag names to 50 characters

Revision ID: d7a2510e3101
Revises: c37721c62629
Create Date: 2026-09-20 23:46:04.085982

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d7a2510e3101"
down_revision: str | None = "c37721c62629"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Shorten `tags.name` to 50 characters.

    Batch mode: SQLite cannot ALTER COLUMN, so the table is rebuilt.
    """
    with op.batch_alter_table("tags") as batch_op:
        batch_op.alter_column(
            "name",
            existing_type=sa.VARCHAR(length=80),
            type_=sa.String(length=50),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("tags") as batch_op:
        batch_op.alter_column(
            "name",
            existing_type=sa.String(length=50),
            type_=sa.VARCHAR(length=80),
            existing_nullable=False,
        )
