import { EVIDENCE_POLICY } from "./evidencePolicy.ts";

export type ReplicationPeriod = {
  period: "discovery" | "validation" | "replication" | string;
  effectValue: number | null;
  normalizedEffect: number | null;
  direction: "supports" | "contradicts" | "inconclusive" | "insufficient_data";
  sampleCount?: number;
  missingRate?: number;
  periodStartAt?: string;
  periodEndAt?: string;
  sourceFingerprint?: string;
};
export type HypothesisPeriodSet = { discovery_start_at: string; discovery_end_at: string; validation_start_at: string; validation_end_at: string; replication_start_at: string; replication_end_at: string };
export type ReplicationStatus = "not_started" | "insufficient_data" | "replicated" | "not_replicated" | "mixed";

function usablePeriod(period: ReplicationPeriod): boolean {
  const start = period.periodStartAt ? Date.parse(period.periodStartAt) : Number.NaN;
  const end = period.periodEndAt ? Date.parse(period.periodEndAt) : Number.NaN;
  return period.period !== "discovery" &&
    ["supports", "contradicts"].includes(period.direction) &&
    typeof period.effectValue === "number" && Number.isFinite(period.effectValue) &&
    typeof period.normalizedEffect === "number" && Number.isFinite(period.normalizedEffect) &&
    Math.abs(period.normalizedEffect) >= EVIDENCE_POLICY.minimumNormalizedReplicationEffect &&
    Number.isInteger(period.sampleCount) && Number(period.sampleCount) >= EVIDENCE_POLICY.minimumTotalSamples &&
    typeof period.missingRate === "number" && Number.isFinite(period.missingRate) && period.missingRate >= 0 && period.missingRate <= EVIDENCE_POLICY.maximumMissingRate &&
    Number.isFinite(start) && Number.isFinite(end) && end >= start &&
    typeof period.sourceFingerprint === "string" && period.sourceFingerprint.trim().length > 0;
}

function independentPeriods(periods: ReplicationPeriod[]): boolean {
  const fingerprints = periods.map((period) => period.sourceFingerprint!.trim());
  if (new Set(fingerprints).size !== fingerprints.length) return false;
  const ordered = periods
    .map((period) => ({ start: Date.parse(period.periodStartAt!), end: Date.parse(period.periodEndAt!) }))
    .sort((left, right) => left.start - right.start);
  return ordered.every((period, index) => index === 0 || period.start > ordered[index - 1].end);
}

export function assessReplication(periods: ReplicationPeriod[]) {
  const usable = periods.filter(usablePeriod);
  if (usable.length < EVIDENCE_POLICY.minimumReplicationPeriods || !independentPeriods(usable)) return { status: "insufficient_data" as const, stability: null, periods };
  const supporting = usable.filter((period) => period.direction === "supports").length;
  const contradicting = usable.filter((period) => period.direction === "contradicts").length;
  const stability = Math.max(supporting, contradicting) / usable.length;
  const status = supporting === usable.length ? "supports" as const : contradicting === usable.length ? "contradicts" as const : "inconclusive" as const;
  return { status, stability, periods };
}

export function assessReplicationLifecycle(periods: ReplicationPeriod[]): { status: ReplicationStatus; stability: number | null; validation: ReplicationPeriod | null; replication: ReplicationPeriod | null } {
  const validation = periods.find((period) => period.period === "validation") ?? null;
  const replication = periods.find((period) => period.period === "replication") ?? null;
  if (!validation && !replication) return { status: "not_started", stability: null, validation, replication };
  if (!validation || !replication || !usablePeriod(validation) || !usablePeriod(replication) || !independentPeriods([validation, replication])) return { status: "insufficient_data", stability: null, validation, replication };
  if (validation.direction === replication.direction && validation.direction === "supports") return { status: "replicated", stability: 1, validation, replication };
  if (validation.direction === replication.direction && validation.direction === "contradicts") return { status: "not_replicated", stability: 1, validation, replication };
  return { status: "mixed", stability: 0, validation, replication };
}
