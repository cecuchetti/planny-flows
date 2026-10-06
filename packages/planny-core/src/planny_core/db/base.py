"""SQLAlchemy declarative base.

Kept in its own module so models can import it without pulling in the engine,
configuration or session machinery.
"""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase

__all__ = ["Base"]


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""
