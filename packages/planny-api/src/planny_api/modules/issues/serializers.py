"""Issue presentation shapes.

``issue_partial`` is part of the JSON contract shared with projects and lives in
:mod:`planny_api.serializers`. The full detail shape is specific to this module.
"""

from __future__ import annotations

from planny_core.models import Issue

from planny_api.serializers import issue_partial, user_to_dict

__all__ = ["issue_detail"]


def issue_detail(issue: Issue) -> dict[str, object]:
    """Serialize an issue with its users and its comments.

    The nested comment shape is glued here rather than shared, because no other
    endpoint nests comments inside an issue.
    """
    result: dict[str, object] = dict(issue_partial(issue))
    result["users"] = [user_to_dict(user) for user in issue.users] if issue.users else []
    result["comments"] = [
        {
            "id": comment.id,
            "body": comment.body,
            "userId": comment.userId,
            "issueId": comment.issueId,
            "createdAt": comment.createdAt.isoformat() if comment.createdAt else None,
            "updatedAt": comment.updatedAt.isoformat() if comment.updatedAt else None,
            **({"user": user_to_dict(comment.user)} if comment.user else {}),
        }
        for comment in (issue.comments or [])
    ]
    return result
