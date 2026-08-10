import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deterministicInterpretation,
  deduplicateSelfUnderstandingHypotheses,
  generateSelfUnderstanding,
  interpretSelfUnderstanding,
  mapConstruct,
  tendencyScopeFor,
  validateSelfModelStatement,
  validateInterpretation,
  type SelfUnderstandingInterpretationInput
} from "../packages/self-understanding/src/index.ts";
import { analyzePersonalContextSnapshot } from "../packages/self-understanding/src/personalContext.ts";

const parameters = [
  {
    id: "condition",
    nameJa: "条件",
    valueType: "boolean",
    usableAsCondition: true,
    usableAsOutcome: false
  },
  {
    id: "outcome",
    nameJa: "結果",
    valueType: "number",
    minimumValue: 0,
    maximumValue: 100,
    usableAsCondition: false,
    usableAsOutcome: true
  }
];
function pairedInput(
  count: number,
  outcomeFor: (condition: boolean, index: number) => unknown,
  observedAtFor: (index: number) => string = () => "2026-07-20T12:00:00.000Z"
) {
  const observations = [];
  const records = [];
  for (let index = 0; index < count; index += 1) {
    const condition = index % 2 === 0;
    const outcome = outcomeFor(condition, index);
    const observedAt = observedAtFor(index);
    observations.push(
      {
        episodeId: `entry_${index}`,
        parameterId: "condition",
        value: condition,
        isMissing: false,
        observedAt
      },
      {
        episodeId: `entry_${index}`,
        parameterId: "outcome",
        value: outcome,
        isMissing: outcome === null,
        observedAt
      }
    );
    records.push({
      id: `entry_${index}`,
      recordedAt: observedAt,
      title: `Entry ${index}`,
      conditionValues: { condition, outcome },
      outcomeValues: { condition, outcome }
    });
  }
  return { observations, records };
}
const interpretationInput: SelfUnderstandingInterpretationInput = {
  candidateId: "candidate_condition_outcome_true_false",
  period: {
    startAt: "2026-07-01T00:00:00.000Z",
    endAt: "2026-07-28T00:00:00.000Z"
  },
  condition: { fieldKey: "condition", label: "条件", groupA: "あり", groupB: "なし" },
  outcome: { fieldKey: "outcome", label: "結果" },
  statistics: {
    groupACount: 4,
    groupBCount: 4,
    groupAValue: 80,
    groupBValue: 40,
    difference: 40,
    missingCount: 0,
    temporalStability: "stable"
  },
  status: "emerging",
  supportingEntries: [{ entryId: "entry_1", recordedAt: "2026-07-20", title: "記録" }],
  contradictingEntries: []
};

test("uncategorized interpretation states the compared fields", () => {
  const output = deterministicInterpretation({ ...interpretationInput, construct: { key: "uncategorized", labelJa: "未分類", descriptionJa: "比較候補" } });
  assert.equal(output.statementJa.includes(interpretationInput.condition.label), true);
  assert.equal(output.statementJa.includes(interpretationInput.outcome.label), true);
});

test("machine-measured comparisons disclose shared measurement definitions", () => {
  const records = Array.from({ length: 8 }, (_, index) => ({
    id: `machine-${index}`,
    recordedAt: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    title: "machine record",
    conditionValues: { condition: index < 4 ? 0 : 1 },
    outcomeValues: { outcome: index < 4 ? 10 : 1 },
    provenanceByParameterId: {
      condition: { source: "user_entry" as const, labelJa: "machine", provenanceSource: "system" as const, sourceTool: "dev-pace" },
      outcome: { source: "user_entry" as const, labelJa: "machine", provenanceSource: "system" as const, sourceTool: "dev-pace" }
    }
  }));
  const result = generateSelfUnderstanding({
    parameters: [
      { id: "condition", fieldKey: "condition", templateId: "t", templateVersionId: "v", semanticRole: "active_duration", semanticMergeAllowed: true, scaleFingerprint: "binary", sourceKind: "entry", nameJa: "作業時間", valueType: "number", minimumValue: 0, maximumValue: 1, usableAsCondition: true, usableAsOutcome: false, allowedConditionRoles: [], allowedOutcomeRoles: [], cohortStrategy: "fixed_threshold", cohortThreshold: 0.5 },
      { id: "outcome", fieldKey: "outcome", templateId: "t", templateVersionId: "v", semanticRole: "focus", semanticMergeAllowed: true, scaleFingerprint: "number", sourceKind: "entry", nameJa: "集中時間", valueType: "number", minimumValue: 0, maximumValue: 100, usableAsCondition: false, usableAsOutcome: true, allowedConditionRoles: [], allowedOutcomeRoles: [] }
    ],
    observations: records.flatMap((record) => Object.entries(record.conditionValues).concat(Object.entries(record.outcomeValues)).map(([parameterId, value]) => ({ episodeId: record.id, episodeKind: "pcs_record" as const, parameterId, value, isMissing: false, observedAt: record.recordedAt }))),
    records,
    now: "2026-08-08T00:00:00.000Z",
    config: { lookbackDays: 30, minimumTotalSamples: 8, minimumSamplesPerCohort: 3, maximumCandidates: 5, pairAllowlistVersion: "candidate-pair-v2" }
  });
  assert.ok(result.some((item) => item.alternativeExplanations.some((text) => text.includes("dev-pace"))));
});

test("eight paired records generate evidence while unknown temporal stability stays emerging", () => {
  const input = pairedInput(8, (condition) => (condition ? 80 : 30));
  const result = generateSelfUnderstanding({
    now: "2026-07-27T12:00:00.000Z",
    parameters,
    ...input
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].status, "emerging");
  assert.equal(result[0].candidate.temporalStabilityStatus, "unknown");
  assert.equal(result[0].candidate.temporalStability, 0.5);
  assert.ok(result[0].supportingEntryIds.length > 0);
  assert.equal(result[0].userReview, "pending");
  assert.ok(result[0].nextAction.length > 0);
});

test("temporal stability status changes only after each half has three records per cohort", () => {
  const statuses = new Map<number, string>();
  for (const count of [8, 12, 100]) {
    const input = pairedInput(
      count,
      (condition) => (condition ? 80 : 30),
      count > 8
        ? (index) => new Date(Date.parse("2026-07-27T12:00:00.000Z") - (29 - index * (29 / (count - 1))) * 86400000).toISOString()
        : undefined
    );
    const result = generateSelfUnderstanding({ now: "2026-07-27T12:00:00.000Z", parameters, ...input });
    statuses.set(count, result[0]?.candidate.temporalStabilityStatus ?? "no_candidate");
  }
  assert.deepEqual(Object.fromEntries(statuses), { 8: "unknown", 12: "stable", 100: "stable" });
});

test("fewer than eight paired records or fewer than three in a cohort are rejected", () => {
  const seven = pairedInput(7, (condition) => (condition ? 90 : 10));
  assert.equal(
    generateSelfUnderstanding({
      now: "2026-07-27T12:00:00.000Z",
      parameters,
      ...seven
    }).length,
    0
  );
  const unbalanced = pairedInput(8, (_condition, index) => (index < 6 ? 90 : 10));
  for (let index = 0; index < unbalanced.records.length; index += 1) {
    const condition = index < 6;
    unbalanced.records[index].conditionValues.condition = condition;
    unbalanced.observations[index * 2].value = condition;
  }
  assert.equal(
    generateSelfUnderstanding({
      now: "2026-07-27T12:00:00.000Z",
      parameters,
      ...unbalanced
    }).length,
    0
  );
});

test("a reversed difference between period halves is marked unstable", () => {
  const now = Date.parse("2026-07-27T12:00:00.000Z");
  const input = pairedInput(
    16,
    (condition, index) => (index < 8 ? (condition ? 90 : 10) : condition ? 55 : 75),
    (index) => new Date(now - (29 - index * 1.8) * 86400000).toISOString()
  );
  const result = generateSelfUnderstanding({
    now: "2026-07-27T12:00:00.000Z",
    parameters,
    ...input,
    config: { minimumNormalizedEffect: 0.05 }
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].candidate.temporalStabilityStatus, "unstable");
  assert.equal(result[0].status, "unstable");
});

test("missing values above the configured rate exclude a candidate", () => {
  const input = pairedInput(12, (condition, index) =>
    index < 6 ? null : condition ? 90 : 10
  );
  assert.equal(
    generateSelfUnderstanding({
      now: "2026-07-27T12:00:00.000Z",
      parameters,
      ...input
    }).length,
    0
  );
});

test("boolean outcomes classify both cohorts using declared positive values", () => {
  const input = pairedInput(8, (condition) => condition);
  const booleanParameters = [
    parameters[0],
    {
      ...parameters[1],
      valueType: "boolean",
      minimumValue: undefined,
      maximumValue: undefined,
      positiveValues: [true]
    }
  ];
  const result = generateSelfUnderstanding({
    now: "2026-07-27T12:00:00.000Z",
    parameters: booleanParameters,
    ...input
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].supportingEntryIds.length, 8);
  assert.equal(result[0].contradictingEntryIds.length, 0);
});

test("interpretation validation rejects diagnostic language", () => {
  const output = {
    ...deterministicInterpretation(interpretationInput),
    statementJa: "診断名を示す説明"
  };
  assert.equal(validateInterpretation(interpretationInput, output), false);
});

test("invalid local AI output falls back for JSON, unknown entries, and invented numbers", async () => {
  const cases = [
    "{invalid",
    {
      ...deterministicInterpretation(interpretationInput),
      plainExplanationJa: "未知の entry_unknown を根拠にします。"
    },
    {
      ...deterministicInterpretation(interpretationInput),
      plainExplanationJa: "99件の記録があります。"
    }
  ];
  for (const output of cases) {
    const result = await interpretSelfUnderstanding(interpretationInput, {
      id: "test-local",
      locality: "local",
      async generate() {
        return output;
      }
    });
    assert.equal(result.mode, "deterministic_fallback");
    assert.ok(result.validationErrors.length > 0);
  }
});

test("disabled and external providers never send self-understanding data", async () => {
  let called = false;
  const external = await interpretSelfUnderstanding(interpretationInput, {
    id: "external",
    locality: "external",
    async generate() {
      called = true;
      return deterministicInterpretation(interpretationInput);
    }
  });
  assert.equal(external.mode, "deterministic_fallback");
  assert.equal(called, false);
  const disabled = await interpretSelfUnderstanding(interpretationInput);
  assert.equal(disabled.mode, "deterministic_fallback");
});

test("valid local provider output passes the shared validator", async () => {
  const output = deterministicInterpretation(interpretationInput);
  const result = await interpretSelfUnderstanding(interpretationInput, {
    id: "local-test",
    locality: "local",
    async generate() {
      return JSON.stringify(output);
    }
  });
  assert.equal(result.mode, "local_ai");
  assert.deepEqual(result.interpretation, output);
});

/* Retired entry-template review history belongs to PCS.
test("review history infers a unique template version from its period and field pair", () => {
  const directory = mkdtempSync(join(tmpdir(), "metheory-self-understanding-"));
  const database = new DatabaseSync(join(directory, "self-understanding.sqlite3"));
  try {
    database.exec(readFileSync(join(process.cwd(), "db", "ts_mvp_schema.sql"), "utf8"));
    const at = "2026-07-20T12:00:00.000Z";
    database
      .prepare(
        "INSERT INTO users(id,auth_subject,locale,timezone,created_at) VALUES(?,?,?,?,?)"
      )
      .run("self-user", "self-auth", "ja-JP", "Asia/Tokyo", at);
    const templates = new SqliteTemplateRepository(database);
    const template = templates.save("self-user", {
      approved: true,
      theme: "work",
      name: "Work",
      description: "",
      fields: [
        {
          fieldKey: "condition",
          label: "条件",
          inputType: "boolean",
          valueType: "boolean",
          required: false,
          displayOrder: 1,
          sensitivity: "normal",
          reason: "比較条件"
        },
        {
          fieldKey: "outcome",
          label: "結果",
          inputType: "number",
          valueType: "number",
          required: false,
          displayOrder: 2,
          minimum: 0,
          maximum: 100,
          sensitivity: "normal",
          reason: "比較結果"
        }
      ]
    }) as unknown as { id: string; currentVersion: { id: string } };
    const entry = templates.createEntry("self-user", template.id, {
      values: { condition: true, outcome: 80 },
      recordedAt: at
    });
    database
      .prepare("UPDATE entry_field_values SET reviewed_at=? WHERE entry_id=?")
      .run(at, entry.id);
    database
      .prepare(
        "INSERT INTO hypothesis_reviews(id,user_id,candidate_id,rating,note,analysis_start_at,analysis_end_at,field_pair_json,reviewed_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)"
      )
      .run(
        "review-1",
        "self-user",
        "candidate_condition_outcome_true_false",
        "fits",
        "",
        "2026-07-01T00:00:00.000Z",
        "2026-07-28T00:00:00.000Z",
        JSON.stringify({ condition: "condition", outcome: "outcome" }),
        at,
        at
      );
    const review = database
      .prepare("SELECT template_version_id FROM hypothesis_reviews WHERE id=?")
      .get("review-1") as { template_version_id: string };
    assert.equal(review.template_version_id, template.currentVersion.id);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

*/

test("Personal Context Studio snapshots are analyzed without copying records into MeTheory", () => {
  const records = Array.from({ length: 8 }, (_, index) => {
    const clear = index % 2 === 0;
    return {
      id: `pcs_entry_${index}`,
      recordedAt: `2026-07-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
      title: "Daily note",
      sourceDocumentId: `doc_${index}`,
      values: [
        { fieldKey: "task_clarity", label: "Task clarity", valueType: "single_choice", value: clear ? "clear" : "unclear", templateId: "pcs_daily", sourceDocumentId: `doc_${index}`, allowedValues: [{ key: "clear", label: "Clear" }, { key: "unclear", label: "Unclear" }] },
        { fieldKey: "start_delay", label: "Start delay", valueType: "number", value: clear ? 10 : 60, templateId: "pcs_daily", sourceDocumentId: `doc_${index}` }
      ]
    };
  });
  const result = analyzePersonalContextSnapshot({ schemaVersion: "pcs-context-analysis-snapshot-v1", generatedAt: "2026-07-10T00:00:00.000Z", records, excluded: { unconfirmed: 2, nonShareable: 1, invalid: 0 } }, { startAt: "2026-07-01T00:00:00.000Z", endAt: "2026-07-10T00:00:00.000Z" });
  assert.equal(result.source, "personal_context_studio");
  assert.equal(result.entryCount, 8);
  assert.ok(result.hypotheses.length >= 1);
  assert.equal(result.hypotheses[0].supportingEntryIds.every((id) => id.startsWith("pcs_entry_")), true);
});

test("semantic role pairs map only through deterministic non-clinical construct rules", () => {
  assert.equal(mapConstruct("task_clarity", "start_delay").key, "task_initiation");
  assert.equal(mapConstruct("social_intensity", "fatigue").key, "social_load");
  assert.equal(mapConstruct("environment", "focus").key, "environment_fit");
  assert.equal(mapConstruct("active_duration", "focus").key, "attention_conditions");
  assert.equal(mapConstruct("switching_frequency", "focus").key, "attention_conditions");
  assert.equal(mapConstruct("self_rating", "observed_behavior").key, "self_perception_gap");
  assert.equal(mapConstruct("other", "other").key, "uncategorized");
});

test("tendency scope distinguishes one period, repeated state patterns, and relatively stable candidates", () => {
  const current = { candidateId: "current", constructKey: "task_initiation" as const, conditionRole: "task_clarity" as const, outcomeRole: "start_delay" as const, relation: "a_less_than_b" as const, period: { startAt: "2026-07-01", endAt: "2026-07-28" }, completePairCount: 8 };
  assert.equal(tendencyScopeFor({ current, history: [] }).scope, "single_period_state");
  assert.equal(tendencyScopeFor({ current, history: [{ ...current, candidateId: "old", period: { startAt: "2026-06-01", endAt: "2026-06-28" } }] }).scope, "repeated_state_pattern");
  const identifiedCurrent = { ...current, sourceEntryIds: Array.from({ length: 8 }, (_, index) => `current-${index}`) };
  const identifiedHistory = [{ ...current, candidateId: "old-1", sourceEntryIds: Array.from({ length: 8 }, (_, index) => `old-1-${index}`), period: { startAt: "2026-06-01", endAt: "2026-06-28" } }, { ...current, candidateId: "old-2", sourceEntryIds: Array.from({ length: 8 }, (_, index) => `old-2-${index}`), period: { startAt: "2026-05-01", endAt: "2026-05-28" } }];
  assert.equal(tendencyScopeFor({ current: identifiedCurrent, history: identifiedHistory }).scope, "relatively_stable_candidate");
  assert.equal(tendencyScopeFor({ current, history: [{ ...current, candidateId: "legacy-1", period: { startAt: "2026-06-01", endAt: "2026-06-28" } }, { ...current, candidateId: "legacy-2", period: { startAt: "2026-05-01", endAt: "2026-05-28" } }] }).scope, "repeated_state_pattern");
  assert.equal(tendencyScopeFor({ current, history: [{ ...current, candidateId: "reversed", relation: "a_greater_than_b", period: { startAt: "2026-06-01", endAt: "2026-06-28" } }] }).scope, "unknown");
});

test("tendency scope rejects overlapping periods and requires independent entries", () => {
  const make = (startAt: string, ids: string[]) => ({ candidateId: startAt, constructKey: "task_initiation" as const, conditionRole: "task_clarity" as const, outcomeRole: "start_delay" as const, relation: "a_less_than_b" as const, period: { startAt, endAt: `${startAt}-end` }, completePairCount: ids.length, sourceEntryIds: ids });
  const current = make("2026-07-01", Array.from({ length: 8 }, (_, index) => `a${index}`));
  const overlapping = make("2026-06-01", Array.from({ length: 8 }, (_, index) => `a${index}`));
  const result = tendencyScopeFor({ current, history: [overlapping] });
  assert.equal(result.scope, "single_period_state");
  const stable = tendencyScopeFor({ current: make("2026-07-01", Array.from({ length: 8 }, (_, index) => `a${index}`)), history: [make("2026-06-01", Array.from({ length: 8 }, (_, index) => `b${index}`)), make("2026-05-01", Array.from({ length: 8 }, (_, index) => `c${index}`))] });
  assert.equal(stable.scope, "relatively_stable_candidate");
});

test("self rating and recorded behavior become a self perception gap without judging the rating", () => {
  const input = pairedInput(8, (condition) => condition);
  const result = generateSelfUnderstanding({
    now: "2026-07-27T12:00:00.000Z",
    parameters: [
      { ...parameters[0], semanticRole: "self_rating", fieldKey: "self_rating_focus" },
      { ...parameters[1], semanticRole: "observed_behavior", fieldKey: "task_started", valueType: "boolean", minimumValue: undefined, maximumValue: undefined, positiveValues: [true] }
    ],
    ...input
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].construct, "self_perception_gap");
  assert.match(result[0].interpretation.uncertaintyJa, /間違っているという意味ではありません/);
});

test("concept-level deduplication preserves merged candidate and evidence references", () => {
  const base = generateSelfUnderstanding({ now: "2026-07-27T12:00:00.000Z", parameters, ...pairedInput(8, (condition) => condition ? 90 : 10) })[0] as any;
  const duplicate = { ...base, id: "duplicate", candidate: { ...base.candidate, id: "duplicate", completePairCount: base.candidate.completePairCount - 1, candidateScore: base.candidate.candidateScore - 0.1 }, supportingEntryIds: [...base.supportingEntryIds], contradictingEntryIds: [...base.contradictingEntryIds] };
  const result = deduplicateSelfUnderstandingHypotheses([base, duplicate]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].mergedCandidateIds, ["duplicate"]);
  assert.ok(result[0].supportingEntryIds.length > 0);
  const other = { ...duplicate, id: "other", construct: "social_load", constructDefinition: { ...duplicate.constructDefinition, key: "social_load" } };
  assert.equal(deduplicateSelfUnderstandingHypotheses([base, other]).length, 2);
});

test("AI output cannot add constructs, semantic roles, stronger tendency claims, or unsafe self model text", async () => {
  const v2 = { ...interpretationInput, version: 2 as const, construct: { key: "task_initiation" as const, labelJa: "作業を始めやすい条件", descriptionJa: "開始条件" }, tendencyScope: "single_period_state" as const, condition: { ...interpretationInput.condition, semanticRole: "task_clarity" as const }, outcome: { ...interpretationInput.outcome, semanticRole: "start_delay" as const }, statistics: { ...interpretationInput.statistics, normalizedEffect: 0.4, sampleBalance: 1, missingRate: 0, repeatedPeriodCount: 1 }, alternativeExplanations: ["疲労"], mergedCandidateIds: [] };
  const safe = deterministicInterpretation(v2);
  const unsafeCases = [
    { ...safe, construct: "social_load" },
    { ...safe, tendencyScope: "relatively_stable_candidate" },
    { ...safe, tendencyScopeExplanationJa: "複数期間で安定しています。" },
    { ...safe, nextExperiment: { ...safe.nextExperiment, fieldsToRecord: ["social_intensity"] } }
  ];
  for (const output of unsafeCases) {
    const result = await interpretSelfUnderstanding(v2, { id: "local", locality: "local", async generate() { return output; } });
    assert.equal(result.mode, "deterministic_fallback");
  }
  assert.equal(validateSelfModelStatement("私は、予定が明確な日に始めやすい可能性がある。"), true);
  assert.equal(validateSelfModelStatement("私はADHDです。"), false);
  assert.equal(validateSelfModelStatement("私は必ずこういう性格です。"), false);
});

/* Retired template repository integration belongs to PCS.
test("confirmed template values flow from semantic roles to a task initiation candidate", () => {
  const directory = mkdtempSync(join(tmpdir(), "metheory-self-understanding-flow-"));
  const database = new DatabaseSync(join(directory, "flow.sqlite3"));
  try {
    database.exec(readFileSync(join(process.cwd(), "db", "ts_mvp_schema.sql"), "utf8"));
    database.prepare("INSERT INTO users(id,auth_subject,locale,timezone,created_at) VALUES(?,?,?,?,?)").run("flow-user", "flow-auth", "ja-JP", "Asia/Tokyo", "2026-07-01T00:00:00.000Z");
    const templates = new SqliteTemplateRepository(database);
    const template = templates.save("flow-user", {
      approved: true,
      theme: "作業",
      name: "作業記録",
      description: "予定の明確さと開始までの時間",
      fields: [
        { fieldKey: "task_clarity", label: "予定の明確さ", inputType: "choice", valueType: "choice", required: true, displayOrder: 1, options: [{ key: "clear", label: "明確" }, { key: "unclear", label: "不明確" }], sensitivity: "normal", semanticRole: "task_clarity", semanticRoleSource: "user", semanticRoleConfidence: 1, semanticRoleConfirmed: true, reason: "条件" },
        { fieldKey: "start_delay", label: "作業開始までの時間", inputType: "number", valueType: "number", required: true, displayOrder: 2, minimum: 0, maximum: 120, sensitivity: "normal", semanticRole: "start_delay", semanticRoleSource: "user", semanticRoleConfidence: 1, semanticRoleConfirmed: true, reason: "結果" }
      ]
    }) as unknown as { id: string };
    for (let index = 0; index < 8; index += 1) {
      const clear = index % 2 === 0;
      templates.createEntry("flow-user", template.id, {
        recordedAt: `2026-07-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
        values: { task_clarity: clear ? "clear" : "unclear", start_delay: clear ? 10 : 60 }
      });
    }
    const result = new SqliteSelfUnderstandingRepository(database).analyze("flow-user", {
      startAt: "2026-07-01T00:00:00.000Z",
      endAt: "2026-07-28T00:00:00.000Z"
    });
    assert.equal(result.hypotheses.length, 1);
    assert.equal(result.hypotheses[0].construct, "task_initiation");
    assert.equal(result.hypotheses[0].interpretationInput.condition.semanticRole, "task_clarity");
    assert.equal(result.hypotheses[0].interpretationInput.outcome.semanticRole, "start_delay");
    const historyCount = database.prepare("SELECT COUNT(*) AS count FROM self_understanding_analysis_history").get() as { count: number };
    assert.equal(historyCount.count, 1);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
*/
