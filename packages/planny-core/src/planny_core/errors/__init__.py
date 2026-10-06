"""Error hierarchy and canonical error codes.

Import from this package::

    from planny_core.errors import AppError, EntityNotFoundError, ErrorCode
"""

from __future__ import annotations

from planny_core.errors.base import (
    AppError,
    BadUserInputError,
    ConflictError,
    EntityNotFoundError,
    ExternalServiceError,
    ForbiddenError,
    InsecureConfigurationError,
    IntegrationUnavailableError,
    InvalidConfigurationError,
    InvalidTokenError,
    RateLimitExceededError,
    RouteNotFoundError,
)
from planny_core.errors.codes import ErrorCode

__all__ = [
    "AppError",
    "BadUserInputError",
    "ConflictError",
    "EntityNotFoundError",
    "ErrorCode",
    "ExternalServiceError",
    "ForbiddenError",
    "InvalidConfigurationError",
    "InsecureConfigurationError",
    "IntegrationUnavailableError",
    "InvalidTokenError",
    "RateLimitExceededError",
    "RouteNotFoundError",
]
