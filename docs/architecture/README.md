# Architecture

Architectural blueprints, decision records, and system design documents for planny-flows.

## Start here

| Document | Status |
|---|---|
| [Backend modular blueprint](./2026-10-05-backend-modular-blueprint.md) | Implemented across Phases 0–6b |
| [Runtime configuration blueprint](./2026-10-05-runtime-configuration-blueprint.md) | Proposal — pending decisions |

The first document is the reference for how the backend is organised: the module
contract, the composition kernel, the route map, the findings that drove each change, and
the phase plan. The second describes the database-backed configuration layer and why it
cannot ship before an authorization model exists.

## Guides

| Document | Use it when |
|---|---|
| [**Architecture contract**](./architecture-contract.md) | **You are about to add a feature or change the structure. Read this first** |
| [API routes](./api-routes.md) | You need the current surface, status codes or the error contract |
| [How to add a module](./how-to-add-a-module.md) | You are adding a domain to the backend |
| [How to merge a project](./how-to-merge-a-project.md) | You are absorbing another project into this one |

## Historical

| Date | Document | Status |
|---|---|---|
| 2026-07-11 | [Python Migration Blueprint](../custom/2026-07-11-python-migration-blueprint.md) | Superseded by the backend modular blueprint |

## Related

- [ADR: Tempo Hours Separation](../tasks/done/adr-tempo-hours-separation.md)
- [Deployment Guide](../DEPLOYMENT.md)
