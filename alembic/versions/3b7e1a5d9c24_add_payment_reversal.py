"""add the payment reversal marker"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "3b7e1a5d9c24"
down_revision: Union[str, None] = "7d1f4b2c9a30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # No backfill: ``NULL`` already means "not reversed", which is the state of
    # every row that exists before this revision.
    op.add_column("payment", sa.Column("reversedAt", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("payment", "reversedAt")
