# Operations Status

## Active

- Node API, CLI, PCS integration, deterministic analysis, experiments, and synthetic verification.
- SQLite is the default local-first store.
- PostgreSQL is selectable for analysis history with `METHEORY_ANALYSIS_STORE=postgres`.
- PostgreSQL analysis history falls back to SQLite when the selected database is unavailable.
- Search and local runtime operation remain local and rebuildable.
- `npm run ops:diagnostics` performs a read-only SQLite integrity, foreign-key,
  migration, and analysis-history check. It also reports whether the optional
  PostgreSQL analysis store is configured.

## Archived or optional

- Expo mobile is archived and excluded from the root dependency graph and default CI.
- PostgreSQL live E2E runs only when `METHEORY_POSTGRES_URL` is supplied to CI.
- Dashboard and service decomposition remain incremental refactors; existing API behavior is preserved.
