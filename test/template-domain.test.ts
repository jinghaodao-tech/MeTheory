import test from "node:test";
import assert from "node:assert/strict";
import { MockTemplateGenerationProvider, validateTemplateDraft, valueForField } from "../packages/templates/src/index.ts";

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
