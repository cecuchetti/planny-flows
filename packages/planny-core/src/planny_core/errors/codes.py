"""Canonical error codes.

Every ``AppError`` subclass references a member of :class:`ErrorCode` instead of
a bare string literal. This gives a single place to see the full set of codes
the API can emit, and makes an accidental typo a lookup error rather than a
silent contract change.

Values are part of the public response contract (``error.code``), so they must
never change without treating it as a breaking API change.
"""

from __future__ import annotations

from enum import StrEnum

__all__ = ["ErrorCode"]


class ErrorCode(StrEnum):
    """Machine-readable error codes returned in ``error.code``.

    ``StrEnum`` members are plain strings for serialization purposes, so
    ``ErrorCode.ENTITY_NOT_FOUND == "ENTITY_NOT_FOUND"`` and JSON encoding
    produces the bare string.
    """

    # ── Generic ────────────────────────────────────────────────────────────
    INTERNAL_ERROR = "INTERNAL_ERROR"
    ROUTE_NOT_FOUND = "ROUTE_NOT_FOUND"
    ENTITY_NOT_FOUND = "ENTITY_NOT_FOUND"
    BAD_USER_INPUT = "BAD_USER_INPUT"
    INVALID_CONFIGURATION = "INVALID_CONFIGURATION"
    CONFLICT = "CONFLICT"

    # ── Authentication / authorization ─────────────────────────────────────
    INVALID_TOKEN = "INVALID_TOKEN"
    FORBIDDEN = "FORBIDDEN"

    # ── Domain rules ───────────────────────────────────────────────────────
    ISSUE_READONLY = "ISSUE_READONLY"

    # ── External integrations ──────────────────────────────────────────────
    INTEGRATION_UNAVAILABLE = "INTEGRATION_UNAVAILABLE"
    EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR"

    # ── Throttling / concurrency ───────────────────────────────────────────
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
    ALREADY_RUNNING = "ALREADY_RUNNING"
