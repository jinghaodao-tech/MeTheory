export type StructuredValueSource = "user_entry" | "ai_extraction" | "activitywatch" | "baseline_self_perception" | "manual_import" | "experiment";
export type PrivacyLevel = "normal" | "sensitive" | "highly_sensitive" | "prohibited";
export type ValueProvenance = {
  source: StructuredValueSource;
  importedAt?: string;
  recordedAt: string;
  userConfirmed: boolean;
  originalReference?: string;
  transformVersion: string;
  privacyLevel: PrivacyLevel;
};
export function validateValueProvenance(value: ValueProvenance): string[] {
  const errors: string[] = [];
  if (!value.source || !value.recordedAt || !value.transformVersion) errors.push("provenance_required");
  if (!Number.isFinite(Date.parse(value.recordedAt))) errors.push("recorded_at_invalid");
  if (value.importedAt !== undefined && !Number.isFinite(Date.parse(value.importedAt))) errors.push("imported_at_invalid");
  if (value.privacyLevel === "prohibited") errors.push("prohibited_value");
  return errors;
}
