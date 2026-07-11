"""Custom error hierarchy matching the TypeScript Node backend.

Each error class serializes to JSON matching the Node format:
``json
{
    "error": { "message": "...", "code": "...", "status": 500, "data": {} },
    "requestId": "..."
}
```
"""

from __future__ import annotations


class AppError(Exception):
    """Base error for all application-level exceptions.

    Fields:
        message: Human-readable error description.
        code: Machine-readable error code (e.g. ``ENTITY_NOT_FOUND``).
        status_code: HTTP status code.
        data: Additional structured error context.
    """

    def __init__(
        self,
        message: str,
        code: str = "INTERNAL_ERROR",
        status_code: int = 500,
        data: dict[str, object] | None = None,
    ) -> None:
        self.message = message
        self.code = code
        self.status_code = status_code
        self.data = data or {}
        super().__init__(message)

    def to_dict(self) -> dict[str, object]:
        """Return error as a dict matching the Node error format."""
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
            code="ROUTE_NOT_FOUND",
            status_code=404,
        )


class EntityNotFoundError(AppError):
    """Raised when a requested entity does not exist in the database."""

    def __init__(self, entity_name: str) -> None:
        super().__init__(
            message=f"{entity_name} not found.",
            code="ENTITY_NOT_FOUND",
            status_code=404,
        )


class BadUserInputError(AppError):
    """Raised when the client sends invalid data."""

    def __init__(self, error_data: dict[str, object]) -> None:
        super().__init__(
            message="There were validation errors.",
            code="BAD_USER_INPUT",
            status_code=400,
            data=error_data,
        )


class InvalidTokenError(AppError):
    """Raised when the authentication token is missing or invalid."""

    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            message=message or "Authentication token is invalid.",
            code="INVALID_TOKEN",
            status_code=401,
        )


class IntegrationUnavailableError(AppError):
    """Raised when an external integration is not reachable."""

    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            message=message or "Integration is not available.",
            code="INTEGRATION_UNAVAILABLE",
            status_code=503,
        )


class ExternalServiceError(AppError):
    """Raised when an external service returns an unexpected response."""

    def __init__(self, message: str, service: str) -> None:
        super().__init__(
            message=message,
            code="EXTERNAL_SERVICE_ERROR",
            status_code=502,
            data={"service": service},
        )
