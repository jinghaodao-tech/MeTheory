import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createPcsAnalysisStore } from "../apps/api/src/pcsAnalysisStore.ts";

test("analysis store defaults to SQLite when PostgreSQL is not selected", () => {
  const previous = process.env.METHEORY_ANALYSIS_STORE;
  delete process.env.METHEORY_ANALYSIS_STORE;
  const store = createPcsAnalysisStore(new DatabaseSync(":memory:"));
  assert.equal(store.driver, "sqlite");
  if (previous === undefined) delete process.env.METHEORY_ANALYSIS_STORE; else process.env.METHEORY_ANALYSIS_STORE = previous;
});
