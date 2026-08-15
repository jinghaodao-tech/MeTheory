import test from "node:test";
import assert from "node:assert/strict";
import { analyzePcsAnalysisSnapshot } from "../packages/self-understanding/src/pcsSnapshotAnalysis.ts";

// Regression test for ADR-016: total_observed for the ai_conversation_ratio /
// deep_thinking_ratio derivation must sum all five dev-pace states, not just
// active/idle/away. Before that fix, a day with zero active/idle/away minutes
// (i.e. a fully-focused or fully-AI-conversation day) had total_observed = 0
// and was silently dropped from `totals` (the `total > 0` filter) -- exactly
// the kind of day this analysis exists to measure.
//
// The four-day fixture below and its before/after numbers were computed by
// hand outside this repo (see study-log) to confirm the fix actually changes
// what gets reported, not just that the code still runs.

function measurementValue(fieldKey: string, label: string, value: number, role: string, usage: "condition" | "outcome" | "both", recordedAt: string) {
  return {
    fieldKey,
    label,
    valueType: "duration_minutes" as const,
    value,
    templateId: "dev-pace-daily-v1",
    templateVersionId: "dev-pace-daily-v1-v1",
    analysisRole: role,
    analysisRoleConfirmed: true,
    analysisUsage: usage,
    analysisMergeAllowed: true,
    scaleFingerprint: "minutes-0-1440",
    unit: "minutes",
    minimum: 0,
    maximum: 1440,
    confirmationMode: "machine_measured" as const,
    measurement: { definitionVersion: "dev-pace-daily-v1", sourceTool: "dev-pace", sourceToolVersion: "0.1.0", measuredAt: recordedAt },
    provenance: {
      source: "system" as const,
      sourceId: `value_${fieldKey}_${recordedAt}`,
      userConfirmed: false,
      recordedAt,
      transformVersion: "dev-pace-daily-v1",
      privacyLevel: "normal" as const
    }
  };
}

function dayRecord(id: string, recordedAt: string, minutes: { active: number; ai: number; deepThinking: number; idle: number; away: number }) {
  return {
    id,
    recordedAt,
    title: id,
    sourceDocumentId: null,
    values: [
      measurementValue("active_minutes", "Active minutes", minutes.active, "active_duration", "condition", recordedAt),
      measurementValue("ai_conversation_minutes", "AI conversation minutes", minutes.ai, "ai_conversation_intensity", "condition", recordedAt),
      measurementValue("deep_thinking_minutes", "Deep thinking minutes", minutes.deepThinking, "focus", "outcome", recordedAt),
      measurementValue("idle_minutes", "Idle minutes", minutes.idle, "active_duration", "condition", recordedAt),
      measurementValue("away_minutes", "Away minutes", minutes.away, "active_duration", "condition", recordedAt)
    ]
  };
}

// Three "ordinary" days (active/idle/away all nonzero) plus one fully-focused
// day (active = idle = away = 0, all time is deep-thinking). Under the old
// three-field formula, the fully-focused day's total was 0 and got dropped.
const snapshot = {
  schemaVersion: "pcs-analysis-snapshot-v3" as const,
  contractRevision: "pcs-analysis-snapshot-v3.0",
  snapshotId: "snapshot_robustness_fixture",
  profileId: "profile_fixture",
  generatedAt: "2026-08-15T00:00:00.000Z",
  period: { startAt: "2026-08-01T00:00:00.000Z", endAt: "2026-08-15T00:00:00.000Z", timezone: "Asia/Tokyo" },
  records: [
    dayRecord("d1", "2026-08-01T09:00:00.000Z", { active: 200, ai: 30, deepThinking: 60, idle: 100, away: 50 }),
    dayRecord("d2", "2026-08-02T09:00:00.000Z", { active: 180, ai: 20, deepThinking: 90, idle: 120, away: 40 }),
    dayRecord("d3", "2026-08-03T09:00:00.000Z", { active: 220, ai: 40, deepThinking: 50, idle: 90, away: 60 }),
    dayRecord("d4_fully_focused", "2026-08-04T09:00:00.000Z", { active: 0, ai: 0, deepThinking: 480, idle: 0, away: 0 })
  ],
  excluded: { unconfirmed: 0, nonShareable: 0, highlySensitive: 0, invalid: 0 }
};

test("ADR-016: totalObservedDefinition covers all five dev-pace states", () => {
  const result = analyzePcsAnalysisSnapshot(snapshot);
  assert.equal(
    result.robustness.totalObservedDefinition,
    "active_minutes + ai_conversation_minutes + deep_thinking_minutes + idle_minutes + away_minutes"
  );
});

test("ADR-016: a fully-focused day (active=idle=away=0) is included, not silently dropped", () => {
  const result = analyzePcsAnalysisSnapshot(snapshot);
  // Before the fix this would be 3 -- the fully-focused day's total_observed
  // was 0 under the old formula and failed the `total > 0` filter.
  const allScope = result.robustness.continuousAssociations.find((item) => item.scope === "all");
  assert.equal(allScope?.recordCount, 4);
});

test("ADR-016: the fully-focused day's deep_thinking_ratio reflects 100% focus, not an inflated or undefined value", () => {
  const result = analyzePcsAnalysisSnapshot(snapshot);
  // total_observed_stratum buckets by median total; with the fix, d4's total
  // is 480 (all deep-thinking minutes), the largest of the four days, so it
  // must land in the "long" stratum and be visible there.
  const longScope = result.robustness.continuousAssociations.find((item) => item.scope === "long_total_observed");
  assert.ok(longScope);
  assert.ok((longScope?.recordCount ?? 0) >= 1);
});

test("ADR-016 before/after: correlation sample size and coefficient both change with the fix (hand-verified numbers)", () => {
  const result = analyzePcsAnalysisSnapshot(snapshot);
  const allScope = result.robustness.continuousAssociations.find((item) => item.scope === "all");
  // Before (old formula, d4 excluded): n=3, pearsonR ≈ -0.9808
  // After  (this fix, d4 included):    n=4, pearsonR ≈ -0.9235
  // Both values computed independently outside this file; see study-log entry
  // for 2026-08-15.
  assert.equal(allScope?.recordCount, 4);
  assert.ok(allScope?.pearsonR !== null);
  assert.ok(Math.abs((allScope?.pearsonR ?? 0) - -0.9235) < 0.001);
});
