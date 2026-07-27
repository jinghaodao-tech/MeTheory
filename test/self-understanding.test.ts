import assert from "node:assert/strict";
import { test } from "node:test";
import { generateSelfUnderstanding, validateInterpretation } from "../packages/self-understanding/src/index.ts";

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
  assert.match(result[0].statement, /energy/);
  assert.ok(result[0].supportingEntryIds.length > 0);
  assert.equal(result[0].userReview, "pending");
  assert.ok(result[0].nextAction.length > 0);
  assert.ok(result[0].selfModelCandidate.length > 0);
  assert.equal(result[0].status, "unstable");
});

test("self-understanding practical thresholds reject fewer than eight confirmed paired records", () => {
  const observations = Array.from({ length: 7 }, (_, index) => [{ episodeId: `entry_${index}`, parameterId: "condition", value: index < 4, isMissing: false, observedAt: "2026-07-20T12:00:00.000Z" }, { episodeId: `entry_${index}`, parameterId: "outcome", value: index < 4 ? 90 : 10, isMissing: false, observedAt: "2026-07-20T12:00:00.000Z" }]).flat();
  const records = Array.from({ length: 7 }, (_, index) => ({ id: `entry_${index}`, recordedAt: "2026-07-20T12:00:00.000Z", title: "Entry", conditionValues: { condition: index < 4, outcome: index < 4 ? 90 : 10 }, outcomeValues: { condition: index < 4, outcome: index < 4 ? 90 : 10 } }));
  const result = generateSelfUnderstanding({ now: "2026-07-27T12:00:00.000Z", parameters: [{ id: "condition", nameJa: "condition", valueType: "boolean", usableAsCondition: true, usableAsOutcome: false }, { id: "outcome", nameJa: "outcome", valueType: "number", minimumValue: 0, maximumValue: 100, usableAsCondition: false, usableAsOutcome: true }], observations, records });
  assert.equal(result.length, 0);
});

test("interpretation validation rejects diagnostic language and preserves deterministic fallback boundaries", () => {
  const input = { candidateId: "candidate", period: { startAt: "2026-07-01T00:00:00.000Z", endAt: "2026-07-28T00:00:00.000Z" }, condition: { fieldKey: "sleep", label: "睡眠", groupA: "長い", groupB: "短い" }, outcome: { fieldKey: "focus", label: "集中", }, statistics: { groupACount: 4, groupBCount: 4, groupAValue: 80, groupBValue: 40, difference: 40, missingCount: 0, temporalStability: "stable" as const }, status: "emerging" as const, supportingEntries: [], contradictingEntries: [] };
  const output = { statementJa: "診断名を示す説明", plainExplanationJa: "", supportingExplanationJa: "", contradictingExplanationJa: "", uncertaintyJa: "", selfModelCandidateJa: "", nextExperiment: { title: "記録", durationDays: 7, action: "記録する", fieldsToRecord: ["sleep", "focus"], successCondition: "3件" } };
  assert.equal(validateInterpretation(input, output), false);
});
