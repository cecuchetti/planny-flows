"""Loan registry API."""

from planny_api.kernel.module import ApiModule

from planny_loans.loans.router import router

MODULE = ApiModule(name="loans", router=router, auth=False, tags=("loans",))
