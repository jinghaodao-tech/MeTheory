import test from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, readMarkdownEntry, planSync, withEntryMetadata } from "../packages/workspace-sync/src/index.ts";
test("workspace sync preserves Markdown body and adds only metadata",()=>{const note="# Memo\n\ntext";const updated=withEntryMetadata(note,{metheory_entry_id:"entry_1"});assert.match(updated,/metheory_entry_id: entry_1/);assert.match(updated,/# Memo\n\ntext/);const entry=readMarkdownEntry("notes/2026-07-26.md",updated);assert.equal(entry.entryId,"entry_1");});
test("sync plan preserves recordedAt for existing entries",()=>{const entry=readMarkdownEntry("notes/x.md","---\nmetheory_entry_id: entry_1\n---\nbody");const plan=planSync(entry,{id:"entry_1",recordedAt:"2020-01-01T00:00:00.000Z",sourceUpdatedAt:"old"});assert.equal(plan.action,"update");assert.equal(plan.entry.recordedAt,"2020-01-01T00:00:00.000Z");assert.deepEqual(parseFrontmatter("body").values,{});});
