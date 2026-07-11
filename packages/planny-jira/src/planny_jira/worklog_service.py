"""Worklog orchestration service — dual-instance worklog creation.

Mirrors ``api/src/jira-integrations/services/worklogService.ts``.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from planny_jira.client import JiraHttpClient
from planny_jira.repositories import SubmissionRepository

logger = structlog.get_logger()


class WorklogTarget(str, Enum):
    """Target system(s) for worklog creation."""

    TEMPO = "TEMPO"
    JIRA = "JIRA"
    BOTH = "BOTH"


class SubmissionStatus(str, Enum):
    """Overall status of a worklog submission."""

    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    PARTIAL_SUCCESS = "PARTIAL_SUCCESS"


class TargetSystem(str, Enum):
    """Individual target system identifier."""

    TEMPO = "TEMPO"
    JIRA = "JIRA"


class TargetResultStatus(str, Enum):
    """Result status for an individual target system call."""

    SUCCESS = "SUCCESS"
    FAILED = "FAILED"


@dataclass
class CreateWorklogRequest:
    """Request payload for creating a worklog."""

    target: WorklogTarget
    external_issue_key: str | None = None
    work_date: str | None = None
    started_at: str | None = None
    time_spent_seconds: int = 0
    description: str = ""


@dataclass
class TargetResult:
    """Result from a single target system call."""

    system: TargetSystem
    issue_key: str
    status: TargetResultStatus
    external_id: str | None
    message: str


def _extract_error_info(error: Exception) -> dict[str, str | None]:
    """Safely extract error information from an exception.

    Handles httpx.HTTPStatusError for status codes from Jira API calls.
    """
    message = str(error)
    status_code: str | None = None

    # httpx.HTTPStatusError has a response attribute
    if hasattr(error, "response") and hasattr(error.response, "status_code"):
        status_code = str(error.response.status_code)

    return {"message": message, "status_code": status_code}


class WorklogService:
    """Orchestrates worklog creation across internal (Tempo) and external (Jira) instances.

    Manages submission tracking, status calculation, and daily hours aggregation.
    """

    def __init__(
        self,
        internal_client: JiraHttpClient,
        external_client: JiraHttpClient,
        tempo_issue_key: str,
        external_account_id: str | None = None,
    ) -> None:
        self._internal_client = internal_client
        self._external_client = external_client
        self._submission_repository = SubmissionRepository()
        self._tempo_issue_key = tempo_issue_key
        self._external_account_id = external_account_id

    async def create_worklog(
        self,
        request: CreateWorklogRequest,
        db: AsyncSession,
    ) -> dict[str, object]:
        """Create worklog(s) on target Jira instances and track the submission.

        Steps:
        1. Generate requestId
        2. Normalize date/time fields
        3. Validate externalIssueKey for JIRA/BOTH targets
        4. Create PENDING submission record
        5. Call the appropriate Jira API(s)
        6. Record result per target system
        7. Calculate overall status
        8. Update submission status
        9. Update ExternalHoursDaily if external worklog created
        10. Return response with results
        """
        request_id = f"wlr_{uuid4().hex[:8]}"
        work_date, started_at = self._normalize_date_time(
            request.work_date, request.started_at
        )

        # Validate externalIssueKey for JIRA / BOTH targets
        if request.target in (WorklogTarget.JIRA, WorklogTarget.BOTH):
            if not request.external_issue_key:
                raise ValueError("externalIssueKey is required for JIRA target")

        # Create PENDING submission
        submission = await self._submission_repository.create_submission(
            db,
            request_id=request_id,
            target=request.target.value,
            tempo_issue_key=self._tempo_issue_key,
            external_issue_key=request.external_issue_key,
            work_date=work_date,
            started_at=started_at,
            time_spent_seconds=request.time_spent_seconds,
            description=request.description,
            overall_status=SubmissionStatus.PENDING.value,
        )

        results: list[dict[str, object]] = []

        # Internal / Tempo worklog
        if request.target in (WorklogTarget.TEMPO, WorklogTarget.BOTH):
            tempo_result = await self._create_internal_worklog(
                db,
                submission.id,
                issue_key=self._tempo_issue_key,
                started_at=started_at or self._to_iso_string(work_date),
                time_spent_seconds=request.time_spent_seconds,
                description=request.description,
            )
            results.append(tempo_result)

        # External / Jira worklog
        if request.target in (WorklogTarget.JIRA, WorklogTarget.BOTH):
            assert request.external_issue_key is not None  # validated above
            jira_result = await self._create_external_worklog(
                db,
                submission.id,
                issue_key=request.external_issue_key,
                started_at=started_at or self._to_iso_string(work_date),
                time_spent_seconds=request.time_spent_seconds,
                description=request.description,
                author_account_id=self._external_account_id,
            )
            results.append(jira_result)

        # Calculate and update overall status
        overall_status = self._calculate_overall_status(results)
        await self._submission_repository.update_submission_status(
            db, request_id, overall_status.value
        )

        # Update ExternalHoursDaily for JIRA / BOTH successes
        if request.target in (WorklogTarget.JIRA, WorklogTarget.BOTH):
            from planny_jira.repositories.external_hours_daily_repository import (
                ExternalHoursDailyRepository,
            )

            hours_repo = ExternalHoursDailyRepository()
            await hours_repo.add_hours(db, work_date, request.time_spent_seconds)

        return {
            "request_id": request_id,
            "target": request.target.value,
            "tempo_issue_key": self._tempo_issue_key,
            "external_issue_key": request.external_issue_key,
            "overall_status": overall_status.value,
            "results": results,
        }

    async def _create_internal_worklog(
        self,
        db: AsyncSession,
        submission_id: int,
        *,
        issue_key: str,
        started_at: str,
        time_spent_seconds: int,
        description: str,
    ) -> dict[str, object]:
        """Call Tempo API via the internal client and record the result."""
        payload = {
            "issueKey": issue_key,
            "timeSpentSeconds": time_spent_seconds,
            "startDate": started_at[:10],
            "startTime": started_at[11:19],
            "description": description,
        }

        try:
            response = await self._internal_client.post(
                "/rest/tempo-timesheets/4/worklogs/",
                json_data=payload,
            )
            external_id = str(response.get("id", ""))
            await self._submission_repository.create_result(
                db=db,
                submission_id=submission_id,
                target_system=TargetSystem.TEMPO.value,
                status=TargetResultStatus.SUCCESS.value,
                external_id=external_id,
                request_payload=json.dumps(payload),
                response_payload=json.dumps(response),
            )
            logger.debug("Tempo worklog created", issue_key=issue_key)
            return {
                "system": TargetSystem.TEMPO.value,
                "issue_key": issue_key,
                "status": TargetResultStatus.SUCCESS.value,
                "external_id": external_id,
                "message": "Tempo worklog created successfully.",
            }
        except Exception as exc:
            error_info = _extract_error_info(exc)
            logger.error(
                "Tempo worklog creation failed",
                issue_key=issue_key,
                error=error_info["message"],
            )
            await self._submission_repository.create_result(
                db=db,
                submission_id=submission_id,
                target_system=TargetSystem.TEMPO.value,
                status=TargetResultStatus.FAILED.value,
                request_payload=json.dumps(payload),
                error_code=error_info["status_code"] or "UNKNOWN",
                error_message=error_info["message"],
            )
            return {
                "system": TargetSystem.TEMPO.value,
                "issue_key": issue_key,
                "status": TargetResultStatus.FAILED.value,
                "external_id": None,
                "message": f"Tempo worklog creation failed: {error_info['message']}",
            }

    async def _create_external_worklog(
        self,
        db: AsyncSession,
        submission_id: int,
        *,
        issue_key: str,
        started_at: str,
        time_spent_seconds: int,
        description: str,
        author_account_id: str | None = None,
    ) -> dict[str, object]:
        """Call Jira API via the external client and record the result."""
        payload: dict[str, object] = {
            "started": self._format_jira_datetime(started_at),
            "timeSpentSeconds": time_spent_seconds,
        }
        if description:
            payload["comment"] = self._create_adf_comment(description)
        if author_account_id:
            payload["author"] = {"accountId": author_account_id}

        try:
            response = await self._external_client.post(
                f"/rest/api/2/issue/{issue_key}/worklog",
                json_data=payload,
            )
            external_id = str(response.get("id", ""))
            await self._submission_repository.create_result(
                db=db,
                submission_id=submission_id,
                target_system=TargetSystem.JIRA.value,
                status=TargetResultStatus.SUCCESS.value,
                external_id=external_id,
                request_payload=json.dumps(payload),
                response_payload=json.dumps(response),
            )
            logger.debug("Jira worklog created", issue_key=issue_key)
            return {
                "system": TargetSystem.JIRA.value,
                "issue_key": issue_key,
                "status": TargetResultStatus.SUCCESS.value,
                "external_id": external_id,
                "message": "Jira worklog created successfully.",
            }
        except Exception as exc:
            error_info = _extract_error_info(exc)
            logger.error(
                "Jira worklog creation failed",
                issue_key=issue_key,
                error=error_info["message"],
            )
            await self._submission_repository.create_result(
                db=db,
                submission_id=submission_id,
                target_system=TargetSystem.JIRA.value,
                status=TargetResultStatus.FAILED.value,
                request_payload=json.dumps(payload),
                error_code=error_info["status_code"] or "UNKNOWN",
                error_message=error_info["message"],
            )
            return {
                "system": TargetSystem.JIRA.value,
                "issue_key": issue_key,
                "status": TargetResultStatus.FAILED.value,
                "external_id": None,
                "message": f"Jira worklog creation failed: {error_info['message']}",
            }

    async def get_submission_history(
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
    ) -> dict[str, object]:
        """Return paginated submission history with optional filters."""
        items, total = await self._submission_repository.search_submissions(
            db,
            target=target,
            status=status,
            external_issue_key=external_issue_key,
            from_date=from_date,
            to_date=to_date,
            page=page,
            size=size,
        )

        return {
            "items": [
                {
                    "id": s.id,
                    "request_id": s.request_id,
                    "target": s.target,
                    "tempo_issue_key": s.tempo_issue_key,
                    "external_issue_key": s.external_issue_key,
                    "work_date": s.work_date,
                    "started_at": s.started_at,
                    "time_spent_seconds": s.time_spent_seconds,
                    "description": s.description,
                    "overall_status": s.overall_status,
                }
                for s in items
            ],
            "total": total,
        }

    async def get_hours_by_date(
        self,
        db: AsyncSession,
        start_date: str,
        end_date: str,
    ) -> list[dict[str, object]]:
        """Return aggregated daily hours within a date range."""
        from planny_jira.repositories.external_hours_daily_repository import (
            ExternalHoursDailyRepository,
        )

        repo = ExternalHoursDailyRepository()
        return await repo.get_by_date_range(db, start_date, end_date)

    async def update_hours_for_date(
        self,
        db: AsyncSession,
        work_date: str,
        total_seconds: int,
    ) -> dict[str, object]:
        """Manually override daily hours for a specific date."""
        from planny_jira.repositories.external_hours_daily_repository import (
            ExternalHoursDailyRepository,
        )

        repo = ExternalHoursDailyRepository()
        record = await repo.upsert_hours(
            db, work_date=work_date, total_seconds=total_seconds
        )
        return {
            "work_date": record.work_date,
            "total_seconds": record.total_seconds,
            "source": record.source,
        }

    # ── Private helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _normalize_date_time(
        work_date: str | None,
        started_at: str | None,
    ) -> tuple[str, str | None]:
        """Normalize work_date and started_at.

        If started_at is provided, derive work_date from it.
        If only work_date is provided, extract the date part.
        Raises ValueError if neither is provided.
        """
        if started_at:
            dt = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
            return dt.strftime("%Y-%m-%d"), started_at
        if work_date:
            date_only = work_date.split("T")[0] if "T" in work_date else work_date
            return date_only, None
        raise ValueError("Either work_date or started_at must be provided")

    @staticmethod
    def _to_iso_string(date_str: str) -> str:
        """Turn a date string (YYYY-MM-DD) into ISO datetime."""
        date_only = date_str.split("T")[0] if "T" in date_str else date_str
        return f"{date_only}T00:00:00Z"

    @staticmethod
    def _format_jira_datetime(iso_string: str) -> str:
        """Format an ISO datetime string to Jira's expected format.

        Jira expects: ``2026-07-11T19:30:00.000+0000``
        """
        # Parse and re-format with +0000 timezone
        dt_str = iso_string.replace("Z", "+00:00")
        dt = datetime.fromisoformat(dt_str)
        # Always output in UTC with +0000 offset
        dt_utc = dt.astimezone(timezone.utc)
        return dt_utc.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt_utc.microsecond // 1000:03d}+0000"

    @staticmethod
    def _create_adf_comment(text: str) -> dict[str, object]:
        """Create Atlassian Document Format (ADF) comment body."""
        return {
            "type": "doc",
            "version": 1,
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": text}],
                }
            ],
        }

    @staticmethod
    def _calculate_overall_status(
        results: list[dict[str, object]],
    ) -> SubmissionStatus:
        """Determine overall status from individual target results."""
        has_success = any(
            r.get("status") == TargetResultStatus.SUCCESS.value for r in results
        )
        has_failure = any(
            r.get("status") == TargetResultStatus.FAILED.value for r in results
        )
        if has_success and not has_failure:
            return SubmissionStatus.SUCCESS
        if not has_success and has_failure:
            return SubmissionStatus.FAILED
        if has_success and has_failure:
            return SubmissionStatus.PARTIAL_SUCCESS
        return SubmissionStatus.PENDING
