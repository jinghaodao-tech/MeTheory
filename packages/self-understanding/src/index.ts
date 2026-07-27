import {
  generateHypothesisCandidates,
  type CandidateGenerationConfig,
  type CandidateObservation,
  type CandidateParameter,
  type HypothesisCandidate
} from "../../domain/src/hypothesis/candidates.ts";

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
export type SelfUnderstandingInterpretationInput = {
  candidateId: string;
  period: { startAt: string; endAt: string };
  condition: { fieldKey: string; label: string; groupA: string; groupB: string };
  outcome: { fieldKey: string; label: string };
  statistics: {
    groupACount: number;
    groupBCount: number;
    groupAValue: number;
    groupBValue: number;
    difference: number;
    missingCount: number;
    temporalStability: "stable" | "unstable" | "unknown";
  };
  status: Exclude<SelfUnderstandingStatus, "insufficient">;
  supportingEntries: Array<{ entryId: string; recordedAt: string; title: string }>;
  contradictingEntries: Array<{ entryId: string; recordedAt: string; title: string }>;
};
export type SelfUnderstandingInterpretation = {
  statementJa: string;
  plainExplanationJa: string;
  supportingExplanationJa: string;
  contradictingExplanationJa: string;
  uncertaintyJa: string;
  nextExperiment: {
    title: string;
    durationDays: number;
    action: string;
    fieldsToRecord: string[];
    successCondition: string;
  };
  selfModelCandidateJa: string;
};
export type SelfUnderstandingHypothesis = {
  id: string;
  construct: string;
  status: Exclude<SelfUnderstandingStatus, "insufficient">;
  statusLabelJa: string;
  statement: string;
  period: { startAt: string; endAt: string };
  supportingEntryIds: string[];
  contradictingEntryIds: string[];
  dataShortage: string[];
  confidence: number;
  userReview: "pending" | "fits" | "does_not_fit" | "on_hold";
  nextAction: string;
  selfModelCandidate: string;
  interpretation: SelfUnderstandingInterpretation;
  interpretationInput: SelfUnderstandingInterpretationInput;
  candidate: HypothesisCandidate;
};
export interface SelfUnderstandingInterpretationProvider {
  readonly id: string;
  readonly locality: "local" | "external" | "disabled";
  generate(input: SelfUnderstandingInterpretationInput): Promise<unknown>;
}
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

  async generate(input: SelfUnderstandingInterpretationInput): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Return one JSON object only. Explain non-clinical observations in Japanese. Do not diagnose, invent statistics, invent Entry IDs, or make absolute claims."
          },
          {
            role: "user",
            content: JSON.stringify({
              schema: {
                statementJa: "string",
                plainExplanationJa: "string",
                supportingExplanationJa: "string",
                contradictingExplanationJa: "string",
                uncertaintyJa: "string",
                nextExperiment: {
                  title: "string",
                  durationDays: "integer 7 through 14",
                  action: "string",
                  fieldsToRecord: [input.condition.fieldKey, input.outcome.fieldKey],
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
export type InterpretationResult = {
  interpretation: SelfUnderstandingInterpretation;
  mode: "local_ai" | "deterministic_fallback";
  providerId: string;
  validationErrors: string[];
};

function cohortKey(value: unknown, candidate: HypothesisCandidate, parameter?: CandidateParameter) {
  if (String(value) === candidate.cohortA.key || String(value) === candidate.cohortB.key) {
    return String(value);
  }
  if (typeof value === "number" && parameter) {
    const minimum = parameter.minimumValue ?? 0;
    const maximum = parameter.maximumValue ?? 100;
    return value <= minimum + (maximum - minimum) / 2 ? "low" : "high";
  }
  return String(value);
}
function labels(candidate: HypothesisCandidate, parameters: CandidateParameter[]) {
  return {
    condition:
      parameters.find((item) => item.id === candidate.conditionParameterId)?.nameJa ??
      candidate.conditionParameterId,
    outcome:
      parameters.find((item) => item.id === candidate.outcomeParameterId)?.nameJa ??
      candidate.outcomeParameterId
  };
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
  if (status === "stable_candidate") return "比較的安定した候補";
  if (status === "unstable") return "結果が不安定";
  if (status === "contradicted") return "反する記録が優勢";
  return "傾向の兆し";
}
function constructFor(candidate: HypothesisCandidate) {
  return `${candidate.conditionParameterId}_and_${candidate.outcomeParameterId}`.replace(
    /[^a-zA-Z0-9_]+/g,
    "_"
  );
}
function numeric(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
export function deterministicInterpretation(
  input: SelfUnderstandingInterpretationInput
): SelfUnderstandingInterpretation {
  const stable = input.status === "stable_candidate";
  const unstable = input.status === "unstable";
  const contradicted = input.status === "contradicted";
  const statementJa = contradicted
    ? `「${input.condition.groupA}」と「${input.outcome.label}」の関係は、現在の記録では反する例が多く、仮説を見直す必要があります。`
    : `「${input.condition.groupA}」の日は、「${input.outcome.label}」が${input.condition.groupB}の日より${input.statistics.difference >= 0 ? "高い" : "低い"}傾向${stable ? "が比較的安定して見られます" : "の兆しがあります"}。`;
  const uncertaintyJa = unstable
    ? "前半と後半で差の方向がそろっていないため、現在の記録では結果が不安定です。"
    : "ただし、記録数はまだ限られ、時間帯や予定の明確さなど別の条件が影響している可能性があります。";
  const fields = [input.condition.fieldKey, input.outcome.fieldKey];
  return {
    statementJa,
    plainExplanationJa: `${input.condition.groupA}の記録は${input.statistics.groupACount}件、${input.condition.groupB}の記録は${input.statistics.groupBCount}件でした。集計値はそれぞれ${numeric(input.statistics.groupAValue)}と${numeric(input.statistics.groupBValue)}で、差は${numeric(input.statistics.difference)}です。`,
    supportingExplanationJa: `この傾向と同じ方向の記録を${input.supportingEntries.length}件確認できます。`,
    contradictingExplanationJa: input.contradictingEntries.length
      ? `一方で、異なる方向の記録も${input.contradictingEntries.length}件あります。`
      : "明確な反証記録は少ないものの、反証がないことを意味しません。",
    uncertaintyJa,
    nextExperiment: {
      title: "小さな比較記録",
      durationDays: 7,
      action: `次の7日間、「${input.condition.label}」と「${input.outcome.label}」を同じ記録で確認します。`,
      fieldsToRecord: fields,
      successCondition: "両方の条件で少なくとも3件ずつ、同じ項目を記録する"
    },
    selfModelCandidateJa: `私は「${input.condition.label}」の条件で「${input.outcome.label}」が変わる可能性を、今後も記録で確かめる。`
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
  if (cohort !== candidate.cohortA.key && cohort !== candidate.cohortB.key) return "none";
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
  const midpoint = (candidate.cohortA.metricValue + candidate.cohortB.metricValue) / 2;
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
function interpretationErrors(
  input: SelfUnderstandingInterpretationInput,
  output: SelfUnderstandingInterpretation
) {
  const errors: string[] = [];
  const forbidden =
    /(ADHD|autism|autistic|depression|bipolar|diagnos|診断|障害|疾患|治療|服薬すべき|必ず|間違いなく)/i;
  const textValues = [
    output.statementJa,
    output.plainExplanationJa,
    output.supportingExplanationJa,
    output.contradictingExplanationJa,
    output.uncertaintyJa,
    output.nextExperiment?.title,
    output.nextExperiment?.action,
    output.nextExperiment?.successCondition,
    output.selfModelCandidateJa
  ];
  if (textValues.some((value) => typeof value !== "string" || !value.trim())) {
    errors.push("required_text_missing");
  }
  const text = textValues.filter((value): value is string => typeof value === "string").join(" ");
  if (forbidden.test(text)) errors.push("forbidden_claim");
  if (!/[\u3040-\u30ff\u3400-\u9fff]/.test(text)) errors.push("japanese_explanation_required");
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
    [...input.supportingEntries, ...input.contradictingEntries].map((entry) => entry.entryId)
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
      input.statistics.missingCount,
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
  input: SelfUnderstandingInterpretationInput,
  output: SelfUnderstandingInterpretation
) {
  return interpretationErrors(input, output).length === 0;
}
export async function interpretSelfUnderstanding(
  input: SelfUnderstandingInterpretationInput,
  provider?: SelfUnderstandingInterpretationProvider
): Promise<InterpretationResult> {
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
export function generateSelfUnderstanding(input: {
  parameters: CandidateParameter[];
  observations: CandidateObservation[];
  records: UnderstandingRecord[];
  allowedValues?: Record<string, Array<{ valueKey: string; labelJa: string }>>;
  now?: string;
  config?: Partial<SelfUnderstandingConfig>;
}): SelfUnderstandingHypothesis[] {
  const config = { ...DEFAULT_SELF_UNDERSTANDING_CONFIG, ...input.config };
  const candidates = generateHypothesisCandidates({
    parameters: input.parameters,
    observations: input.observations,
    allowedValues: input.allowedValues,
    now: input.now,
    config: { ...config, lookbackDays: 30 }
  });
  return candidates.slice(0, config.maximumCandidates).map((candidate) => {
    const conditionParameter = input.parameters.find(
      (item) => item.id === candidate.conditionParameterId
    );
    const outcomeParameter = input.parameters.find(
      (item) => item.id === candidate.outcomeParameterId
    );
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
    const missing: string[] = [];
    if (candidate.missingConditionCount) {
      missing.push(`条件値の欠損: ${candidate.missingConditionCount}件`);
    }
    if (candidate.missingOutcomeCount) {
      missing.push(`結果値の欠損: ${candidate.missingOutcomeCount}件`);
    }
    const names = labels(candidate, input.parameters);
    const status = statusFor(candidate, config, supporting.length, contradicting.length);
    const interpretationInput: SelfUnderstandingInterpretationInput = {
      candidateId: candidate.id,
      period: candidate.supportingPeriod,
      condition: {
        fieldKey: candidate.conditionParameterId,
        label: names.condition,
        groupA: candidate.cohortA.labelJa,
        groupB: candidate.cohortB.labelJa
      },
      outcome: { fieldKey: candidate.outcomeParameterId, label: names.outcome },
      statistics: {
        groupACount: candidate.cohortA.validSampleCount,
        groupBCount: candidate.cohortB.validSampleCount,
        groupAValue: candidate.cohortA.metricValue,
        groupBValue: candidate.cohortB.metricValue,
        difference: candidate.effectValue,
        missingCount: candidate.missingConditionCount + candidate.missingOutcomeCount,
        temporalStability: candidate.temporalStabilityStatus
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
        }))
    };
    const interpretation = deterministicInterpretation(interpretationInput);
    return {
      id: candidate.id,
      construct: constructFor(candidate),
      status,
      statusLabelJa: statusLabel(status),
      statement: interpretation.statementJa,
      period: candidate.supportingPeriod,
      supportingEntryIds: supporting,
      contradictingEntryIds: contradicting,
      dataShortage: missing,
      confidence: Math.round(candidate.candidateScore * 100) / 100,
      userReview: "pending",
      nextAction: interpretation.nextExperiment.action,
      selfModelCandidate: interpretation.selfModelCandidateJa,
      interpretation,
      interpretationInput,
      candidate
    };
  });
}
