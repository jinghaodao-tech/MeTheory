import { randomUUID } from "node:crypto";
import type { ClassificationSource, SensitivityLevel } from "../../../packages/privacy/src/index.ts";

export type TemplateInputType = "text" | "number" | "boolean" | "choice" | "multi_choice" | "date" | "datetime" | "duration" | "scale";
export type TemplateValueType = "text" | "integer" | "number" | "boolean" | "choice" | "multi_choice" | "date" | "datetime" | "duration_seconds" | "scale";
export type TemplateField = { fieldKey: string; label: string; description?: string; inputType: TemplateInputType; valueType: TemplateValueType; required: boolean; displayOrder: number; options?: Array<{ key: string; label: string }>; minimum?: number; maximum?: number; unit?: string; sensitivity: "normal" | "sensitive"; sensitivityLevel?: SensitivityLevel; classificationSource?: ClassificationSource; prohibitedSecretRisk?: boolean; reason: string };
export type TemplateDraft = { theme: string; name: string; description: string; fields: TemplateField[] };
export type GeneratedTemplateDraft = TemplateDraft;
export type GenerateTemplateDraftInput = { userId: string; theme: string; purpose?: string; frequency?: string; answerTimeLimitSeconds?: number };
export type TemplateProviderKind = "mock" | "manual_chatgpt" | "openai" | "disabled";
export const TEMPLATE_PROMPT_VERSION = "template-v2";
export const templateDraftJsonSchema = { type: "object", additionalProperties: false, required: ["theme", "name", "description", "fields"], properties: { theme: { type: "string" }, name: { type: "string" }, description: { type: "string" }, fields: { type: "array", minItems: 1, maxItems: 12, items: { type: "object", additionalProperties: false, required: ["fieldKey", "label", "inputType", "valueType", "required", "displayOrder", "sensitivity", "reason"], properties: { fieldKey: { type: "string" }, label: { type: "string" }, description: { type: "string" }, inputType: { type: "string" }, valueType: { type: "string" }, required: { type: "boolean" }, displayOrder: { type: "integer" }, options: { type: "array" }, minimum: { type: "number" }, maximum: { type: "number" }, unit: { type: "string" }, sensitivity: { type: "string" }, sensitivityLevel: { type: "string", enum: ["normal", "sensitive", "highly_sensitive"] }, classificationSource: { type: "string", enum: ["ai_suggested", "user_selected", "system_rule"] }, prohibitedSecretRisk: { type: "boolean" }, reason: { type: "string" } } } } } } as const;
export function buildManualTemplatePrompt(input: GenerateTemplateDraftInput): string { return JSON.stringify({ instruction: "Return JSON only. Create a concise reusable Entry Template. Do not diagnose, infer medical facts, or include unnecessary personal data.", input, schema: templateDraftJsonSchema, rules: ["Use 1-12 fields", "Use unique snake_case fieldKey", "Include a reason for every field", "Mark sensitive fields explicitly"] }, null, 2); }
export function parseTemplateDraftJson(text: string): TemplateDraft { const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(); try { return validateTemplateDraft(JSON.parse(stripped)); } catch { throw new Error("template_generation_invalid_json"); } }

const keys = /^[a-z][a-z0-9_]{0,63}$/;
const compatible: Record<TemplateInputType, TemplateValueType[]> = { text: ["text"], number: ["integer", "number"], boolean: ["boolean"], choice: ["choice"], multi_choice: ["multi_choice"], date: ["date"], datetime: ["datetime"], duration: ["duration_seconds"], scale: ["scale", "integer", "number"] };
export function validateTemplateDraft(input: unknown): TemplateDraft {
  if (!input || typeof input !== "object") throw new Error("template_generation_invalid_schema");
  const draft = input as Partial<TemplateDraft>;
  if (typeof draft.theme !== "string" || !draft.theme.trim()) throw new Error("template_theme_required");
  if (typeof draft.name !== "string" || !draft.name.trim()) throw new Error("template_field_invalid");
  if (!Array.isArray(draft.fields) || draft.fields.length < 1 || draft.fields.length > 12) throw new Error("template_generation_invalid_schema");
  const seen = new Set<string>(); const orders = new Set<number>();
  const fields = draft.fields.map((raw) => {
    const field = raw as TemplateField;
    if (!keys.test(field.fieldKey) || seen.has(field.fieldKey) || !field.label?.trim() || !compatible[field.inputType]?.includes(field.valueType) || orders.has(field.displayOrder) || !Number.isInteger(field.displayOrder)) throw new Error("template_field_invalid");
    seen.add(field.fieldKey); orders.add(field.displayOrder);
    if ((field.inputType === "choice" || field.inputType === "multi_choice") && (!field.options?.length || new Set(field.options.map((o) => o.key)).size !== field.options.length)) throw new Error("template_field_invalid");
    if ((field.minimum !== undefined || field.maximum !== undefined) && (typeof field.minimum !== "number" || typeof field.maximum !== "number" || field.minimum > field.maximum)) throw new Error("template_field_invalid");
    return { ...field, description: field.description ?? "", required: Boolean(field.required), sensitivity: field.sensitivity === "sensitive" ? "sensitive" : "normal", sensitivityLevel: field.sensitivityLevel, classificationSource: field.classificationSource, prohibitedSecretRisk: field.prohibitedSecretRisk ?? false, reason: field.reason?.trim() || "テーマに沿った記録" };
  });
  return { theme: draft.theme.trim(), name: draft.name.trim(), description: typeof draft.description === "string" ? draft.description : "", fields: fields as TemplateField[] };
}
export function valueForField(field: TemplateField, value: unknown): unknown {
  if (value === undefined || value === null || value === "") { if (field.required) throw new Error("template_value_required"); return null; }
  if (field.valueType === "boolean" && typeof value !== "boolean") throw new Error("template_value_type_invalid");
  if (["integer", "number", "scale", "duration_seconds"].includes(field.valueType) && (typeof value !== "number" || !Number.isFinite(value) || (field.valueType === "integer" && !Number.isInteger(value)))) throw new Error("template_value_type_invalid");
  if (["text", "choice", "date", "datetime"].includes(field.valueType) && typeof value !== "string") throw new Error("template_value_type_invalid");
  if (field.valueType === "multi_choice" && (!Array.isArray(value) || value.some((v) => typeof v !== "string"))) throw new Error("template_value_type_invalid");
  if ((field.minimum !== undefined && Number(value) < field.minimum) || (field.maximum !== undefined && Number(value) > field.maximum)) throw new Error("template_value_out_of_range");
  if (["choice", "multi_choice"].includes(field.valueType)) { const values = Array.isArray(value) ? value : [value]; if (values.some((v) => !field.options?.some((o) => o.key === v))) throw new Error("template_value_not_allowed"); }
  return value;
}
export interface TemplateGenerationProvider { generateTemplateDraft(input: GenerateTemplateDraftInput): Promise<GeneratedTemplateDraft>; }
export class ProviderUnavailableError extends Error { constructor() { super("template_generation_provider_unavailable"); } }
export class MockTemplateGenerationProvider implements TemplateGenerationProvider { private readonly draft?: TemplateDraft; constructor(draft?: TemplateDraft) { this.draft = draft; } async generateTemplateDraft(input: GenerateTemplateDraftInput) { return validateTemplateDraft(this.draft ?? { theme: input.theme, name: `${input.theme}の記録`, description: `${input.theme}を振り返るための記録`, fields: [{ fieldKey: "feeling", label: "今の感覚", inputType: "scale", valueType: "scale", required: true, displayOrder: 1, minimum: 1, maximum: 5, sensitivity: "normal", reason: "テーマの状態を確認する" }] }); } }
export class UnavailableTemplateGenerationProvider implements TemplateGenerationProvider { async generateTemplateDraft(): Promise<GeneratedTemplateDraft> { throw new ProviderUnavailableError(); } }
export class DisabledTemplateGenerationProvider extends UnavailableTemplateGenerationProvider {}
export class ManualChatGPTTemplateProvider implements TemplateGenerationProvider { async generateTemplateDraft(): Promise<GeneratedTemplateDraft> { throw new Error("template_manual_input_required"); } buildPrompt(input: GenerateTemplateDraftInput) { return buildManualTemplatePrompt(input); } parseResponse(text: string) { return parseTemplateDraftJson(text); } }
export class OpenAITemplateGenerationProvider implements TemplateGenerationProvider {
  private readonly config: { apiKey: string; model?: string; reasoning?: string; fetchImpl?: typeof fetch };
  constructor(config: { apiKey: string; model?: string; reasoning?: string; fetchImpl?: typeof fetch }) { this.config = config; }
  async generateTemplateDraft(input: GenerateTemplateDraftInput): Promise<GeneratedTemplateDraft> { if (!this.config.apiKey) throw new ProviderUnavailableError(); const response = await (this.config.fetchImpl ?? fetch)("https://api.openai.com/v1/responses", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}` }, body: JSON.stringify({ model: this.config.model ?? "gpt-5.4-mini", reasoning: { effort: this.config.reasoning ?? "none" }, input: buildManualTemplatePrompt(input), text: { format: { type: "json_schema", name: "entry_template_draft", strict: true, schema: templateDraftJsonSchema } } }) }); if (!response.ok) throw new Error("template_generation_provider_error"); const payload = await response.json() as { output_text?: string }; if (!payload.output_text) throw new Error("template_generation_invalid_json"); return parseTemplateDraftJson(payload.output_text); }
}
export function newTemplateId(prefix = "template") { return `${prefix}_${randomUUID().replaceAll("-", "")}`; }
