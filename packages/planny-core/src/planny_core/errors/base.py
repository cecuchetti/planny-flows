"""Exception hierarchy for the application.

Every error serializes to the same JSON envelope::

    {
        "error": {"message": "...", "code": "...", "status": 500, "data": {}},
        "requestId": "..."
    }

Machine-readable codes come from :class:`planny_core.errors.codes.ErrorCode`
rather than string literals, so the full set of codes the API can emit lives in
one place.
"""

from __future__ import annotations

from planny_core.errors.codes import ErrorCode

__all__ = [
    "AppError",
    "BadUserInputError",
    "EntityNotFoundError",
    "ExternalServiceError",
    "ForbiddenError",
    "InsecureConfigurationError",
    "IntegrationUnavailableError",
    "InvalidTokenError",
    "RouteNotFoundError",
]


class AppError(Exception):
    """Base error for all application-level exceptions.

    Attributes:
        message: Human-readable error description.
        code: Machine-readable error code.
        status_code: HTTP status code.
        data: Additional structured error context.
        headers: Extra response headers (for example ``Retry-After``).
    """

    def __init__(
        self,
        message: str,
        code: str = ErrorCode.INTERNAL_ERROR,
        status_code: int = 500,
        data: dict[str, object] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.message = message
        self.code = code
        self.status_code = status_code
        self.data = data or {}
        self.headers = headers or {}
        super().__init__(message)

    def to_dict(self) -> dict[str, object]:
        """Return the error as a dict matching the response envelope."""
        return {
            "message": self.message,
            "code": self.code,
            "status": self.status_code,
            "data": self.data,
        }


class RouteNotFoundError(AppError):
    """Raised when a request does not match any registered route."""

    def __init__(self, original_url: str) -> None:
        super().__init__(
            message=f"Route '{original_url}' does not exist.",
            code=ErrorCode.ROUTE_NOT_FOUND,
            status_code=404,
        )


class EntityNotFoundError(AppError):
    """Raised when a requested entity does not exist in the database."""

    def __init__(self, entity_name: str, message: str | None = None) -> None:
        super().__init__(
            message=message or f"{entity_name} not found.",
            code=ErrorCode.ENTITY_NOT_FOUND,
            status_code=404,
        )


class BadUserInputError(AppError):
    """Raised when the client sends invalid data."""

    def __init__(
        self, error_data: dict[str, object], message: str = "There were validation errors."
    ) -> None:
        super().__init__(
            message=message,
            code=ErrorCode.BAD_USER_INPUT,
            status_code=400,
            data=error_data,
        )


class InvalidTokenError(AppError):
    """Raised when the authentication token is missing or invalid."""

    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            message=message or "Authentication token is invalid.",
            code=ErrorCode.INVALID_TOKEN,
            status_code=401,
        )


class ForbiddenError(AppError):
    """Raised when the user attempts an action they do not have permission for."""

    def __init__(self, message: str, code: str = ErrorCode.FORBIDDEN) -> None:
        super().__init__(
            message=message,
            code=code,
            status_code=403,
        )


class IntegrationUnavailableError(AppError):
    """Raised when an external integration is not reachable."""

    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            message=message or "Integration is not available.",
            code=ErrorCode.INTEGRATION_UNAVAILABLE,
            status_code=503,
        )


class ExternalServiceError(AppError):
    """Raised when an external service returns an unexpected response."""

    def __init__(self, message: str, service: str) -> None:
        super().__init__(
            message=message,
            code=ErrorCode.EXTERNAL_SERVICE_ERROR,
            status_code=502,
            data={"service": service},
        )


class RateLimitExceededError(AppError):
    """Raised when a client exceeds a rate limit.

    Carries the standard ``X-RateLimit-*`` headers. It exists as an ``AppError``
    so throttling responses use the same envelope as every other error instead of
    FastAPI's ``{"detail": ...}`` wrapper.
    """

    def __init__(
        self,
        message: str = "Too many requests, please try again later.",
        *,
        limit: int,
        remaining: int,
        reset_seconds: int,
    ) -> None:
        super().__init__(
            message=message,
            code=ErrorCode.RATE_LIMIT_EXCEEDED,
            status_code=429,
            data={"retryAfter": reset_seconds},
            headers={
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": str(remaining),
                "X-RateLimit-Reset": str(reset_seconds),
                "Retry-After": str(reset_seconds),
            },
        )


class ConflictError(AppError):
    """Raised when a request conflicts with the current state of a resource."""

    def __init__(self, message: str, code: str = ErrorCode.CONFLICT) -> None:
        super().__init__(message=message, code=code, status_code=409)


class InvalidConfigurationError(AppError):
    """Raised when a configuration *value* is rejected.

    Two contexts use it, and the type has to serve both:

    * at startup, while stored overrides are being resolved — it aborts the
      process, exactly like an unsafe configuration does;
    * in the settings API, where it becomes a ``400``.

    It is distinct from :class:`InsecureConfigurationError`, which is about a
    *combination* of valid values being unsafe (for example production running
    with the development JWT secret) rather than about one bad value.
    """

    def __init__(self, message: str) -> None:
        super().__init__(
            message=message,
            code=ErrorCode.INVALID_CONFIGURATION,
            status_code=400,
        )


class InsecureConfigurationError(RuntimeError):
    """Raised at startup when the resolved configuration is unsafe.

    This is deliberately *not* an :class:`AppError`: it never maps to an HTTP
    response. It aborts application startup so an unsafe deployment fails loudly
    instead of serving traffic with, for example, a publicly known JWT secret.
    """
