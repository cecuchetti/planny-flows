"""add_source_aware_columns_and_user_projects

Revision ID: 2a7d9f3e8b1c
Revises: 8818096fbc8f
Create Date: 2026-07-11 16:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2a7d9f3e8b1c"
down_revision: Union[str, None] = "8818096fbc8f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Add columns to project table ──────────────────────────────────────────
    op.add_column("project", sa.Column("source_type", sa.String(length=20), nullable=False, server_default="local"))
    op.add_column("project", sa.Column("external_key", sa.String(length=50), nullable=True))
    op.add_column("project", sa.Column("external_id", sa.String(length=100), nullable=True))
    op.add_column("project", sa.Column("last_synced_at", sa.DateTime(), nullable=True))

    # ── Add columns to issue table ────────────────────────────────────────────
    op.add_column("issue", sa.Column("source_type", sa.String(length=20), nullable=False, server_default="local"))
    op.add_column("issue", sa.Column("external_key", sa.String(length=50), nullable=True))
    op.add_column("issue", sa.Column("readonly", sa.Boolean(), nullable=False, server_default=sa.text("0")))

    # Create unique index on issue.external_key (SQLite doesn't support
    # ALTER TABLE ADD CONSTRAINT, so a unique index is used instead).
    op.create_index("uq_issue_external_key", "issue", ["external_key"], unique=True)

    # ── Create user_projects join table ────────────────────────────────────────
    op.create_table(
        "user_projects",
        sa.Column("userId", sa.Integer(), nullable=False),
        sa.Column("projectId", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["userId"], ["user.id"], name="fk_user_projects_user"),
        sa.ForeignKeyConstraint(["projectId"], ["project.id"], name="fk_user_projects_project"),
        sa.PrimaryKeyConstraint("userId", "projectId", name="pk_user_projects"),
    )

    # ── Data migration: set source_type for existing rows ─────────────────────
    op.execute("UPDATE project SET source_type = 'local'")
    op.execute("UPDATE issue SET source_type = 'local'")

    # ── Data migration: populate user_projects from existing FK ───────────────
    op.execute("INSERT INTO user_projects (userId, projectId) SELECT id, projectId FROM user")


def downgrade() -> None:
    # ── Drop user_projects table ──────────────────────────────────────────────
    op.drop_table("user_projects")

    # ── Drop unique index on issue.external_key ───────────────────────────────
    op.drop_index("uq_issue_external_key", table_name="issue")

    # ── Drop columns from issue table ─────────────────────────────────────────
    op.drop_column("issue", "readonly")
    op.drop_column("issue", "external_key")
    op.drop_column("issue", "source_type")

    # ── Drop columns from project table ───────────────────────────────────────
    op.drop_column("project", "last_synced_at")
    op.drop_column("project", "external_id")
    op.drop_column("project", "external_key")
    op.drop_column("project", "source_type")
