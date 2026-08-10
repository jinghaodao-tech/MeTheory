import { EVIDENCE_POLICY } from "./evidencePolicy.ts";

export type SignificanceDirection = "a_greater" | "b_greater";
export type SignificanceMethod = "exact_permutation" | "exact_binomial" | "monte_carlo_permutation";
export type SignificanceResult = { pValue: number; permutations: number; method: SignificanceMethod };

function logCombination(n: number, k: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || k > n) return Number.NEGATIVE_INFINITY;
  const selected = Math.min(k, n - k);
  let result = 0;
  for (let index = 1; index <= selected; index += 1) result += Math.log(n - selected + index) - Math.log(index);
  return result;
}
function combinationsAtMost(n: number, k: number, limit: number): number | null {
  const selected = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= selected; index += 1) {
    result = result * (n - selected + index) / index;
    if (result > limit) return null;
  }
  return Math.round(result);
}

function monteCarloSeed(values: number[], groupASize: number, direction: SignificanceDirection): number {
  let seed = 2166136261;
  const input = `${direction}|${groupASize}|${values.join(",")}`;
  for (let index = 0; index < input.length; index += 1) seed = Math.imul(seed ^ input.charCodeAt(index), 16777619);
  return seed >>> 0 || 1;
}

function monteCarloRandom(state: { value: number }): number {
  state.value = Math.imul(state.value ^ (state.value >>> 15), 2246822519);
  state.value = Math.imul(state.value ^ (state.value >>> 13), 3266489917);
  return ((state.value ^ (state.value >>> 16)) >>> 0) / 0x100000000;
}

function monteCarloPermutationPValue(values: number[], groupASize: number, direction: SignificanceDirection): SignificanceResult {
  const groupBSize = values.length - groupASize;
  const observedA = values.slice(0, groupASize).reduce((sum, value) => sum + value, 0) / groupASize;
  const observedB = values.slice(groupASize).reduce((sum, value) => sum + value, 0) / groupBSize;
  const observed = direction === "a_greater" ? observedA - observedB : observedB - observedA;
  const tolerance = Math.max(1e-12, Math.abs(observed) * 1e-12);
  const samples = EVIDENCE_POLICY.monteCarloPermutationSamples;
  const shuffled = [...values];
  const randomState = { value: monteCarloSeed(values, groupASize, direction) };
  let extreme = 0;
  for (let sample = 0; sample < samples; sample += 1) {
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(monteCarloRandom(randomState) * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    const sumA = shuffled.slice(0, groupASize).reduce((sum, value) => sum + value, 0);
    const permutedA = sumA / groupASize;
    const permutedB = (shuffled.slice(groupASize).reduce((sum, value) => sum + value, 0)) / groupBSize;
    const statistic = direction === "a_greater" ? permutedA - permutedB : permutedB - permutedA;
    if (statistic >= observed - tolerance) extreme += 1;
  }
  return { pValue: Math.min(1, 4 * (extreme + 1) / (samples + 1)), permutations: samples, method: "monte_carlo_permutation" };
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
  const uniqueValues = [...new Set(values)];
  if (uniqueValues.length <= 2 && !values.every((value) => value === 0 || value === 1)) {
    const high = Math.max(...uniqueValues);
    return exactPermutationPValue(groupA.map((value) => value === high ? 1 : 0), groupB.map((value) => value === high ? 1 : 0), direction);
  }
  if (values.every((value) => value === 0 || value === 1)) {
    const totalSuccesses = values.reduce<number>((sum, value) => sum + value, 0);
    const observedA = groupA.reduce<number>((sum, value) => sum + value, 0) / groupA.length;
    const observedB = groupB.reduce<number>((sum, value) => sum + value, 0) / groupB.length;
    const observed = direction === "a_greater" ? observedA - observedB : observedB - observedA;
    const tolerance = Math.max(1e-12, Math.abs(observed) * 1e-12);
    const denominatorLog = logCombination(values.length, groupASize);
    let pValue = 0;
    for (let successesA = 0; successesA <= groupASize; successesA += 1) {
      const successesB = totalSuccesses - successesA;
      if (successesB < 0 || successesB > groupB.length) continue;
      const permutedA = successesA / groupA.length;
      const permutedB = successesB / groupB.length;
      const statistic = direction === "a_greater" ? permutedA - permutedB : permutedB - permutedA;
      if (statistic >= observed - tolerance) {
        pValue += Math.exp(logCombination(totalSuccesses, successesA) + logCombination(values.length - totalSuccesses, groupASize - successesA) - denominatorLog);
      }
    }
    const permutations = denominatorLog < Math.log(Number.MAX_SAFE_INTEGER) ? Math.round(Math.exp(denominatorLog)) : Number.MAX_SAFE_INTEGER;
    return { pValue: Math.min(1, pValue), permutations, method: "exact_permutation" };
  }
  const totalPermutations = combinationsAtMost(values.length, groupASize, EVIDENCE_POLICY.maximumExactPermutations);
  if (totalPermutations === null) return monteCarloPermutationPValue(values, groupASize, direction);
  const observedA = groupA.reduce<number>((sum, value) => sum + value, 0) / groupA.length;
  const observedB = groupB.reduce<number>((sum, value) => sum + value, 0) / groupB.length;
  const observed = direction === "a_greater" ? observedA - observedB : observedB - observedA;
  const total = values.reduce<number>((sum, value) => sum + value, 0);
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
  return { pValue: Math.min(1, 4 * extreme / totalPermutations), permutations: totalPermutations, method: "exact_permutation" };
}
