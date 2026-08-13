import assert from "node:assert/strict";
import { test } from "node:test";
import {
  inferSemanticRole,
  semanticRoleConfidence,
  semanticRoleNeedsConfirmation,
  validateSemanticRoleSuggestion
} from "../packages/self-understanding/src/semanticRoles.ts";

test("inferSemanticRole labels a pattern match with inferenceMethod pattern_match and confidence 0.9", () => {
  const suggestion = inferSemanticRole({
    fieldKey: "sleep_hours",
    label: "睡眠時間"
  });
  assert.equal(suggestion.semanticRole, "sleep_duration");
  assert.equal(suggestion.inferenceMethod, "pattern_match");
  assert.equal(suggestion.inferenceConfidence, 0.9);
});

test("inferSemanticRole labels a non-match with inferenceMethod fallback and confidence 0.4", () => {
  const suggestion = inferSemanticRole({
    fieldKey: "custom_field_xyz",
    label: "何か新しい項目"
  });
  assert.equal(suggestion.semanticRole, "other");
  assert.equal(suggestion.inferenceMethod, "fallback");
  assert.equal(suggestion.inferenceConfidence, 0.4);
});

test("semanticRoleConfidence rejects values outside [0, 1]", () => {
  assert.throws(() => semanticRoleConfidence(1.5), /semantic_role_confidence_invalid/);
  assert.throws(() => semanticRoleConfidence(-0.1), /semantic_role_confidence_invalid/);
  assert.throws(() => semanticRoleConfidence(Number.NaN), /semantic_role_confidence_invalid/);
  assert.equal(semanticRoleConfidence(0.9), 0.9);
});

test("validateSemanticRoleSuggestion requires inferenceConfidence and inferenceMethod, not confidence", () => {
  const legacyShape = {
    fieldKey: "sleep_hours",
    semanticRole: "sleep_duration",
    confidence: 0.9,
    reasonJa: "test"
  };
  assert.throws(
    () => validateSemanticRoleSuggestion(legacyShape),
    /semantic_role_suggestion_invalid/,
    "the old confidence-only shape must be rejected now that the field is renamed"
  );

  const currentShape = {
    fieldKey: "sleep_hours",
    semanticRole: "sleep_duration",
    inferenceConfidence: 0.9,
    inferenceMethod: "pattern_match",
    reasonJa: "test"
  };
  assert.deepEqual(validateSemanticRoleSuggestion(currentShape), currentShape);
});

test("semanticRoleNeedsConfirmation still gates on the 0.85 threshold via inferenceConfidence", () => {
  const lowConfidence = inferSemanticRole({ fieldKey: "x", label: "unmatched label" });
  assert.equal(semanticRoleNeedsConfirmation({ suggestion: lowConfidence }), true);

  const highConfidence = inferSemanticRole({ fieldKey: "sleep_hours", label: "睡眠時間" });
  assert.equal(semanticRoleNeedsConfirmation({ suggestion: highConfidence }), false);
});
