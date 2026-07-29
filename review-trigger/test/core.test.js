import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildReviewPrompt,
  createEmptyState,
  isTriggerReady,
  markConfirmed,
  markSubmitted,
  observePullRequest,
  loadState,
  saveState,
  selectReviewScope,
  validateCustomGptUrl,
} from "../src/core.js";

test("writes and loads trigger state atomically", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "metheory-review-trigger-"));
  const statePath = path.join(directory, "state.json");
  try {
    const state = createEmptyState();
    state.pullRequests["jinghaodao-tech/MeTheory#1"] = { observedSha: "abc" };
    await saveState(statePath, state);
    assert.deepEqual(await loadState(statePath), state);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("accepts only ChatGPT custom GPT URLs", () => {
  assert.equal(validateCustomGptUrl("https://chatgpt.com/g/g-example/reviewer"), "https://chatgpt.com/g/g-example/reviewer");
  assert.throws(() => validateCustomGptUrl("http://chatgpt.com/g/g-example"));
  assert.throws(() => validateCustomGptUrl("https://example.com/g/g-example"));
  assert.throws(() => validateCustomGptUrl("https://chatgpt.com/"));
});

test("builds a PR review prompt with an explicit scope", () => {
  const prompt = buildReviewPrompt({ repository: "jinghaodao-tech/MeTheory", prNumber: 1, headSha: "db9bbcb0fd202f8960fda11567c6f57bab6fcfa2", reviewCycle: 2 });
  assert.match(prompt, /PR: #1/);
  assert.match(prompt, /reviewScope=pr/);
  assert.match(prompt, /Review cycle: 2/);
});

test("builds a repository review prompt with the selected ref", () => {
  const prompt = buildReviewPrompt({ repository: "jinghaodao-tech/MeTheory", prNumber: 1, headSha: "db9bbcb0fd202f8960fda11567c6f57bab6fcfa2", reviewCycle: 1, reviewScope: "repository", ref: "agent/ai-review-loop" });
  assert.match(prompt, /reviewScope=repository/);
  assert.match(prompt, /getRepositoryReviewContext/);
  assert.match(prompt, /agent\/ai-review-loop/);
});

test("returns to PR scope after a completed full review reaches a new SHA", () => {
  assert.equal(selectReviewScope("repository", undefined, "new-sha"), "repository");
  assert.equal(selectReviewScope("repository", "old-sha", "new-sha"), "pr");
  assert.equal(selectReviewScope("repository", "same-sha", "same-sha"), "repository");
});

test("debounces, confirms, and retries by SHA", () => {
  const state = createEmptyState();
  const metadata = { repository: "jinghaodao-tech/MeTheory", prNumber: 1, headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", url: "https://github.com/jinghaodao-tech/MeTheory/pull/1" };
  const entry = observePullRequest(state, metadata, "2026-07-28T09:00:00.000Z");
  assert.equal(isTriggerReady(entry, Date.parse("2026-07-28T09:00:30.000Z"), 90_000, 1_800_000), false);
  assert.equal(isTriggerReady(entry, Date.parse("2026-07-28T09:02:00.000Z"), 90_000, 1_800_000), true);
  markSubmitted(entry, metadata.headSha, "2026-07-28T09:02:00.000Z");
  assert.equal(isTriggerReady(entry, Date.parse("2026-07-28T09:10:00.000Z"), 90_000, 1_800_000), false);
  assert.equal(isTriggerReady(entry, Date.parse("2026-07-28T09:40:01.000Z"), 90_000, 1_800_000), true);
  markConfirmed(entry, metadata.headSha, "2026-07-28T09:41:00.000Z");
  assert.equal(isTriggerReady(entry, Date.parse("2026-07-28T10:00:00.000Z"), 90_000, 1_800_000), false);
});
