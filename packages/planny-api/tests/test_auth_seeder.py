"""Tests for the guest account seeder.

The seed content used to be ~430 lines of Python literals inside the auth
router. It is now data, so these tests pin the shape of that data and the
validation that protects against a malformed file.
"""

from __future__ import annotations

import json
from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest
from planny_core.models import Issue, User

from planny_api.modules.auth.seeder import SEED_PATH, GuestSeed, load_guest_seed

EXPECTED_USERS = 3
EXPECTED_ISSUES = 8
EXPECTED_COMMENTS = 8


@pytest.fixture(autouse=True)
def _clear_seed_cache() -> None:
    """Each test reads the seed fresh."""
    load_guest_seed.cache_clear()
    yield
    load_guest_seed.cache_clear()


class TestSeedFile:
    """The packaged seed file is present and well formed."""

    def test_seed_file_exists(self) -> None:
        """Guards against the JSON being dropped from the distribution."""
        assert SEED_PATH.is_file(), f"missing packaged seed at {SEED_PATH}"

    def test_seed_file_is_valid_json(self) -> None:
        json.loads(SEED_PATH.read_text(encoding="utf-8"))

    def test_loads_with_expected_counts(self) -> None:
        seed = load_guest_seed()
        assert len(seed.users) == EXPECTED_USERS
        assert len(seed.issues) == EXPECTED_ISSUES
        assert len(seed.comments) == EXPECTED_COMMENTS

    def test_project_metadata(self) -> None:
        seed = load_guest_seed()
        assert seed.project["name"] == "singularity 1.0"
        assert seed.project["category"] == "software"

    def test_users_look_like_guest_accounts(self) -> None:
        seed = load_guest_seed()
        emails = [user["email"] for user in seed.users]
        assert all(email.endswith("@jira.guest") for email in emails)
        assert all(user["name"] and user["avatarUrl"] for user in seed.users)

    def test_authenticated_user_is_the_last_one(self) -> None:
        """Matches the original behaviour: the caller becomes the last seeded user."""
        seed = load_guest_seed()
        assert seed.authentication_user_index == len(seed.users) - 1

    def test_issues_carry_rich_content(self) -> None:
        """The sample board is only useful if the descriptions survived the move."""
        seed = load_guest_seed()
        for index, issue in enumerate(seed.issues):
            assert issue["title"], f"issue {index} has no title"
            assert issue["description"], f"issue {index} has no description"
            assert issue["type"] in {"task", "bug", "story"}
            assert issue["status"] in {"backlog", "selected", "inprogress", "done"}

    def test_every_comment_points_at_a_real_issue_and_user(self) -> None:
        seed = load_guest_seed()
        for comment in seed.comments:
            assert comment["issueIndex"] < len(seed.issues)
            assert comment["userIndex"] < len(seed.users)
            assert comment["body"]

    def test_assignments_reference_existing_users(self) -> None:
        seed = load_guest_seed()
        owners = [index for index, i in enumerate(seed.issues) if i["assigneeIndexes"]]
        assert owners, "at least one issue should be assigned in the sample data"
        for issue in seed.issues:
            for assignee in issue["assigneeIndexes"]:
                assert assignee < len(seed.users)


class TestSeedValidation:
    """A malformed seed file fails loudly instead of producing a broken account."""

    @staticmethod
    def _write(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, payload: dict) -> None:
        path = tmp_path / "guest_project.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        monkeypatch.setattr("planny_api.modules.auth.seeder.SEED_PATH", path)
        load_guest_seed.cache_clear()

    @staticmethod
    def _base() -> dict:
        return {
            "project": {"name": "p", "url": "u", "description": "d", "category": "software"},
            "authentication_user_index": 0,
            "users": [{"name": "u", "email": "e@jira.guest", "avatarUrl": "a"}],
            "issues": [
                {
                    "title": "t",
                    "type": "task",
                    "status": "backlog",
                    "priority": "3",
                    "listPosition": 1.0,
                    "reporterIndex": 0,
                    "assigneeIndexes": [],
                }
            ],
            "comments": [],
        }

    def test_missing_key_is_rejected(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        payload = self._base()
        del payload["comments"]
        self._write(tmp_path, monkeypatch, payload)
        with pytest.raises(ValueError, match="missing required key"):
            load_guest_seed()

    def test_out_of_range_reporter_is_rejected(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        payload = self._base()
        payload["issues"][0]["reporterIndex"] = 99
        self._write(tmp_path, monkeypatch, payload)
        with pytest.raises(ValueError, match="reporterIndex"):
            load_guest_seed()

    def test_out_of_range_assignee_is_rejected(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        payload = self._base()
        payload["issues"][0]["assigneeIndexes"] = [99]
        self._write(tmp_path, monkeypatch, payload)
        with pytest.raises(ValueError, match="assigneeIndex"):
            load_guest_seed()

    def test_out_of_range_authentication_user_is_rejected(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        payload = self._base()
        payload["authentication_user_index"] = 5
        self._write(tmp_path, monkeypatch, payload)
        with pytest.raises(ValueError, match="authentication_user_index"):
            load_guest_seed()

    def test_out_of_range_comment_issue_is_rejected(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        payload = self._base()
        payload["comments"] = [{"body": "b", "issueIndex": 42, "userIndex": 0}]
        self._write(tmp_path, monkeypatch, payload)
        with pytest.raises(ValueError, match="issueIndex"):
            load_guest_seed()


class TestSeedDataclass:
    """The parsed seed is a frozen value object."""

    def test_is_frozen(self) -> None:
        seed = load_guest_seed()
        assert isinstance(seed, GuestSeed)
        with pytest.raises(FrozenInstanceError):
            seed.users = []  # type: ignore[misc]


async def test_seeded_models_are_constructible() -> None:
    """The seed payloads map cleanly onto the ORM models."""
    seed = load_guest_seed()
    user = User(**seed.users[0], projectId=1)
    assert isinstance(user, User)

    issue = Issue(
        title=seed.issues[0]["title"],
        type=seed.issues[0]["type"],
        status=seed.issues[0]["status"],
        priority=seed.issues[0]["priority"],
        listPosition=seed.issues[0]["listPosition"],
        description=seed.issues[0]["description"],
        reporterId=user.id or 0,
        projectId=1,
    )
    assert isinstance(issue, Issue)
    assert issue.description
