import { EVIDENCE_POLICY } from "./evidencePolicy.ts";

export type SignificanceDirection = "a_greater" | "b_greater";
export type SignificanceResult = { pValue: number; permutations: number; method: "exact_permutation" | "exact_binomial" };

function combinationsAtMost(n: number, k: number, limit: number): number | null {
  const selected = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= selected; index += 1) {
    result = result * (n - selected + index) / index;
    if (result > limit) return null;
  }
  return Math.round(result);
}

export function correctedAlpha(comparisonCount = 1): number {
  const count = Number.isInteger(comparisonCount) && comparisonCount > 0 ? comparisonCount : 1;
  return EVIDENCE_POLICY.falsePositiveAlpha / count;
}

export function exactBinomialPValue(successes: number, failures: number): SignificanceResult | null {
  const total = successes + failures;
  if (!Number.isInteger(successes) || !Number.isInteger(failures) || successes < 0 || failures < 0 || total === 0) return null;
  const denominator = 2 ** total;
  if (!Number.isFinite(denominator)) return null;
  let numerator = 0;
  for (let k = successes; k <= total; k += 1) numerator += binomialCoefficient(total, k);
  return { pValue: Math.min(1, numerator / denominator), permutations: denominator, method: "exact_binomial" };
}

function binomialCoefficient(n: number, k: number): number {
  const selected = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= selected; index += 1) result = result * (n - selected + index) / index;
  return result;
}

export function exactPermutationPValue(groupA: number[], groupB: number[], direction: SignificanceDirection): SignificanceResult | null {
  if (!groupA.length || !groupB.length || groupA.some((value) => !Number.isFinite(value)) || groupB.some((value) => !Number.isFinite(value))) return null;
  const values = [...groupA, ...groupB];
  const groupASize = groupA.length;
  const totalPermutations = combinationsAtMost(values.length, groupASize, EVIDENCE_POLICY.maximumExactPermutations);
  if (totalPermutations === null) return null;
  const observedA = groupA.reduce((sum, value) => sum + value, 0) / groupA.length;
  const observedB = groupB.reduce((sum, value) => sum + value, 0) / groupB.length;
  const observed = direction === "a_greater" ? observedA - observedB : observedB - observedA;
  const total = values.reduce((sum, value) => sum + value, 0);
  const tolerance = Math.max(1e-12, Math.abs(observed) * 1e-12);
  let extreme = 0;
  const visit = (start: number, remaining: number, sumA: number) => {
    if (remaining === 0) {
      const permutedA = sumA / groupASize;
      const permutedB = (total - sumA) / groupB.length;
      const statistic = direction === "a_greater" ? permutedA - permutedB : permutedB - permutedA;
      if (statistic >= observed - tolerance) extreme += 1;
      return;
    }
    for (let index = start; index <= values.length - remaining; index += 1) visit(index + 1, remaining - 1, sumA + values[index]);
  };
  visit(0, groupASize, 0);
  return { pValue: Math.min(1, extreme / totalPermutations), permutations: totalPermutations, method: "exact_permutation" };
}
