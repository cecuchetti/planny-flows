"""Composition kernel: module contract, discovery and mounting."""

from __future__ import annotations

from planny_api.kernel.module import ApiModule
from planny_api.kernel.registry import ModuleRegistryError, discover_modules

__all__ = ["ApiModule", "ModuleRegistryError", "discover_modules"]
