import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("PostgreSQL analysis schema keeps PCS records outside the analysis database", () => {
  const schema = readFileSync("db/postgres_schema.sql", "utf8");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS pcs_analysis_runs/);
  assert.match(schema, /UNIQUE\(user_id, snapshot_id\)/);
  assert.doesNotMatch(schema, /context_entries|context_values|markdown/);
});
