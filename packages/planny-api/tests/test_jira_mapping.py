"""Tests for the pure Jira-to-local mapping.

Splitting these out of the sync service is what makes them testable without a
database, a Jira client or configuration. The last class is a regression suite:
the mapping used to overwrite the reporter based on the display name.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from planny_core.enums import ProjectSourceType

from planny_api.modules.jira.sync.mapping import (
    DEFAULT_ISSUE_TYPE,
    DEFAULT_PRIORITY,
    adf_to_html,
    adf_to_text,
    jira_user_identity,
    map_jira_issue_to_local,
    map_jira_status,
    seconds_to_hours,
)


class TestMapJiraStatus:
    """Jira statuses are free-form, so matching is by substring."""

    @pytest.mark.parametrize(
        "jira_status",
        ["Backlog", "To Do", "TODO", "Open", "backlog"],
    )
    def test_backlog_family(self, jira_status: str) -> None:
        assert map_jira_status(jira_status) == "backlog"

    @pytest.mark.parametrize("jira_status", ["Selected for Development", "Ready", "Approved"])
    def test_selected_family(self, jira_status: str) -> None:
        assert map_jira_status(jira_status) == "selected"

    @pytest.mark.parametrize("jira_status", ["In Progress", "Doing", "In Review", "QA"])
    def test_in_progress_family(self, jira_status: str) -> None:
        assert map_jira_status(jira_status) == "inprogress"

    @pytest.mark.parametrize("jira_status", ["Done", "Closed", "Resolved", "Verified"])
    def test_done_family(self, jira_status: str) -> None:
        assert map_jira_status(jira_status) == "done"

    @pytest.mark.parametrize("jira_status", ["", "   ", "Something Unmapped"])
    def test_unmapped_falls_back_to_backlog(self, jira_status: str) -> None:
        assert map_jira_status(jira_status) == "backlog"

    def test_is_case_insensitive(self) -> None:
        assert map_jira_status("IN PROGRESS") == "inprogress"


class TestSecondsToHours:
    """Jira reports durations in seconds."""

    def test_none_passes_through(self) -> None:
        assert seconds_to_hours(None) is None

    def test_zero(self) -> None:
        assert seconds_to_hours(0) == 0

    @pytest.mark.parametrize("seconds,expected", [(3600, 1), (7200, 2), (28800, 8)])
    def test_whole_hours_are_integers(self, seconds: int, expected: int) -> None:
        result = seconds_to_hours(seconds)
        assert result == expected
        assert isinstance(result, int)

    def test_fractional_hours_are_rounded(self) -> None:
        assert seconds_to_hours(5400) == 1.5

    def test_rounds_to_two_decimals(self) -> None:
        assert seconds_to_hours(1) == 0.0


class TestAdfToText:
    """Atlassian Document Format is flattened to plain text."""

    def test_empty_values(self) -> None:
        assert adf_to_text(None) == ""
        assert adf_to_text("") == ""
        assert adf_to_text({}) == ""

    def test_plain_string_passes_through(self) -> None:
        assert adf_to_text("already text") == "already text"

    def test_non_dict_is_ignored(self) -> None:
        assert adf_to_text(42) == ""

    def test_text_node(self) -> None:
        assert adf_to_text({"type": "text", "text": "hello"}) == "hello"

    def test_paragraph_gets_a_trailing_newline(self) -> None:
        node = {
            "type": "paragraph",
            "content": [{"type": "text", "text": "first"}],
        }
        assert adf_to_text(node) == "first\n"

    def test_nested_content_is_concatenated(self) -> None:
        node = {
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "a"}]},
                {"type": "paragraph", "content": [{"type": "text", "text": "b"}]},
            ],
        }
        assert adf_to_text(node) == "a\nb\n"


class TestAdfToHtml:
    """Atlassian Document Format is rendered as the HTML subset the client allows."""

    def test_empty_values(self) -> None:
        assert adf_to_html(None) == ""
        assert adf_to_html("") == ""
        assert adf_to_html({}) == ""

    def test_non_dict_is_ignored(self) -> None:
        assert adf_to_html(42) == ""

    def test_plain_string_passes_through(self) -> None:
        assert adf_to_html("<p>already html</p>") == "<p>already html</p>"

    def test_empty_content_array(self) -> None:
        assert adf_to_html({"type": "doc", "content": []}) == ""

    def test_heading_paragraph_list_and_code_block(self) -> None:
        """The required node set, mapped to their semantic tags."""
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "heading",
                    "attrs": {"level": 2},
                    "content": [{"type": "text", "text": "Plan"}],
                },
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "normal "},
                        {"type": "text", "marks": [{"type": "strong"}], "text": "bold"},
                        {"type": "text", "marks": [{"type": "em"}], "text": " italic"},
                    ],
                },
                {
                    "type": "bulletList",
                    "content": [
                        {
                            "type": "listItem",
                            "content": [
                                {
                                    "type": "paragraph",
                                    "content": [{"type": "text", "text": "one"}],
                                }
                            ],
                        },
                        {
                            "type": "listItem",
                            "content": [
                                {
                                    "type": "paragraph",
                                    "content": [{"type": "text", "text": "two"}],
                                }
                            ],
                        },
                    ],
                },
                {
                    "type": "codeBlock",
                    "content": [{"type": "text", "text": "x = 1"}],
                },
            ],
        }
        assert adf_to_html(doc) == (
            "<h2>Plan</h2>"
            "<p>normal <strong>bold</strong><em> italic</em></p>"
            "<ul><li><p>one</p></li><li><p>two</p></li></ul>"
            "<pre><code>x = 1</code></pre>"
        )

    def test_ordered_list_and_blockquote(self) -> None:
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "orderedList",
                    "content": [
                        {
                            "type": "listItem",
                            "content": [
                                {"type": "paragraph", "content": [{"type": "text", "text": "a"}]}
                            ],
                        }
                    ],
                },
                {
                    "type": "blockquote",
                    "content": [
                        {"type": "paragraph", "content": [{"type": "text", "text": "quoted"}]}
                    ],
                },
            ],
        }
        assert adf_to_html(doc) == (
            "<ol><li><p>a</p></li></ol><blockquote><p>quoted</p></blockquote>"
        )

    def test_hard_break_inside_paragraph(self) -> None:
        doc = {
            "type": "paragraph",
            "content": [
                {"type": "text", "text": "line1"},
                {"type": "hardBreak"},
                {"type": "text", "text": "line2"},
            ],
        }
        assert adf_to_html(doc) == "<p>line1<br>line2</p>"

    def test_link_mark_becomes_anchor(self) -> None:
        node = {
            "type": "text",
            "marks": [{"type": "link", "attrs": {"href": "https://example.com"}}],
            "text": "docs",
        }
        assert adf_to_html(node) == (
            '<a href="https://example.com" target="_blank" rel="noopener noreferrer">docs</a>'
        )

    def test_underline_and_strike_marks(self) -> None:
        underlined = {"type": "text", "marks": [{"type": "underline"}], "text": "u"}
        struck = {"type": "text", "marks": [{"type": "strike"}], "text": "s"}
        assert adf_to_html(underlined) == "<u>u</u>"
        assert adf_to_html(struck) == "<s>s</s>"

    def test_heading_level_is_clamped(self) -> None:
        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "heading",
                    "attrs": {"level": 9},
                    "content": [{"type": "text", "text": "big"}],
                },
                {
                    "type": "heading",
                    "attrs": {"level": 0},
                    "content": [{"type": "text", "text": "small"}],
                },
            ],
        }
        assert adf_to_html(doc) == "<h6>big</h6><h1>small</h1>"

    def test_code_block_renders_raw_text_without_marks(self) -> None:
        doc = {
            "type": "codeBlock",
            "content": [
                {"type": "text", "marks": [{"type": "strong"}], "text": "keep <raw>"}
            ],
        }
        assert adf_to_html(doc) == "<pre><code>keep &lt;raw&gt;</code></pre>"

    def test_text_and_href_are_escaped(self) -> None:
        """Jira content is never trusted: text and link hrefs are escaped."""
        node = {
            "type": "paragraph",
            "content": [
                {
                    "type": "text",
                    "marks": [
                        {"type": "link", "attrs": {"href": 'https://x.com/"onclick="evil'}}
                    ],
                    "text": '<script>alert("xss")</script>',
                }
            ],
        }
        result = adf_to_html(node)
        assert "&lt;script&gt;" in result
        assert "<script>" not in result
        # The quote is escaped, so the attribute cannot be broken out of.
        assert 'href="https://x.com/&quot;onclick' in result

    def test_mentions_are_dropped_without_losing_the_paragraph(self) -> None:
        """Nodes without a required mapping render nothing but don't kill text."""
        doc = {
            "type": "paragraph",
            "content": [
                {"type": "text", "text": "hi "},
                {"type": "mention", "attrs": {"id": "u1", "text": "Ada"}},
            ],
        }
        assert adf_to_html(doc) == "<p>hi </p>"


class TestJiraUserIdentity:
    """Identity extraction, including Jira's hidden-email case."""

    def test_none_and_empty(self) -> None:
        assert jira_user_identity(None) is None
        assert jira_user_identity({}) is None

    def test_email_address_is_used(self) -> None:
        identity = jira_user_identity(
            {"displayName": "Ada", "emailAddress": "ada@example.com"}
        )
        assert identity == ("Ada", "ada@example.com", None)

    def test_avatar_is_extracted(self) -> None:
        identity = jira_user_identity(
            {
                "displayName": "Ada",
                "emailAddress": "ada@example.com",
                "avatarUrls": {"24x24": "https://avatar"},
            }
        )
        assert identity is not None
        assert identity[2] == "https://avatar"

    def test_account_id_is_used_when_the_email_is_hidden(self) -> None:
        """Jira omits emailAddress for users who hide it."""
        identity = jira_user_identity({"displayName": "Ada", "accountId": "abc123"})
        assert identity == ("Ada", "abc123@jira.placeholder", None)

    def test_missing_display_name_falls_back(self) -> None:
        identity = jira_user_identity({"accountId": "abc123"})
        assert identity is not None
        assert identity[0] == "Jira User"

    def test_no_usable_identity(self) -> None:
        assert jira_user_identity({"displayName": "Ada"}) is None


def _issue(**field_overrides: object) -> dict[str, object]:
    """Build a minimal Jira search-result entry."""
    fields: dict[str, object] = {
        "summary": "A summary",
        "status": {"name": "In Progress"},
        "issuetype": {"name": "Story"},
        "priority": {"name": "High"},
        "created": "2026-01-02T03:04:05.000+0000",
        "description": {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Body"}]}],
        },
        "timetracking": {
            "originalEstimateSeconds": 3600,
            "timeSpentSeconds": 1800,
            "remainingEstimateSeconds": 1800,
        },
        "project": {"key": "VIS", "name": "Visible"},
        "reporter": {"displayName": "Ada", "emailAddress": "ada@example.com"},
    }
    fields.update(field_overrides)
    return {"key": "VIS-1", "fields": fields}


class TestMapJiraIssueToLocal:
    """The whole mapping, as a pure function."""

    def test_maps_every_field(self) -> None:
        result = map_jira_issue_to_local(
            _issue(), project_id=10, reporter_id=7, max_list_position=5.0
        )

        assert result["external_key"] == "VIS-1"
        assert result["title"] == "A summary"
        assert result["type"] == "story"
        assert result["status"] == "inprogress"
        assert result["priority"] == "4"
        assert result["description"] == "<p>Body</p>"
        assert result["estimate"] == 1
        assert result["timeSpent"] == 0.5
        assert result["timeRemaining"] == 0.5
        assert result["listPosition"] == 6.0
        assert result["reporterId"] == 7
        assert result["projectId"] == 10

    def test_marks_the_issue_read_only_and_jira_sourced(self) -> None:
        result = map_jira_issue_to_local(_issue(), 1, 1, 0.0)
        assert result["readonly"] is True
        assert result["source_type"] == ProjectSourceType.JIRA.value

    def test_unknown_type_and_priority_use_defaults(self) -> None:
        result = map_jira_issue_to_local(
            _issue(issuetype={"name": "Spike"}, priority={"name": "Blocker"}), 1, 1, 0.0
        )
        assert result["type"] == DEFAULT_ISSUE_TYPE
        assert result["priority"] == DEFAULT_PRIORITY

    def test_missing_optional_blocks_do_not_raise(self) -> None:
        jira_issue: dict[str, object] = {"key": "VIS-2", "fields": {}}
        result = map_jira_issue_to_local(jira_issue, 1, 1, 0.0)

        assert result["title"] == ""
        assert result["status"] == "backlog"
        assert result["description"] == ""
        assert result["estimate"] is None
        assert result["timeSpent"] is None

    def test_naive_utc_created_at(self) -> None:
        result = map_jira_issue_to_local(_issue(), 1, 1, 0.0)
        created = result["createdAt"]
        assert isinstance(created, datetime)
        assert created.tzinfo is None

    def test_unparseable_created_at_falls_back_to_now(self) -> None:
        before = datetime.now(UTC).replace(tzinfo=None)
        result = map_jira_issue_to_local(_issue(created="not-a-date"), 1, 1, 0.0)
        created = result["createdAt"]
        assert isinstance(created, datetime)
        assert created >= before


class TestReporterIsNotGuessedFromTheName:
    """Regression: the mapping used to overwrite the reporter by display name.

    The old code returned hardcoded local ids based on a substring match::

        if "rick" in display_name: return 3

    Those ids belong to whatever rows exist, so any Jira user named "Rick" was
    silently attributed to an unrelated local account.
    """

    @pytest.mark.parametrize(
        "reporter",
        [
            {"displayName": "Pickle Rick", "emailAddress": "rick@example.com"},
            {"displayName": "Baby Yoda", "emailAddress": "yoda@example.com"},
            {"displayName": "Lord Gaben", "emailAddress": "gaben@example.com"},
        ],
    )
    def test_reporter_id_is_taken_from_the_caller(self, reporter: dict[str, str]) -> None:
        result = map_jira_issue_to_local(_issue(reporter=reporter), 1, 99, 0.0)
        assert result["reporterId"] == 99

    def test_mapping_is_pure(self) -> None:
        """Same input, same output: no hidden state or configuration."""
        jira_issue = _issue()
        first = map_jira_issue_to_local(jira_issue, 1, 5, 2.0)
        second = map_jira_issue_to_local(jira_issue, 1, 5, 2.0)
        assert first == second
