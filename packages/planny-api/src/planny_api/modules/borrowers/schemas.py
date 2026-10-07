from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class BorrowerRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    first_name: str | None = Field(default=None, alias="firstName")
    last_name: str | None = Field(default=None, alias="lastName")
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    national_id: str | None = Field(default=None, alias="nationalId")
    notes: str | None = None


class BorrowerResponse(BaseModel):  # noqa: D101
    id: int
    firstName: str  # noqa: N815
    lastName: str  # noqa: N815
    email: str | None
    phone: str | None
    address: str | None
    nationalId: str | None  # noqa: N815
    notes: str | None
    loanCount: int = 0  # noqa: N815
