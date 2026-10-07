"""The optional loans distribution.

Installing ``planny-loans`` publishes the ``planny.modules`` entry point that
makes the borrower directory and the loan registry visible to the application.
Nothing under ``planny_api`` imports this package: a deployment that does not
install it simply never discovers these domains.
"""
