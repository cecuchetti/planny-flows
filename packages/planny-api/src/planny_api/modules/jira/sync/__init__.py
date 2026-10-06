"""Jira synchronisation, split by responsibility.

* :mod:`mapping`    — pure transformations from Jira payloads to local fields
* :mod:`repository` — every statement issued against the database
* :mod:`service`    — the sync algorithm, plus the staleness check
"""

from __future__ import annotations

__all__ = ["mapping", "repository", "service"]
