export const CONDITION_OPERATORS = [
  "equals", "not_equals", "less_than", "less_than_or_equal",
  "greater_than", "greater_than_or_equal", "in", "not_in",
] as const;

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];
export type EvaluatorTemplate = "binary_rate_difference" | "numeric_mean_difference";
export type EvaluationResult = "insufficient_data" | "supports" | "challenges" | "inconclusive";

export interface Condition {
  field: string;
  operator: ConditionOperator;
  value: unknown;
}

export interface Cohort {
  key: string;
  conditions: Condition[];
}

export interface HypothesisSpec {
  schemaVersion: string;
  unit: "response";
  scope: Condition[];
  cohorts: [Cohort, Cohort];
  outcome: { field: string; metric: EvaluatorTemplate; positiveValues?: unknown[] };
  expectation: { relation: "cohort_a_greater_than_b" | "cohort_a_less_than_b"; minimumEffect: number };
  evaluationPolicy: {
    captureModes: Array<"momentary_observation" | "retrospective_entry">;
    acceptedSources: Array<"user_confirmed" | "system" | "ai_inferred">;
    minimumSamplesPerCohort: number;
    maximumCohortRatio: number;
    windowDays: number;
    excludeLowCertainty: boolean;
    maximumMissingRate: number;
  };
}

export function validateHypothesisSpec(input: unknown): HypothesisSpec {
  if (!input || typeof input !== "object") throw new Error("hypothesis_spec must be an object");
  const value = input as Record<string, any>;
  if (value.schemaVersion !== "1" || value.unit !== "response") throw new Error("unsupported hypothesis spec version or unit");
  if (!Array.isArray(value.cohorts) || value.cohorts.length !== 2) throw new Error("exactly two cohorts are required");
  const keys = value.cohorts.map((cohort: any) => cohort?.key);
  if (keys.some((key: unknown) => typeof key !== "string" || key.length === 0) || new Set(keys).size !== 2) throw new Error("cohort keys must be unique and non-empty");
  const validateConditions = (conditions: unknown, label: string) => {
    if (!Array.isArray(conditions) || conditions.length === 0) throw new Error(`${label} conditions are required`);
    for (const condition of conditions) {
      if (!condition || typeof condition.field !== "string" || !condition.field) throw new Error(`${label} condition field is required`);
      if (!CONDITION_OPERATORS.includes(condition.operator)) throw new Error(`unknown condition operator: ${condition.operator}`);
      if (["in", "not_in"].includes(condition.operator) && !Array.isArray(condition.value)) throw new Error(`${condition.operator} requires an array value`);
    }
  };
  validateConditions(value.scope, "scope");
  value.cohorts.forEach((cohort: any, index: number) => validateConditions(cohort.conditions, `cohort ${index}`));
  if (!value.outcome?.field || !["binary_rate_difference", "numeric_mean_difference"].includes(value.outcome.metric)) throw new Error("unsupported outcome metric or empty outcome field");
  if (value.outcome.metric === "binary_rate_difference" && !Array.isArray(value.outcome.positiveValues)) throw new Error("binary rate requires positiveValues");
  if (!value.expectation || !["cohort_a_greater_than_b", "cohort_a_less_than_b"].includes(value.expectation.relation)) throw new Error("unsupported expectation relation");
  if (typeof value.expectation.minimumEffect !== "number" || value.expectation.minimumEffect < 0) throw new Error("minimumEffect must be non-negative");
  const policy = value.evaluationPolicy;
  if (!policy || !Array.isArray(policy.captureModes) || !Array.isArray(policy.acceptedSources)) throw new Error("evaluation policy is required");
  if (!Number.isInteger(policy.minimumSamplesPerCohort) || policy.minimumSamplesPerCohort <= 0) throw new Error("minimumSamplesPerCohort must be positive");
  if (typeof policy.maximumCohortRatio !== "number" || policy.maximumCohortRatio < 1) throw new Error("maximumCohortRatio must be at least 1");
  if (typeof policy.maximumMissingRate !== "number" || policy.maximumMissingRate < 0 || policy.maximumMissingRate > 1) throw new Error("maximumMissingRate must be between 0 and 1");
  if (!Number.isInteger(policy.windowDays) || policy.windowDays <= 0) throw new Error("windowDays must be positive");
  return value as HypothesisSpec;
}
