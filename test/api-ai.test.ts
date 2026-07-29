import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('read-only AI HTTP API enforces the client allowlist', async () => {
  const port = 18100 + Math.floor(Math.random() * 200); const directory = mkdtempSync(join(tmpdir(), 'metheory-api-')); const database = join(directory, 'api.sqlite3');
  const child = spawn(process.execPath, ['--experimental-strip-types', 'apps/api/src/server.ts'], { env: { ...process.env, PORT: String(port), METHEORY_DB: database, METHEORY_AI_CLIENTS: 'test-client', METHEORY_API_AUTH_MODE: 'production' }, stdio: 'ignore' });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 30 && !ready; attempt += 1) { try { ready = (await fetch(`http://127.0.0.1:${port}/healthz`)).ok; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); } }
    assert.equal(ready, true);
    const created = await fetch(`http://127.0.0.1:${port}/v1/users`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ authSubject: `api-test-${port}` }) });
    const user = await created.json() as { id: string };
    const missingAuth = await fetch(`http://127.0.0.1:${port}/v1/ai/parameters?userId=${user.id}&clientId=test-client&clientType=mcp`); assert.equal(missingAuth.status, 401);
    const denied = await fetch(`http://127.0.0.1:${port}/v1/ai/parameters?userId=${user.id}&clientId=unknown&clientType=mcp`, { headers: { 'x-metheory-authenticated-user-id': user.id } }); assert.equal(denied.status, 403);
    const allowed = await fetch(`http://127.0.0.1:${port}/v1/ai/parameters?userId=${user.id}&clientId=test-client&clientType=mcp`, { headers: { 'x-metheory-authenticated-user-id': user.id } }); assert.equal(allowed.status, 200); assert.deepEqual((await allowed.json()).items, []);
    const contextExport = await fetch(`http://127.0.0.1:${port}/v1/self-understanding/context-export?userId=${user.id}`);
    assert.equal(contextExport.status, 200);
    const exported = await contextExport.json() as { schemaVersion: string; exportedAt: string; acceptedItems: unknown[]; proposedItems: unknown[] };
    assert.equal(exported.schemaVersion, 'personal-context-migration-v1');
    assert.ok(Number.isFinite(Date.parse(exported.exportedAt)));
    assert.deepEqual(exported.acceptedItems, []);
    assert.deepEqual(exported.proposedItems, []);
  } finally { child.kill(); await new Promise((resolve) => setTimeout(resolve, 150)); try { rmSync(directory, { recursive: true, force: true }); } catch { /* Windows may release the SQLite handle after the test process exits. */ } }
});

test('API startup migrates legacy IPIP-named baseline rows without losing responses', async () => {
  const port = 18300 + Math.floor(Math.random() * 200); const directory = mkdtempSync(join(tmpdir(), 'metheory-baseline-migration-')); const database = join(directory, 'api.sqlite3');
  const legacy = new DatabaseSync(database);
  legacy.exec("CREATE TABLE users (id TEXT PRIMARY KEY, auth_subject TEXT NOT NULL, locale TEXT NOT NULL, timezone TEXT NOT NULL, created_at TEXT NOT NULL) STRICT");
  legacy.exec("CREATE TABLE baseline_self_perceptions (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,source TEXT NOT NULL CHECK(source = 'ipip'),item_set_version TEXT NOT NULL,item_key TEXT NOT NULL,original_item_reference TEXT,statement_ja TEXT NOT NULL,response INTEGER NOT NULL CHECK(response >= 1 AND response <= 5),response_minimum INTEGER NOT NULL DEFAULT 1,response_maximum INTEGER NOT NULL DEFAULT 5,recorded_at TEXT NOT NULL,user_confirmed INTEGER NOT NULL DEFAULT 1 CHECK(user_confirmed IN(0,1)),use_for_self_understanding INTEGER NOT NULL DEFAULT 1 CHECK(use_for_self_understanding IN(0,1)),privacy_level TEXT NOT NULL DEFAULT 'normal' CHECK(privacy_level = 'normal'),provenance_json TEXT NOT NULL DEFAULT '{}',deleted_at TEXT,UNIQUE(user_id, item_set_version, item_key)) STRICT");
  legacy.prepare("INSERT INTO users(id,auth_subject,locale,timezone,created_at) VALUES(?,?,?,?,?)").run('baseline-user', 'baseline-subject', 'ja-JP', 'Asia/Tokyo', '2026-07-28T00:00:00.000Z');
  legacy.prepare("INSERT INTO baseline_self_perceptions(id,user_id,source,item_set_version,item_key,statement_ja,response,recorded_at,provenance_json) VALUES(?,?,?,?,?,?,?,?,?)").run('baseline-1', 'baseline-user', 'ipip', 'ipip-paraphrase-ja-v1', 'starting_tasks', 'Self perception', 4, '2026-07-28T00:00:00.000Z', '{}');
  legacy.close();
  const child = spawn(process.execPath, ['--experimental-strip-types', 'apps/api/src/server.ts'], { env: { ...process.env, PORT: String(port), METHEORY_DB: database }, stdio: 'ignore' });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 30 && !ready; attempt += 1) { try { ready = (await fetch(`http://127.0.0.1:${port}/healthz`)).ok; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); } }
    assert.equal(ready, true);
    const migrated = new DatabaseSync(database).prepare("SELECT source,item_set_version,response FROM baseline_self_perceptions WHERE id=?").get('baseline-1') as { source: string; item_set_version: string; response: number };
    assert.deepEqual({ ...migrated }, { source: 'baseline_self_perception', item_set_version: 'ipip-inspired-baseline-ja-v1', response: 4 });
  } finally { child.kill(); await new Promise((resolve) => setTimeout(resolve, 150)); try { rmSync(directory, { recursive: true, force: true }); } catch { /* Windows may release the SQLite handle after the test process exits. */ } }
});
