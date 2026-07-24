import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('read-only AI HTTP API enforces the client allowlist', async () => {
  const port = 18100 + Math.floor(Math.random() * 200); const directory = mkdtempSync(join(tmpdir(), 'metheory-api-')); const database = join(directory, 'api.sqlite3');
  const child = spawn(process.execPath, ['--experimental-strip-types', 'apps/api/src/server.ts'], { env: { ...process.env, PORT: String(port), METHEORY_DB: database, METHEORY_AI_CLIENTS: 'test-client' }, stdio: 'ignore' });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 30 && !ready; attempt += 1) { try { ready = (await fetch(`http://127.0.0.1:${port}/healthz`)).ok; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); } }
    assert.equal(ready, true);
    const created = await fetch(`http://127.0.0.1:${port}/v1/users`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ authSubject: `api-test-${port}` }) });
    const user = await created.json() as { id: string };
    const denied = await fetch(`http://127.0.0.1:${port}/v1/ai/parameters?userId=${user.id}&clientId=unknown&clientType=mcp`); assert.equal(denied.status, 403);
    const allowed = await fetch(`http://127.0.0.1:${port}/v1/ai/parameters?userId=${user.id}&clientId=test-client&clientType=mcp`); assert.equal(allowed.status, 200); assert.deepEqual((await allowed.json()).items, []);
  } finally { child.kill(); await new Promise((resolve) => setTimeout(resolve, 150)); try { rmSync(directory, { recursive: true, force: true }); } catch { /* Windows may release the SQLite handle after the test process exits. */ } }
});
