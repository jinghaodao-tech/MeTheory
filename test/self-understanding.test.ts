import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { SqliteTemplateRepository } from "../apps/api/src/templateRepository.ts";
import {
  deterministicInterpretation,
  generateSelfUnderstanding,
  interpretSelfUnderstanding,
  validateInterpretation,
  type SelfUnderstandingInterpretationInput
} from "../packages/self-understanding/src/index.ts";

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
  assert.ok(result[0].supportingEntryIds.length > 0);
  assert.equal(result[0].userReview, "pending");
  assert.ok(result[0].nextAction.length > 0);
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
