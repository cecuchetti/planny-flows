"""Request and response models for the settings API.

Field names are camelCase on purpose: they are the wire format the client reads,
matching the rest of the API.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

__all__ = [
    "ApplyResult",
    "ChangeRequest",
    "ConnectionTestRequest",
    "ConnectionTestResult",
    "SettingsEntry",
    "SettingsGroup",
    "SettingsList",
    "SettingsUpdateRequest",
    "SettingsUpdateResponse",
]


class SettingsEntry(BaseModel):
    """One configuration key, as the UI needs to render it.

    ``value`` is ``None`` for secrets. An admin may replace a token, but reading it
    back would put every credential on screen and into any response body a log or
    a proxy captures.
    """

    key: str
    label: str
    group: str
    type: str
    apply: str
    isSecret: bool  # noqa: N815 - camelCase is the wire format
    isOverridden: bool  # noqa: N815 - camelCase is the wire format
    value: Any = None
    """The value in effect in the running process.

    For a key that requires a restart this is still the *old* value, which is the
    truthful answer: the change is saved but not in effect.
    """

    storedValue: Any = None  # noqa: N815 - camelCase is the wire format
    """The saved value, when it differs from the one in effect.

    ``None`` for secrets: the UI can show that a change is pending without the
    credential ever being rendered back to the client.
    """

    defaultValue: Any = None  # noqa: N815 - camelCase is the wire format
    envAliases: list[str] = Field(default_factory=list)  # noqa: N815 - wire format
    choices: list[str] = Field(default_factory=list)
    help: str = ""
    updatedAt: str | None = None  # noqa: N815 - camelCase is the wire format


class SettingsGroup(BaseModel):
    """Keys grouped the way the UI presents them."""

    name: str
    entries: list[SettingsEntry]


class SettingsList(BaseModel):
    """The whole configuration surface."""

    groups: list[SettingsGroup]
    masterKeyConfigured: bool  # noqa: N815 - camelCase is the wire format


class ChangeRequest(BaseModel):
    """One key to change."""

    key: str
    value: Any = None


class SettingsUpdateRequest(BaseModel):
    """A batch of changes.

    Batched rather than one key per request because a configuration change often
    spans keys — a new database host *and* its port — and applying half of it would
    leave the application in a state nobody asked for.
    """

    changes: list[ChangeRequest]


class ApplyResult(BaseModel):
    """What happened to one change."""

    key: str
    status: str
    """``applied``, ``stored``, ``cleared`` or ``rejected``."""

    detail: str = ""
    requiresRestart: bool = False  # noqa: N815 - camelCase is the wire format


class SettingsUpdateResponse(BaseModel):
    """Outcome of a batch, per key."""

    results: list[ApplyResult]
    restartRequired: bool = False  # noqa: N815 - camelCase is the wire format
    restartKeys: list[str] = Field(default_factory=list)  # noqa: N815 - wire format


class ConnectionTestRequest(BaseModel):
    """Parameters for a connectivity check.

    ``fields`` is optional: omitted values are taken from the *current* effective
    configuration. That lets the UI test a single changed field without resending
    the rest, and without a stored password ever being rendered back to the client.
    """

    target: str = "database"
    fields: dict[str, Any] = Field(default_factory=dict)


class ConnectionTestResult(BaseModel):
    """Whether the candidate configuration actually works."""

    target: str
    ok: bool
    detail: str
    latencyMs: float | None = None  # noqa: N815 - camelCase is the wire format
