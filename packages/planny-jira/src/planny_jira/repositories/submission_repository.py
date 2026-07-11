"""Repository for WorklogSubmission and WorklogSubmissionResult.

Mirrors ``api/src/jira-integrations/persistence/submissionRepository.ts``.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from planny_core.models import WorklogSubmission, WorklogSubmissionResult


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

        Returns (items, total_count). Pagination is 0-indexed.
        """
        safe_page = max(0, page)
        safe_size = min(100, max(1, size))

        # Build query
        query = select(WorklogSubmission).order_by(WorklogSubmission.created_at.desc())

        if target is not None:
            query = query.where(WorklogSubmission.target == target)
        if status is not None:
            query = query.where(WorklogSubmission.overall_status == status)
        if external_issue_key is not None:
            query = query.where(
                WorklogSubmission.external_issue_key == external_issue_key
            )
        if from_date is not None:
            query = query.where(WorklogSubmission.work_date >= from_date)
        if to_date is not None:
            query = query.where(WorklogSubmission.work_date <= to_date)

        # Count total
        count_query = select(WorklogSubmission.id)
        if target is not None:
            count_query = count_query.where(WorklogSubmission.target == target)
        if status is not None:
            count_query = count_query.where(WorklogSubmission.overall_status == status)
        if external_issue_key is not None:
            count_query = count_query.where(
                WorklogSubmission.external_issue_key == external_issue_key
            )
        if from_date is not None:
            count_query = count_query.where(WorklogSubmission.work_date >= from_date)
        if to_date is not None:
            count_query = count_query.where(WorklogSubmission.work_date <= to_date)

        total_result = await db.execute(count_query)
        total = len(total_result.scalars().all())

        # Apply pagination
        query = query.offset(safe_page * safe_size).limit(safe_size)
        result = await db.execute(query)
        items = list(result.scalars().all())

        return items, total
