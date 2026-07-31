import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

const pcsRoot = process.env.PCS_REPO_PATH;
test("real PCS to MeTheory snapshot flow", { skip: !pcsRoot ? "set PCS_REPO_PATH to run the cross-repository E2E" : false }, async () => {
  const root = mkdtempSync(join(tmpdir(), "metheory-pcs-live-"));
  const notes = join(root, "notes");
  const pcsPort = 19000 + (process.pid % 500);
  const mtPort = pcsPort + 1;
  const pcsDb = join(root, "pcs.sqlite3");
  const mtDb = join(root, "metheory.sqlite3");
  const children: ChildProcess[] = [];
  const start = (cwd: string, env: Record<string, string>) => { const args = cwd === pcsRoot ? ["--experimental-strip-types", "apps/api/src/server.ts"] : ["--experimental-strip-types", "apps/api/src/server.ts"]; const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: "ignore" }); children.push(child); return child; };
  const wait = async (url: string) => { for (let attempt = 0; attempt < 120; attempt += 1) { try { if ((await fetch(url)).ok) return; } catch { /* service is starting */ } await new Promise((resolve) => setTimeout(resolve, 250)); } throw new Error(`service_not_ready:${url}`); };
  const request = async (base: string, path: string, method = "GET", value?: unknown, headers: Record<string, string> = {}) => { const response = await fetch(base + path, { method, headers: { ...(value === undefined ? {} : { "content-type": "application/json" }), ...headers }, body: value === undefined ? undefined : JSON.stringify(value) }); const body = await response.json() as Record<string, any>; assert.ok(response.ok, `${method} ${path}: ${JSON.stringify(body)}`); return body; };
  try {
    start(pcsRoot!, { PCS_PORT: String(pcsPort), PCS_DB: pcsDb, PCS_NOTES_DIR: notes });
    await wait(`http://127.0.0.1:${pcsPort}/health`);
    const pcs = `http://127.0.0.1:${pcsPort}`;
    const template = await request(pcs, "/v1/context-templates", "POST", { name: "Live", purpose: "self_understanding", fields: [
      { fieldKey: "clarity", label: "Clarity", valueType: "number", required: true, displayOrder: 1, minimum: 1, maximum: 5, analysisRole: "task_clarity", analysisRoleConfirmed: true, analysisUsage: "condition", analysisMergeAllowed: true, sharingDefault: "purpose_only", sensitivity: "normal", reason: "condition" },
      { fieldKey: "delay", label: "Delay", valueType: "duration_minutes", required: true, displayOrder: 2, minimum: 0, maximum: 60, analysisRole: "start_delay", analysisRoleConfirmed: true, analysisUsage: "outcome", analysisMergeAllowed: true, sharingDefault: "purpose_only", sensitivity: "normal", reason: "outcome" }
    ] });
    await request(pcs, `/v1/context-templates/${template.item.id}/activate`, "POST", {});
    const purpose = await request(pcs, "/v1/sharing-purposes", "POST", { name: "live_e2e" });
    for (let index = 0; index < 12; index += 1) { const entry = await request(pcs, "/v1/context-entries", "POST", { templateId: template.item.id, values: { clarity: index < 6 ? 2 : 4, delay: index < 6 ? 40 : 10 } }); for (const fieldKey of ["clarity", "delay"]) await request(pcs, `/v1/context-entries/${entry.id}/values/${fieldKey}/purposes`, "PUT", { purposeIds: [purpose.id] }); }
    const profile = await request(pcs, "/v1/context-profiles", "POST", { name: "Live profile", target: "metheory", purposeId: purpose.id, includedFields: [{ templateId: template.item.id, fieldKey: "clarity" }, { templateId: template.item.id, fieldKey: "delay" }] });
    const client = await request(pcs, "/v1/integration-clients", "POST", { name: "MeTheory", permissions: ["read_snapshot"], allowedProfileIds: [profile.id] });
    const snapshot = await request(pcs, `/v1/context/analysis-snapshot?profileId=${encodeURIComponent(profile.id)}&from=2026-07-01T00:00:00.000Z&to=2026-08-01T00:00:00.000Z`, "GET", undefined, { "x-pcs-client-id": client.id, authorization: `Bearer ${client.token}` });
    assert.equal(snapshot.contractRevision, "pcs-analysis-snapshot-v2.1"); assert.equal(snapshot.profileId, profile.id); assert.equal(snapshot.records.length, 12);
    start(process.cwd(), { PORT: String(mtPort), METHEORY_DB: mtDb, PCS_API_URL: pcs, PCS_CLIENT_ID: client.id, PCS_CLIENT_TOKEN: client.token, PCS_PROFILE_ID: profile.id });
    await wait(`http://127.0.0.1:${mtPort}/healthz`);
    const db = new DatabaseSync(mtDb); db.prepare("INSERT INTO users(id,auth_subject,locale,timezone,created_at) VALUES(?,?,?,?,?)").run("live-user", "live-user-subject", "ja-JP", "Asia/Tokyo", "2026-07-01T00:00:00.000Z"); db.close();
    const result = await request(`http://127.0.0.1:${mtPort}`, "/v1/self-understanding/analyze-personal-context", "POST", { userId: "live-user", profileId: profile.id, minimumEntryCount: 8, startAt: "2026-07-01T00:00:00.000Z", endAt: "2026-08-01T00:00:00.000Z" });
    assert.ok(Array.isArray(result.hypotheses));
  } finally { for (const child of children) child.kill(); await new Promise((resolve) => setTimeout(resolve, 100)); rmSync(root, { recursive: true, force: true }); }
});
