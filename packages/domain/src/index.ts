export const HYPOTHESIS_STATUSES = [
  "proposed",
  "tracking",
  "supported",
  "challenged",
  "inconclusive",
  "archived",
] as const;

export type HypothesisStatus = (typeof HYPOTHESIS_STATUSES)[number];
export type EvidenceDirection = "supports" | "challenges" | "insufficient";
export type ObservationSource = "user_confirmed" | "ai_inferred" | "system";

export interface ObservationInput {
  field: string;
  value: string | number | boolean | null;
  certainty: "high" | "medium" | "low";
  source: ObservationSource;
  missing?: boolean;
}

export interface Evaluation {
  status: Extract<HypothesisStatus, "supported" | "challenged" | "inconclusive">;
  supports: number;
  challenges: number;
  insufficient: number;
  sampleSize: number;
  ruleVersion: string;
}

export const RULE_VERSION = "evidence-v2";

export function transitionHypothesis(
  current: HypothesisStatus,
  next: HypothesisStatus,
): HypothesisStatus {
  if (current === "archived") {
    throw new Error("archived hypotheses cannot transition");
  }
  if (next === "proposed" || next === "tracking" || next === "archived") {
    return next;
  }
  if (current !== "tracking" && next !== "archived") {
    throw new Error("only tracking hypotheses can be evaluated");
  }
  return next;
}

export function directionForObservation(observation: ObservationInput): EvidenceDirection {
  if (observation.missing || observation.value === null || observation.certainty === "low") {
    return "insufficient";
  }
  if (observation.value === "completed" || observation.value === "yes" || observation.value === "supported" || observation.value === true) {
    return "supports";
  }
  if (observation.value === "interrupted" || observation.value === "no" || observation.value === "challenged" || observation.value === false) {
    return "challenges";
  }
  return "insufficient";
}

export function evaluateEvidence(observations: ObservationInput[], ruleVersion = RULE_VERSION): Evaluation {
  let supports = 0;
  let challenges = 0;
  let insufficient = 0;
  for (const observation of observations) {
    const direction = directionForObservation(observation);
    if (direction === "supports") supports += 1;
    if (direction === "challenges") challenges += 1;
    if (direction === "insufficient") insufficient += 1;
  }
  const status = supports + challenges < 2
    ? "inconclusive"
    : supports > challenges
      ? "supported"
      : challenges > supports
        ? "challenged"
        : "inconclusive";
  return { status, supports, challenges, insufficient, sampleSize: observations.length, ruleVersion };
}

export interface QuestionCandidate {
  field: string;
  burden: number;
  novelty: number;
  informationGainProxy: number;
  hypothesisPriority: number;
  recentlyAsked: boolean;
}

export function chooseQuestion(candidates: QuestionCandidate[]): QuestionCandidate | null {
  const eligible = candidates.filter((candidate) => !candidate.recentlyAsked);
  if (eligible.length === 0) return null;
  return [...eligible].sort((left, right) => {
    const score = (candidate: QuestionCandidate) =>
      candidate.informationGainProxy * candidate.hypothesisPriority * candidate.novelty - candidate.burden;
    return score(right) - score(left) || left.field.localeCompare(right.field);
  })[0];
}
