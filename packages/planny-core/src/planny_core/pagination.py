"""Pagination primitives.

Zero-indexed, and deliberately free of any web-framework import so both the API
and the integration packages can use it. The FastAPI dependency wrapper lives in
``planny_api/core/pagination.py``.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from math import ceil
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

__all__ = ["DEFAULT_PAGE_SIZE", "MAX_PAGE_SIZE", "Page", "count_rows"]

#: Window used when a caller does not ask for one.
DEFAULT_PAGE_SIZE = 20

#: Upper bound, so a client cannot ask the database for everything at once.
MAX_PAGE_SIZE = 100


@dataclass(frozen=True, slots=True)
class Page:
    """A validated pagination window.

    Attributes are normalised on construction: ``number`` is never negative and
    ``size`` always sits between 1 and :data:`MAX_PAGE_SIZE`.
    """

    number: int = 0
    size: int = DEFAULT_PAGE_SIZE
    total: int = 0

    def __post_init__(self) -> None:
        # ``frozen=True`` means the normalisation has to go through object.
        object.__setattr__(self, "number", max(0, self.number))
        object.__setattr__(self, "size", min(MAX_PAGE_SIZE, max(1, self.size)))
        object.__setattr__(self, "total", max(0, self.total))

    @property
    def offset(self) -> int:
        """Rows to skip, for ``Query.offset``."""
        return self.number * self.size

    @property
    def limit(self) -> int:
        """Rows to fetch, for ``Query.limit``."""
        return self.size

    @property
    def pages(self) -> int:
        """Total number of pages for the known ``total``."""
        return ceil(self.total / self.size) if self.total else 0

    @property
    def has_more(self) -> bool:
        """Whether another page exists beyond this one."""
        return self.offset + self.size < self.total

    def with_total(self, total: int) -> Page:
        """Return this window with the total row count filled in."""
        return replace(self, total=total)


async def count_rows(db: AsyncSession, query: Select[Any]) -> int:
    """Count how many rows *query* would return, without loading them.

    The previous implementation selected every matching id and took ``len`` of
    the result, which transfers the whole result set to count it. This delegates
    the count to the database, which returns a single row.
    """
    counted = select(func.count()).select_from(query.order_by(None).subquery())
    result = await db.execute(counted)
    return int(result.scalar() or 0)
