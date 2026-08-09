export const SELF_UNDERSTANDING_SEMANTIC_ROLES = [
  "mood",
  "energy",
  "fatigue",
  "recovery",
  "sleep_duration",
  "sleep_quality",
  "time_of_day",
  "day_type",
  "social_context",
  "social_intensity",
  "environment",
  "noise_level",
  "task_clarity",
  "deadline_clarity",
  "start_delay",
  "initiation_difficulty",
  "continuation_difficulty",
  "focus",
  "ai_conversation_intensity",
  "switching_frequency",
  "active_duration",
  "completion",
  "satisfaction",
  "uncertainty",
  "decision_count",
  "avoidance",
  "self_rating",
  "observed_behavior",
  "other"
] as const;

export type SelfUnderstandingSemanticRole =
  (typeof SELF_UNDERSTANDING_SEMANTIC_ROLES)[number];
export type SemanticRoleSource =
  | "user"
  | "template_rule"
  | "ai_suggestion"
  | "legacy_inference";
export type SemanticRoleSuggestion = {
  fieldKey: string;
  semanticRole: SelfUnderstandingSemanticRole;
  confidence: number;
  reasonJa: string;
};
export type ResolvedSemanticRole =
  | { status: "confirmed"; role: SelfUnderstandingSemanticRole; source: "user" | "template_rule" | "ai_suggestion" }
  | { status: "safe_auto_inferred"; role: SelfUnderstandingSemanticRole; source: "legacy_inference" }
  | { status: "confirmation_required"; suggestedRole: SelfUnderstandingSemanticRole; reason: string }
  | { status: "unknown"; reason: string };

const roleSet = new Set<string>(SELF_UNDERSTANDING_SEMANTIC_ROLES);
const sensitiveReviewRoles = new Set<SelfUnderstandingSemanticRole>([
  "self_rating",
  "observed_behavior",
  "avoidance"
]);
const rolePatterns: Array<{
  role: SelfUnderstandingSemanticRole;
  pattern: RegExp;
}> = [
  { role: "sleep_duration", pattern: /(sleep.*duration|sleep.*hours|睡眠時間|睡眠.*長)/i },
  { role: "sleep_quality", pattern: /(sleep.*quality|睡眠の?質|熟睡)/i },
  { role: "time_of_day", pattern: /(time.*day|time_period|時間帯|朝|昼|夜)/i },
  { role: "day_type", pattern: /(day.*type|weekday|holiday|平日|休日)/i },
  { role: "social_intensity", pattern: /(social.*intensity|people.*count|人数|大人数)/i },
  { role: "social_context", pattern: /(social|interaction|is_alone|対人|交流|一人)/i },
  { role: "noise_level", pattern: /(noise|騒音|静か)/i },
  { role: "environment", pattern: /(environment|location|場所|環境)/i },
  { role: "task_clarity", pattern: /(task.*clarity|予定.*明確|作業.*明確|やること.*明確)/i },
  { role: "deadline_clarity", pattern: /(deadline|締切)/i },
  { role: "start_delay", pattern: /(start.*delay|開始.*時間|始めるまで)/i },
  { role: "initiation_difficulty", pattern: /(initiation|start.*difficulty|開始.*難|着手.*難)/i },
  {
    role: "continuation_difficulty",
    pattern: /(continuation|continue.*difficulty|継続.*難)/i
  },
  { role: "focus", pattern: /(focus|concentration|集中)/i },
  { role: "completion", pattern: /(completion|completed|完了|達成)/i },
  { role: "decision_count", pattern: /(decision.*count|判断.*数|決定.*数)/i },
  { role: "uncertainty", pattern: /(uncertainty|曖昧|不確実)/i },
  { role: "avoidance", pattern: /(avoidance|procrastination|回避|先延ばし)/i },
  { role: "recovery", pattern: /(recovery|refresh|回復|休息)/i },
  { role: "fatigue", pattern: /(fatigue|tired|疲労|疲れ)/i },
  { role: "energy", pattern: /(energy|活力|元気)/i },
  { role: "mood", pattern: /(mood|気分|感情)/i },
  { role: "satisfaction", pattern: /(satisfaction|満足)/i },
  { role: "self_rating", pattern: /(self.*rating|自己評価|主観評価)/i },
  { role: "observed_behavior", pattern: /(observed.*behavior|実際.*行動|行動記録)/i }
];

export function isSelfUnderstandingSemanticRole(
  value: unknown
): value is SelfUnderstandingSemanticRole {
  return typeof value === "string" && roleSet.has(value);
}

export function inferSemanticRole(input: {
  fieldKey: string;
  label: string;
  description?: string;
  templateTheme?: string;
}): SemanticRoleSuggestion {
  const source = [
    input.fieldKey,
    input.label,
    input.description ?? "",
    input.templateTheme ?? ""
  ].join(" ");
  const match = rolePatterns.find((item) => item.pattern.test(source));
  return {
    fieldKey: input.fieldKey,
    semanticRole: match?.role ?? "other",
    confidence: match ? 0.9 : 0.4,
    reasonJa: match
      ? "フィールド名、ラベル、説明に一致する定義済みルール"
      : "定義済みルールでは意味役割を特定できない"
  };
}

export function validateSemanticRoleSuggestion(
  input: unknown
): SemanticRoleSuggestion {
  if (!input || typeof input !== "object") {
    throw new Error("semantic_role_suggestion_invalid");
  }
  const suggestion = input as Partial<SemanticRoleSuggestion>;
  if (
    typeof suggestion.fieldKey !== "string" ||
    !isSelfUnderstandingSemanticRole(suggestion.semanticRole) ||
    typeof suggestion.confidence !== "number" ||
    !Number.isFinite(suggestion.confidence) ||
    suggestion.confidence < 0 ||
    suggestion.confidence > 1 ||
    typeof suggestion.reasonJa !== "string" ||
    !suggestion.reasonJa.trim()
  ) {
    throw new Error("semantic_role_suggestion_invalid");
  }
  return suggestion as SemanticRoleSuggestion;
}

export function semanticRoleNeedsConfirmation(input: {
  suggestion: SemanticRoleSuggestion;
  sensitivity?: "normal" | "sensitive" | "highly_sensitive";
  currentRole?: SelfUnderstandingSemanticRole;
}): boolean {
  return (
    input.suggestion.confidence < 0.85 ||
    sensitiveReviewRoles.has(input.suggestion.semanticRole) ||
    input.sensitivity === "sensitive" ||
    input.sensitivity === "highly_sensitive" ||
    (input.currentRole !== undefined &&
      input.currentRole !== input.suggestion.semanticRole)
  );
}

export function canAutoApplySemanticRole(input: {
  suggestion: SemanticRoleSuggestion;
  sensitivity?: "normal" | "sensitive" | "highly_sensitive";
  currentRole?: SelfUnderstandingSemanticRole;
}): boolean {
  return !semanticRoleNeedsConfirmation(input);
}

export function resolveSemanticRole(input: {
  fieldKey: string;
  label: string;
  description?: string;
  templateTheme?: string;
  storedRole?: unknown;
  storedSource?: unknown;
  confirmed?: boolean;
  confidence?: number;
  sensitivity?: "normal" | "sensitive" | "highly_sensitive";
}): ResolvedSemanticRole {
  if (isSelfUnderstandingSemanticRole(input.storedRole)) {
    const suggestion = {
      fieldKey: input.fieldKey,
      semanticRole: input.storedRole,
      confidence: input.confidence ?? 0,
      reasonJa: "stored semantic role"
    };
    if (!input.confirmed) {
      return { status: "confirmation_required", suggestedRole: input.storedRole, reason: "semantic_role_confirmation_required" };
    }
    const source = input.storedSource;
    if (source === "user" || source === "template_rule" || source === "ai_suggestion") {
      return { status: "confirmed", role: input.storedRole, source };
    }
    return { status: "confirmation_required", suggestedRole: input.storedRole, reason: "semantic_role_source_invalid" };
  }
  const suggestion = inferSemanticRole(input);
  if (canAutoApplySemanticRole({ suggestion, sensitivity: input.sensitivity }) && suggestion.semanticRole !== "other") {
    return { status: "safe_auto_inferred", role: suggestion.semanticRole, source: "legacy_inference" };
  }
  return suggestion.semanticRole === "other"
    ? { status: "unknown", reason: "semantic_role_unknown" }
    : { status: "confirmation_required", suggestedRole: suggestion.semanticRole, reason: "semantic_role_confirmation_required" };
}

export function suggestSemanticRolesForTemplate(input: {
  theme: string;
  description?: string;
  fields: Array<{
    fieldKey: string;
    label: string;
    description?: string;
    sensitivity?: "normal" | "sensitive" | "highly_sensitive";
    currentRole?: SelfUnderstandingSemanticRole;
  }>;
}) {
  return input.fields.map((field) => {
    const suggestion = inferSemanticRole({
      fieldKey: field.fieldKey,
      label: field.label,
      description: [field.description ?? "", input.description ?? ""].join(" "),
      templateTheme: input.theme
    });
    return {
      ...suggestion,
      requiresConfirmation: semanticRoleNeedsConfirmation({
        suggestion,
        sensitivity: field.sensitivity,
        currentRole: field.currentRole
      })
    };
  });
}

export type SemanticFieldCompatibility = {
  semanticRole?: SelfUnderstandingSemanticRole;
  valueType: string;
  minimum?: number;
  maximum?: number;
  optionKeys?: string[];
  sensitivity: string;
  mergeAllowed: boolean;
};

export function canMergeSemanticFields(
  left: SemanticFieldCompatibility,
  right: SemanticFieldCompatibility
): boolean {
  if (
    !left.mergeAllowed ||
    !right.mergeAllowed ||
    !left.semanticRole ||
    left.semanticRole !== right.semanticRole ||
    left.valueType !== right.valueType ||
    left.sensitivity !== right.sensitivity
  ) {
    return false;
  }
  if (["integer", "number", "scale", "duration_seconds"].includes(left.valueType)) {
    return left.minimum === right.minimum && left.maximum === right.maximum;
  }
  if (["choice", "multi_choice"].includes(left.valueType)) {
    return (
      JSON.stringify([...(left.optionKeys ?? [])].sort()) ===
      JSON.stringify([...(right.optionKeys ?? [])].sort())
    );
  }
  return true;
}

export function semanticGroupIdFor(input: {
  semanticRole: SelfUnderstandingSemanticRole;
  valueType: string;
  scaleFingerprint: string;
  sensitivity: string;
}): string {
  const value = `${input.semanticRole}|${input.valueType}|${input.scaleFingerprint}|${input.sensitivity}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `semantic_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
