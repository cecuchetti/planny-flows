"""Tests for JiraHttpClient and auth classes."""

from unittest.mock import patch

import httpx
import pytest

from planny_jira.client import BearerAuth, JiraHttpClient, JiraInstanceConfig


class TestBearerAuth:
    """BearerAuth custom auth class."""

    def test_sets_bearer_header(self) -> None:
        auth = BearerAuth("my-token-123")
        request = httpx.Request("GET", "https://example.com/api")
        # The auth flow should yield the request with the header set
        results = list(auth.auth_flow(request))
        assert len(results) == 1
        assert results[0].headers["Authorization"] == "Bearer my-token-123"

    def test_empty_token_sets_empty_value(self) -> None:
        auth = BearerAuth("")
        request = httpx.Request("GET", "https://example.com/api")
        results = list(auth.auth_flow(request))
        assert results[0].headers["Authorization"] == "Bearer "


class TestJiraHttpClient:
    """JiraHttpClient tests with mocked transport."""

    def _make_mock_transport(
        self, status_code: int = 200, json_data: dict | None = None
    ) -> httpx.MockTransport:
        """Create a MockTransport that returns a given status and JSON body."""
        json_data = json_data or {"key": "value"}

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(status_code=status_code, json=json_data)

        return httpx.MockTransport(handler)

    @pytest.mark.asyncio
    async def test_basic_auth_header(self) -> None:
        """Verify BasicAuth sets the correct Authorization header."""
        config = JiraInstanceConfig(
            base_url="https://jira.example.com",
            auth_type="basic",
            email="user@example.com",
            api_token="token-123",
        )

        # Capture the request to inspect headers
        captured_requests: list[httpx.Request] = []

        def capturing_handler(request: httpx.Request) -> httpx.Response:
            captured_requests.append(request)
            return httpx.Response(200, json={"ok": True})

        transport = httpx.MockTransport(capturing_handler)
        client = JiraHttpClient(config)
        client._client._transport = transport

        try:
            await client.get("/rest/api/2/myself")
        finally:
            await client.close()

        assert len(captured_requests) == 1
        auth_header = captured_requests[0].headers.get("Authorization", "")
        assert auth_header.startswith("Basic ")

    @pytest.mark.asyncio
    async def test_bearer_auth_header(self) -> None:
        """Verify BearerAuth sets the correct Authorization header."""
        config = JiraInstanceConfig(
            base_url="https://jira.example.com",
            auth_type="bearer",
            api_token="bearer-token-456",
        )

        captured_requests: list[httpx.Request] = []

        def capturing_handler(request: httpx.Request) -> httpx.Response:
            captured_requests.append(request)
            return httpx.Response(200, json={"ok": True})

        transport = httpx.MockTransport(capturing_handler)
        client = JiraHttpClient(config)
        client._client._transport = transport

        try:
            await client.get("/rest/api/2/myself")
        finally:
            await client.close()

        assert len(captured_requests) == 1
        assert captured_requests[0].headers["Authorization"] == "Bearer bearer-token-456"

    @pytest.mark.asyncio
    async def test_get_returns_dict(self) -> None:
        """GET request returns parsed JSON dict."""
        config = JiraInstanceConfig(
            base_url="https://jira.example.com",
            auth_type="basic",
            email="user@example.com",
            api_token="token",
        )
        client = JiraHttpClient(config)
        client._client._transport = self._make_mock_transport(200, {"displayName": "John"})

        try:
            result = await client.get("/rest/api/2/myself")
            assert result == {"displayName": "John"}
        finally:
            await client.close()

    @pytest.mark.asyncio
    async def test_get_raises_on_4xx(self) -> None:
        """GET raises httpx.HTTPStatusError on 4xx response."""
        config = JiraInstanceConfig(
            base_url="https://jira.example.com",
            auth_type="basic",
            email="user@example.com",
            api_token="token",
        )
        client = JiraHttpClient(config)
        client._client._transport = self._make_mock_transport(404, {"message": "Not found"})

        try:
            with pytest.raises(httpx.HTTPStatusError) as exc_info:
                await client.get("/rest/api/2/issue/BAD-1")
            assert exc_info.value.response.status_code == 404
        finally:
            await client.close()

    @pytest.mark.asyncio
    async def test_post_returns_dict(self) -> None:
        """POST request returns parsed JSON dict."""
        config = JiraInstanceConfig(
            base_url="https://jira.example.com",
            auth_type="bearer",
            api_token="token",
        )
        client = JiraHttpClient(config)
        client._client._transport = self._make_mock_transport(201, {"id": "12345"})

        try:
            result = await client.post(
                "/rest/api/2/issue",
                json_data={"fields": {"summary": "Test"}},
            )
            assert result == {"id": "12345"}
        finally:
            await client.close()

    @pytest.mark.asyncio
    async def test_post_raises_on_5xx(self) -> None:
        """POST raises httpx.HTTPStatusError on 5xx response."""
        config = JiraInstanceConfig(
            base_url="https://jira.example.com",
            auth_type="basic",
            email="user@example.com",
            api_token="token",
        )
        client = JiraHttpClient(config)
        client._client._transport = self._make_mock_transport(500, {"message": "Server error"})

        try:
            with pytest.raises(httpx.HTTPStatusError) as exc_info:
                await client.post("/rest/api/2/issue", json_data={})
            assert exc_info.value.response.status_code == 500
        finally:
            await client.close()

    @pytest.mark.asyncio
    async def test_close_cleans_up(self) -> None:
        """Calling close() should not raise."""
        config = JiraInstanceConfig(
            base_url="https://jira.example.com",
            auth_type="basic",
            email="user@example.com",
            api_token="token",
        )
        client = JiraHttpClient(config)
        client._client._transport = self._make_mock_transport(200, {})
        # close should succeed without error
        await client.close()

    @pytest.mark.asyncio
    async def test_system_name_in_logging(self) -> None:
        """Log event hooks receive correct system name."""
        config = JiraInstanceConfig(
            base_url="https://jira.example.com",
            auth_type="basic",
            email="user@example.com",
            api_token="token",
            system_name="test-system",
        )

        captured_requests: list[httpx.Request] = []

        def capturing_handler(request: httpx.Request) -> httpx.Response:
            captured_requests.append(request)
            return httpx.Response(200, json={"ok": True})

        client = JiraHttpClient(config)
        client._client._transport = httpx.MockTransport(capturing_handler)

        # Patch logger to verify system name is passed
        with patch("planny_jira.client.logger.debug") as mock_debug:
            try:
                await client.get("/test")
            finally:
                await client.close()

            # First call is _log_request, subsequent are _log_response
            assert mock_debug.call_count >= 1
            # Check the first call has system=test-system
            call_kwargs = mock_debug.call_args_list[0].kwargs
            assert call_kwargs.get("system") == "test-system"
