"""Borrower directory API."""

from planny_api.kernel.module import ApiModule

from planny_loans.borrowers.router import router

MODULE = ApiModule(name="borrowers", router=router, auth=False, tags=("borrowers",))
