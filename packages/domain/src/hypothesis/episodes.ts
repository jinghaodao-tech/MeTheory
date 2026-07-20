import type { CaptureMode, ObservationSource } from "../index.ts";

export interface EpisodeObservation {
  responseId: string;
  checkinId: string;
  capturedAt: string;
  captureMode: CaptureMode;
  field: string;
  value: unknown;
  source: ObservationSource;
  certainty: "high" | "medium" | "low";
}

export interface ObservationEpisode {
  responseId: string;
  checkinId: string;
  capturedAt: string;
  captureMode: CaptureMode;
  values: Record<string, unknown>;
  sources: Record<string, ObservationSource>;
  certainties: Record<string, "high" | "medium" | "low">;
}

const sourcePriority: Record<ObservationSource, number> = { user_confirmed: 3, system: 2, ai_inferred: 1 };

export function buildEpisodes(observations: EpisodeObservation[]): ObservationEpisode[] {
  const grouped = new Map<string, EpisodeObservation[]>();
  for (const observation of observations) grouped.set(observation.responseId, [...(grouped.get(observation.responseId) ?? []), observation]);
  return [...grouped.entries()].map(([responseId, rows]) => {
    const first = rows[0];
    const selected = new Map<string, EpisodeObservation>();
    for (const row of rows) {
      const current = selected.get(row.field);
      if (!current || sourcePriority[row.source] > sourcePriority[current.source] || (sourcePriority[row.source] === sourcePriority[current.source] && row.capturedAt > current.capturedAt)) selected.set(row.field, row);
    }
    return {
      responseId,
      checkinId: first.checkinId,
      capturedAt: first.capturedAt,
      captureMode: first.captureMode,
      values: Object.fromEntries([...selected].map(([field, row]) => [field, row.value])),
      sources: Object.fromEntries([...selected].map(([field, row]) => [field, row.source])),
      certainties: Object.fromEntries([...selected].map(([field, row]) => [field, row.certainty])),
    };
  });
}
