import {
  generateHypothesisCandidates,
  type CandidateGenerationConfig,
  type CandidateObservation,
  type CandidateParameter,
  type HypothesisCandidate
} from "../../domain/src/hypothesis/candidates.ts";
import {
  inferSemanticRole,
  isSelfUnderstandingSemanticRole,
  type SelfUnderstandingSemanticRole
} from "../../templates/src/semanticRoles.ts";
import {
  SELF_UNDERSTANDING_CONSTRUCT_CATALOG,
  alternativeExplanationsFor,
  getConstructDefinition,
  isSelfUnderstandingConstructKey,
  mapConstruct,
  tendencyScopeFor,
  tendencyScopeLabelJa,
  type CandidateHistory,
  type SelfUnderstandingConstructDefinition,
  type SelfUnderstandingConstructKey,
  type TendencyScope
} from "./constructs.ts";
import {
  SELF_UNDERSTANDING_EXPLANATION_PROMPT_VERSION,
  SELF_UNDERSTANDING_EXPLANATION_SYSTEM_PROMPT
} from "./prompt.ts";

export * from "./constructs.ts";
export * from "./prompt.ts";

export type UnderstandingRecord = {
  id: string;
  recordedAt: string;
  title: string;
  conditionValues: Record<string, unknown>;
  outcomeValues: Record<string, unknown>;
};
export type SelfUnderstandingStatus =
  | "insufficient"
  | "emerging"
  | "stable_candidate"
  | "unstable"
  | "contradicted";
export type SelfUnderstandingConfig = Pick<
  CandidateGenerationConfig,
  | "minimumSamplesPerCohort"
  | "minimumTotalSamples"
  | "maximumMissingRate"
  | "minimumNormalizedEffect"
  | "minimumSampleBalance"
  | "maximumCandidates"
> & { stableMinimumSamples: number };
export const DEFAULT_SELF_UNDERSTANDING_CONFIG: SelfUnderstandingConfig = {
  minimumSamplesPerCohort: 3,
  minimumTotalSamples: 8,
  stableMinimumSamples: 12,
  maximumMissingRate: 0.35,
  minimumNormalizedEffect: 0.2,
  minimumSampleBalance: 0.3,
  maximumCandidates: 5
};

type EntryReference = { entryId: string; recordedAt: string; title: string };
type InterpretationStatisticsV1 = {
  groupACount: number;
  groupBCount: number;
  groupAValue: number;
  groupBValue: number;
  difference: number;
  missingCount: number;
  temporalStability: "stable" | "unstable" | "unknown";
};
export type SelfUnderstandingInterpretationInput = {
  version?: 1;
  candidateId: string;
  period: { startAt: string; endAt: string };
  condition: {
    fieldKey: string;
    label: string;
    groupA: string;
    groupB: string;
    semanticRole?: SelfUnderstandingSemanticRole;
  };
  outcome: {
    fieldKey: string;
    label: string;
    semanticRole?: SelfUnderstandingSemanticRole;
  };
  statistics: InterpretationStatisticsV1 & {
    normalizedEffect?: number;
    sampleBalance?: number;
    missingRate?: number;
    repeatedPeriodCount?: number;
  };
  status: Exclude<SelfUnderstandingStatus, "insufficient">;
  supportingEntries: EntryReference[];
  contradictingEntries: EntryReference[];
  construct?: {
    key: SelfUnderstandingConstructKey;
    labelJa: string;
    descriptionJa: string;
  };
  tendencyScope?: TendencyScope;
  alternativeExplanations?: string[];
  mergedCandidateIds?: string[];
};
export type SelfUnderstandingInterpretationInputV2 = {
  version: 2;
  candidateId: string;
  construct: {
    key: SelfUnderstandingConstructKey;
    labelJa: string;
    descriptionJa: string;
  };
  tendencyScope: TendencyScope;
  period: { startAt: string; endAt: string };
  condition: {
    fieldKey: string;
    label: string;
    semanticRole: SelfUnderstandingSemanticRole;
    groupA: string;
    groupB: string;
  };
  outcome: {
    fieldKey: string;
    label: string;
    semanticRole: SelfUnderstandingSemanticRole;
  };
  statistics: {
    groupACount: number;
    groupBCount: number;
    groupAValue: number;
    groupBValue: number;
    difference: number;
    normalizedEffect: number;
    sampleBalance: number;
    missingRate: number;
    temporalStability: "stable" | "unstable" | "unknown";
    repeatedPeriodCount: number;
  };
  status: Exclude<SelfUnderstandingStatus, "insufficient">;
  supportingEntries: EntryReference[];
  contradictingEntries: EntryReference[];
  alternativeExplanations: string[];
  mergedCandidateIds: string[];
};
export type SelfUnderstandingInterpretation = {
  statementJa: string;
  constructExplanationJa: string;
  plainExplanationJa: string;
  supportingExplanationJa: string;
  contradictingExplanationJa: string;
  alternativeExplanationJa: string;
  uncertaintyJa: string;
  tendencyScopeExplanationJa: string;
  nextExperiment: {
    title: string;
    durationDays: number;
    action: string;
    fieldsToRecord: string[];
    comparisonPlan: string;
    successCondition: string;
  };
  selfModelCandidateJa: string;
};
export type SelfUnderstandingHypothesis = {
  id: string;
  construct: SelfUnderstandingConstructKey;
  constructDefinition: SelfUnderstandingConstructDefinition;
  tendencyScope: TendencyScope;
  tendencyScopeLabelJa: string;
  status: Exclude<SelfUnderstandingStatus, "insufficient">;
  statusLabelJa: string;
  statement: string;
  period: { startAt: string; endAt: string };
  templateIds: string[];
  supportingEntryIds: string[];
  contradictingEntryIds: string[];
  dataShortage: string[];
  alternativeExplanations: string[];
  mergedCandidateIds: string[];
  confidence: number;
  userReview: "pending" | "fits" | "does_not_fit" | "on_hold";
  nextAction: string;
  selfModelCandidate: string;
  interpretation: SelfUnderstandingInterpretation;
  interpretationInput: SelfUnderstandingInterpretationInputV2;
  candidate: HypothesisCandidate;
};
export interface SelfUnderstandingInterpretationProvider {
  readonly id: string;
  readonly locality: "local" | "external" | "disabled";
  generate(input: SelfUnderstandingInterpretationInputV2): Promise<unknown>;
}
export type InterpretationResult = {
  interpretation: SelfUnderstandingInterpretation;
  mode: "local_ai" | "deterministic_fallback";
  providerId: string;
  validationErrors: string[];
};

const outputKeys = new Set([
  "statementJa",
  "constructExplanationJa",
  "plainExplanationJa",
  "supportingExplanationJa",
  "contradictingExplanationJa",
  "alternativeExplanationJa",
  "uncertaintyJa",
  "tendencyScopeExplanationJa",
  "nextExperiment",
  "selfModelCandidateJa"
]);
const nextExperimentKeys = new Set([
  "title",
  "durationDays",
  "action",
  "fieldsToRecord",
  "comparisonPlan",
  "successCondition"
]);
const forbiddenClinical =
  /(ADHD|autism|autistic|depression|bipolar|MBTI|診断|診断候補|障害|疾患|病的|正常|異常|治療|服薬|受診|重症度|疾患確率|障害確率)/i;
const forbiddenAbsolute =
  /(必ず|間違いなく|絶対|性格です|人格です|生まれつき|固定的な性格|安定した性格)/i;
const forbiddenBlame =
  /(怠け|甘え|意志が弱|努力不足|あなたのせい|自己責任|だめな人)/i;

export class OpenAICompatibleLocalInterpretationProvider
  implements SelfUnderstandingInterpretationProvider
{
  readonly locality = "local" as const;
  readonly id: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: { id?: string; baseUrl: string; model: string }) {
    const url = new URL(config.baseUrl);
    if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
      throw new Error("self_understanding_remote_endpoint_prohibited");
    }
    this.id = config.id ?? "openai-compatible-local";
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.model = config.model;
  }

  async generate(input: SelfUnderstandingInterpretationInputV2): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        messages: [
          { role: "system", content: SELF_UNDERSTANDING_EXPLANATION_SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              promptVersion: SELF_UNDERSTANDING_EXPLANATION_PROMPT_VERSION,
              schema: {
                statementJa: "string",
                constructExplanationJa: "string",
                plainExplanationJa: "string",
                supportingExplanationJa: "string",
                contradictingExplanationJa: "string",
                alternativeExplanationJa: "string",
                uncertaintyJa: "string",
                tendencyScopeExplanationJa: "string",
                nextExperiment: {
                  title: "string",
                  durationDays: "integer 7 through 14",
                  action: "string",
                  fieldsToRecord: [
                    input.condition.fieldKey,
                    input.outcome.fieldKey
                  ],
                  comparisonPlan: "string",
                  successCondition: "string"
                },
                selfModelCandidateJa: "string"
              },
              data: input
            })
          }
        ]
      })
    });
    if (!response.ok) throw new Error("self_understanding_provider_failed");
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("self_understanding_invalid_response");
    return content;
  }
}

function normalizeInput(
  input: SelfUnderstandingInterpretationInput | SelfUnderstandingInterpretationInputV2
): SelfUnderstandingInterpretationInputV2 {
  if (input.version === 2) return input as SelfUnderstandingInterpretationInputV2;
  const construct = input.construct ?? getConstructDefinition("uncategorized");
  return {
    version: 2,
    candidateId: input.candidateId,
    construct: {
      key: construct.key,
      labelJa: construct.labelJa,
      descriptionJa: construct.descriptionJa
    },
    tendencyScope: input.tendencyScope ?? "single_period_state",
    period: input.period,
    condition: {
      ...input.condition,
      semanticRole: input.condition.semanticRole ?? "other"
    },
    outcome: {
      ...input.outcome,
      semanticRole: input.outcome.semanticRole ?? "other"
    },
    statistics: {
      groupACount: input.statistics.groupACount,
      groupBCount: input.statistics.groupBCount,
      groupAValue: input.statistics.groupAValue,
      groupBValue: input.statistics.groupBValue,
      difference: input.statistics.difference,
      normalizedEffect: input.statistics.normalizedEffect ?? 0,
      sampleBalance: input.statistics.sampleBalance ?? 0,
      missingRate: input.statistics.missingRate ?? 0,
      temporalStability: input.statistics.temporalStability,
      repeatedPeriodCount: input.statistics.repeatedPeriodCount ?? 1
    },
    status: input.status,
    supportingEntries: input.supportingEntries,
    contradictingEntries: input.contradictingEntries,
    alternativeExplanations:
      input.alternativeExplanations ?? alternativeExplanationsFor(construct.key),
    mergedCandidateIds: input.mergedCandidateIds ?? []
  };
}

function parameterRole(parameter: CandidateParameter): SelfUnderstandingSemanticRole {
  if (isSelfUnderstandingSemanticRole(parameter.semanticRole)) {
    return parameter.semanticRole;
  }
  return inferSemanticRole({
    fieldKey: parameter.fieldKey ?? parameter.id,
    label: parameter.nameJa
  }).semanticRole;
}

function parameterFieldKey(parameter: CandidateParameter) {
  return parameter.fieldKey ?? parameter.id;
}

function cohortKey(
  value: unknown,
  candidate: HypothesisCandidate,
  parameter?: CandidateParameter
) {
  if (
    String(value) === candidate.cohortA.key ||
    String(value) === candidate.cohortB.key
  ) {
    return String(value);
  }
  if (typeof value === "number" && parameter) {
    const minimum = parameter.minimumValue ?? 0;
    const maximum = parameter.maximumValue ?? 100;
    return value <= minimum + (maximum - minimum) / 2 ? "low" : "high";
  }
  return String(value);
}

function statusFor(
  candidate: HypothesisCandidate,
  config: SelfUnderstandingConfig,
  supportingCount: number,
  contradictingCount: number
): Exclude<SelfUnderstandingStatus, "insufficient"> {
  if (
    contradictingCount >= config.minimumSamplesPerCohort &&
    contradictingCount > supportingCount
  ) {
    return "contradicted";
  }
  if (candidate.temporalStabilityStatus === "unstable") return "unstable";
  if (
    candidate.temporalStabilityStatus === "stable" &&
    candidate.completePairCount >= config.stableMinimumSamples
  ) {
    return "stable_candidate";
  }
  return "emerging";
}

function statusLabel(status: SelfUnderstandingHypothesis["status"]) {
  if (status === "stable_candidate") return "期間内で方向が安定した候補";
  if (status === "unstable") return "期間内で結果が不安定";
  if (status === "contradicted") return "反する記録が優勢";
  return "傾向の兆し";
}

function numeric(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function relationWord(input: SelfUnderstandingInterpretationInputV2) {
  return input.statistics.difference >= 0 ? "高い" : "低い";
}

export function deterministicInterpretation(
  rawInput: SelfUnderstandingInterpretationInput | SelfUnderstandingInterpretationInputV2
): SelfUnderstandingInterpretation {
  const input = normalizeInput(rawInput);
  const contradicted = input.status === "contradicted";
  const statementJa =
    input.construct.key === "self_perception_gap"
      ? "自己評価と記録された行動に違いが見られる場合があります。"
      : contradicted
        ? `${input.construct.labelJa}について、現在は反する記録が多く、仮説を見直す必要があります。`
        : `${input.construct.labelJa}について、傾向の兆しがあります。`;
  const observation =
    input.construct.key === "self_perception_gap"
      ? `「${input.condition.groupA}」という自己評価の日でも、「${input.outcome.label}」が記録されている場合があります。`
      : `「${input.condition.groupA}」の日は、「${input.outcome.label}」が${input.condition.groupB}の日より${relationWord(input)}傾向でした。`;
  const tendency =
    input.tendencyScope === "relatively_stable_candidate"
      ? "この傾向は異なる3期間以上で同じ方向に見られています。比較的安定した候補ですが、環境や生活状況によって変わる可能性があります。"
      : input.tendencyScope === "repeated_state_pattern"
        ? "この傾向は複数の期間で繰り返し見られています。固定的な特性ではなく、条件に応じた状態的な傾向として扱います。"
        : input.tendencyScope === "single_period_state"
          ? "この結果は今回の分析期間で見られた状態的な傾向です。"
          : "期間によって方向が変わるため、傾向の範囲はまだ確定できません。";
  const alternatives = input.alternativeExplanations.join("、");
  const suggestedRoles = getConstructDefinition(input.construct.key)
    .suggestedObservationRoles;
  const suggestedText = suggestedRoles.length
    ? suggestedRoles.join("、")
    : `${input.condition.semanticRole}、${input.outcome.semanticRole}`;
  return {
    statementJa,
    constructExplanationJa: input.construct.descriptionJa,
    plainExplanationJa: `${observation}${input.condition.groupA}の記録は${input.statistics.groupACount}件、${input.condition.groupB}の記録は${input.statistics.groupBCount}件でした。集計値はそれぞれ${numeric(input.statistics.groupAValue)}と${numeric(input.statistics.groupBValue)}で、差は${numeric(input.statistics.difference)}です。`,
    supportingExplanationJa: `この傾向と同じ方向の記録を${input.supportingEntries.length}件確認できます。`,
    contradictingExplanationJa: input.contradictingEntries.length
      ? `一方で、異なる方向の記録も${input.contradictingEntries.length}件あります。`
      : "明確な反証記録は少ないものの、反証がないことを意味しません。",
    alternativeExplanationJa: `別の説明として、${alternatives}が影響した可能性があります。`,
    uncertaintyJa:
      input.construct.key === "self_perception_gap"
        ? "自己評価が間違っているという意味ではありません。感じ方と、記録された行動量が別々に変化している可能性があります。"
        : "記録された関連は因果関係を意味せず、未記録の条件が影響した可能性があります。",
    tendencyScopeExplanationJa: tendency,
    nextExperiment: {
      title: `${input.construct.labelJa}を確かめる小さな比較`,
      durationDays: 7,
      action: `次の7日間、${suggestedText}を同じ記録で確認します。`,
      fieldsToRecord: [input.condition.fieldKey, input.outcome.fieldKey],
      comparisonPlan: `${input.condition.groupA}と${input.condition.groupB}の両方で、同じ項目を記録して比べます。`,
      successCondition: "両方の条件で少なくとも3件ずつ、同じ項目を記録する"
    },
    selfModelCandidateJa: `私は、「${input.condition.label}」の条件で「${input.outcome.label}」が変わる可能性があるため、状況に応じて確かめる。`
  };
}

function isPositiveOutcome(value: unknown, parameter: CandidateParameter) {
  const positiveValues =
    parameter.positiveValues ??
    (parameter.valueType === "boolean" ? [true] : ["completed", "started"]);
  return positiveValues.some((positive) => Object.is(value, positive));
}

export function recordEvidence(
  record: UnderstandingRecord,
  candidate: HypothesisCandidate,
  conditionParameter?: CandidateParameter,
  outcomeParameter?: CandidateParameter
) {
  const condition = record.conditionValues[candidate.conditionParameterId];
  const outcome = record.outcomeValues[candidate.outcomeParameterId];
  if (condition === undefined || outcome === undefined || outcome === null) return "none";
  const cohort = cohortKey(condition, candidate, conditionParameter);
  if (cohort !== candidate.cohortA.key && cohort !== candidate.cohortB.key) {
    return "none";
  }
  const expectedHigher = candidate.relation === "a_greater_than_b";
  if (typeof outcome !== "number") {
    if (!outcomeParameter) return "none";
    const positive = isPositiveOutcome(outcome, outcomeParameter);
    const aligns =
      cohort === candidate.cohortA.key
        ? expectedHigher === positive
        : expectedHigher !== positive;
    return aligns ? "supports" : "contradicts";
  }
  const midpoint =
    (candidate.cohortA.metricValue + candidate.cohortB.metricValue) / 2;
  const aligns =
    cohort === candidate.cohortA.key
      ? expectedHigher
        ? outcome >= midpoint
        : outcome <= midpoint
      : expectedHigher
        ? outcome < midpoint
        : outcome > midpoint;
  return aligns ? "supports" : "contradicts";
}

function outputText(output: SelfUnderstandingInterpretation) {
  return [
    output.statementJa,
    output.constructExplanationJa,
    output.plainExplanationJa,
    output.supportingExplanationJa,
    output.contradictingExplanationJa,
    output.alternativeExplanationJa,
    output.uncertaintyJa,
    output.tendencyScopeExplanationJa,
    output.nextExperiment?.title,
    output.nextExperiment?.action,
    output.nextExperiment?.comparisonPlan,
    output.nextExperiment?.successCondition,
    output.selfModelCandidateJa
  ];
}

function interpretationErrors(
  input: SelfUnderstandingInterpretationInputV2,
  output: SelfUnderstandingInterpretation
) {
  const errors: string[] = [];
  if (
    Object.keys(output as object).some((key) => !outputKeys.has(key)) ||
    !output.nextExperiment ||
    Object.keys(output.nextExperiment).some((key) => !nextExperimentKeys.has(key))
  ) {
    errors.push("unknown_output_field");
  }
  const textValues = outputText(output);
  if (textValues.some((value) => typeof value !== "string" || !value.trim())) {
    errors.push("required_text_missing");
  }
  const text = textValues
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  if (forbiddenClinical.test(text)) errors.push("forbidden_clinical_claim");
  if (forbiddenAbsolute.test(text)) errors.push("forbidden_absolute_claim");
  if (forbiddenBlame.test(text)) errors.push("blaming_language");
  if (/心理的|精神的/.test(text)) errors.push("ambiguous_medicalized_language");
  if (!/[\u3040-\u30ff\u3400-\u9fff]/.test(text)) {
    errors.push("japanese_explanation_required");
  }
  if (
    !Number.isInteger(output.nextExperiment?.durationDays) ||
    output.nextExperiment.durationDays < 7 ||
    output.nextExperiment.durationDays > 14
  ) {
    errors.push("invalid_experiment_duration");
  }
  const allowedFields = [input.condition.fieldKey, input.outcome.fieldKey];
  if (
    !Array.isArray(output.nextExperiment?.fieldsToRecord) ||
    output.nextExperiment.fieldsToRecord.some((field) => !allowedFields.includes(field))
  ) {
    errors.push("unknown_field");
  }
  const allowedEntryIds = new Set(
    [...input.supportingEntries, ...input.contradictingEntries].map(
      (entry) => entry.entryId
    )
  );
  const mentionedEntryIds = text.match(/\bentry_[a-zA-Z0-9_-]+\b/g) ?? [];
  if (mentionedEntryIds.some((entryId) => !allowedEntryIds.has(entryId))) {
    errors.push("unknown_entry_reference");
  }
  const allowedNumbers = new Set(
    [
      input.statistics.groupACount,
      input.statistics.groupBCount,
      input.statistics.groupAValue,
      input.statistics.groupBValue,
      input.statistics.difference,
      input.statistics.normalizedEffect,
      input.statistics.sampleBalance,
      input.statistics.missingRate,
      input.statistics.repeatedPeriodCount,
      input.supportingEntries.length,
      input.contradictingEntries.length,
      output.nextExperiment?.durationDays,
      3
    ]
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      .flatMap((value) => [String(value), numeric(value)])
  );
  const numericClaims = text.match(/-?\d+(?:\.\d+)?/g) ?? [];
  if (numericClaims.some((value) => !allowedNumbers.has(value))) {
    errors.push("invented_numeric_claim");
  }
  const otherConstruct = SELF_UNDERSTANDING_CONSTRUCT_CATALOG.find(
    (definition) =>
      definition.key !== input.construct.key &&
      (text.includes(definition.key) || text.includes(definition.labelJa))
  );
  if (otherConstruct) errors.push("construct_changed");
  const roleKeys = text.match(
    /\b(?:mood|energy|fatigue|recovery|sleep_duration|sleep_quality|time_of_day|day_type|social_context|social_intensity|environment|noise_level|task_clarity|deadline_clarity|start_delay|initiation_difficulty|continuation_difficulty|focus|completion|satisfaction|uncertainty|decision_count|avoidance|self_rating|observed_behavior|other)\b/g
  ) ?? [];
  if (
    roleKeys.some(
      (role) =>
        role !== input.condition.semanticRole && role !== input.outcome.semanticRole
    )
  ) {
    errors.push("semantic_role_changed");
  }
  if (
    input.tendencyScope !== "relatively_stable_candidate" &&
    /(比較的安定した傾向|複数期間で安定)/.test(text)
  ) {
    errors.push("tendency_scope_strengthened");
  }
  return [...new Set(errors)];
}

function parseInterpretation(output: unknown): SelfUnderstandingInterpretation | null {
  try {
    const parsed = typeof output === "string" ? JSON.parse(output) : output;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as SelfUnderstandingInterpretation;
  } catch {
    return null;
  }
}

export function validateInterpretation(
  rawInput: SelfUnderstandingInterpretationInput | SelfUnderstandingInterpretationInputV2,
  output: SelfUnderstandingInterpretation
) {
  return interpretationErrors(normalizeInput(rawInput), output).length === 0;
}

export function validateSelfModelStatement(statement: string): boolean {
  return (
    Boolean(statement.trim()) &&
    statement.length <= 500 &&
    !forbiddenClinical.test(statement) &&
    !forbiddenAbsolute.test(statement) &&
    !forbiddenBlame.test(statement)
  );
}

export async function interpretSelfUnderstanding(
  rawInput: SelfUnderstandingInterpretationInput | SelfUnderstandingInterpretationInputV2,
  provider?: SelfUnderstandingInterpretationProvider
): Promise<InterpretationResult> {
  const input = normalizeInput(rawInput);
  const fallback = deterministicInterpretation(input);
  if (!provider || provider.locality === "disabled") {
    return {
      interpretation: fallback,
      mode: "deterministic_fallback",
      providerId: provider?.id ?? "disabled",
      validationErrors: ["provider_unavailable"]
    };
  }
  if (provider.locality !== "local") {
    return {
      interpretation: fallback,
      mode: "deterministic_fallback",
      providerId: provider.id,
      validationErrors: ["external_provider_prohibited"]
    };
  }
  try {
    const parsed = parseInterpretation(await provider.generate(input));
    if (!parsed) {
      return {
        interpretation: fallback,
        mode: "deterministic_fallback",
        providerId: provider.id,
        validationErrors: ["invalid_json"]
      };
    }
    const validationErrors = interpretationErrors(input, parsed);
    if (validationErrors.length) {
      return {
        interpretation: fallback,
        mode: "deterministic_fallback",
        providerId: provider.id,
        validationErrors
      };
    }
    return {
      interpretation: parsed,
      mode: "local_ai",
      providerId: provider.id,
      validationErrors: []
    };
  } catch {
    return {
      interpretation: fallback,
      mode: "deterministic_fallback",
      providerId: provider.id,
      validationErrors: ["provider_error"]
    };
  }
}

function periodOverlap(
  left: { startAt: string; endAt: string },
  right: { startAt: string; endAt: string }
) {
  const leftStart = Date.parse(left.startAt);
  const leftEnd = Date.parse(left.endAt);
  const rightStart = Date.parse(right.startAt);
  const rightEnd = Date.parse(right.endAt);
  const overlap = Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart));
  const shorter = Math.max(1, Math.min(leftEnd - leftStart, rightEnd - rightStart));
  return overlap / shorter;
}

function jaccard(left: string[], right: string[]) {
  const a = new Set(left);
  const b = new Set(right);
  const intersection = [...a].filter((item) => b.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function representativeOrder(
  left: SelfUnderstandingHypothesis,
  right: SelfUnderstandingHypothesis
) {
  return (
    right.candidate.completePairCount - left.candidate.completePairCount ||
    left.candidate.missingRate - right.candidate.missingRate ||
    right.candidate.sampleBalance - left.candidate.sampleBalance ||
    right.candidate.temporalStability - left.candidate.temporalStability ||
    right.candidate.normalizedEffect - left.candidate.normalizedEffect
  );
}

export function deduplicateSelfUnderstandingHypotheses(
  hypotheses: SelfUnderstandingHypothesis[],
  maximumCandidates = 5
): SelfUnderstandingHypothesis[] {
  const remaining = [...hypotheses].sort(representativeOrder);
  const result: SelfUnderstandingHypothesis[] = [];
  while (remaining.length && result.length < maximumCandidates) {
    const representative = remaining.shift()!;
    const duplicates = remaining.filter(
      (candidate) =>
        candidate.construct === representative.construct &&
        candidate.interpretationInput.condition.semanticRole ===
          representative.interpretationInput.condition.semanticRole &&
        candidate.interpretationInput.outcome.semanticRole ===
          representative.interpretationInput.outcome.semanticRole &&
        candidate.candidate.relation === representative.candidate.relation &&
        periodOverlap(candidate.period, representative.period) >= 0.5 &&
        jaccard(
          [
            ...candidate.supportingEntryIds,
            ...candidate.contradictingEntryIds
          ],
          [
            ...representative.supportingEntryIds,
            ...representative.contradictingEntryIds
          ]
        ) >= 0.5
    );
    for (const duplicate of duplicates) {
      remaining.splice(remaining.indexOf(duplicate), 1);
    }
    if (duplicates.length) {
      representative.mergedCandidateIds = [
        ...new Set([
          ...representative.mergedCandidateIds,
          ...duplicates.flatMap((item) => [item.id, ...item.mergedCandidateIds])
        ])
      ];
      representative.supportingEntryIds = [
        ...new Set([
          ...representative.supportingEntryIds,
          ...duplicates.flatMap((item) => item.supportingEntryIds)
        ])
      ];
      representative.contradictingEntryIds = [
        ...new Set([
          ...representative.contradictingEntryIds,
          ...duplicates.flatMap((item) => item.contradictingEntryIds)
        ])
      ];
      representative.interpretationInput.mergedCandidateIds =
        representative.mergedCandidateIds;
      representative.interpretation = deterministicInterpretation(
        representative.interpretationInput
      );
      representative.statement = representative.interpretation.statementJa;
    }
    result.push(representative);
  }
  return result.sort(
    (left, right) =>
      right.candidate.candidateScore - left.candidate.candidateScore ||
      left.id.localeCompare(right.id)
  );
}

export function generateSelfUnderstanding(input: {
  parameters: CandidateParameter[];
  observations: CandidateObservation[];
  records: UnderstandingRecord[];
  allowedValues?: Record<string, Array<{ valueKey: string; labelJa: string }>>;
  history?: CandidateHistory[];
  now?: string;
  config?: Partial<SelfUnderstandingConfig>;
}): SelfUnderstandingHypothesis[] {
  const config = { ...DEFAULT_SELF_UNDERSTANDING_CONFIG, ...input.config };
  const candidates = generateHypothesisCandidates({
    parameters: input.parameters,
    observations: input.observations,
    allowedValues: input.allowedValues,
    now: input.now,
    config: {
      ...config,
      maximumCandidates: Math.max(config.maximumCandidates * 4, 20),
      lookbackDays: 30
    }
  });
  const hypotheses = candidates.map((candidate) => {
    const conditionParameter = input.parameters.find(
      (item) => item.id === candidate.conditionParameterId
    )!;
    const outcomeParameter = input.parameters.find(
      (item) => item.id === candidate.outcomeParameterId
    )!;
    const conditionRole = parameterRole(conditionParameter);
    const outcomeRole = parameterRole(outcomeParameter);
    const constructDefinition = mapConstruct(conditionRole, outcomeRole);
    const supporting: string[] = [];
    const contradicting: string[] = [];
    for (const record of input.records) {
      const evidence = recordEvidence(
        record,
        candidate,
        conditionParameter,
        outcomeParameter
      );
      if (evidence === "supports") supporting.push(record.id);
      if (evidence === "contradicts") contradicting.push(record.id);
    }
    const status = statusFor(
      candidate,
      config,
      supporting.length,
      contradicting.length
    );
    const currentHistory: CandidateHistory = {
      candidateId: candidate.id,
      constructKey: constructDefinition.key,
      conditionRole,
      outcomeRole,
      relation: candidate.relation,
      period: candidate.supportingPeriod,
      completePairCount: candidate.completePairCount
    };
    const tendency = tendencyScopeFor({
      current: currentHistory,
      history: input.history ?? []
    });
    const alternativeExplanations = alternativeExplanationsFor(
      constructDefinition.key
    );
    const interpretationInput: SelfUnderstandingInterpretationInputV2 = {
      version: 2,
      candidateId: candidate.id,
      construct: {
        key: constructDefinition.key,
        labelJa: constructDefinition.labelJa,
        descriptionJa: constructDefinition.descriptionJa
      },
      tendencyScope: tendency.scope,
      period: candidate.supportingPeriod,
      condition: {
        fieldKey: parameterFieldKey(conditionParameter),
        label: conditionParameter.nameJa,
        semanticRole: conditionRole,
        groupA: candidate.cohortA.labelJa,
        groupB: candidate.cohortB.labelJa
      },
      outcome: {
        fieldKey: parameterFieldKey(outcomeParameter),
        label: outcomeParameter.nameJa,
        semanticRole: outcomeRole
      },
      statistics: {
        groupACount: candidate.cohortA.validSampleCount,
        groupBCount: candidate.cohortB.validSampleCount,
        groupAValue: candidate.cohortA.metricValue,
        groupBValue: candidate.cohortB.metricValue,
        difference: candidate.effectValue,
        normalizedEffect: candidate.normalizedEffect,
        sampleBalance: candidate.sampleBalance,
        missingRate: candidate.missingRate,
        temporalStability: candidate.temporalStabilityStatus,
        repeatedPeriodCount: tendency.repeatedPeriodCount
      },
      status,
      supportingEntries: input.records
        .filter((record) => supporting.includes(record.id))
        .map((record) => ({
          entryId: record.id,
          recordedAt: record.recordedAt,
          title: record.title
        })),
      contradictingEntries: input.records
        .filter((record) => contradicting.includes(record.id))
        .map((record) => ({
          entryId: record.id,
          recordedAt: record.recordedAt,
          title: record.title
        })),
      alternativeExplanations,
      mergedCandidateIds: []
    };
    const interpretation = deterministicInterpretation(interpretationInput);
    const dataShortage: string[] = [];
    if (candidate.missingConditionCount) {
      dataShortage.push(`条件値の欠損: ${candidate.missingConditionCount}件`);
    }
    if (candidate.missingOutcomeCount) {
      dataShortage.push(`結果値の欠損: ${candidate.missingOutcomeCount}件`);
    }
    return {
      id: candidate.id,
      construct: constructDefinition.key,
      constructDefinition,
      tendencyScope: tendency.scope,
      tendencyScopeLabelJa: tendencyScopeLabelJa(tendency.scope),
      status,
      statusLabelJa: statusLabel(status),
      statement: interpretation.statementJa,
      period: candidate.supportingPeriod,
      templateIds: [
        ...new Set(
          [conditionParameter.templateId, outcomeParameter.templateId].filter(
            (value): value is string => Boolean(value)
          )
        )
      ],
      supportingEntryIds: supporting,
      contradictingEntryIds: contradicting,
      dataShortage,
      alternativeExplanations,
      mergedCandidateIds: [],
      confidence: Math.round(candidate.candidateScore * 100) / 100,
      userReview: "pending" as const,
      nextAction: interpretation.nextExperiment.action,
      selfModelCandidate: interpretation.selfModelCandidateJa,
      interpretation,
      interpretationInput,
      candidate
    };
  });
  return deduplicateSelfUnderstandingHypotheses(
    hypotheses,
    config.maximumCandidates
  );
}
