"""Tests for planny_core.errors — custom error hierarchy."""

from __future__ import annotations

import pytest

from planny_core.errors import (
    AppError,
    BadUserInputError,
    EntityNotFoundError,
    ExternalServiceError,
    IntegrationUnavailableError,
    InvalidTokenError,
    RouteNotFoundError,
)


class TestAppError:
    """Base error — instantiation and serialisation."""

    def test_defaults(self) -> None:
        err = AppError("Something went wrong")
        assert err.message == "Something went wrong"
        assert err.code == "INTERNAL_ERROR"
        assert err.status_code == 500
        assert err.data == {}

    def test_custom_fields(self) -> None:
        err = AppError("Custom", code="CUSTOM_CODE", status_code=418, data={"key": "val"})
        assert err.message == "Custom"
        assert err.code == "CUSTOM_CODE"
        assert err.status_code == 418
        assert err.data == {"key": "val"}

    def test_to_dict(self) -> None:
        err = AppError("Test message", code="TEST", status_code=400, data={"x": 1})
        assert err.to_dict() == {
            "message": "Test message",
            "code": "TEST",
            "status": 400,
            "data": {"x": 1},
        }

    def test_is_exception(self) -> None:
        """AppError is a proper Exception — can be raised and caught."""
        with pytest.raises(AppError) as exc_info:
            raise AppError("oops")
        assert exc_info.value.message == "oops"


class TestRouteNotFoundError:
    def test_defaults(self) -> None:
        err = RouteNotFoundError("/api/foo")
        assert err.message == "Route '/api/foo' does not exist."
        assert err.code == "ROUTE_NOT_FOUND"
        assert err.status_code == 404
        assert err.data == {}


class TestEntityNotFoundError:
    def test_defaults(self) -> None:
        err = EntityNotFoundError("Issue")
        assert err.message == "Issue not found."
        assert err.code == "ENTITY_NOT_FOUND"
        assert err.status_code == 404
        assert err.data == {}

    def test_custom_entity_name(self) -> None:
        err = EntityNotFoundError("Project")
        assert err.message == "Project not found."


class TestBadUserInputError:
    def test_defaults(self) -> None:
        err = BadUserInputError({"field": "required"})
        assert err.message == "There were validation errors."
        assert err.code == "BAD_USER_INPUT"
        assert err.status_code == 400
        assert err.data == {"field": "required"}

    def test_empty_data(self) -> None:
        err = BadUserInputError({})
        assert err.data == {}


class TestInvalidTokenError:
    def test_default_message(self) -> None:
        err = InvalidTokenError()
        assert err.message == "Authentication token is invalid."
        assert err.code == "INVALID_TOKEN"
        assert err.status_code == 401

    def test_custom_message(self) -> None:
        err = InvalidTokenError("Token expired")
        assert err.message == "Token expired"
        assert err.status_code == 401


class TestIntegrationUnavailableError:
    def test_default_message(self) -> None:
        err = IntegrationUnavailableError()
        assert err.message == "Integration is not available."
        assert err.code == "INTEGRATION_UNAVAILABLE"
        assert err.status_code == 503

    def test_custom_message(self) -> None:
        err = IntegrationUnavailableError("Jira is down")
        assert err.message == "Jira is down"
        assert err.status_code == 503


class TestExternalServiceError:
    def test_defaults(self) -> None:
        err = ExternalServiceError("Upstream error", service="jira")
        assert err.message == "Upstream error"
        assert err.code == "EXTERNAL_SERVICE_ERROR"
        assert err.status_code == 502
        assert err.data == {"service": "jira"}

    def test_service_name_in_data(self) -> None:
        err = ExternalServiceError("Timeout", service="outlook-cleaner")
        assert err.data == {"service": "outlook-cleaner"}
