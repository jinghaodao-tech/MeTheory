import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("hypothesis check-ins name the condition and outcome fields", async () => {
  const port = 18800 + Math.floor(Math.random() * 100);
  const directory = mkdtempSync(join(tmpdir(), "metheory-checkin-"));
  const database = join(directory, "api.sqlite3");
  const child = spawn(process.execPath, ["--experimental-strip-types", "apps/api/src/server.ts"], { env: { ...process.env, PORT: String(port), METHEORY_DB: database }, stdio: "ignore" });
  const api = async (path: string, value: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
    return { response, body: await response.json() as any };
  };
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break; } catch { await new Promise((resolve) => setTimeout(resolve, 50)); }
      if (attempt === 99) throw new Error("server_not_ready");
    }
    const user = (await api("/v1/users", { authSubject: `checkin-${port}` })).body;
    const spec = { schemaVersion: "1", unit: "response", scope: [], cohorts: [{ key: "clear", conditions: [{ field: "task_clarity", operator: "equals", value: "clear" }] }, { key: "unclear", conditions: [{ field: "task_clarity", operator: "equals", value: "unclear" }] }], outcome: { field: "start_delay", metric: "numeric_mean_difference", minimumValue: 0, maximumValue: 60 }, expectation: { relation: "cohort_a_less_than_b", minimumEffect: 1 }, evaluationPolicy: { captureModes: ["momentary_observation"], acceptedSources: ["user_confirmed"], minimumSamplesPerCohort: 3, maximumCohortRatio: 3, windowDays: 7, excludeLowCertainty: true, maximumMissingRate: 0.2 } };
    const hypothesis = await api("/v1/hypotheses", { userId: user.id, statement: "Clear tasks start sooner", spec });
    const checkin = await api("/v1/checkins/next", { userId: user.id, kind: "hypothesis" });
    assert.equal(checkin.response.status, 201);
    assert.match(checkin.body.question.text, /task_clarity/);
    assert.match(checkin.body.question.text, /start_delay/);
    assert.equal(checkin.body.question.field, "start_delay");
    assert.ok(hypothesis.body.id);
  } finally { child.kill(); await new Promise((resolve) => setTimeout(resolve, 100)); try { rmSync(directory, { recursive: true, force: true }); } catch {} }
});
