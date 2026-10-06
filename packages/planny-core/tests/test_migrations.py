"""Migration hygiene.

Alembic's CLI is not currently a declared dependency (finding H15), so these
checks parse the migration files directly. A broken revision chain is a silent
failure: ``alembic upgrade head`` either refuses to run or applies the wrong
order, and nothing in the test suite would notice.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest

from planny_core.config.paths import PROJECT_ROOT

MIGRATIONS_DIR = PROJECT_ROOT / "alembic" / "versions"


def _migration_files() -> list[Path]:
    return sorted(path for path in MIGRATIONS_DIR.glob("*.py") if path.name != "__init__.py")


def _literal(path: Path, name: str) -> str | None:
    """Read a module-level ``name: str = "..."`` assignment.

    Returns ``None`` both when the name is absent and when it is explicitly
    ``None`` — a root migration legitimately declares ``down_revision = None``,
    and collapsing that to the string ``"None"`` would hide it.
    """
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            if node.target.id == name and isinstance(node.value, ast.Constant):
                value = node.value.value
                return None if value is None else str(value)
    return None


def _has_function(path: Path, name: str) -> bool:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    return any(
        isinstance(node, ast.FunctionDef) and node.name == name for node in tree.body
    )


class TestMigrationFiles:
    """Every migration file is well formed."""

    def test_migrations_exist(self) -> None:
        assert _migration_files(), f"no migrations found under {MIGRATIONS_DIR}"

    @pytest.mark.parametrize("path", _migration_files(), ids=lambda p: p.stem)
    def test_parses_and_declares_revision(self, path: Path) -> None:
        revision = _literal(path, "revision")
        assert revision, f"{path.name} does not declare a revision id"
        assert _has_function(path, "upgrade"), f"{path.name} has no upgrade()"
        assert _has_function(path, "downgrade"), f"{path.name} has no downgrade()"


class TestRevisionChain:
    """The chain is linear, complete and has a single head."""

    def test_revision_ids_are_unique(self) -> None:
        revisions = [_literal(path, "revision") for path in _migration_files()]
        assert len(revisions) == len(set(revisions)), "duplicate revision ids"

    def test_down_revisions_reference_existing_revisions(self) -> None:
        revisions = {_literal(path, "revision") for path in _migration_files()}
        for path in _migration_files():
            down = _literal(path, "down_revision")
            if down is not None:
                assert down in revisions, (
                    f"{path.name} revises {down!r}, which no migration declares"
                )

    def test_exactly_one_head(self) -> None:
        """More than one head means two branches that ``upgrade head`` cannot merge."""
        revisions = {_literal(path, "revision") for path in _migration_files()}
        referenced = {
            _literal(path, "down_revision")
            for path in _migration_files()
            if _literal(path, "down_revision") is not None
        }
        heads = revisions - referenced
        assert len(heads) == 1, f"expected exactly one head, found {sorted(heads)}"

    def test_exactly_one_root(self) -> None:
        roots = [
            path
            for path in _migration_files()
            if _literal(path, "down_revision") is None
        ]
        assert len(roots) == 1, f"expected a single root migration, found {len(roots)}"

    def test_the_chain_covers_every_migration(self) -> None:
        """Walking from the root must visit every file exactly once."""
        by_down: dict[str | None, str] = {}
        revisions = {}
        for path in _migration_files():
            revision = _literal(path, "revision")
            assert revision is not None
            revisions[revision] = path
            by_down[_literal(path, "down_revision")] = revision

        visited: list[str] = []
        current = by_down.get(None)
        while current is not None:
            visited.append(current)
            current = by_down.get(current)

        assert len(visited) == len(revisions), (
            f"the chain reaches {len(visited)} of {len(revisions)} migrations"
        )


class TestSchemaFollowsTheMigrations:
    """The model metadata and the migrations agree on the essentials."""

    def test_user_role_column_exists_in_metadata(self) -> None:
        import planny_core.models  # noqa: F401 - registers every table
        from planny_core.db.base import Base

        columns = {column.name for column in Base.metadata.tables["user"].columns}
        assert "role" in columns

    def test_app_setting_table_exists_in_metadata(self) -> None:
        import planny_core.models  # noqa: F401 - registers every table
        from planny_core.db.base import Base

        assert "app_setting" in Base.metadata.tables

    def test_some_migration_mentions_each_new_object(self) -> None:
        """Guards against adding a model and forgetting the migration."""
        sources = "\n".join(path.read_text(encoding="utf-8") for path in _migration_files())
        assert re.search(r'add_column\(\s*"user"', sources), "user.role migration is missing"
        assert "create_table(\n        \"app_setting\"" in sources or "app_setting" in sources
