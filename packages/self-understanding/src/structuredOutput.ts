import type { SelfUnderstandingInterpretationInputV2, SelfUnderstandingInterpretation } from "./index.ts";

export const SELF_UNDERSTANDING_INTERPRETATION_SCHEMA_VERSION = "SelfUnderstandingInterpretationV3" as const;

export type SelfUnderstandingInterpretationV3 = SelfUnderstandingInterpretation & {
  schemaVersion: typeof SELF_UNDERSTANDING_INTERPRETATION_SCHEMA_VERSION;
};

export const selfUnderstandingInterpretationV3Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://metheory.local/schemas/self-understanding-interpretation-v3.json",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "statementJa", "constructExplanationJa", "plainExplanationJa", "supportingExplanationJa", "contradictingExplanationJa", "alternativeExplanationJa", "uncertaintyJa", "tendencyScopeExplanationJa", "nextExperiment", "selfModelCandidateJa"],
  properties: {
    schemaVersion: { const: SELF_UNDERSTANDING_INTERPRETATION_SCHEMA_VERSION },
    statementJa: { type: "string", minLength: 1, maxLength: 500 },
    constructExplanationJa: { type: "string", minLength: 1, maxLength: 1000 },
    plainExplanationJa: { type: "string", minLength: 1, maxLength: 1000 },
    supportingExplanationJa: { type: "string", minLength: 1, maxLength: 1000 },
    contradictingExplanationJa: { type: "string", minLength: 1, maxLength: 1000 },
    alternativeExplanationJa: { type: "string", minLength: 1, maxLength: 1000 },
    uncertaintyJa: { type: "string", minLength: 1, maxLength: 1000 },
    tendencyScopeExplanationJa: { type: "string", minLength: 1, maxLength: 1000 },
    nextExperiment: {
      type: "object",
      additionalProperties: false,
      required: ["title", "durationDays", "action", "fieldsToRecord", "comparisonPlan", "successCondition"],
      properties: {
        title: { type: "string", minLength: 1, maxLength: 200 },
        durationDays: { type: "integer", minimum: 7, maximum: 14 },
        action: { type: "string", minLength: 1, maxLength: 1000 },
        fieldsToRecord: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", minLength: 1, maxLength: 100 } },
        comparisonPlan: { type: "string", minLength: 1, maxLength: 1000 },
        successCondition: { type: "string", minLength: 1, maxLength: 1000 }
      }
    },
    selfModelCandidateJa: { type: "string", minLength: 1, maxLength: 500 }
  }
} as const;

type ValidationContext = { input: SelfUnderstandingInterpretationInputV2 };

function parseOutput(output: unknown): unknown {
  if (typeof output !== "string") return output;
  try { return JSON.parse(output); } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textFields(output: Record<string, unknown>): string[] {
  return ["statementJa", "constructExplanationJa", "plainExplanationJa", "supportingExplanationJa", "contradictingExplanationJa", "alternativeExplanationJa", "uncertaintyJa", "tendencyScopeExplanationJa", "selfModelCandidateJa"]
    .map((key) => output[key]).filter((value): value is string => typeof value === "string");
}

export function validateSelfUnderstandingStructuredOutput(output: unknown, context: ValidationContext): { valid: boolean; errors: string[]; value?: SelfUnderstandingInterpretationV3 } {
  const parsed = parseOutput(output);
  const errors: string[] = [];
  if (!isRecord(parsed)) return { valid: false, errors: ["invalid_json"] };
  const allowed = new Set(["schemaVersion", "statementJa", "constructExplanationJa", "plainExplanationJa", "supportingExplanationJa", "contradictingExplanationJa", "alternativeExplanationJa", "uncertaintyJa", "tendencyScopeExplanationJa", "nextExperiment", "selfModelCandidateJa"]);
  if (Object.keys(parsed).some((key) => !allowed.has(key))) errors.push("unknown_output_field");
  if (parsed.schemaVersion !== SELF_UNDERSTANDING_INTERPRETATION_SCHEMA_VERSION) errors.push("schema_version_mismatch");
  for (const key of ["statementJa", "constructExplanationJa", "plainExplanationJa", "supportingExplanationJa", "contradictingExplanationJa", "alternativeExplanationJa", "uncertaintyJa", "tendencyScopeExplanationJa", "selfModelCandidateJa"]) {
    const value = parsed[key];
    if (typeof value !== "string" || !value.trim()) errors.push("required_text_missing");
    else if (value.length > (key === "statementJa" || key === "selfModelCandidateJa" ? 500 : 1000)) errors.push("text_too_long");
  }
  const experiment = parsed.nextExperiment;
  if (!isRecord(experiment)) errors.push("next_experiment_invalid");
  else {
    const experimentKeys = new Set(["title", "durationDays", "action", "fieldsToRecord", "comparisonPlan", "successCondition"]);
    if (Object.keys(experiment).some((key) => !experimentKeys.has(key))) errors.push("unknown_experiment_field");
    if (!Number.isInteger(experiment.durationDays) || Number(experiment.durationDays) < 7 || Number(experiment.durationDays) > 14) errors.push("invalid_experiment_duration");
    if (!Array.isArray(experiment.fieldsToRecord) || experiment.fieldsToRecord.length < 1 || experiment.fieldsToRecord.length > 4 || experiment.fieldsToRecord.some((field) => typeof field !== "string")) errors.push("invalid_experiment_fields");
    else if (experiment.fieldsToRecord.some((field) => ![context.input.condition.fieldKey, context.input.outcome.fieldKey].includes(field))) errors.push("unknown_field");
    for (const key of ["title", "action", "comparisonPlan", "successCondition"]) if (typeof experiment[key] !== "string" || !String(experiment[key]).trim()) errors.push("required_experiment_text_missing");
  }
  const text = textFields(parsed).join(" ");
  if (/(ADHD|autism|autistic|depression|bipolar|MBTI|診断|障害|疾患|病的|治療|服薬|受診|絶対|必ず|間違いなく|怠け|甘え|意志が弱|あなたのせい)/i.test(text)) errors.push("unsafe_language");
  const allowedEntryIds = new Set([...context.input.supportingEntries, ...context.input.contradictingEntries].map((entry) => entry.entryId));
  const mentionedEntryIds = text.match(/\bentry_[a-zA-Z0-9_-]+\b/g) ?? [];
  if (mentionedEntryIds.some((entryId) => !allowedEntryIds.has(entryId))) errors.push("unknown_entry_reference");
  if (errors.length) return { valid: false, errors: [...new Set(errors)] };
  return { valid: true, errors: [], value: parsed as unknown as SelfUnderstandingInterpretationV3 };
}

export function withInterpretationSchemaVersion(value: SelfUnderstandingInterpretation): SelfUnderstandingInterpretationV3 {
  return { ...value, schemaVersion: SELF_UNDERSTANDING_INTERPRETATION_SCHEMA_VERSION };
}
