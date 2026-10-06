"""Runtime settings store.

Holds **overrides only**. The absence of a row means "no override", which is
what lets a value fall back to the environment and then to the code default
instead of being duplicated here.

Secret values are stored encrypted; ``key_id`` records which master key produced
the ciphertext so keys can be rotated without re-encrypting everything at once.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from planny_core.db.base import Base


class AppSetting(Base):
    __tablename__ = "app_setting"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    #: Serialised value. JSON for every key; additionally **encrypted** when
    #: ``is_secret`` is set, which is why the flag and not the column name tells
    #: you how to read it.
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_secret: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="0", nullable=False
    )
    key_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("user.id"), nullable=True
    )

    def __repr__(self) -> str:
        return f"<AppSetting key={self.key!r} secret={self.is_secret}>"
