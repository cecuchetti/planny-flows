"""add payment records with their frozen snapshots"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "7d1f4b2c9a30"
down_revision: Union[str, None] = "9c3e5a7b1d20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "payment",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("loan_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("date", sa.DateTime(), nullable=False),
        sa.Column(
            "pendingBalanceAtPayment", sa.Numeric(precision=14, scale=2), nullable=False
        ),
        sa.Column("totalPaidAtPayment", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("advancePaidAtPayment", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("paymentsHistoryAtPayment", sa.JSON(), nullable=False),
        sa.Column("createdAt", sa.DateTime(), nullable=False),
        # Mirrors the model's ``ondelete="CASCADE"``: the service deletes a
        # loan's payments explicitly, so this is the database-level backstop for
        # any other writer, and without it the DDL and the model disagree.
        sa.ForeignKeyConstraint(["loan_id"], ["loan.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_payment_loan_id", "payment", ["loan_id"])


def downgrade() -> None:
    op.drop_index("ix_payment_loan_id", table_name="payment")
    op.drop_table("payment")
