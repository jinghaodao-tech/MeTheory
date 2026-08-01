# PostgreSQL Analysis Migration

MeTheory keeps SQLite as the local-first operational database. PostgreSQL is an optional analysis-history store selected by `METHEORY_ANALYSIS_STORE=postgres` and `METHEORY_POSTGRES_URL`.

The PostgreSQL schema contains only profile bindings and immutable PCS analysis runs. Markdown, PCS records, sensitive values, and raw snapshot records are not copied into it. Apply the schema with:

```powershell
$env:METHEORY_POSTGRES_URL = "postgres://..."
npm run db:migrate:postgres
npm run db:backfill:postgres
```

The HTTP server uses a common async analysis-store contract. Without the environment flag it uses SQLite; with the flag it uses PostgreSQL. If PostgreSQL becomes unavailable, analysis-history operations fall back to SQLite and emit a structured `analysis_store_fallback` warning. After three consecutive failures, a 30-second circuit breaker avoids repeated connection timeouts. Configure the threshold and cooldown with `METHEORY_POSTGRES_FAILURE_THRESHOLD` and `METHEORY_POSTGRES_COOLDOWN_MS`. A deployment should enable the flag only after applying the schema, running the backfill, and validating backups.
