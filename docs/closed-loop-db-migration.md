# Closed-loop SQLite migration

The additive migration is `db/closed-loop-experiments-migration.sql`. The
runtime schema `db/ts_mvp_schema.sql` contains the same tables for a new local
API database, and the mobile migration adds the experiment columns to
`checkins` and `observation_episodes` at schema version 16.

The migration uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT
EXISTS`. It does not delete or rewrite existing Entries, observations,
Evidence, hypotheses, or Self Model rows. Experiment responses are explicitly
linked to an experiment; free Entries are not implicitly converted.

Apply the standalone migration only to a copy or an existing local database
under the normal migration backup policy. The API applies the runtime schema at
startup, while Expo applies numbered migrations through its existing database
module. Re-running either path is idempotent.