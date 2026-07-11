"""Jira HTTP client — httpx-based async client with auth and logging interceptors."""

import time
import typing
from dataclasses import dataclass

import httpx
import structlog

logger = structlog.get_logger()


@dataclass
class JiraInstanceConfig:
    """Configuration for a single Jira instance."""

    base_url: str
    auth_type: typing.Literal["basic", "bearer"]
    email: str | None = None
    api_token: str | None = None
    timeout_ms: int = 5000
    system_name: str = "external-jira"
    fixed_issue_key: str | None = None
    my_account_id: str | None = None


class BearerAuth(httpx.Auth):
    """Custom httpx Auth implementation for Bearer token authentication."""

    def __init__(self, token: str) -> None:
        self.token = token

    def auth_flow(
        self, request: httpx.Request
    ) -> typing.Generator[httpx.Request, httpx.Response, None]:
        request.headers["Authorization"] = f"Bearer {self.token}"
        yield request


class JiraHttpClient:
    """Async HTTP client for Jira API with logging interceptors."""

    def __init__(self, config: JiraInstanceConfig) -> None:
        self.config = config
        self.system_name = config.system_name

        auth: httpx.Auth | None = None
        if config.auth_type == "bearer" and config.api_token:
            auth = BearerAuth(config.api_token)
        elif config.auth_type == "basic" and config.email and config.api_token:
            auth = httpx.BasicAuth(config.email, config.api_token)

        self._client = httpx.AsyncClient(
            base_url=config.base_url,
            auth=auth,
            timeout=httpx.Timeout(config.timeout_ms / 1000),
            event_hooks={
                "request": [self._log_request],
                "response": [self._log_response],
            },
        )

    async def _log_request(self, request: httpx.Request) -> None:
        """Log outgoing request at DEBUG level and store start time."""
        request.extensions["start_time"] = time.monotonic()
        logger.debug(
            "External API request",
            system=self.system_name,
            method=request.method,
            url=str(request.url),
        )

    async def _log_response(self, response: httpx.Response) -> None:
        """Log incoming response at DEBUG or WARNING level (4xx/5xx)."""
        request = response.request
        start_time = request.extensions.get("start_time", None)
        if start_time is not None:
            duration_ms = (time.monotonic() - start_time) * 1000
        else:
            duration_ms = 0.0
        log_method = logger.debug if response.status_code < 400 else logger.warning
        log_method(
            "External API response",
            system=self.system_name,
            method=request.method,
            url=str(request.url),
            status_code=response.status_code,
            duration_ms=round(duration_ms),
        )

    async def get(self, path: str, **kwargs: typing.Any) -> dict[str, typing.Any]:
        """Send GET request and return parsed JSON dict."""
        response = await self._client.get(path, **kwargs)
        response.raise_for_status()
        return typing.cast(dict[str, typing.Any], response.json())

    async def post(
        self,
        path: str,
        json_data: dict[str, typing.Any] | None = None,
        **kwargs: typing.Any,
    ) -> dict[str, typing.Any]:
        """Send POST request with optional JSON body and return parsed JSON dict."""
        response = await self._client.post(path, json=json_data, **kwargs)
        response.raise_for_status()
        return typing.cast(dict[str, typing.Any], response.json())

    async def close(self) -> None:
        """Close the underlying AsyncClient connection pool."""
        await self._client.aclose()
