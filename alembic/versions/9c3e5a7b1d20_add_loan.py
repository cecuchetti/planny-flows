"""add loan records"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "9c3e5a7b1d20"
down_revision: Union[str, None] = "6b4f2c9d1a77"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "loan",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("borrower_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("advancePaid", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("installmentAmount", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("concept", sa.String(length=500), nullable=False),
        sa.Column("lender", sa.String(length=200), nullable=False),
        sa.Column("city", sa.String(length=120), nullable=False),
        sa.Column("createdAt", sa.DateTime(), nullable=False),
        sa.Column("updatedAt", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["borrower_id"], ["borrower.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("uq_loan_number", "loan", ["number"], unique=True)
    op.create_index("ix_loan_borrower_id", "loan", ["borrower_id"])


def downgrade() -> None:
    op.drop_index("ix_loan_borrower_id", table_name="loan")
    op.drop_index("uq_loan_number", table_name="loan")
    op.drop_table("loan")
