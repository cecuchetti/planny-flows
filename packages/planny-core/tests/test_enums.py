"""Tests for planny_core.enums — domain enums."""

from __future__ import annotations

from planny_core.enums import (
    IssuePriority,
    IssueStatus,
    IssueType,
    ProjectCategory,
)


class TestIssueType:
    def test_values(self) -> None:
        assert IssueType.TASK.value == "task"
        assert IssueType.BUG.value == "bug"
        assert IssueType.STORY.value == "story"

    def test_members(self) -> None:
        assert set(IssueType.__members__) == {"TASK", "BUG", "STORY"}

    def test_is_str_enum(self) -> None:
        """str + Enum base so values serialise as strings."""
        assert isinstance(IssueType.TASK.value, str)


class TestIssueStatus:
    def test_values(self) -> None:
        assert IssueStatus.BACKLOG.value == "backlog"
        assert IssueStatus.SELECTED.value == "selected"
        assert IssueStatus.INPROGRESS.value == "inprogress"
        assert IssueStatus.DONE.value == "done"

    def test_members(self) -> None:
        assert set(IssueStatus.__members__) == {
            "BACKLOG",
            "SELECTED",
            "INPROGRESS",
            "DONE",
        }


class TestIssuePriority:
    def test_values_are_number_strings(self) -> None:
        assert IssuePriority.HIGHEST.value == "5"
        assert IssuePriority.HIGH.value == "4"
        assert IssuePriority.MEDIUM.value == "3"
        assert IssuePriority.LOW.value == "2"
        assert IssuePriority.LOWEST.value == "1"

    def test_members(self) -> None:
        assert set(IssuePriority.__members__) == {
            "HIGHEST",
            "HIGH",
            "MEDIUM",
            "LOW",
            "LOWEST",
        }


class TestProjectCategory:
    def test_values(self) -> None:
        assert ProjectCategory.SOFTWARE.value == "software"
        assert ProjectCategory.MARKETING.value == "marketing"
        assert ProjectCategory.BUSINESS.value == "business"

    def test_members(self) -> None:
        assert set(ProjectCategory.__members__) == {
            "SOFTWARE",
            "MARKETING",
            "BUSINESS",
        }
