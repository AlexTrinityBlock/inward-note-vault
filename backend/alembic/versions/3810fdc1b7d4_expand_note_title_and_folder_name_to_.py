"""expand_note_title_and_folder_name_to_text

Revision ID: 3810fdc1b7d4
Revises: e40151fbfb56
Create Date: 2026-09-23 14:03:28.572744

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '3810fdc1b7d4'
down_revision: str | None = 'e40151fbfb56'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("notes") as batch_op:
        batch_op.alter_column("title", existing_type=sa.String(length=200), type_=sa.Text(), nullable=True)

    with op.batch_alter_table("folders") as batch_op:
        batch_op.alter_column("name", existing_type=sa.String(length=120), type_=sa.Text(), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("folders") as batch_op:
        batch_op.alter_column("name", existing_type=sa.Text(), type_=sa.String(length=120), nullable=True)

    with op.batch_alter_table("notes") as batch_op:
        batch_op.alter_column("title", existing_type=sa.Text(), type_=sa.String(length=200), nullable=True)
