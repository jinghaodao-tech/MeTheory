import assert from "node:assert/strict";
import { test } from "node:test";
import { AiProviderError, ManualExternalAiProvider, MockAiProvider, DisabledAiProvider, OpenAICompatibleLocalProvider } from "../packages/ai-core/src/index.ts";

test("mock provider returns a validated template draft", async () => {
  const provider = new MockAiProvider();
  const draft = await provider.generateTemplateDraft({ userId: "test", theme: "daily review" });
  assert.equal(draft.theme, "daily review");
  assert.ok(draft.fields.length > 0);
});

test("manual provider creates a schema prompt without executing an external client", async () => {
  const provider = new ManualExternalAiProvider();
  const prompt = provider.promptForTemplate({ userId: "test", theme: "sleep" });
  assert.match(prompt, /schema/);
  await assert.rejects(() => provider.generateTemplateDraft({ userId: "test", theme: "sleep" }), (error: unknown) => error instanceof AiProviderError && error.code === "manual_input_required");
});

test("disabled provider never performs generation", async () => {
  const provider = new DisabledAiProvider();
  await assert.rejects(() => provider.extractEntryValues({ content: "private", template: { fields: [] }, sourceContentHash: "hash" }), (error: unknown) => error instanceof AiProviderError && error.code === "disabled");
});

test("local OpenAI-compatible provider rejects non-loopback endpoints", () => {
  assert.throws(() => new OpenAICompatibleLocalProvider({ baseUrl: "https://example.invalid/v1", model: "test" }), (error: unknown) => error instanceof AiProviderError && error.code === "remote_local_ai_endpoint");
});
