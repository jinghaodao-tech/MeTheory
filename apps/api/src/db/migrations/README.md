# API migration directory

`apps/api/src/db/migrate.ts` is the single runtime migration runner. Migration IDs are ordered and recorded in `schema_migrations`; each migration is idempotent and structural changes are transactional.

The SQL schema remains a bootstrap reference. New runtime changes belong in the migration runner and should have a matching note here or in an ADR. Do not add request-time `ensureColumn` calls for new fields.

Current IDs include `runtime-columns-v1` and `pcs-snapshot-v2`. Existing compatibility migrations for ActivityWatch and baseline data are isolated and are candidates for later migration modules.