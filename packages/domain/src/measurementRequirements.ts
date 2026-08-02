import type { IntegrationTemplateRequestV1 } from "personal-context-studio/integration-contracts";

export const MEASUREMENT_SEMANTIC_ROLES = [
  "task_clarity", "deadline_clarity", "start_delay", "initiation_difficulty",
  "continuation_difficulty", "focus", "completion", "energy", "fatigue",
  "mood", "sleep_duration", "sleep_quality", "social_context", "environment",
  "noise_level", "satisfaction", "uncertainty", "avoidance"
] as const;
export type MeasurementSemanticRole = (typeof MEASUREMENT_SEMANTIC_ROLES)[number];
export type MeasurementValueType = IntegrationTemplateRequestV1["requestedFields"][number]["valueType"];
export type MeasurementAnalysisUsage = "condition" | "outcome" | "both";
export type CollectionTiming = "task_start" | "before_activity" | "during_activity" | "after_activity" | "daily" | "follow_up";

export type HypothesisMeasurementSpec = {
  hypothesisId: string;
  purpose: string;
  recommendedDurationDays: number;
  minimumObservations: number;
  minimumPerGroup: number;
  requirements: Array<{
    semanticRole: MeasurementSemanticRole;
    analysisUsage: MeasurementAnalysisUsage;
    valueType: MeasurementValueType;
    minimum?: number;
    maximum?: number;
    unit?: string;
    allowedValues?: Array<{ key: string; label: string }>;
    required: boolean;
    collectionTiming: CollectionTiming;
  }>;
};

export type MeasurementRequirementInput = {
  hypothesisId: string;
  purpose: string;
  durationDays?: number;
  minimumObservations?: number;
  minimumPerGroup?: number;
  requirements: Array<{
    semanticRole: string;
    analysisUsage: string;
    valueType: string;
    minimum?: number;
    maximum?: number;
    unit?: string;
    allowedValues?: Array<{ key: string; label: string }>;
    required?: boolean;
    collectionTiming?: string;
  }>;
};

const roleSet = new Set<string>(MEASUREMENT_SEMANTIC_ROLES);
const valueTypes = new Set<string>(["text", "long_text", "boolean", "single_choice", "multi_choice", "number", "integer", "date", "datetime", "duration_minutes", "scale"]);
const usages = new Set<string>(["condition", "outcome", "both"]);
const timings = new Set<string>(["task_start", "before_activity", "during_activity", "after_activity", "daily", "follow_up"]);

function fail(code: string): never { throw new Error(code); }

export function validateHypothesisMeasurementSpec(input: MeasurementRequirementInput): HypothesisMeasurementSpec {
  if (!input || typeof input !== "object" || !input.hypothesisId?.trim() || !input.purpose?.trim()) fail("measurement_spec_invalid");
  if (!Array.isArray(input.requirements) || input.requirements.length === 0) fail("measurement_requirements_required");
  const durationDays = input.durationDays ?? 14;
  const minimumObservations = input.minimumObservations ?? 10;
  const minimumPerGroup = input.minimumPerGroup ?? Math.max(1, Math.ceil(minimumObservations / 2));
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) fail("measurement_duration_invalid");
  if (!Number.isInteger(minimumObservations) || minimumObservations < 2 || minimumObservations > 10_000) fail("measurement_minimum_invalid");
  if (!Number.isInteger(minimumPerGroup) || minimumPerGroup < 1 || minimumPerGroup > 10_000) fail("measurement_group_minimum_invalid");
  const seen = new Set<string>();
  const requirements = input.requirements.map((item) => {
    if (!roleSet.has(item.semanticRole) || seen.has(item.semanticRole)) fail("measurement_semantic_role_invalid");
    seen.add(item.semanticRole);
    if (!usages.has(item.analysisUsage) || !valueTypes.has(item.valueType) || !timings.has(item.collectionTiming ?? "")) fail("measurement_requirement_contract_invalid");
    const minimum = item.minimum;
    const maximum = item.maximum;
    if ((minimum !== undefined && !Number.isFinite(minimum)) || (maximum !== undefined && !Number.isFinite(maximum)) || (minimum !== undefined && maximum !== undefined && minimum > maximum)) fail("measurement_range_invalid");
    if (["number", "integer", "scale", "duration_minutes"].includes(item.valueType) && minimum === undefined && maximum === undefined) fail("measurement_numeric_range_required");
    if (["single_choice", "multi_choice"].includes(item.valueType) && (!item.allowedValues?.length || new Set(item.allowedValues.map((value) => value.key)).size !== item.allowedValues.length)) fail("measurement_choices_required");
    return { semanticRole: item.semanticRole as MeasurementSemanticRole, analysisUsage: item.analysisUsage as MeasurementAnalysisUsage, valueType: item.valueType as MeasurementValueType, ...(minimum === undefined ? {} : { minimum }), ...(maximum === undefined ? {} : { maximum }), ...(item.unit === undefined ? {} : { unit: item.unit }), ...(item.allowedValues === undefined ? {} : { allowedValues: item.allowedValues }), required: item.required !== false, collectionTiming: item.collectionTiming as CollectionTiming };
  });
  return { hypothesisId: input.hypothesisId, purpose: input.purpose.trim(), recommendedDurationDays: durationDays, minimumObservations, minimumPerGroup, requirements };
}

const defaultLabel: Record<MeasurementSemanticRole, string> = {
  task_clarity: "予定・作業の明確さ", deadline_clarity: "締切の明確さ", start_delay: "作業開始までの時間", initiation_difficulty: "作業開始の難しさ", continuation_difficulty: "作業継続の難しさ", focus: "集中度", completion: "完了状態", energy: "エネルギー", fatigue: "疲労", mood: "気分", sleep_duration: "睡眠時間", sleep_quality: "睡眠の質", social_context: "対人状況", environment: "環境", noise_level: "騒音", satisfaction: "満足度", uncertainty: "不確実さ", avoidance: "回避したい気持ち"
};
const defaultQuestion: Record<MeasurementSemanticRole, string> = {
  task_clarity: "始める内容はどの程度明確でしたか？", deadline_clarity: "締切や期限はどの程度明確でしたか？", start_delay: "始めようと思ってから実際に始めるまで何分でしたか？", initiation_difficulty: "作業を始めるのはどの程度難しかったですか？", continuation_difficulty: "作業を続けるのはどの程度難しかったですか？", focus: "集中できた程度を選んでください。", completion: "活動の完了状態を選んでください。", energy: "現在のエネルギーを選んでください。", fatigue: "現在の疲労感を選んでください。", mood: "現在の気分を選んでください。", sleep_duration: "昨夜の睡眠時間を入力してください。", sleep_quality: "昨夜の睡眠の質を選んでください。", social_context: "そのときの対人状況を選んでください。", environment: "そのときの環境を選んでください。", noise_level: "そのときの騒音の程度を選んでください。", satisfaction: "活動への満足度を選んでください。", uncertainty: "そのときの不確実さを選んでください。", avoidance: "避けたい気持ちはどの程度ありましたか？"
};

export function resolveMeasurementRequirements(input: MeasurementRequirementInput): HypothesisMeasurementSpec {
  const spec = validateHypothesisMeasurementSpec(input);
  return { ...spec, requirements: [...spec.requirements].sort((left, right) => left.semanticRole.localeCompare(right.semanticRole)) };
}

const fieldAliases: Record<string, MeasurementSemanticRole> = {
  energy_level: "energy", mood_valence: "mood", completed: "completion", completion_status: "completion",
  activity_type: "environment", activity_category: "environment", start_delay_minutes: "start_delay",
  task_difficulty: "initiation_difficulty", sleep_minutes: "sleep_duration"
};
const catalogRanges: Partial<Record<MeasurementSemanticRole, { valueType: string; minimum?: number; maximum?: number; unit?: string }>> = {
  task_clarity: { valueType: "scale", minimum: 1, maximum: 5 }, deadline_clarity: { valueType: "scale", minimum: 1, maximum: 5 },
  start_delay: { valueType: "duration_minutes", minimum: 0, maximum: 60, unit: "minutes" }, initiation_difficulty: { valueType: "scale", minimum: 1, maximum: 5 },
  continuation_difficulty: { valueType: "scale", minimum: 1, maximum: 5 }, focus: { valueType: "scale", minimum: 1, maximum: 5 },
  energy: { valueType: "scale", minimum: 1, maximum: 5 }, fatigue: { valueType: "scale", minimum: 1, maximum: 5 }, mood: { valueType: "scale", minimum: 1, maximum: 5 },
  sleep_duration: { valueType: "duration_minutes", minimum: 0, maximum: 1440, unit: "minutes" }, sleep_quality: { valueType: "scale", minimum: 1, maximum: 5 },
  satisfaction: { valueType: "scale", minimum: 1, maximum: 5 }, uncertainty: { valueType: "scale", minimum: 1, maximum: 5 }, avoidance: { valueType: "scale", minimum: 1, maximum: 5 }
};

function semanticRoleForField(field: string): MeasurementSemanticRole {
  const role = fieldAliases[field] ?? field;
  if (!roleSet.has(role)) fail(`hypothesis_spec_semantic_role_unknown:${field}`);
  return role as MeasurementSemanticRole;
}

function optionValues(value: unknown): Array<{ key: string; label: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item) => typeof item === "string" || typeof item === "number").map((item) => ({ key: String(item), label: String(item) }));
  return values.length ? values : undefined;
}

export function deriveMeasurementRequirementsFromHypothesis(input: { hypothesisId: string; spec: { scope: Array<{ field: string; operator: string; value: unknown }>; cohorts: Array<{ conditions: Array<{ field: string; operator: string; value: unknown }> }>; outcome: { field: string; metric: string; positiveValues?: unknown[] }; evaluationPolicy: { windowDays: number; minimumSamplesPerCohort: number } }; purpose: string }): HypothesisMeasurementSpec {
  const fields = new Map<string, { role: MeasurementSemanticRole; usage: MeasurementAnalysisUsage; operator?: string; value?: unknown }>();
  const add = (condition: { field: string; operator: string; value: unknown }, usage: MeasurementAnalysisUsage) => {
    const current = fields.get(condition.field);
    fields.set(condition.field, { role: semanticRoleForField(condition.field), usage: current?.usage === "outcome" || usage === "both" ? "both" : current?.usage === "condition" ? "condition" : usage, operator: condition.operator, value: condition.value });
  };
  for (const condition of input.spec.scope ?? []) add(condition, "condition");
  for (const cohort of input.spec.cohorts ?? []) for (const condition of cohort.conditions ?? []) add(condition, "condition");
  const outcomeRole = semanticRoleForField(input.spec.outcome.field);
  const outcome = fields.get(input.spec.outcome.field);
  fields.set(input.spec.outcome.field, { role: outcomeRole, usage: outcome?.usage === "condition" ? "both" : "outcome", operator: outcome?.operator, value: outcome?.value });
  const requirements = [...fields.values()].map((item) => {
    const catalog = catalogRanges[item.role] ?? { valueType: "number" };
    const options = item.role === outcomeRole && input.spec.outcome.metric === "binary_rate_difference" ? optionValues(input.spec.outcome.positiveValues) : optionValues(item.value);
    const valueType = options ? "single_choice" : catalog.valueType;
    return { semanticRole: item.role, analysisUsage: item.usage, valueType, ...(options ? { allowedValues: options } : {}), ...(catalog.minimum === undefined ? {} : { minimum: catalog.minimum }), ...(catalog.maximum === undefined ? {} : { maximum: catalog.maximum }), ...(catalog.unit ? { unit: catalog.unit } : {}), required: true, collectionTiming: "task_start" as const };
  });
  return validateHypothesisMeasurementSpec({ hypothesisId: input.hypothesisId, purpose: input.purpose, durationDays: input.spec.evaluationPolicy.windowDays, minimumObservations: input.spec.evaluationPolicy.minimumSamplesPerCohort * 2, minimumPerGroup: input.spec.evaluationPolicy.minimumSamplesPerCohort, requirements });
}

export function buildIntegrationTemplateRequest(spec: HypothesisMeasurementSpec, now = new Date().toISOString()): IntegrationTemplateRequestV1 {
  return {
    schemaVersion: "pcs-integration-template-request-v1",
    id: `metheory_${spec.hypothesisId}_${spec.requirements.map((item) => item.semanticRole).join("_")}`.slice(0, 240),
    sourceSystem: "metheory",
    sourceReferenceId: spec.hypothesisId,
    title: `仮説検証: ${spec.purpose}`,
    purpose: spec.purpose,
    durationDays: spec.recommendedDurationDays,
    minimumObservations: spec.minimumObservations,
    minimumPerGroup: spec.minimumPerGroup,
    requestedFields: spec.requirements.map((item) => ({ fieldKey: item.semanticRole, label: defaultLabel[item.semanticRole], valueType: item.valueType, required: item.required, ...(item.allowedValues ? { options: item.allowedValues } : {}), reason: item.analysisUsage, ...(item.minimum === undefined ? {} : { minimum: item.minimum }), ...(item.maximum === undefined ? {} : { maximum: item.maximum }), ...(item.unit === undefined ? {} : { unit: item.unit }), semanticRole: item.semanticRole, analysisUsage: item.analysisUsage, collectionTiming: item.collectionTiming, questionText: defaultQuestion[item.semanticRole], sharingDefault: "purpose_only", sensitivity: "normal" } as IntegrationTemplateRequestV1["requestedFields"][number] & Record<string, unknown>)),
    createdAt: now
  } as IntegrationTemplateRequestV1;
}
