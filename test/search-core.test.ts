import test from "node:test";
import assert from "node:assert/strict";
import { LightweightTokenizer, rankSearchDocuments, type SearchDocument } from "../packages/search-core/src/index.ts";

test("lightweight tokenizer preserves English words and Japanese bigrams", async () => {
  const tokens = await new LightweightTokenizer().tokenize("Deep workでは集中が続く");
  assert.equal(tokens.includes("deep"), true);
  assert.equal(tokens.includes("work"), true);
  assert.equal(tokens.includes("集中"), true);
});

test("BM25 ranking returns a stable source reference and matched terms", async () => {
  const tokenizer = new LightweightTokenizer();
  const firstTokens = await tokenizer.tokenize("集中して深い作業ができた");
  const secondTokens = await tokenizer.tokenize("休憩中に散歩した");
  const documents: SearchDocument[] = [
    { id: "search_one", userId: "u", sourceKind: "entry", sourceId: "entry_one", title: "集中", searchText: "集中して深い作業ができた", tags: [], tokens: firstTokens, docLength: firstTokens.length, recordedAt: "2026-07-25T10:00:00.000Z", updatedAt: "2026-07-25T10:00:00.000Z" },
    { id: "search_two", userId: "u", sourceKind: "entry", sourceId: "entry_two", title: "散歩", searchText: "休憩中に散歩した", tags: [], tokens: secondTokens, docLength: secondTokens.length, recordedAt: "2026-07-25T09:00:00.000Z", updatedAt: "2026-07-25T09:00:00.000Z" },
  ];
  const results = rankSearchDocuments(await tokenizer.tokenize("集中 作業"), documents);
  assert.equal(results[0].sourceId, "entry_one");
  assert.deepEqual(results[0].reference, { kind: "entry", id: "entry_one" });
  assert.equal(results[0].matchedTerms.includes("集中"), true);
});
