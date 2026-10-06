"""Layered resolution of configuration values.

Precedence, as decided::

    database  >  process environment  >  .env  >  code default

The environment and ``.env`` tiers are resolved by :class:`Settings` itself, using
pydantic-settings. They are **not** reimplemented here as separate sources: doing
so would duplicate a working implementation, its alias handling and its type
coercion for no behavioural gain. This module's job is the tier that pydantic
cannot know about — overrides that come from the runtime store — and the
validation that applying them must not skip.

An override is always applied *on top of* a fully resolved :class:`Settings`, and
the result is revalidated. Using ``model_copy`` here would bypass validation and
let an invalid stored value reach the rest of the application.
"""

from __future__ import annotations

from collections.abc import Mapping
from functools import cache
from typing import Any

from pydantic import TypeAdapter

from planny_core.config.keys import SettingKey, key_by_name
from planny_core.config.settings import Settings
from planny_core.errors import InvalidConfigurationError

__all__ = ["apply_overrides", "overrides_from_fields", "validate_override"]


def validate_override(entry: SettingKey, value: Any) -> Any:
    """Validate *value* for a key and return the coerced result.

    The type is validated here rather than only when the merged settings object is
    revalidated. Without it a value like ``"not-a-number"`` for an integer key
    would be accepted and stored, and would only fail on the *next start*, when
    the store is read — turning a rejected keystroke into an application that
    cannot boot.

    Returns:
        The coerced value, so callers persist what they validated rather than what
        they were given.

    Raises:
        InvalidConfigurationError: the value cannot be valid for this key.
        ValidationError: the value does not match the field's declared type.
    """
    if value is None:
        raise InvalidConfigurationError(f"{entry.key} cannot be set to null.")
    if entry.choices and str(value) not in entry.choices:
        raise InvalidConfigurationError(
            f"{entry.key} must be one of {', '.join(entry.choices)}; got {value!r}."
        )
    return _adapter_for(entry).validate_python(value)


@cache
def _adapter_for(entry: SettingKey) -> TypeAdapter[Any]:
    """A validator for the settings field behind *entry*.

    Built from the annotation rather than from a ``Settings`` instance so one
    field can be checked without assembling a whole configuration — and cached,
    because ``TypeAdapter`` construction is the expensive part.
    """
    field = Settings.model_fields[entry.settings_field]
    return TypeAdapter(field.annotation)


def apply_overrides(base: Settings, overrides: Mapping[str, Any]) -> Settings:
    """Return *base* with *overrides* applied and the result revalidated.

    Keys are registry names (``jira.external.base_url``), not field names, so a
    typo fails loudly instead of silently writing an attribute nothing reads.

    Args:
        base: A fully resolved settings object, normally the environment tier.
        overrides: Registry key to value.

    Raises:
        KeyError: a key is not registered.
        InvalidConfigurationError: a value is rejected by the registry.
        ValidationError: a value fails the field's own type validation.
    """
    if not overrides:
        return base

    changes: dict[str, Any] = {}
    for name, value in overrides.items():
        entry = key_by_name(name)
        changes[entry.settings_field] = validate_override(entry, value)

    return Settings.model_validate({**base.model_dump(), **changes})


def overrides_from_fields(fields: Mapping[str, Any]) -> dict[str, Any]:
    """Translate ``settings_field`` names into registry keys.

    Used by the bootstrap cache, which stores field names because it mirrors the
    database connection shape. Unknown fields are dropped rather than raising:
    the cache is a file on disk and may have been written by an older version.
    """
    from planny_core.config.keys import key_by_settings_field

    translated: dict[str, Any] = {}
    for field, value in fields.items():
        if value is None:
            continue
        entry = key_by_settings_field(field)
        if entry is not None:
            translated[entry.key] = value
    return translated
