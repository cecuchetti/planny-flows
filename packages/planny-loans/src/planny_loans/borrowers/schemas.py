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
    model_config = ConfigDict(extra="allow")

    id: int
    firstName: str  # noqa: N815
    lastName: str  # noqa: N815
    email: str | None
    phone: str | None
    address: str | None
    nationalId: str | None  # noqa: N815
    notes: str | None
    loanCount: int = 0  # noqa: N815
    activeLoanCount: int = 0  # noqa: N815
    totalHistoricalAmount: str | None = None  # noqa: N815
    remainingBalance: str | None = None  # noqa: N815
    recoveryPercent: float = 0.0  # noqa: N815

    # Detail-only fields (list endpoint does not populate them).
    dni: str | None = None
    fiscalStatus: str | None = None  # noqa: N815
    altPhone: str | None = None  # noqa: N815
    city: str | None = None
    postalCode: str | None = None  # noqa: N815
    occupation: str | None = None
    monthlyIncome: str | None = None  # noqa: N815
    enabledForLoans: bool | None = None  # noqa: N815
    notifyWhatsApp: bool | None = None  # noqa: N815
    incomeCertification: dict[str, str] | None = None  # noqa: N815
    loans: list[dict[str, object]] | None = None
    activity: list[dict[str, object]] | None = None
