import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { validateEntryWriteInput } from "../packages/records/src/index.ts";
import { entryBodyFromNote, entryIdFromFrontmatter, entryTitleFromPath } from "../apps/obsidian-plugin/src/frontmatter.ts";

async function waitForApi(port: number): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) return;
    } catch {
      // The child process has not bound its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error("api_not_ready");
}

test("entry schema can be applied more than once", () => {
  const directory = mkdtempSync(join(tmpdir(), "metheory-entry-schema-"));
  const database = new DatabaseSync(join(directory, "entries.sqlite3"));
  try {
    const schema = readFileSync(join(process.cwd(), "db", "ts_mvp_schema.sql"), "utf8");
    database.exec(schema);
    database.exec(schema);
    assert.equal(Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='entries'").get()), true);
    assert.equal(Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='search_documents'").get()), true);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Entry API upserts an Obsidian note, archives it, and exports it", async () => {
  const port = 18350 + Math.floor(Math.random() * 200);
  const directory = mkdtempSync(join(tmpdir(), "metheory-entry-api-"));
  const database = join(directory, "api.sqlite3");
  const child = spawn(process.execPath, ["--experimental-strip-types", "apps/api/src/server.ts"], {
    env: { ...process.env, PORT: String(port), METHEORY_DB: database },
    stdio: "ignore",
  });
  try {
    await waitForApi(port);
    const userResponse = await fetch(`http://127.0.0.1:${port}/v1/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authSubject: `entry-test-${port}` }),
    });
    const user = await userResponse.json() as { id: string };
    const repeatedUser = await fetch(`http://127.0.0.1:${port}/v1/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authSubject: `entry-test-${port}` }),
    });
    assert.equal(repeatedUser.status, 200);
    assert.equal((await repeatedUser.json() as { id: string }).id, user.id);
    const original = { userId: user.id, externalSource: "obsidian", externalSourceId: "daily/2026-07-25.md", title: "2026-07-25", body: "first note", recordedAt: "2026-07-25T09:00:00.000Z" };
    const createdResponse = await fetch(`http://127.0.0.1:${port}/v1/entries`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(original) });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json() as { created: boolean; entry: { id: string; body: string } };
    assert.equal(created.created, true);

    const updatedResponse = await fetch(`http://127.0.0.1:${port}/v1/entries`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...original, body: "updated note", recordedAt: "2026-07-25T10:00:00.000Z" }) });
    assert.equal(updatedResponse.status, 200);
    const updated = await updatedResponse.json() as { created: boolean; entry: { id: string; body: string } };
    assert.equal(updated.created, false);
    assert.equal(updated.entry.id, created.entry.id);
    assert.equal(updated.entry.body, "updated note");

    const search = await fetch(`http://127.0.0.1:${port}/v1/search?userId=${user.id}&q=updated`);
    assert.equal(search.status, 200);
    const searchPayload = await search.json() as { items: Array<{ sourceKind: string; sourceId: string; title: string; snippet: string; score: number; matchedTerms: string[]; recordedAt: string; reference: { kind: string; id: string } }> };
    assert.equal(searchPayload.items[0].sourceId, created.entry.id);
    assert.equal(searchPayload.items[0].sourceKind, "entry");
    assert.equal(searchPayload.items[0].title, original.title);
    assert.equal(typeof searchPayload.items[0].snippet, "string");
    assert.equal(searchPayload.items[0].score > 0, true);
    assert.equal(searchPayload.items[0].matchedTerms.includes("updated"), true);
    assert.deepEqual(searchPayload.items[0].reference, { kind: "entry", id: created.entry.id });
    assert.equal(searchPayload.items[0].recordedAt, "2026-07-25T10:00:00.000Z");
    const rebuilt = await fetch(`http://127.0.0.1:${port}/v1/search-documents/rebuild`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: user.id }) });
    assert.equal((await rebuilt.json() as { indexed: number }).indexed, 1);

    const invalidIdentity = await fetch(`http://127.0.0.1:${port}/v1/entries`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: user.id, externalSource: "obsidian", title: "invalid", body: "invalid" }) });
    assert.equal(invalidIdentity.status, 400);
    const entries = await fetch(`http://127.0.0.1:${port}/v1/entries?userId=${user.id}`);
    assert.equal((await entries.json() as { items: unknown[] }).items.length, 1);

    const archived = await fetch(`http://127.0.0.1:${port}/v1/entries/${created.entry.id}?userId=${user.id}`, { method: "DELETE" });
    assert.equal(archived.status, 200);
    const visibleEntries = await fetch(`http://127.0.0.1:${port}/v1/entries?userId=${user.id}`);
    assert.equal((await visibleEntries.json() as { items: unknown[] }).items.length, 0);
    const searchAfterArchive = await fetch(`http://127.0.0.1:${port}/v1/search?userId=${user.id}&q=updated`);
    assert.deepEqual((await searchAfterArchive.json() as { items: unknown[] }).items, []);
    const exported = await fetch(`http://127.0.0.1:${port}/v1/exports/entries?userId=${user.id}`);
    const exportPayload = await exported.json() as { formatVersion: string; entries: Array<{ id: string; archivedAt: string | null }> };
    assert.equal(exportPayload.formatVersion, "entries-export-v1");
    assert.deepEqual(exportPayload.entries.map((entry) => entry.id), [created.entry.id]);
    assert.equal(typeof exportPayload.entries[0].archivedAt, "string");
  } finally {
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 150));
    try { rmSync(directory, { recursive: true, force: true }); } catch { /* Windows can retain a closed SQLite handle momentarily. */ }
  }
});

test("Entry validation and Obsidian frontmatter keep text records separate from observations", () => {
  assert.throws(() => validateEntryWriteInput({ userId: "u", externalSource: "obsidian", title: "note", body: "body" }));
  const note = "---\nmetheory_entry_id: entry_123\ntags: [daily]\n---\n# Today\nbody";
  assert.equal(entryIdFromFrontmatter(note), "entry_123");
  assert.equal(entryBodyFromNote(note), "# Today\nbody");
  assert.equal(entryTitleFromPath("daily/2026-07-25.md"), "2026-07-25");
});
