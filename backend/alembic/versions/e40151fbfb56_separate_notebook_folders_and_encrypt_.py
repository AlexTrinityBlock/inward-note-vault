"""separate_notebook_folders_and_encrypt_names

Revision ID: e40151fbfb56
Revises: b171f7335f61
Create Date: 2026-09-23 13:31:55.781278

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = 'e40151fbfb56'
down_revision: str | None = 'b171f7335f61'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("folders") as batch_op:
        batch_op.add_column(
            sa.Column("notebook", sa.String(length=16), server_default="plain", nullable=False)
        )
        batch_op.add_column(sa.Column("ciphertext", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("iv", sa.String(length=64), nullable=True))
        batch_op.alter_column("name", existing_type=sa.String(length=120), nullable=True)
        batch_op.create_index("ix_folders_notebook", ["notebook"], unique=False)

    # Detach any encrypted notes that might have been linked to plain folders before
    op.execute("UPDATE notes SET folder_id = NULL WHERE notebook = 'encrypted'")


def downgrade() -> None:
    with op.batch_alter_table("folders") as batch_op:
        batch_op.drop_index("ix_folders_notebook")
        batch_op.drop_column("iv")
        batch_op.drop_column("ciphertext")
        batch_op.drop_column("notebook")
        batch_op.alter_column("name", existing_type=sa.String(length=120), nullable=False)
