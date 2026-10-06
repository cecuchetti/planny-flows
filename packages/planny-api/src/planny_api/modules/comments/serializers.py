"""Comment presentation shapes."""

from __future__ import annotations

from planny_core.models import Comment

from planny_api.serializers import user_to_dict

__all__ = ["comment_to_dict"]


def comment_to_dict(comment: Comment) -> dict[str, object]:
    """Serialize a comment with its nested author."""
    return {
        "id": comment.id,
        "body": comment.body,
        "userId": comment.userId,
        "issueId": comment.issueId,
        "createdAt": comment.createdAt.isoformat() if comment.createdAt else None,
        "updatedAt": comment.updatedAt.isoformat() if comment.updatedAt else None,
        "user": user_to_dict(comment.user) if comment.user else None,
    }
