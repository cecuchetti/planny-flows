"""Read-only extraction from the legacy MongoDB.

The legacy URI carries no database name (``mongodb+srv://.../``), so the driver
defaults to ``test``; the single collection is ``loans`` (Mongoose pluralised the
``Loan`` model). Both are overridable from the CLI in case the source ever moves.
"""

from __future__ import annotations

from typing import Any

__all__ = ["LEGACY_COLLECTION", "LEGACY_DATABASE", "extract_loans"]

LEGACY_DATABASE = "test"
LEGACY_COLLECTION = "loans"


async def extract_loans(
    uri: str,
    *,
    database: str = LEGACY_DATABASE,
    collection: str = LEGACY_COLLECTION,
) -> list[dict[str, Any]]:
    """Return every legacy loan document from *uri*.

    The connection is opened and closed here and nothing is written to the source.
    ``motor`` is imported lazily so the name-analysis and load stages stay
    importable — and testable — without a MongoDB driver.
    """
    from motor.motor_asyncio import AsyncIOMotorClient

    client: Any = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=5000)
    try:
        return [doc async for doc in client[database][collection].find()]
    finally:
        client.close()
