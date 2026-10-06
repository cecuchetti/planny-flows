"""Authorization policies shared across modules.

Before this existed, the same "which projects may this user see?" query was
written out in four places, and a second mechanism (membership in the loaded
``project.users`` relationship) existed alongside it. Two mechanisms for one
concept is how the ``GET /project?ids=`` authorization bypass happened.

Resolving the scope once per request here means every module enforces the same
rule, and a fix lands everywhere at once.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends
from planny_core.errors import EntityNotFoundError, ForbiddenError
from planny_core.models import User, user_projects
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from planny_api.dependencies import get_current_user, get_db

__all__ = ["ProjectScope", "get_project_scope", "require_admin"]


@dataclass(frozen=True, slots=True)
class ProjectScope:
    """The projects the current user is authorized to act on.

    Attributes:
        user_id: The authenticated user.
        default_project_id: The user's primary project, if any. Several legacy
            endpoints operate on it implicitly.
        project_ids: Every project the user is a member of.
    """

    user_id: int
    default_project_id: int | None
    project_ids: frozenset[int]

    def allows(self, project_id: int) -> bool:
        """Whether *project_id* is within the scope."""
        return project_id in self.project_ids

    def require(self, project_id: int) -> None:
        """Raise unless *project_id* is within the scope.

        Raises:
            EntityNotFoundError: the project is out of scope. A 404 is used
                rather than a 403 so the API does not reveal that a project the
                caller cannot see exists.
        """
        if not self.allows(project_id):
            raise EntityNotFoundError("Project")

    def require_default(self) -> int:
        """Return the default project id, or raise if the user has none."""
        if self.default_project_id is None:
            raise EntityNotFoundError("Project")
        return self.default_project_id


async def get_project_scope(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectScope:
    """Resolve the caller's project scope.

    FastAPI caches dependency results within a request, so this query runs at
    most once even when several dependencies and endpoints ask for the scope.
    """
    result = await db.execute(
        select(user_projects.c.projectId).where(user_projects.c.userId == current_user.id)
    )
    project_ids = frozenset(int(row[0]) for row in result.all())

    return ProjectScope(
        user_id=current_user.id,
        default_project_id=current_user.projectId,
        project_ids=project_ids,
    )


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency that only lets administrators through.

    Used by the settings module. Note that it is a *second* line of defence: the
    module is also not mounted at all while no admin exists (fail closed), so an
    unconfigured deployment has no administrative surface to reach.

    Raises:
        ForbiddenError: the caller is authenticated but is not an admin.
    """
    if not current_user.is_admin:
        raise ForbiddenError("Administrator privileges are required for this action.")
    return current_user
