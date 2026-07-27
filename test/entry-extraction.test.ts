import assert from "node:assert/strict";
import { test } from "node:test";
import { MockAiProvider } from "../packages/ai-core/src/index.ts";
import { applyExtraction, contentHash, extractEntryValues, extractionIsStale } from "../packages/entry-extraction/src/index.ts";

test("extraction records the source content hash and blocks stale application", async () => {
  const record = await extractEntryValues({ entryId: "entry_1", template: { id: "template_1", currentVersion: { id: "v1", fields: [] } }, content: "energy was high", sourceUpdatedAt: "2026-07-26T00:00:00.000Z", provider: new MockAiProvider() });
  assert.equal(record.sourceContentHash, contentHash("energy was high"));
  assert.equal(extractionIsStale(record, "changed"), true);
  assert.throws(() => applyExtraction(record, "changed"), /extraction_stale/);
  assert.equal(applyExtraction(record, "energy was high").status, "applied");
});
