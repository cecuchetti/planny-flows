"""add user role and app_setting

Adds the two tables/columns the runtime configuration feature needs:

* ``user.role`` — the authorization role. The settings module reads and writes
  infrastructure credentials, so it must not be reachable by every authenticated
  user; before this column existed, all users had identical privileges,
  including the anonymous accounts created by ``POST /authentication/guest``.
* ``app_setting`` — the runtime settings store, which holds overrides only.
  Absence of a row means "no override", which is what lets a value fall back to
  the environment and then to the code default.

Revision ID: 4f1c8a6d2e35
Revises: 2a7d9f3e8b1c
Create Date: 2026-10-05 18:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4f1c8a6d2e35"
down_revision: Union[str, None] = "2a7d9f3e8b1c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── user.role ─────────────────────────────────────────────────────────────
    # server_default backfills existing rows; without it the column could not be
    # NOT NULL on a populated table. The default is the unprivileged role, so a
    # missed value can never grant access.
    op.add_column(
        "user",
        sa.Column("role", sa.String(length=20), nullable=False, server_default="member"),
    )
    op.create_index("ix_user_role", "user", ["role"])

    # ── app_setting ───────────────────────────────────────────────────────────
    op.create_table(
        "app_setting",
        sa.Column("key", sa.String(length=120), primary_key=True),
        # NULL means "not overridden here"; the resolver falls through.
        # Holds JSON, encrypted when is_secret is set.
        sa.Column("value", sa.Text(), nullable=True),
        sa.Column("is_secret", sa.Boolean(), nullable=False, server_default=sa.false()),
        # Identifies which master key encrypted the row, so keys can be rotated.
        sa.Column("key_id", sa.String(length=40), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("updated_by", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["updated_by"], ["user.id"], name="fk_app_setting_updated_by"),
    )


def downgrade() -> None:
    op.drop_table("app_setting")
    op.drop_index("ix_user_role", table_name="user")
    op.drop_column("user", "role")
