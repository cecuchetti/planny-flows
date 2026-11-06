"""Allow ``python -m planny_loans.migration``."""

from __future__ import annotations

from planny_loans.migration.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
