import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { PostgresPcsAnalysisRepository } from "../apps/api/src/postgresPcsAnalysisRepository.ts";

test("PostgreSQL analysis store is reachable when configured", { skip: !process.env.METHEORY_POSTGRES_URL ? "METHEORY_POSTGRES_URL is not configured" : false }, async () => {
  const pool = new Pool({ connectionString: process.env.METHEORY_POSTGRES_URL, max: 1 });
  try {
    const result = await pool.query("SELECT 1 AS ok");
    assert.equal(result.rows[0]?.ok, 1);
    const repository = new PostgresPcsAnalysisRepository({ connectionString: process.env.METHEORY_POSTGRES_URL! });
    assert.equal(await repository.health(), true);
    await repository.close();
  } finally { await pool.end(); }
});

test("PostgreSQL analysis history supports scoped CRUD and paging", { skip: !process.env.METHEORY_POSTGRES_URL ? "METHEORY_POSTGRES_URL is not configured" : false }, async () => {
  const repository = new PostgresPcsAnalysisRepository({ connectionString: process.env.METHEORY_POSTGRES_URL!, max: 1 });
  const userId = `live_user_${Date.now()}`;
  const snapshotId = `live_snapshot_${Date.now()}`;
  try {
    const binding = await repository.bind(userId, "pcs_live_profile");
    assert.equal(binding.pcsProfileId, "pcs_live_profile");
    const run = await repository.saveRun(userId, {
      schemaVersion: "pcs-analysis-snapshot-v2",
      contractRevision: "pcs-analysis-snapshot-v2.1",
      snapshotId,
      profileId: "pcs_live_profile",
      generatedAt: "2026-08-01T00:00:00.000Z",
      period: { startAt: "2026-07-01T00:00:00.000Z", endAt: "2026-08-01T00:00:00.000Z", timezone: "Asia/Tokyo" },
      records: [],
      excluded: { unconfirmed: 0, nonShareable: 0, highlySensitive: 0, invalid: 0 }
    } as any, {
      status: "insufficient_data",
      dataQuality: { completeRecordCount: 0, excludedRecordCount: 0, excludedValueCount: 0, observedParameterCount: 0, missingParameterCount: 0, warnings: [] },
      excludedFields: [],
      hypotheses: [],
      candidateEvidence: []
    } as any);
    assert.equal((await repository.getRun(userId, run.id))?.snapshotId, snapshotId);
    const page = await repository.listRuns(userId, { limit: 1, offset: 0 });
    assert.equal(page.total, 1);
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0]?.id, run.id);
  } finally {
    await repository.pool.query("DELETE FROM pcs_analysis_runs WHERE user_id=$1", [userId]);
    await repository.pool.query("DELETE FROM pcs_profile_bindings WHERE metheory_user_id=$1", [userId]);
    await repository.close();
  }
});
