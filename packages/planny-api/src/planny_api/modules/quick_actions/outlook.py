"""Outlook clean service — async background job with in-memory state machine.

Mirrors the TypeScript implementation in ``api/src/controllers/quickActions.ts``.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Literal

import httpx
import structlog
from planny_core.config import settings

logger = structlog.get_logger(__name__)

OutlookCleanStatus = Literal["idle", "running", "success", "failed"]


class OutlookCleanService:
    """Simple in-memory state machine for Outlook clean background jobs.

    State transitions:

        idle ──(trigger)──> running ──(success)──> success
                                     ──(failure)──> failed

    The ``trigger()`` method is non-blocking — it spawns a background
    ``asyncio.Task`` that makes an HTTP POST to ``OUTLOOK_CLEANER_URL``.
    """

    def __init__(self) -> None:
        self._status: OutlookCleanStatus = "idle"
        self._last_run: dict[str, object] | None = None

    # ── Public API ───────────────────────────────────────────────────────────

    def status(self) -> dict[str, object]:
        """Return current job status and last-run details if available.

        Example return values::

            {"status": "idle"}
            {"status": "running"}
            {"status": "success", "lastRun": {"status": "success", "at": "…"}}
        """
        result: dict[str, object] = {"status": self._status}
        if self._last_run is not None:
            result["lastRun"] = self._last_run
        return result

    def trigger(self) -> None:
        """Start the Outlook clean background job.

        Raises ``RuntimeError`` (→ 409 Conflict) if a job is already running.
        """
        if self._status == "running":
            raise RuntimeError("An Outlook clean is already running")

        self._status = "running"
        self._last_run = None
        asyncio.create_task(self._run())

    # ── Internal ─────────────────────────────────────────────────────────────

    async def _run(self) -> None:
        """Execute the Outlook cleaner HTTP call in the background.

        On success → status = "success".
        On failure (HTTP error, network error, timeout) → status = "failed".
        """
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    settings.outlook_cleaner_url,
                    headers={
                        "X-API-KEY": settings.outlook_cleaner_api_key,
                        "Content-Type": "application/json",
                    },
                    json={},
                )

            ok = response.is_success

            if ok:
                self._status = "success"
                self._last_run = {
                    "status": "success",
                    "at": datetime.now(UTC).isoformat(),
                }
                logger.info("outlook_clean.completed")
            else:
                message = _extract_message(response)
                self._status = "failed"
                self._last_run = {
                    "status": "failed",
                    "at": datetime.now(UTC).isoformat(),
                    "message": message or f"HTTP {response.status_code}",
                }
                logger.warning(
                    "outlook_clean.failed",
                    status_code=response.status_code,
                    message=message,
                )

        except Exception as exc:
            self._status = "failed"
            self._last_run = {
                "status": "failed",
                "at": datetime.now(UTC).isoformat(),
                "message": str(exc),
            }
            logger.error("outlook_clean.error", error=str(exc))


def _extract_message(response: httpx.Response) -> str | None:
    """Try to extract a human-readable message from the response body."""
    try:
        data = response.json()
        if isinstance(data, dict):
            return data.get("message") or data.get("error") or None
    except Exception:
        pass
    return None
