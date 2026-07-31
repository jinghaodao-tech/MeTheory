import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migratePcsSchema, PCS_MIGRATION_VERSION, rollbackPcsMigrationMarker } from "../apps/api/src/db/migrate.ts";

test("PCS migration is repeatable and its non-destructive rollback is explicit", () => {
  const dir = mkdtempSync(join(tmpdir(), "pcs-rollback-")); const db = new DatabaseSync(join(dir, "db.sqlite"));
  try {
    const root = resolve("."); migratePcsSchema(db, root); migratePcsSchema(db, root);
    assert.equal((db.prepare("SELECT count(*) AS count FROM schema_migrations WHERE version=?").get(PCS_MIGRATION_VERSION) as { count: number }).count, 1);
    rollbackPcsMigrationMarker(db);
    assert.equal((db.prepare("SELECT count(*) AS count FROM schema_migrations WHERE version=?").get(PCS_MIGRATION_VERSION) as { count: number }).count, 0);
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pcs_experiments'").get());
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
