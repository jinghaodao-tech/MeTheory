# ADR-009: Remove the obsolete Python runtime

## Decision

The Python MVP runtime, its reference schema, and its Python-only compatibility
test are removed from the active repository:

- backend/core.py
- backend/server.py
- backend/__init__.py
- db/mvp_schema.sql
- tools/test_mvp.py

The TypeScript Node API, db/ts_mvp_schema.sql, and the versioned migration
runner are the only runtime path.

## Rationale

MeTheory is a single-user local-first TypeScript/Node application. No supported
deployment or persisted data path requires the Python runtime. Keeping a second
implementation caused schema and behavior drift and made it unclear which
threshold and lifecycle rules were authoritative.

## Compatibility boundary

The observations and evidence_links tables are not removed in this change.
The current Node API, mobile compatibility client, and existing SQLite data still
use them. They are legacy data entities, not a Python runtime. Their eventual
removal requires a separate migration that proves all clients and stored data
have moved to the current EAV/evaluation paths.

## Consequences

- TypeScript is the sole executable domain implementation.
- Existing SQLite migration and data-preservation tests remain the compatibility
  safety net.
- Python is still allowed for one-off repository tooling only when documented;
  it is not a runtime or domain reference implementation.
