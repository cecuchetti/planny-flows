"""FastAPI wrapper around the pagination primitives.

The maths lives in :mod:`planny_core.pagination`, which must stay free of web
framework imports. This module only turns query parameters into a
:class:`~planny_core.pagination.Page`.
"""

from __future__ import annotations

from fastapi import Query
from planny_core.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, Page

__all__ = ["page_request"]


def page_request(
    page: int = Query(0, description="Zero-indexed page number. Negative values are treated as 0."),
    size: int = Query(
        DEFAULT_PAGE_SIZE,
        description=(
            f"Rows per page. Clamped to 1..{MAX_PAGE_SIZE}; a larger value is "
            "reduced rather than rejected."
        ),
    ),
) -> Page:
    """Dependency returning a validated pagination window.

    The bounds are applied by :class:`Page` rather than by ``Query`` validators,
    which preserves the previous behaviour: an out-of-range value was clamped,
    not rejected with a 422.
    """
    return Page(number=page, size=size)
