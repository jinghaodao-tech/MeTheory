export type SensitivitySummary = {
  conclusionChangeConditions: string[];
  groupImbalanceWarnings: string[];
  missingnessWarnings: string[];
  overlapWarnings: string[];
  minimumAdditionalObservations?: number;
  minimumChangesToCrossEffect?: number | null;
  changesByGroup?: { groupA: number | null; groupB: number | null };
  method?: "binary_rate_flip" | "continuous_value_flip" | "not_applicable";
  explanation: string;
};

export type BinarySensitivityInput = {
  groupAPositive: number;
  groupATotal: number;
  groupBPositive: number;
  groupBTotal: number;
  minimumEffect: number;
};

function validCount(value: number, total: number): boolean {
  return Number.isInteger(value) && Number.isInteger(total) && total > 0 && value >= 0 && value <= total;
}

function changesToCross(input: BinarySensitivityInput, side: "groupA" | "groupB", observedDifference: number): number | null {
  const total = side === "groupA" ? input.groupATotal : input.groupBTotal;
  const positive = side === "groupA" ? input.groupAPositive : input.groupBPositive;
  const reduceByRemoving = observedDifference >= 0 ? side === "groupA" : side === "groupB";
  const available = reduceByRemoving ? positive : total - positive;
  for (let changes = 1; changes <= available; changes += 1) {
    const nextPositive = positive + (reduceByRemoving ? -changes : changes);
    const nextA = side === "groupA" ? nextPositive / input.groupATotal : input.groupAPositive / input.groupATotal;
    const nextB = side === "groupB" ? nextPositive / input.groupBTotal : input.groupBPositive / input.groupBTotal;
    if (Math.abs(nextA - nextB) < input.minimumEffect) return changes;
  }
  return null;
}

export function binaryRateSensitivity(input: BinarySensitivityInput): { minimumChangesToCrossEffect: number | null; changesByGroup: { groupA: number | null; groupB: number | null } } | null {
  if (!validCount(input.groupAPositive, input.groupATotal) || !validCount(input.groupBPositive, input.groupBTotal) || !Number.isFinite(input.minimumEffect) || input.minimumEffect < 0) return null;
  const observedDifference = input.groupAPositive / input.groupATotal - input.groupBPositive / input.groupBTotal;
  if (Math.abs(observedDifference) < input.minimumEffect) return { minimumChangesToCrossEffect: 0, changesByGroup: { groupA: 0, groupB: 0 } };
  const changesByGroup = { groupA: changesToCross(input, "groupA", observedDifference), groupB: changesToCross(input, "groupB", observedDifference) };
  const possible = [changesByGroup.groupA, changesByGroup.groupB].filter((value): value is number => value !== null);
  return { minimumChangesToCrossEffect: possible.length ? Math.min(...possible) : null, changesByGroup };
}

export type ContinuousSensitivityInput = {
  groupAValues: number[];
  groupBValues: number[];
  minimumNormalizedEffect: number;
  relation: "a_greater_than_b" | "a_less_than_b" | "approximately_equal";
};

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizedDifference(groupAValues: number[], groupBValues: number[]) {
  if (groupAValues.length < 2 || groupBValues.length < 2) return null;
  const groupAMean = mean(groupAValues);
  const groupBMean = mean(groupBValues);
  const pooledDegrees = groupAValues.length + groupBValues.length - 2;
  const sumSquares = groupAValues.reduce((sum, value) => sum + (value - groupAMean) ** 2, 0)
    + groupBValues.reduce((sum, value) => sum + (value - groupBMean) ** 2, 0);
  const pooledStandardDeviation = Math.sqrt(sumSquares / pooledDegrees);
  if (!Number.isFinite(pooledStandardDeviation)) return null;
  if (pooledStandardDeviation === 0) return Math.abs(groupAMean - groupBMean) === 0 ? 0 : Number.POSITIVE_INFINITY;
  return Math.abs(groupAMean - groupBMean) / pooledStandardDeviation;
}

function changedValues(values: number[], count: number, toward: number, descending: boolean) {
  const sorted = [...values].sort((left, right) => descending ? right - left : left - right);
  return sorted.map((value, index) => index < count ? toward : value);
}

export function continuousValueSensitivity(input: ContinuousSensitivityInput): { minimumChangesToCrossEffect: number | null; changesByGroup: { groupA: number | null; groupB: number | null } } | null {
  const groupAValues = input.groupAValues.filter(Number.isFinite);
  const groupBValues = input.groupBValues.filter(Number.isFinite);
  if (!groupAValues.length || !groupBValues.length || !Number.isFinite(input.minimumNormalizedEffect) || input.minimumNormalizedEffect < 0) return null;
  const current = normalizedDifference(groupAValues, groupBValues);
  if (current === null) return null;
  if (current < input.minimumNormalizedEffect || input.relation === "approximately_equal") return { minimumChangesToCrossEffect: 0, changesByGroup: { groupA: 0, groupB: 0 } };
  const midpoint = (mean(groupAValues) + mean(groupBValues)) / 2;
  const groupAHigher = mean(groupAValues) >= mean(groupBValues);
  let best: { total: number; groupA: number; groupB: number } | null = null;
  for (let groupAChanges = 0; groupAChanges <= groupAValues.length; groupAChanges += 1) {
    for (let groupBChanges = 0; groupBChanges <= groupBValues.length; groupBChanges += 1) {
      const total = groupAChanges + groupBChanges;
      if (total === 0 || (best && total > best.total)) continue;
      const changedA = changedValues(groupAValues, groupAChanges, midpoint, groupAHigher);
      const changedB = changedValues(groupBValues, groupBChanges, midpoint, !groupAHigher);
      const next = normalizedDifference(changedA, changedB);
      if (next !== null && next < input.minimumNormalizedEffect) best = { total, groupA: groupAChanges, groupB: groupBChanges };
    }
  }
  return { minimumChangesToCrossEffect: best?.total ?? null, changesByGroup: { groupA: best?.groupA ?? null, groupB: best?.groupB ?? null } };
}
