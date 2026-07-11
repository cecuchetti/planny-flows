"""Shared serializers — convert domain models to camelCase dicts.

All serializers produce dicts with camelCase keys matching the
Node.js/TypeScript backend response format exactly.

Usage:
    from planny_api.serializers import issue_partial, project_to_dict, user_to_dict
"""

from __future__ import annotations

from planny_core.models import Issue, Project, User


def issue_partial(issue: Issue) -> dict[str, object]:
    """Serialize an Issue as a partial (matching Node's ``issuePartial``).

    Includes only the fields the frontend needs for list/board views.
    ``listPosition`` is a float, ``userIds`` is a list of ints.
    """
    return {
        "id": issue.id,
        "title": issue.title,
        "type": issue.type,
        "status": issue.status,
        "priority": issue.priority,
        "listPosition": issue.listPosition,
        "description": issue.description,
        "descriptionText": issue.descriptionText,
        "estimate": issue.estimate,
        "timeSpent": issue.timeSpent,
        "timeRemaining": issue.timeRemaining,
        "reporterId": issue.reporterId,
        "projectId": issue.projectId,
        "createdAt": issue.createdAt.isoformat() if issue.createdAt else None,
        "updatedAt": issue.updatedAt.isoformat() if issue.updatedAt else None,
        "userIds": [u.id for u in issue.users] if issue.users else [],
    }


def project_to_dict(project: Project, *, include_issues: bool = True) -> dict[str, object]:
    """Serialize a Project with its users (and optional issues).

    The Node ``GET /project`` returns ``issues`` as partials and
    ``users`` as full user objects. ``PUT /project`` passes
    ``include_issues=False`` to skip loading the issues relationship.
    """
    result = {
        "id": project.id,
        "name": project.name,
        "url": project.url,
        "description": project.description,
        "category": project.category,
        "createdAt": project.createdAt.isoformat() if project.createdAt else None,
        "updatedAt": project.updatedAt.isoformat() if project.updatedAt else None,
        "users": [user_to_dict(u) for u in project.users] if project.users else [],
    }
    if include_issues:
        result["issues"] = (
            [issue_partial(i) for i in project.issues] if project.issues else []
        )
    return result


def user_to_dict(user: User) -> dict[str, object]:
    """Serialize a User (matching Node's ``User`` entity JSON).

    Note: ``avatarUrl`` is camelCase to match the TypeORM column name.
    """
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "avatarUrl": user.avatarUrl,
        "projectId": user.projectId,
        "createdAt": user.createdAt.isoformat() if user.createdAt else None,
        "updatedAt": user.updatedAt.isoformat() if user.updatedAt else None,
    }
