"""Tests for project path resolution and startup configuration validation.

Regression coverage for finding H13: ``env_file`` used to be relative to the
process working directory, so running from another directory silently dropped
the whole configuration and fell back to defaults, including the publicly known
development JWT secret.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from planny_core.config import DEV_JWT_SECRET, Settings, paths
from planny_core.errors import InsecureConfigurationError


class TestProjectRoot:
    """``project_root()`` must resolve to the workspace root, not a sub-package."""

    def test_resolves_to_workspace_root(self) -> None:
        """The root owns both ``pyproject.toml`` and ``packages/``."""
        root = paths.project_root()
        assert (root / "pyproject.toml").is_file()
        assert (root / "packages").is_dir()

    def test_is_not_a_workspace_subpackage(self) -> None:
        """Regression: stopping at the first ``pyproject.toml`` picked the wrong root.

        Workspace sub-packages such as ``packages/planny-core`` also contain a
        ``pyproject.toml``, so an innermost-first search resolves to them and
        then looks for a nonexistent ``.env`` -- silently disabling all
        configuration.
        """
        root = paths.project_root()
        assert (root / "packages" / "planny-core").is_dir()
        assert not (root / "src").exists()

    def test_does_not_depend_on_working_directory(
        self,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Resolving from another directory yields the same root (H13)."""
        expected = paths.project_root()
        monkeypatch.chdir(tmp_path)
        assert paths.project_root() == expected

    def test_env_override_wins(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        """``PLANNY_ROOT`` takes precedence over repository discovery."""
        monkeypatch.setenv(paths.ROOT_OVERRIDE_ENV, str(tmp_path))
        assert paths.project_root() == tmp_path.resolve()

    def test_project_root_constant_matches_function(self) -> None:
        """The module-level constant is the function result."""
        assert paths.PROJECT_ROOT == paths.project_root()


class TestEnvFile:
    """The env file path must be absolute."""

    def test_env_file_is_absolute(self) -> None:
        assert Path(paths.env_file()).is_absolute()

    def test_env_file_lives_in_project_root(self) -> None:
        assert Path(paths.env_file()).parent == paths.PROJECT_ROOT


class TestStartupValidation:
    """``validate_for_startup`` fails closed on unsafe production config.

    Note: the ``env`` field is aliased to ``NODE_ENV``, so it must be set
    through the environment (or the alias), not by field name.
    """

    @staticmethod
    def _settings() -> Settings:
        """Build settings from the environment only, ignoring any ``.env`` file."""
        return Settings(_env_file=None)

    def test_aborts_in_production_with_dev_secret(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("NODE_ENV", "production")
        monkeypatch.setenv("JWT_SECRET", DEV_JWT_SECRET)
        with pytest.raises(InsecureConfigurationError, match="JWT_SECRET"):
            self._settings().validate_for_startup()

    def test_allows_production_with_custom_secret(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("NODE_ENV", "production")
        monkeypatch.setenv("JWT_SECRET", "a-real-unique-secret")
        self._settings().validate_for_startup()

    def test_allows_development_with_dev_secret(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("NODE_ENV", "development")
        monkeypatch.setenv("JWT_SECRET", DEV_JWT_SECRET)
        self._settings().validate_for_startup()

    def test_helpers_report_expected_state(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("NODE_ENV", "production")
        monkeypatch.setenv("JWT_SECRET", DEV_JWT_SECRET)
        prod_dev = self._settings()
        assert prod_dev.is_production()
        assert prod_dev.uses_dev_jwt_secret()

        monkeypatch.setenv("NODE_ENV", "development")
        monkeypatch.setenv("JWT_SECRET", "x")
        dev_real = self._settings()
        assert not dev_real.is_production()
        assert not dev_real.uses_dev_jwt_secret()
