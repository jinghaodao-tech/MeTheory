import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { validateEntryWriteInput } from "../packages/records/src/index.ts";
import { entryBodyFromNote, entryIdFromFrontmatter, entryRecordedAtFromFrontmatter, entryRecordedAtFromPath, entryTitleFromPath } from "../apps/obsidian-plugin/src/frontmatter.ts";
import { entryRegistrationPayload } from "../apps/obsidian-plugin/src/entryRegistration.ts";
import { SqliteEntryRepository } from "../apps/api/src/entryRepository.ts";
import { SqliteSearchDocumentRepository } from "../apps/api/src/searchDocumentRepository.ts";

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
    const created = await createdResponse.json() as { created: boolean; entry: { id: string; body: string; recordedAt: string; sourceUpdatedAt: string | null } };
    assert.equal(created.created, true);
    assert.equal(created.entry.recordedAt, original.recordedAt);
    assert.equal(created.entry.sourceUpdatedAt, null);

    const updatedResponse = await fetch(`http://127.0.0.1:${port}/v1/entries`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...original, body: "updated note", recordedAt: "2026-07-25T10:00:00.000Z", sourceUpdatedAt: "2026-07-25T10:15:00.000Z" }) });
    assert.equal(updatedResponse.status, 200);
    const updated = await updatedResponse.json() as { created: boolean; entry: { id: string; body: string; recordedAt: string; sourceUpdatedAt: string | null } };
    assert.equal(updated.created, false);
    assert.equal(updated.entry.id, created.entry.id);
    assert.equal(updated.entry.body, "updated note");
    assert.equal(updated.entry.recordedAt, original.recordedAt);
    assert.equal(updated.entry.sourceUpdatedAt, "2026-07-25T10:15:00.000Z");

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
    assert.equal(searchPayload.items[0].recordedAt, original.recordedAt);

    const secondUserResponse = await fetch(`http://127.0.0.1:${port}/v1/users`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ authSubject: `entry-isolation-${port}` }) });
    const secondUser = await secondUserResponse.json() as { id: string };
    const secondEntryResponse = await fetch(`http://127.0.0.1:${port}/v1/entries`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: secondUser.id, externalSource: "obsidian", externalSourceId: "daily/second.md", title: "second", body: "isolated entry" }) });
    assert.equal(secondEntryResponse.status, 201);
    assert.equal(Number.isFinite(Date.parse((await secondEntryResponse.json() as { entry: { recordedAt: string } }).entry.recordedAt)), true);

    const direct = new DatabaseSync(database);
    direct.prepare("INSERT INTO search_documents(id,user_id,source_kind,source_id,title,search_text,tags_json,tokens_json,doc_length,recorded_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run("search_orphan", user.id, "entry", "entry_orphan", "orphan", "obsolete entry", "[]", '["obsolete"]', 1, original.recordedAt, original.recordedAt);
    direct.prepare("INSERT INTO search_documents(id,user_id,source_kind,source_id,title,search_text,tags_json,tokens_json,doc_length,recorded_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run("search_hypothesis", user.id, "hypothesis", "hypothesis_1", "hypothesis", "keep me", "[]", '["keep"]', 1, original.recordedAt, original.recordedAt);
    direct.close();
    const rebuilt = await fetch(`http://127.0.0.1:${port}/v1/search-documents/rebuild`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: user.id }) });
    assert.deepEqual(await rebuilt.json() as { sourceKind: string; deleted: number; removed: number; indexed: number }, { sourceKind: "entry", deleted: 2, removed: 2, indexed: 1 });
    const sourceKindCheck = new DatabaseSync(database);
    assert.equal(Number((sourceKindCheck.prepare("SELECT COUNT(*) AS count FROM search_documents WHERE user_id=? AND source_kind='hypothesis'").get(user.id) as { count: number }).count), 1);
    sourceKindCheck.close();
    const rebuiltAgain = await fetch(`http://127.0.0.1:${port}/v1/search-documents/rebuild`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: user.id }) });
    assert.deepEqual(await rebuiltAgain.json() as { sourceKind: string; deleted: number; removed: number; indexed: number }, { sourceKind: "entry", deleted: 1, removed: 1, indexed: 1 });
    const isolatedSearch = await fetch(`http://127.0.0.1:${port}/v1/search?userId=${secondUser.id}&q=isolated`);
    assert.equal((await isolatedSearch.json() as { items: Array<{ sourceKind: string }> }).items.length, 1);

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
    const archivedOrphan = new DatabaseSync(database);
    archivedOrphan.prepare("INSERT INTO search_documents(id,user_id,source_kind,source_id,title,search_text,tags_json,tokens_json,doc_length,recorded_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run("search_archived_orphan", user.id, "entry", created.entry.id, "archived", "archived entry", "[]", '["archived"]', 1, original.recordedAt, original.recordedAt);
    archivedOrphan.close();
    const rebuildAfterArchive = await fetch(`http://127.0.0.1:${port}/v1/search-documents/rebuild`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: user.id }) });
    assert.deepEqual(await rebuildAfterArchive.json() as { sourceKind: string; deleted: number; removed: number; indexed: number }, { sourceKind: "entry", deleted: 1, removed: 1, indexed: 0 });
    const exported = await fetch(`http://127.0.0.1:${port}/v1/exports/entries?userId=${user.id}`);
    const exportPayload = await exported.json() as { formatVersion: string; entries: Array<{ id: string; archivedAt: string | null; sourceUpdatedAt: string | null }> };
    assert.equal(exportPayload.formatVersion, "entries-export-v1");
    assert.deepEqual(exportPayload.entries.map((entry) => entry.id), [created.entry.id]);
    assert.equal(typeof exportPayload.entries[0].archivedAt, "string");
    assert.equal(exportPayload.entries[0].sourceUpdatedAt, "2026-07-25T10:15:00.000Z");
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

test("Node startup migrates legacy source_modified_at without changing recordedAt", async () => {
  const port = 18650 + Math.floor(Math.random() * 200);
  const directory = mkdtempSync(join(tmpdir(), "metheory-entry-legacy-"));
  const database = join(directory, "legacy.sqlite3");
  const legacyDatabase = new DatabaseSync(database);
  try {
    const legacySchema = readFileSync(join(process.cwd(), "db", "ts_mvp_schema.sql"), "utf8").replaceAll("source_updated_at", "source_modified_at");
    legacyDatabase.exec(legacySchema);
    legacyDatabase.prepare("INSERT INTO users(id, auth_subject, locale, timezone, created_at) VALUES (?, ?, ?, ?, ?)").run("legacy-user", "legacy-auth", "ja-JP", "Asia/Tokyo", "2026-07-25T00:00:00.000Z");
    legacyDatabase.prepare("INSERT INTO entries(id,user_id,template_id,episode_id,external_source,external_source_id,source_modified_at,title,body,recorded_at,created_at,updated_at,archived_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run("legacy-entry", "legacy-user", null, null, "obsidian", "legacy.md", "2026-07-25T12:00:00.000Z", "legacy", "legacy body", "2020-01-02T03:04:05.000Z", "2020-01-02T03:04:05.000Z", "2026-07-25T12:00:00.000Z", null);
  } finally {
    legacyDatabase.close();
  }
  const child = spawn(process.execPath, ["--experimental-strip-types", "apps/api/src/server.ts"], { env: { ...process.env, PORT: String(port), METHEORY_DB: database }, stdio: "ignore" });
  try {
    await waitForApi(port);
    const response = await fetch(`http://127.0.0.1:${port}/v1/entries?userId=legacy-user`);
    assert.equal(response.status, 200);
    const payload = await response.json() as { items: Array<{ recordedAt: string; sourceUpdatedAt: string | null }> };
    assert.deepEqual(payload.items.map((item) => ({ recordedAt: item.recordedAt, sourceUpdatedAt: item.sourceUpdatedAt })), [{ recordedAt: "2020-01-02T03:04:05.000Z", sourceUpdatedAt: "2026-07-25T12:00:00.000Z" }]);
  } finally {
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 150));
    try { rmSync(directory, { recursive: true, force: true }); } catch { /* Windows can retain a closed SQLite handle momentarily. */ }
  }
});

test("Obsidian recordedAt rules prefer canonical frontmatter, then daily filename", () => {
  const explicit = "---\nmetheory_entry_id: entry_existing\nrecorded_at: 2026-07-22T09:30:00+09:00\n---\nbody";
  assert.equal(entryIdFromFrontmatter(explicit), "entry_existing");
  assert.equal(entryRecordedAtFromFrontmatter(explicit), "2026-07-22T00:30:00.000Z");
  assert.equal(entryRecordedAtFromFrontmatter("---\ndate: 2026-07-23\n---\nbody"), "2026-07-23T00:00:00.000Z");
  assert.equal(entryRecordedAtFromPath("daily/2026-07-24.md"), "2026-07-24T00:00:00.000Z");
  assert.equal(entryRecordedAtFromPath("daily/2026-07-24"), "2026-07-24T00:00:00.000Z");
  assert.equal(entryRecordedAtFromPath("notes/ordinary.md"), null);
  assert.throws(() => entryRecordedAtFromFrontmatter("---\nrecorded_at: not-a-date\n---\nbody"), /invalid_frontmatter_recorded_at/);
  assert.throws(() => entryRecordedAtFromFrontmatter("---\nrecorded_at: 2026-02-30T09:00:00Z\n---\nbody"), /invalid_frontmatter_recorded_at/);
  assert.throws(() => entryRecordedAtFromPath("daily/2026-02-30.md"), /invalid_filename_recorded_at/);
  assert.equal(validateEntryWriteInput({ userId: "u", externalSource: "obsidian", externalSourceId: "notes/new.md", title: "new", body: "body" }).recordedAt, undefined);
});

test("Obsidian registration payload shares ID, body, daily and ordinary note rules", () => {
  const common = { userId: "user_1", sourceUpdatedAt: "2026-07-25T12:00:00.000Z", creationTimestamp: "2026-07-25T13:00:00.000Z" };
  const existing = entryRegistrationPayload({ ...common, path: "daily/2026-07-22.md", note: "---\nmetheory_entry_id: entry_existing\nrecorded_at: 2026-07-01\n---\nexisting body" });
  assert.deepEqual(existing, { id: "entry_existing", userId: "user_1", externalSource: "obsidian", externalSourceId: "daily/2026-07-22.md", title: "2026-07-22", body: "existing body", recordedAt: undefined, sourceUpdatedAt: common.sourceUpdatedAt });
  const daily = entryRegistrationPayload({ ...common, path: "daily/2026-07-23.md", note: "# Daily\ndaily body" });
  assert.equal(daily.recordedAt, "2026-07-23T00:00:00.000Z");
  assert.equal(daily.body, "# Daily\ndaily body");
  const ordinary = entryRegistrationPayload({ ...common, path: "notes/ordinary.md", note: "ordinary body" });
  assert.equal(ordinary.recordedAt, common.creationTimestamp);
  assert.equal(ordinary.id, undefined);
});

test("Obsidian plugin is bundled from shared TypeScript helpers", () => {
  const source = readFileSync(join(process.cwd(), "apps", "obsidian-plugin", "src", "main.ts"), "utf8");
  assert.match(source, /entryRegistrationPayload/);
  assert.match(source, /entryIdFromFrontmatter/);
  assert.match(source, /sourceUpdatedAt/);
  const registrationSource = readFileSync(join(process.cwd(), "apps", "obsidian-plugin", "src", "entryRegistration.ts"), "utf8");
  assert.match(registrationSource, /entryBodyFromNote/);
  assert.match(registrationSource, /entryIdFromFrontmatter/);
  assert.match(registrationSource, /entryRecordedAtFromFrontmatter/);
  const bundle = readFileSync(join(process.cwd(), "apps", "obsidian-plugin", "main.js"), "utf8");
  assert.match(bundle, /metheory_entry_id/);
});

test("search rebuild rolls back deleted documents when regeneration fails", async () => {
  const directory = mkdtempSync(join(tmpdir(), "metheory-search-rollback-"));
  const database = new DatabaseSync(join(directory, "rollback.sqlite3"));
  try {
    database.exec(readFileSync(join(process.cwd(), "db", "ts_mvp_schema.sql"), "utf8"));
    const userId = "rollback-user";
    database.prepare("INSERT INTO users(id, auth_subject, locale, timezone, created_at) VALUES (?, ?, ?, ?, ?)").run(userId, "rollback-auth", "ja-JP", "Asia/Tokyo", new Date().toISOString());
    const entries = new SqliteEntryRepository(database);
    const { entry } = entries.save({ userId, externalSource: "obsidian", externalSourceId: "rollback.md", title: "rollback", body: "keep this", recordedAt: "2026-07-25T00:00:00.000Z" });
    const workingRepository = new SqliteSearchDocumentRepository(database);
    await workingRepository.indexEntry(entry);
    database.prepare("INSERT INTO search_documents(id,user_id,source_kind,source_id,title,search_text,tags_json,tokens_json,doc_length,recorded_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run("rollback-orphan", userId, "entry", "missing-entry", "orphan", "keep orphan", "[]", '["orphan"]', 1, entry.recordedAt, entry.recordedAt);
    database.prepare("INSERT INTO search_documents(id,user_id,source_kind,source_id,title,search_text,tags_json,tokens_json,doc_length,recorded_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run("rollback-hypothesis", userId, "hypothesis", "hypothesis-rollback", "hypothesis", "keep hypothesis", "[]", '["hypothesis"]', 1, entry.recordedAt, entry.recordedAt);
    const failingRepository = new SqliteSearchDocumentRepository(database, { tokenize: async () => { throw new Error("rebuild_tokenizer_failed"); } });
    await assert.rejects(() => failingRepository.rebuildEntries(userId), /rebuild_tokenizer_failed/);
    assert.equal(Number((database.prepare("SELECT COUNT(*) AS count FROM search_documents WHERE user_id=? AND source_kind='entry'").get(userId) as { count: number }).count), 2);
    assert.equal(Number((database.prepare("SELECT COUNT(*) AS count FROM search_documents WHERE user_id=? AND source_kind='hypothesis'").get(userId) as { count: number }).count), 1);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
