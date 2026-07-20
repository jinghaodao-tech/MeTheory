import type { Condition } from "./spec.ts";

function comparable(left: unknown, right: unknown): boolean {
  return typeof left === typeof right && (typeof left === "number" || typeof left === "string" || typeof left === "boolean");
}

export function matchesCondition(values: Record<string, unknown>, condition: Condition): boolean {
  if (!(condition.field in values)) return false;
  const actual = values[condition.field];
  if (["less_than", "less_than_or_equal", "greater_than", "greater_than_or_equal"].includes(condition.operator)) {
    if (typeof actual !== "number" || typeof condition.value !== "number") return false;
    if (condition.operator === "less_than") return actual < condition.value;
    if (condition.operator === "less_than_or_equal") return actual <= condition.value;
    if (condition.operator === "greater_than") return actual > condition.value;
    return actual >= condition.value;
  }
  if (condition.operator === "in" || condition.operator === "not_in") {
    if (!Array.isArray(condition.value)) return false;
    const included = condition.value.some((candidate) => comparable(actual, candidate) && actual === candidate);
    return condition.operator === "in" ? included : !included;
  }
  if (!comparable(actual, condition.value)) return false;
  return condition.operator === "equals" ? actual === condition.value : actual !== condition.value;
}

export function matchesAll(values: Record<string, unknown>, conditions: Condition[]): boolean {
  return conditions.every((condition) => matchesCondition(values, condition));
}
