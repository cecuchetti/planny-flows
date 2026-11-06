"""Money rounding shared by every migration stage.

One rounding decision for the whole pipeline, so ``transform``, ``load`` and
``reconcile`` cannot drift apart over a cent.
"""

from __future__ import annotations

from decimal import Decimal

CENT = Decimal("0.01")
ZERO = Decimal("0.00")


def money(value: Decimal | int | str | None) -> Decimal:
    """Round a money value to two decimals."""
    if value is None:
        return ZERO
    return Decimal(str(value)).quantize(CENT)
