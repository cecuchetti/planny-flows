"""The migration command line.

Three commands, one per operational moment:

* ``spike``      — extract and report the name heuristic (Story 2.8), no host DB.
* ``migrate``    — the full ETL; ``--dry-run`` rehearses it with zero writes.
* ``reconcile``  — compare the already-migrated host DB against the source.

The legacy Mongo URI is read from ``settings.legacy_mongo_uri`` (the
``LEGACY_MONGO_URI`` environment variable or the project ``.env``), through the
configuration layer — never from the process environment directly here.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from planny_core.config import settings
from planny_core.config.bootstrap import resolve_bootstrap_settings
from planny_core.db import Database

from planny_loans.migration import extract, load, reconcile, report, transform

__all__ = ["main"]


class MigrationError(RuntimeError):
    """A migration problem that should abort the run with a clear message."""


def _load_overrides(path: Path | None) -> dict[str, tuple[str, str]]:
    if path is None:
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise MigrationError("--overrides debe apuntar a una lista JSON.")
    overrides: dict[str, tuple[str, str]] = {}
    for entry in data:
        if not isinstance(entry, dict) or "match" not in entry:
            raise MigrationError("cada entrada de --overrides necesita 'match'.")
        first = str(entry.get("firstName") or "").strip()
        last = str(entry.get("lastName") or "").strip()
        overrides[str(entry["match"]).strip()] = (first, last)
    return overrides


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="planny-migrate",
        description="Migración única de los datos legacy de gestión-prestamos.",
    )
    parser.add_argument("command", choices=("spike", "migrate", "reconcile"))
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="con 'migrate': transformar y reportar sin escribir en la base.",
    )
    parser.add_argument("--json", action="store_true", help="reportar como JSON.")
    parser.add_argument(
        "--overrides",
        type=Path,
        help="JSON con decisiones manuales de nombres (lista de {match, firstName, lastName}).",
    )
    parser.add_argument("--database", default=extract.LEGACY_DATABASE)
    parser.add_argument("--collection", default=extract.LEGACY_COLLECTION)
    return parser


async def _run(args: argparse.Namespace) -> int:
    uri = settings.legacy_mongo_uri
    if not uri:
        raise MigrationError(
            "LEGACY_MONGO_URI no está configurada. Definila en el entorno o en el "
            ".env del proyecto (URI de solo lectura de MongoDB de gestión-prestamos)."
        )

    overrides = _load_overrides(args.overrides)
    raw_loans = await extract.extract_loans(
        uri, database=args.database, collection=args.collection
    )
    plan = transform.build_plan(raw_loans, overrides)

    if args.command == "spike":
        print(report.render_spike(plan, as_json=args.json))
        return 0

    database = Database(resolve_bootstrap_settings(settings))
    try:
        async with database.session() as session:
            if args.command == "migrate":
                load_report = await load.load_plan(session, plan, dry_run=args.dry_run)
                reconciliation = None
                if not args.dry_run:
                    reconciliation = await reconcile.build(session, plan)
                print(
                    report.render_migration(
                        plan, load_report, reconciliation, as_json=args.json
                    )
                )
            else:
                reconciliation = await reconcile.build(session, plan)
                print(report.render_reconciliation(reconciliation, as_json=args.json))
    finally:
        await database.dispose()
    return 0


def main(argv: list[str] | None = None) -> int:
    """Entry point for ``planny-migrate`` and ``python -m``."""
    args = _build_parser().parse_args(argv)
    try:
        return asyncio.run(_run(args))
    except MigrationError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
