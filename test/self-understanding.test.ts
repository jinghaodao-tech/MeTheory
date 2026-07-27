import assert from "node:assert/strict";
import { test } from "node:test";
import { generateSelfUnderstanding } from "../packages/self-understanding/src/index.ts";

test("self-understanding hypotheses include evidence references and review fields", () => {
  const now = "2026-07-27T12:00:00.000Z";
  const observations = [] as Array<{ episodeId: string; parameterId: string; value: unknown; isMissing: boolean; observedAt: string }>;
  const records = [] as Array<{ id: string; recordedAt: string; title: string; conditionValues: Record<string, unknown>; outcomeValues: Record<string, unknown> }>;
  for (let index = 0; index < 8; index += 1) {
    const observedAt = new Date(Date.parse(now) - (index + 1) * 86400000).toISOString();
    const condition = index % 2 === 0;
    const outcome = condition ? 80 : 30;
    observations.push({ episodeId: `entry_${index}`, parameterId: "social_context", value: condition, isMissing: false, observedAt });
    observations.push({ episodeId: `entry_${index}`, parameterId: "energy", value: outcome, isMissing: false, observedAt });
    records.push({ id: `entry_${index}`, recordedAt: observedAt, title: `Entry ${index}`, conditionValues: { social_context: condition, energy: outcome }, outcomeValues: { social_context: condition, energy: outcome } });
  }
  const result = generateSelfUnderstanding({ now, parameters: [{ id: "social_context", nameJa: "social context", valueType: "boolean", usableAsCondition: true, usableAsOutcome: false }, { id: "energy", nameJa: "energy", valueType: "number", minimumValue: 0, maximumValue: 100, usableAsCondition: false, usableAsOutcome: true }], observations, records });
  assert.equal(result.length, 1);
  assert.match(result[0].statement, /social context/);
  assert.ok(result[0].supportingEntryIds.length > 0);
  assert.equal(result[0].userReview, "pending");
  assert.ok(result[0].nextAction.length > 0);
  assert.ok(result[0].selfModelCandidate.length > 0);
});
