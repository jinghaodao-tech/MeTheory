export type SensitivitySummary = {
  conclusionChangeConditions: string[];
  groupImbalanceWarnings: string[];
  missingnessWarnings: string[];
  overlapWarnings: string[];
  minimumAdditionalObservations?: number;
  minimumChangesToCrossEffect?: number | null;
  changesByGroup?: { groupA: number | null; groupB: number | null };
  method?: "binary_rate_flip" | "not_applicable";
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
