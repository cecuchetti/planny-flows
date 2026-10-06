"""Guest account seeder.

The seed content lives in ``seeds/guest_project.json`` instead of ~430 lines of
literals inside the router. Keeping it as data means the sample project can be
reviewed, diffed and replaced without touching application code.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from planny_core.models import Comment, Issue, Project, User, issue_users, user_projects
from sqlalchemy.ext.asyncio import AsyncSession

__all__ = ["GUEST_EMAIL_SUFFIX", "GuestSeed", "create_guest_account", "load_guest_seed"]

#: Marks an account as a demo/guest account. Used to detect an existing seed.
GUEST_EMAIL_SUFFIX = "@jira.guest"

SEED_PATH = Path(__file__).resolve().parent / "seeds" / "guest_project.json"


@dataclass(frozen=True, slots=True)
class GuestSeed:
    """Parsed seed data for the guest account."""

    project: dict[str, Any]
    users: list[dict[str, Any]]
    issues: list[dict[str, Any]]
    comments: list[dict[str, Any]]
    authentication_user_index: int


@lru_cache(maxsize=1)
def load_guest_seed() -> GuestSeed:
    """Load and validate the seed file once per process.

    Raises:
        FileNotFoundError: the packaged seed file is missing.
        ValueError: the file is malformed or references an out-of-range index.
    """
    raw = json.loads(SEED_PATH.read_text(encoding="utf-8"))

    try:
        seed = GuestSeed(
            project=raw["project"],
            users=raw["users"],
            issues=raw["issues"],
            comments=raw["comments"],
            authentication_user_index=raw["authentication_user_index"],
        )
    except KeyError as exc:
        raise ValueError(f"guest seed is missing required key {exc}") from exc

    _validate(seed)
    return seed


def _validate(seed: GuestSeed) -> None:
    """Fail loudly on a seed file that would produce a broken account."""
    user_count = len(seed.users)
    issue_count = len(seed.issues)

    if not seed.users or not seed.issues:
        raise ValueError("guest seed must define at least one user and one issue")

    if not 0 <= seed.authentication_user_index < user_count:
        raise ValueError("authentication_user_index is out of range")

    for index, issue in enumerate(seed.issues):
        reporter = issue.get("reporterIndex", 0)
        if not 0 <= reporter < user_count:
            raise ValueError(f"issue {index}: reporterIndex {reporter} is out of range")
        for assignee in issue.get("assigneeIndexes", []):
            if not 0 <= assignee < user_count:
                raise ValueError(f"issue {index}: assigneeIndex {assignee} is out of range")

    for index, comment in enumerate(seed.comments):
        if not 0 <= comment.get("issueIndex", -1) < issue_count:
            raise ValueError(f"comment {index}: issueIndex is out of range")
        if not 0 <= comment.get("userIndex", -1) < user_count:
            raise ValueError(f"comment {index}: userIndex is out of range")


async def create_guest_account(db: AsyncSession) -> User:
    """Create the guest project with its users, issues, assignments and comments.

    Returns:
        The user the caller should be authenticated as.
    """
    seed = load_guest_seed()

    project = Project(**seed.project)
    db.add(project)
    await db.flush()

    users = [User(**payload, projectId=project.id) for payload in seed.users]
    for user in users:
        db.add(user)
    await db.flush()

    # Association rows are inserted directly rather than through the
    # relationship: touching a lazy relationship here would raise
    # MissingGreenlet inside an async session.
    for user in users:
        await db.execute(
            user_projects.insert().values(userId=user.id, projectId=project.id)
        )

    issues = [
        Issue(
            title=payload["title"],
            type=payload["type"],
            status=payload["status"],
            priority=payload["priority"],
            listPosition=payload["listPosition"],
            description=payload.get("description"),
            estimate=payload.get("estimate"),
            timeSpent=payload.get("timeSpent"),
            reporterId=users[payload["reporterIndex"]].id,
            projectId=project.id,
        )
        for payload in seed.issues
    ]
    for issue in issues:
        db.add(issue)
    await db.flush()

    for index, payload in enumerate(seed.issues):
        for assignee_index in payload.get("assigneeIndexes", []):
            await db.execute(
                issue_users.insert().values(
                    issueId=issues[index].id,
                    userId=users[assignee_index].id,
                )
            )

    for payload in seed.comments:
        db.add(
            Comment(
                body=payload["body"],
                issueId=issues[payload["issueIndex"]].id,
                userId=users[payload["userIndex"]].id,
            )
        )
    await db.flush()

    return users[seed.authentication_user_index]
