"""add loan lifecycle: status, closedAt, writtenOffAmount"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "4e7b8c2d9a15"
down_revision: Union[str, None] = "3b7e1a5d9c24"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Existing loans stay active: the server default fills every legacy row, and
    # the migration backfill (Epic 5) derives the closed ones from their balance.
    op.add_column(
        "loan",
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
    )
    op.add_column("loan", sa.Column("closedAt", sa.DateTime(), nullable=True))
    op.add_column(
        "loan",
        sa.Column("writtenOffAmount", sa.Numeric(precision=14, scale=2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("loan", "writtenOffAmount")
    op.drop_column("loan", "closedAt")
    op.drop_column("loan", "status")
