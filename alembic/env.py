"""Alembic migrations environment — configured for planny-core models.

Imports all SQLAlchemy models to populate ``Base.metadata``, then sets
``target_metadata`` so ``--autogenerate`` can detect schema changes.
"""

from logging.config import fileConfig

from alembic import context

# ── Ensure the planny-core package is importable ──────────────────────────────
import sys
from pathlib import Path

# Add planny-core source to path so models are importable.
# ``prepend_sys_path = .`` in alembic.ini adds project root.
# We need the package source nest under packages/planny-core/src.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_PROJECT_ROOT / "packages" / "planny-core" / "src"))

# ── Load models so metadata is populated ──────────────────────────────────────
from planny_core.database import Base
from planny_core.models import (  # noqa: F401 — registers all tables
    Comment,
    DailyHours,
    ExternalHoursDaily,
    Issue,
    Project,
    TempoHoursDaily,
    User,
    WorklogSubmission,
    WorklogSubmissionResult,
    issue_users,
)

# ── Alembic config ────────────────────────────────────────────────────────────
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    Configures the context with just a URL and not an Engine,
    emitting SQL as a script instead of executing it directly.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    Creates an Engine and associates a connection with the context.
    """
    from sqlalchemy import create_engine

    connectable = create_engine(config.get_main_option("sqlalchemy.url"))

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
