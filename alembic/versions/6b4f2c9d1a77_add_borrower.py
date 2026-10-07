"""add borrower directory records"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "6b4f2c9d1a77"
down_revision: Union[str, None] = "4f1c8a6d2e35"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "borrower",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("firstName", sa.String(length=100), nullable=False),
        sa.Column("lastName", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=True),
        sa.Column("phone", sa.String(length=80), nullable=True),
        sa.Column("address", sa.String(length=500), nullable=True),
        sa.Column("nationalId", sa.String(length=80), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("createdAt", sa.DateTime(), nullable=False),
        sa.Column("updatedAt", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_borrower_normalized_name",
        "borrower",
        [sa.text("lower(trim(firstName))"), sa.text("lower(trim(lastName))")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_borrower_normalized_name", table_name="borrower")
    op.drop_table("borrower")
