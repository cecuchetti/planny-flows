"""Loan registry API."""

from planny_api.kernel.module import ApiModule
from planny_api.modules.loans.router import router

MODULE = ApiModule(name="loans", router=router, auth=False, tags=("loans",))
