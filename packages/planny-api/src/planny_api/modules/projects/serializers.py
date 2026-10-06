"""Project presentation shapes.

The full project representation lives in :mod:`planny_api.serializers` because it
is part of the JSON contract shared with issues. The list summary is specific to
this module, so it lives here.
"""

from __future__ import annotations

from planny_core.models import Project

__all__ = ["project_summary"]


def project_summary(project: Project) -> dict[str, object]:
    """Serialize a project for the list endpoint.

    Intentionally lighter than ``project_to_dict``: the list view needs counts,
    not the issues themselves.
    """
    return {
        "id": project.id,
        "name": project.name,
        "source_type": project.source_type,
        "external_key": project.external_key,
        "last_synced_at": project.last_synced_at.isoformat() if project.last_synced_at else None,
        "issue_count": len(project.issues) if project.issues else 0,
    }
