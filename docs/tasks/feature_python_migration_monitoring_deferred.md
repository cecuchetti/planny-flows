---
type: feature
priority: low
created: 2026-07-11T12:00:00Z
status: open
tags: [python, monitoring, observability, deferred]
keywords: [OpenTelemetry, Prometheus, metrics, tracing, cross-backend]
patterns: [distributed tracing, metrics collection, health monitoring]
---

# FEATURE-014: OpenTelemetry + Prometheus monitoring (deferred)

## Description

Add OpenTelemetry distributed tracing across both backends (while both exist) and expose a Prometheus `/metrics` endpoint on the Python backend. This ticket is created for visibility but implementation is deferred until after the migration is complete.

## Context

Blueprint Section 8 (nice-to-have). With two backends running during the migration, distributed tracing helps debug cross-backend issues. After migration, Prometheus metrics enable production monitoring parity with existing observability.

## Requirements

### Functional Requirements

**OpenTelemetry:**
- Auto-instrumentation for FastAPI (requests, dependencies, DB queries)
- Manual spans for Jira HTTP client calls
- Trace context propagation via `traceparent` header
- Export to OTLP collector (configurable endpoint)

**Prometheus:**
- `GET /metrics` endpoint exposing:
  - Request count by method/status/route
  - Request duration histogram
  - DB query count and duration
  - Jira API call count and duration
  - Active connections gauge

### Non-Functional Requirements

- Zero performance impact on critical path (<1% overhead)
- Sampling rate configurable (default: 10% in production)
- Metrics endpoint must respect existing auth (or be on separate port)

## Current State

No observability beyond structured logging. Node has no tracing. Python has no metrics.

## Research Context

### Keywords to Search
- `opentelemetry-instrumentation-fastapi` — FastAPI auto-instrumentation
- `prometheus_fastapi_instrumentator` — Prometheus for FastAPI
- `opentelemetry-instrumentation-sqlalchemy` — DB query tracing

### Key Decisions Made
- **Deferred**: Not blocking migration. Create ticket, skip implementation.
- **OTLP exporter**: Standard protocol, works with any collector (Jaeger, Grafana, Datadog)

## Success Criteria

### Automated Verification
- [ ] `GET /metrics` returns Prometheus format metrics
- [ ] HTTP requests generate trace spans with full path
- [ ] DB queries generate child spans of request spans
- [ ] Jira API calls generate child spans with system tag

### Manual Verification
- [ ] Jaeger/Grafana UI shows trace waterfall across backends

## Related Information

- Depends on: FEATURE-013 (all routes in Python)
- Priority: Low. Not needed for migration. Created for tracking only.

## Notes

Do not start implementation until the migration is fully complete (DEBT-001 done). This ticket is a placeholder in the backlog. The OpenTelemetry configuration for httpx must use `opentelemetry-instrumentation-httpx` for automatic Jira client tracing.
