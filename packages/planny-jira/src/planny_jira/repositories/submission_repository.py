"""Repository for WorklogSubmission and WorklogSubmissionResult.

Mirrors ``api/src/jira-integrations/persistence/submissionRepository.ts``.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import ColumnElement, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from planny_core.models import WorklogSubmission, WorklogSubmissionResult
from planny_core.pagination import Page, count_rows


class SubmissionRepository:
    """CRUD operations for worklog submissions and their results."""

    async def create_submission(
        self,
        db: AsyncSession,
        *,
        request_id: str,
        target: str,
        tempo_issue_key: str,
        work_date: str,
        time_spent_seconds: int,
        description: str,
        overall_status: str,
        external_issue_key: str | None = None,
        started_at: str | None = None,
    ) -> WorklogSubmission:
        """Create a new WorklogSubmission record."""
        submission = WorklogSubmission(
            request_id=request_id,
            target=target,
            tempo_issue_key=tempo_issue_key,
            external_issue_key=external_issue_key,
            work_date=work_date,
            started_at=started_at,
            time_spent_seconds=time_spent_seconds,
            description=description,
            overall_status=overall_status,
        )
        db.add(submission)
        await db.flush()
        return submission

    async def create_result(
        self,
        db: AsyncSession,
        *,
        submission_id: int,
        target_system: str,
        status: str,
        request_payload: str,
        external_id: str | None = None,
        response_payload: str | None = None,
        error_code: str | None = None,
        error_message: str | None = None,
    ) -> WorklogSubmissionResult:
        """Create a WorklogSubmissionResult linked to a submission."""
        result = WorklogSubmissionResult(
            submission_id=submission_id,
            target_system=target_system,
            status=status,
            external_id=external_id,
            request_payload=request_payload,
            response_payload=response_payload,
            error_code=error_code,
            error_message=error_message,
        )
        db.add(result)
        await db.flush()
        return result

    async def update_submission_status(
        self,
        db: AsyncSession,
        request_id: str,
        status: str,
    ) -> None:
        """Update the overall_status of a submission by request_id."""
        stmt = (
            update(WorklogSubmission)
            .where(WorklogSubmission.request_id == request_id)
            .values(overall_status=status, updated_at=datetime.now(timezone.utc))
        )
        await db.execute(stmt)

    async def find_by_request_id(
        self,
        db: AsyncSession,
        request_id: str,
    ) -> WorklogSubmission | None:
        """Find a submission by its request_id, eagerly loading results."""
        stmt = (
            select(WorklogSubmission)
            .options(selectinload(WorklogSubmission.results))
            .where(WorklogSubmission.request_id == request_id)
        )
        result = await db.execute(stmt)
        return result.scalars().first()

    async def search_submissions(
        self,
        db: AsyncSession,
        *,
        target: str | None = None,
        status: str | None = None,
        external_issue_key: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
        page: int = 0,
        size: int = 20,
    ) -> tuple[list[WorklogSubmission], int]:
        """Search submissions with optional filters.

        Returns ``(items, total_count)``. Pagination is zero-indexed.
        """
        window = Page(number=page, size=size)

        # The filters are built once and applied to both queries. They used to be
        # written out twice, so adding a filter to one and forgetting the other
        # silently produced a total that disagreed with the page.
        filters: list[ColumnElement[bool]] = []
        if target is not None:
            filters.append(WorklogSubmission.target == target)
        if status is not None:
            filters.append(WorklogSubmission.overall_status == status)
        if external_issue_key is not None:
            filters.append(WorklogSubmission.external_issue_key == external_issue_key)
        if from_date is not None:
            filters.append(WorklogSubmission.work_date >= from_date)
        if to_date is not None:
            filters.append(WorklogSubmission.work_date <= to_date)

        base = select(WorklogSubmission).where(*filters)

        total = await count_rows(db, base)
        result = await db.execute(
            base.order_by(WorklogSubmission.created_at.desc())
            .offset(window.offset)
            .limit(window.limit)
        )
        return list(result.scalars().all()), total
