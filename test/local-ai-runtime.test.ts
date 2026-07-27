import assert from "node:assert/strict";
import { test } from "node:test";
import { detectOpenAiCompatible, RuntimeManager } from "../packages/local-ai-runtime/src/index.ts";

test("unavailable local endpoint is reported without throwing", async () => {
  const result = await detectOpenAiCompatible("http://127.0.0.1:1/v1");
  assert.equal(result.running, false);
  assert.equal(result.kind, "openai-compatible");
});

test("runtime manager rejects an unconfigured executable", async () => {
  const manager = new RuntimeManager();
  await assert.rejects(() => manager.start(), /runtime_executable_unavailable/);
  assert.equal(manager.state, "failed");
});
