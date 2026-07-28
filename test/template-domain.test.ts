import test from "node:test";
import assert from "node:assert/strict";
import { MockTemplateGenerationProvider, canAutoApplySemanticRole, canMergeSemanticFields, inferSemanticRole, semanticRoleNeedsConfirmation, validateSemanticRoleSuggestion, validateTemplateDraft, valueForField } from "../packages/templates/src/index.ts";

test("template drafts validate fields and values", async () => {
  const draft = await new MockTemplateGenerationProvider().generateTemplateDraft({ userId: "u", theme: "集中" });
  assert.equal(draft.fields.length, 1);
  assert.equal(valueForField(draft.fields[0], 3), 3);
  assert.throws(() => valueForField(draft.fields[0], 9), /out_of_range/);
  assert.throws(() => validateTemplateDraft({ ...draft, fields: [{ ...draft.fields[0], fieldKey: "bad-key" }] }), /field_invalid/);
});

test("required fields and choices are enforced", () => {
  const field = { fieldKey: "kind", label: "種類", inputType: "choice" as const, valueType: "choice" as const, required: true, displayOrder: 1, options: [{ key: "a", label: "A" }], sensitivity: "normal" as const, reason: "確認" };
  assert.throws(() => valueForField(field, undefined), /required/);
  assert.throws(() => valueForField(field, "b"), /not_allowed/);
  assert.equal(valueForField(field, "a"), "a");
});

test("semantic roles are allowlisted and legacy templates remain valid", () => {
  const legacy = { theme: "記録", name: "記録", description: "", fields: [{ fieldKey: "energy", label: "エネルギー", inputType: "scale" as const, valueType: "scale" as const, required: false, displayOrder: 1, minimum: 1, maximum: 5, sensitivity: "normal" as const, reason: "状態" }] };
  assert.equal(validateTemplateDraft(legacy).fields[0].semanticRole, undefined);
  assert.equal(validateTemplateDraft({ ...legacy, fields: [{ ...legacy.fields[0], semanticRole: "energy", semanticRoleSource: "user", semanticRoleConfidence: 1 }] }).fields[0].semanticRole, "energy");
  assert.throws(() => validateTemplateDraft({ ...legacy, fields: [{ ...legacy.fields[0], semanticRole: "unknown_role" }] }), /semantic_role_invalid/);
  assert.throws(() => validateSemanticRoleSuggestion({ fieldKey: "energy", semanticRole: "unknown_role", confidence: 0.9, reasonJa: "bad" }), /semantic_role_suggestion_invalid/);
});

test("semantic role rules require confirmation for ambiguous and sensitive roles", () => {
  const energy = inferSemanticRole({ fieldKey: "energy_level", label: "エネルギー" });
  assert.equal(energy.semanticRole, "energy");
  assert.equal(canAutoApplySemanticRole({ suggestion: energy, sensitivity: "normal" }), true);
  const avoidance = { fieldKey: "avoidance", semanticRole: "avoidance" as const, confidence: 0.95, reasonJa: "rule" };
  assert.equal(semanticRoleNeedsConfirmation({ suggestion: avoidance, sensitivity: "normal" }), true);
  assert.equal(canAutoApplySemanticRole({ suggestion: { ...energy, confidence: 0.7 } }), false);
  assert.equal(canAutoApplySemanticRole({ suggestion: energy, currentRole: "fatigue" }), false);
});

test("semantic fields only merge with explicit compatible permission", () => {
  const base = { semanticRole: "energy" as const, valueType: "scale", minimum: 1, maximum: 5, sensitivity: "normal", mergeAllowed: true };
  assert.equal(canMergeSemanticFields(base, { ...base }), true);
  assert.equal(canMergeSemanticFields(base, { ...base, maximum: 10 }), false);
  assert.equal(canMergeSemanticFields(base, { ...base, mergeAllowed: false }), false);
});
