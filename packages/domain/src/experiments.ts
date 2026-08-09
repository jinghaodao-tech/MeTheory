import { EVIDENCE_POLICY } from "./evidencePolicy.ts";
import { evaluateExperimentDeterministic } from "./experimentEvaluation.ts";
import type { SensitivitySummary } from "./sensitivity.ts";
import type { SignificanceMethod } from "./significance.ts";

export type { SensitivitySummary } from "./sensitivity.ts";

export const EXPERIMENT_DRAFT_STATUSES = ["draft", "accepted", "rejected"] as const;
export type ExperimentDraftStatus = (typeof EXPERIMENT_DRAFT_STATUSES)[number];

export const EXPERIMENT_STATUSES = [
  "draft",
  "ready",
  "active",
  "paused",
  "completed",
  "evaluated",
  "archived",
  "cancelled",
  "insufficient_data",
  "invalid"
] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export type ExperimentKind = "condition_comparison" | "behavioral_intervention" | "observation_only";
export type ComparisonType = "condition_difference" | "before_after" | "with_without_intervention";
export type EvaluationStatus = "supported" | "challenged" | "mixed" | "inconclusive" | "insufficient_data" | "invalid";

export type ExperimentSchedule = {
  timezone: string;
  frequency: "daily" | "multiple_daily" | "on_activity" | "manual";
  preferredLocalTimes: string[];
  quietHours?: { start: string; end: string };
};

export type StopCondition = {
  kind: "burden" | "distress" | "privacy" | "missed_days" | "manual";
  description: string;
  threshold?: number;
};

export type ExperimentDraft = {
  id: string;
  sourceCandidateId: string;
  title: string;
  statement: string;
  rationale: string;
  kind: ExperimentKind;
  comparisonType: ComparisonType;
  groupAKey: string;
  groupBKey: string;
  expectedDirection: "a_greater" | "b_greater";
  minimumEffect: number;
  targetOutcomeParameter: string;
  outcomeDefinition?: { parameterId: string; valueType: string; minimum?: number; maximum?: number; allowedValues?: string[] };
  conditionParameters: string[];
  requiredParameters: string[];
  durationDays: number;
  minimumObservations: number;
  minimumPerGroup: number;
  suggestedSchedule: ExperimentSchedule;
  stopConditions: StopCondition[];
  safetyNotes: string[];
  status: ExperimentDraftStatus;
  createdAt: string;
};

export type Experiment = {
  id: string;
  userId: string;
  draftId: string;
  sourceCandidateId: string;
  title: string;
  statement: string;
  kind: ExperimentKind;
  comparisonType: ComparisonType;
  groupAKey?: string;
  groupBKey?: string;
  expectedDirection?: "a_greater" | "b_greater";
  status: ExperimentStatus;
  startedAt: string | null;
  endedAt: string | null;
  durationDays: number;
  minimumObservations: number;
  minimumPerGroup: number;
  schedule: ExperimentSchedule;
  stopConditions: StopCondition[];
  safetyNotes: string[];
  createdAt: string;
};

export type ExperimentObservation = {
  id: string;
  experimentId: string;
  idempotencyKey?: string;
  episodeId?: string;
  observedAt: string;
  groupKey: string;
  outcome: number;
  conditionValues?: Record<string, unknown>;
  source: "checkin" | "manual" | "import";
  eligible: boolean;
  note?: string;
};

export type DataQualitySummary = {
  eligibleCount: number;
  excludedCount: number;
  missingCount: number;
  groupImbalance: number;
  warnings: string[];
};


export type ExperimentEvaluation = {
  experimentId: string;
  status: EvaluationStatus;
  period: { startAt: string; endAt: string };
  observationCount: number;
  groupCounts: Array<{ key: string; count: number; mean: number }>;
  effectSummary: { groupA: string; groupB: string; difference: number | null; direction: "a_greater" | "b_greater" | "equal" | "unknown" };
  dataQuality: DataQualitySummary;
  supportingObservationIds: string[];
  contradictingObservationIds: string[];
  missingData: Array<{ groupKey: string; needed: number; reason: string }>;
  adherence?: { attempted: number; completed: number; rate: number; notImplementedCount: number; reasons: string[] };
  burden?: { averageMinutes?: number; skippedCount: number };
  alternativeExplanations: string[];
  sensitivitySummary: SensitivitySummary;
  nextOptions: Array<"collect_more" | "repeat_in_another_period" | "review_hypothesis" | "archive_experiment" | "pause_and_reduce_burden">;
  evaluatedAt: string;
  pValue: number | null;
  significanceAlpha: number;
  significanceMethod: SignificanceMethod | "not_evaluable";
};

export type CandidateForExperiment = {
  id: string;
  conditionParameterId: string;
  outcomeParameterId: string;
  conditionLabel: string;
  outcomeLabel: string;
  cohortAKey: string;
  cohortBKey: string;
  cohortALabel?: string;
  cohortBLabel?: string;
  effectValue: number;
  sampleCount: number;
  minimumPerGroup?: number;
  statement?: string;
};

const transitions: Record<ExperimentStatus, readonly ExperimentStatus[]> = {
  draft: ["ready", "cancelled", "invalid"],
  ready: ["active", "cancelled", "invalid"],
  active: ["paused", "completed", "cancelled", "insufficient_data", "invalid"],
  paused: ["active", "cancelled", "invalid"],
  completed: ["evaluated", "insufficient_data", "invalid"],
  evaluated: ["archived", "active", "invalid"],
  archived: [],
  cancelled: [],
  insufficient_data: ["active", "archived"],
  invalid: ["archived"]
};

export function canTransitionExperiment(from: ExperimentStatus, to: ExperimentStatus): boolean {
  return from === to || transitions[from].includes(to);
}

export function transitionExperiment(status: ExperimentStatus, next: ExperimentStatus): ExperimentStatus {
  if (!canTransitionExperiment(status, next) || status === next) {
    if (status === next) return status;
    throw new Error(`experiment_transition_invalid:${status}:${next}`);
  }
  return next;
}

function safePositiveInteger(value: number | undefined, fallback: number, maximum: number): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? Math.min(value ?? fallback, maximum) : fallback;
}

export function createExperimentDraftFromCandidate(input: {
  id: string;
  candidate: CandidateForExperiment;
  now?: string;
  durationDays?: number;
  minimumObservations?: number;
  timezone?: string;
}): ExperimentDraft {
  const now = input.now ?? new Date().toISOString();
  const candidate = input.candidate;
  const minimumPerGroup = Math.max(EVIDENCE_POLICY.minimumSamplesPerCohort, safePositiveInteger(candidate.minimumPerGroup, EVIDENCE_POLICY.minimumSamplesPerCohort, 1000));
  const minimumObservations = Math.max(minimumPerGroup * 2, safePositiveInteger(input.minimumObservations, 8, 5000));
  const title = `${candidate.conditionLabel}と${candidate.outcomeLabel}を確認する`;
  const statement = candidate.statement ?? `${candidate.conditionLabel}の条件によって${candidate.outcomeLabel}の記録に違いがある可能性を追加観測で確認する`;
  return {
    id: input.id,
    sourceCandidateId: candidate.id,
    title,
    statement,
    rationale: `現在の比較では${candidate.cohortALabel ?? candidate.cohortAKey}と${candidate.cohortBLabel ?? candidate.cohortBKey}の差が観測されています。別の記録で同じ傾向が見られるかを確認します。`,
    kind: "condition_comparison",
    comparisonType: "condition_difference",
    groupAKey: candidate.cohortAKey,
    groupBKey: candidate.cohortBKey,
    expectedDirection: candidate.effectValue >= 0 ? "a_greater" : "b_greater",
    minimumEffect: Math.max(EVIDENCE_POLICY.minimumAbsoluteEffect, Math.abs(Number.isFinite(candidate.effectValue) ? candidate.effectValue : 0)),
    targetOutcomeParameter: candidate.outcomeParameterId,
    conditionParameters: [candidate.conditionParameterId],
    requiredParameters: [candidate.conditionParameterId, candidate.outcomeParameterId],
    durationDays: safePositiveInteger(input.durationDays, 7, 90),
    minimumObservations,
    minimumPerGroup,
    suggestedSchedule: { timezone: input.timezone ?? "Asia/Tokyo", frequency: "daily", preferredLocalTimes: ["09:00", "13:00", "20:00"] },
    stopConditions: [
      { kind: "burden", description: "負担が大きいと感じたら一時停止する" },
      { kind: "privacy", description: "記録したくない情報が含まれそうなら回答しない" },
      { kind: "manual", description: "利用者がいつでも中止できる" }
    ],
    safetyNotes: ["診断や因果関係を示すものではありません", "回答はスキップできます", "Self Modelは自動更新されません"],
    status: "draft",
    createdAt: now
  };
}

export type CollectionRequirement = { parameterId: string; label: string; groupKey?: string; minimumSamples: number; askable: boolean; preferredSource: "user" | "system" | "device" | "external_app" };
export type DataCollectionPlan = {
  id: string;
  sourceAnalysisId: string;
  targetConstruct: string;
  requiredFields: CollectionRequirement[];
  currentCounts: Array<{ key: string; count: number }>;
  shortages: Array<{ key: string; needed: number; reason: string }>;
  estimatedMinimumDays: number;
  suggestedQuestions: Array<{ parameterId: string; text: string; reason: string }>;
  pcsTemplateRequest?: { theme: string; requiredFields: string[]; status: "draft" };
  status: "proposed" | "accepted" | "completed" | "cancelled";
};

export function buildDataCollectionPlan(input: {
  id: string;
  sourceAnalysisId: string;
  targetConstruct: string;
  requirements: CollectionRequirement[];
  counts: Record<string, number>;
  now?: string;
  includePcsTemplateRequest?: boolean;
}): DataCollectionPlan {
  const shortages = input.requirements.flatMap((requirement) => {
    const current = input.counts[requirement.parameterId] ?? 0;
    return current < requirement.minimumSamples ? [{ key: requirement.parameterId, needed: requirement.minimumSamples - current, reason: requirement.askable ? "ユーザー回答が必要" : "取得元からの値が必要" }] : [];
  });
  const askable = input.requirements.filter((requirement) => requirement.askable && shortages.some((shortage) => shortage.key === requirement.parameterId));
  const plan: DataCollectionPlan = {
    id: input.id,
    sourceAnalysisId: input.sourceAnalysisId,
    targetConstruct: input.targetConstruct,
    requiredFields: input.requirements,
    currentCounts: Object.entries(input.counts).map(([key, count]) => ({ key, count })),
    shortages,
    estimatedMinimumDays: Math.max(1, shortages.length ? Math.ceil(Math.max(...shortages.map((shortage) => shortage.needed)) / Math.max(1, askable.length)) : 0),
    suggestedQuestions: askable.map((requirement) => ({ parameterId: requirement.parameterId, text: `現在の「${requirement.label}」を記録してください。`, reason: "不足している必須パラメータを補うため" })),
    status: "proposed"
  };
  if (input.includePcsTemplateRequest && shortages.some((shortage) => input.requirements.find((requirement) => requirement.parameterId === shortage.key)?.preferredSource === "user")) {
    plan.pcsTemplateRequest = { theme: `仮説検証: ${input.targetConstruct}`, requiredFields: shortages.map((shortage) => shortage.key), status: "draft" };
  }
  return plan;
}

function mean(values: number[]): number { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }

function evaluateExperimentLegacy(input: {
  experimentId: string;
  observations: ExperimentObservation[];
  groupAKey: string;
  groupBKey: string;
  minimumPerGroup: number;
  minimumObservations: number;
  expectedDirection: "a_greater" | "b_greater";
  minimumEffect: number;
  kind?: ExperimentKind;
  evaluatedAt?: string;
  alternativeExplanations?: string[];
  outcomeScale?: { minimumValue: number; maximumValue: number };
}): ExperimentEvaluation {
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  const minimumPerGroup = Math.max(EVIDENCE_POLICY.minimumSamplesPerCohort, Number.isInteger(input.minimumPerGroup) ? input.minimumPerGroup : 0);
  const minimumObservations = Math.max(EVIDENCE_POLICY.minimumTotalSamples, minimumPerGroup * 2, Number.isInteger(input.minimumObservations) ? input.minimumObservations : 0);
  const minimumEffect = Math.max(EVIDENCE_POLICY.minimumAbsoluteEffect, Number.isFinite(input.minimumEffect) ? input.minimumEffect : 0);
  const eligible = input.observations.filter((observation) => observation.eligible && Number.isFinite(observation.outcome));
  const expectedDirectionValid = input.expectedDirection === "a_greater" || input.expectedDirection === "b_greater";
  const excludedCount = input.observations.length - eligible.length;
  const groupA = eligible.filter((observation) => observation.groupKey === input.groupAKey);
  const groupB = eligible.filter((observation) => observation.groupKey === input.groupBKey);
  const meanA = mean(groupA.map((observation) => observation.outcome));
  const meanB = mean(groupB.map((observation) => observation.outcome));
  const difference = groupA.length && groupB.length ? meanA - meanB : null;
  const exclusionRate = input.observations.length ? excludedCount / input.observations.length : 1;
  const direction = difference === null || difference === 0 ? difference === 0 ? "equal" : "unknown" : difference > 0 ? "a_greater" : "b_greater";
  const groupImbalance = Math.min(groupA.length, groupB.length) / Math.max(groupA.length, groupB.length, 1);
  const warnings: string[] = [];
  if (groupImbalance < 0.5) warnings.push("比較グループの記録数に偏りがあります");
  if (excludedCount > 0) warnings.push("一部の観測は品質条件を満たさないため除外されました");
  const missingData = [
    ...(groupA.length < input.minimumPerGroup ? [{ groupKey: input.groupAKey, needed: input.minimumPerGroup - groupA.length, reason: "グループAの記録不足" }] : []),
    ...(groupB.length < input.minimumPerGroup ? [{ groupKey: input.groupBKey, needed: input.minimumPerGroup - groupB.length, reason: "グループBの記録不足" }] : [])
  ];
  if (groupA.length < minimumPerGroup && !missingData.some((item) => item.groupKey === input.groupAKey)) missingData.push({ groupKey: input.groupAKey, needed: minimumPerGroup - groupA.length, reason: "group_a_samples_insufficient" });
  if (groupB.length < minimumPerGroup && !missingData.some((item) => item.groupKey === input.groupBKey)) missingData.push({ groupKey: input.groupBKey, needed: minimumPerGroup - groupB.length, reason: "group_b_samples_insufficient" });
  let status: EvaluationStatus;
  if (!expectedDirectionValid) status = "invalid";
  else if (!groupA.length || !groupB.length || eligible.length < minimumObservations || groupA.length < minimumPerGroup || groupB.length < minimumPerGroup || groupImbalance < EVIDENCE_POLICY.minimumSampleBalance || exclusionRate > EVIDENCE_POLICY.maximumMissingRate) status = "insufficient_data";
  else if (input.kind === "behavioral_intervention") {
    const attempted = eligible.filter((observation) => observation.conditionValues?.interventionAttempted !== undefined);
    const completed = attempted.filter((observation) => observation.conditionValues?.interventionAttempted === true);
    if (attempted.length < minimumObservations || completed.length / attempted.length < 0.5) status = "insufficient_data";
    else status = direction === input.expectedDirection && Math.abs(difference ?? 0) >= minimumEffect ? "supported" : direction !== input.expectedDirection && Math.abs(difference ?? 0) >= minimumEffect ? "challenged" : "inconclusive";
  } else if (direction === input.expectedDirection && Math.abs(difference ?? 0) >= minimumEffect) status = "supported";
  else if (direction !== "unknown" && direction !== "equal" && Math.abs(difference ?? 0) >= minimumEffect) status = "challenged";
  else status = "inconclusive";
  const supportIds = status === "supported" ? eligible.map((observation) => observation.id) : [];
  const contradictionIds = status === "challenged" ? eligible.map((observation) => observation.id) : [];
  const additional = Math.max(0, minimumPerGroup - Math.min(groupA.length, groupB.length));
  const sensitivity: SensitivitySummary = {
    conclusionChangeConditions: status === "supported" ? [`反対側のグループに${Math.max(1, additional)}件以上の記録が追加され、平均との差が${minimumEffect}未満になる場合`] : ["各グループの記録数と条件の偏りが変わる場合"],
    groupImbalanceWarnings: groupImbalance < 0.5 ? ["比較グループの件数差が大きいため結論は暫定的です"] : [],
    missingnessWarnings: excludedCount ? ["除外された観測の理由が偏っている場合、結果が変わる可能性があります"] : [],
    overlapWarnings: [],
    minimumAdditionalObservations: additional || undefined,
    explanation: status === "insufficient_data" ? "必要なグループ数に達していないため、結論はまだ出せません。" : "この説明は現在の決定論的な比較結果に対する感度情報で、因果関係を示しません。"
  };
  return {
    experimentId: input.experimentId,
    status,
    period: { startAt: input.observations[0]?.observedAt ?? evaluatedAt, endAt: input.observations.at(-1)?.observedAt ?? evaluatedAt },
    observationCount: eligible.length,
    groupCounts: [{ key: input.groupAKey, count: groupA.length, mean: meanA }, { key: input.groupBKey, count: groupB.length, mean: meanB }],
    effectSummary: { groupA: input.groupAKey, groupB: input.groupBKey, difference, direction },
    dataQuality: { eligibleCount: eligible.length, excludedCount, missingCount: input.observations.filter((observation) => !observation.eligible).length, groupImbalance, warnings },
    supportingObservationIds: supportIds,
    contradictingObservationIds: contradictionIds,
    missingData,
    alternativeExplanations: input.alternativeExplanations ?? ["記録された条件以外の要因が影響している可能性があります"],
    sensitivitySummary: sensitivity,
    nextOptions: status === "insufficient_data" ? ["collect_more", "pause_and_reduce_burden"] : status === "supported" || status === "challenged" ? ["review_hypothesis", "repeat_in_another_period", "archive_experiment"] : ["collect_more", "repeat_in_another_period"],
    evaluatedAt,
    pValue: null,
    significanceAlpha: EVIDENCE_POLICY.falsePositiveAlpha,
    significanceMethod: "not_evaluable"
  };
}

export function evaluateExperiment(input: Parameters<typeof evaluateExperimentLegacy>[0]): ExperimentEvaluation {
  return evaluateExperimentDeterministic(input);
}

export type HypothesisReviewReason = "already_knew" | "partly_fits" | "depends_on_context" | "interpretation_is_wrong" | "evidence_is_weak" | "not_useful" | "not_ready_to_test" | "too_burdensome" | "privacy_concern" | "other";

export function reviewReasonAction(reason: HypothesisReviewReason): { action: "lower_novelty" | "split_context" | "revise_wording" | "collect_more" | "suppress_similar" | "shorten_experiment" | "exclude_sensitive" | "record_only"; explanation: string } {
  const actions: Record<HypothesisReviewReason, { action: "lower_novelty" | "split_context" | "revise_wording" | "collect_more" | "suppress_similar" | "shorten_experiment" | "exclude_sensitive" | "record_only"; explanation: string }> = {
    already_knew: { action: "lower_novelty", explanation: "新規性を低く扱います" },
    partly_fits: { action: "record_only", explanation: "部分的に合うという評価を履歴に残します" },
    depends_on_context: { action: "split_context", explanation: "条件を分けて確認する候補にします" },
    interpretation_is_wrong: { action: "revise_wording", explanation: "表現の修正候補にします" },
    evidence_is_weak: { action: "collect_more", explanation: "追加の記録計画を提示します" },
    not_useful: { action: "suppress_similar", explanation: "類似候補を一定期間抑制します" },
    not_ready_to_test: { action: "record_only", explanation: "試験を始めず評価だけを保存します" },
    too_burdensome: { action: "shorten_experiment", explanation: "短い実験を提案します" },
    privacy_concern: { action: "exclude_sensitive", explanation: "該当する項目を実験対象から外します" },
    other: { action: "record_only", explanation: "自由記述とともに評価だけを保存します" }
  };
  return actions[reason];
}

export type SelfModelFreshnessStatus = "current" | "review_due" | "possibly_changed" | "unsupported_recently" | "retracted";

export function selfModelFreshness(input: { lastReviewedAt: string; reviewDueAt?: string; supportingEvidenceCount: number; contradictingEvidenceCount: number; now?: string; retracted?: boolean }): SelfModelFreshnessStatus {
  if (input.retracted) return "retracted";
  const now = Date.parse(input.now ?? new Date().toISOString());
  if (input.reviewDueAt && Date.parse(input.reviewDueAt) <= now) return "review_due";
  if (input.contradictingEvidenceCount > input.supportingEvidenceCount) return "possibly_changed";
  if (input.supportingEvidenceCount === 0) return "unsupported_recently";
  return "current";
}
