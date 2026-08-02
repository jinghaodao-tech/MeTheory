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
export type CaptureMode = "momentary_observation" | "retrospective_entry";

export interface ObservationRecord extends ObservationInput {
  captureMode: CaptureMode;
  responseId: string;
}

export interface InsightPresentation {
  observedFact: string;
  boundedInterpretation: string | null;
  hypothesisCandidate: string | null;
}

export const FORBIDDEN_AI_TERMS = [
  "diagnosis",
  "diagnosed",
  "personality type",
  "proven",
  "因果",
  "診断",
  "性格",
] as const;

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
  if (next === "proposed" || next === "tracking") {
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

export interface TimeWindow {
  startMinute: number;
  endMinute: number;
}

export interface NotificationPolicyInput {
  candidateMinutes: readonly number[];
  allowedWindows: readonly TimeWindow[];
  quietWindows: readonly TimeWindow[];
  sentToday: number;
  maxPerDay: number;
  lastSentMinute: number | null;
  minimumIntervalMinutes: number;
}

function inWindow(minute: number, window: TimeWindow): boolean {
  if (window.startMinute <= window.endMinute) return minute >= window.startMinute && minute <= window.endMinute;
  return minute >= window.startMinute || minute <= window.endMinute;
}

export function chooseNotificationMinute(input: NotificationPolicyInput): number | null {
  if (input.sentToday >= input.maxPerDay) return null;
  return [...input.candidateMinutes].sort((a, b) => a - b).find((minute) => {
    const allowed = input.allowedWindows.some((window) => inWindow(minute, window));
    const quiet = input.quietWindows.some((window) => inWindow(minute, window));
    const intervalOk = input.lastSentMinute === null || minute - input.lastSentMinute >= input.minimumIntervalMinutes;
    return allowed && !quiet && intervalOk;
  }) ?? null;
}

export * from './sourceAdapters.ts';
export * from './questionBudget.ts';
export * from './experiments.ts';
export * from './measurementRequirements.ts';
export * from './measurementSufficiency.ts';
export * from './provenance.ts';
export * from './syntheticData.ts';
export * from './replication.ts';
export * from './aiProvider.ts';
export * from './externalProviders.ts';

export function validateAiCandidate(candidate: unknown): { ok: true } | { ok: false; reason: string } {
  if (!candidate || typeof candidate !== "object") return { ok: false, reason: "candidate must be an object" };
  const value = candidate as Record<string, unknown>;
  if (typeof value.statement !== "string" || value.statement.trim() === "") return { ok: false, reason: "statement is required" };
  const lower = value.statement.toLowerCase();
  const forbidden = FORBIDDEN_AI_TERMS.find((term) => lower.includes(term.toLowerCase()));
  if (forbidden) return { ok: false, reason: `forbidden term: ${forbidden}` };
  if ("status" in value || "evidenceStrength" in value || "notificationMinute" in value) return { ok: false, reason: "system-owned fields are not allowed" };
  const allowedKeys = new Set(["statement", "alternativeExplanation", "validationCondition", "requiredObservations"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return { ok: false, reason: "unknown field" };
  return { ok: true };
}
