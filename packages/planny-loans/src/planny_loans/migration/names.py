"""Legacy free-text borrower names -> first/last-name borrower records.

The legacy app stored the borrower as one free-text string. Migration turns each
distinct name into a ``borrower`` record: the name splits on its first whitespace
run into first name and last name, and identical names — after case and whitespace
normalisation — share one record. A name that cannot be split safely (empty, or a
single word) is queued for operator review rather than guessed, because
``lastName`` is required and inventing one would fabricate data.
"""

from __future__ import annotations

from dataclasses import dataclass, field

__all__ = [
    "BorrowerMapping",
    "BorrowerPlan",
    "NameSplit",
    "dedup_key",
    "normalize",
    "resolve_borrowers",
    "split_name",
]


def normalize(value: object) -> str:
    """Collapse a name to single spaces, trimmed."""
    return " ".join(str(value or "").split())


@dataclass(frozen=True, slots=True)
class NameSplit:
    """The outcome of splitting one legacy name."""

    first_name: str
    last_name: str
    ambiguous: bool
    reason: str | None = None


def split_name(raw: object) -> NameSplit:
    """Split one legacy name into first and last name.

    The heuristic is simple and documented: the first whitespace run separates the
    given name from the family name(s). A single token has no split to make and an
    empty string has nothing at all — both are flagged rather than guessed.
    """
    name = normalize(raw)
    if not name:
        return NameSplit("", "", True, "nombre vacío")
    tokens = name.split()
    if len(tokens) == 1:
        return NameSplit(
            tokens[0], "", True, "una sola palabra; no se puede separar nombre/apellido"
        )
    return NameSplit(tokens[0], " ".join(tokens[1:]), False)


def dedup_key(first_name: str, last_name: str) -> str:
    """The identity two borrowers share: normalised first and last name."""
    return f"{normalize(first_name).lower()}|{normalize(last_name).lower()}"


@dataclass
class BorrowerMapping:
    """One target borrower and every legacy name that folds into it."""

    first_name: str
    last_name: str
    source_names: list[str] = field(default_factory=list)
    ambiguous: bool = False
    reasons: list[str] = field(default_factory=list)

    @property
    def key(self) -> str:
        return dedup_key(self.first_name, self.last_name)


@dataclass
class BorrowerPlan:
    """The borrower half of a migration plan.

    ``by_source_name`` maps a normalised legacy name to its target mapping;
    ``ambiguous`` holds the mappings queued for operator review.
    """

    by_source_name: dict[str, BorrowerMapping]
    mappings: dict[str, BorrowerMapping]
    ambiguous: list[BorrowerMapping]


def resolve_borrowers(
    names: list[str],
    overrides: dict[str, tuple[str, str]] | None = None,
) -> BorrowerPlan:
    """Resolve distinct legacy names into borrower mappings.

    ``overrides`` maps a normalised legacy name to ``(first_name, last_name)`` —
    the operator's decision from a prior review, applied instead of the heuristic.
    Two names overriding to the same pair fold into one borrower, which is how a
    "merge" decision is expressed.
    """
    overrides = {
        normalize(key): (normalize(first), normalize(last))
        for key, (first, last) in (overrides or {}).items()
    }
    by_source: dict[str, BorrowerMapping] = {}
    mappings: dict[str, BorrowerMapping] = {}

    def _mapping(split: NameSplit, reason: str | None = None) -> BorrowerMapping:
        key = dedup_key(split.first_name, split.last_name)
        mapping = mappings.get(key)
        if mapping is None:
            mapping = BorrowerMapping(split.first_name, split.last_name)
            mappings[key] = mapping
        if reason is not None:
            mapping.reasons.append(reason)
            mapping.ambiguous = True
        return mapping

    # The (lower, raw) key makes the first-seen casing deterministic: for two names
    # that differ only by case, the ASCII-uppercase form sorts first and becomes the
    # canonical first/last name of the deduplicated borrower.
    for name in sorted({normalize(n) for n in names}, key=lambda n: (n.lower(), n)):
        if name in overrides:
            first, last = overrides[name]
            if not last:
                split = NameSplit(first, "", True, "decisión manual dejó el apellido vacío")
            else:
                split = NameSplit(first, last, False)
        else:
            split = split_name(name)
        mapping = _mapping(split, split.reason if split.ambiguous else None)
        mapping.source_names.append(name)
        by_source[name] = mapping

    return BorrowerPlan(
        by_source_name=by_source,
        mappings=mappings,
        ambiguous=[m for m in mappings.values() if m.ambiguous],
    )
