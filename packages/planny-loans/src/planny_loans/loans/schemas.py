from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class LoanRequest(BaseModel):
    """A loan payload.

    Every field is optional at this layer: the service enforces the business
    rules and raises the catalogued ``BAD_USER_INPUT`` error with Spanish
    messages, so a malformed payload is a ``400`` rather than a FastAPI ``422``.
    ``number`` is deliberately absent — the API assigns it and never reads it.
    """

    model_config = ConfigDict(populate_by_name=True, extra="ignore")
    borrower_id: object = Field(default=None, alias="borrowerId")
    amount: object = None
    currency: object = None
    date: object = None
    concept: object = None
    lender: object = None
    city: object = None
    advance_paid: object = Field(default=None, alias="advancePaid")
    installment_amount: object = Field(default=None, alias="installmentAmount")
