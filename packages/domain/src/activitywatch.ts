import { createHash } from "node:crypto";

export type ExternalObservation = {
  id: string;
  source: "activitywatch";
  sourceEventId?: string;
  observedAt: string;
  localDate: string;
  durationSeconds?: number;
  semanticRole: "observed_behavior" | "task_continuation" | "time_of_day" | "environment";
  category: "coding" | "writing" | "browser" | "communication" | "idle" | "other";
  projectLabel?: string;
  privacyLevel: "normal" | "sensitive";
  importedAt: string;
};
export type ActivityWatchEvent = { id?: string | number; timestamp?: string; duration?: number; data?: Record<string, unknown> };
export type ActivityWatchBucket = { id: string; type?: string; client?: string; hostname?: string };
export type ActivityWatchFetch = (url: string, init?: RequestInit) => Promise<Response>;
export type ActivityWatchDailySummary = {
  localDate: string;
  activeDurationSeconds: number;
  codingDurationSeconds: number;
  writingDurationSeconds: number;
  browserDurationSeconds: number;
  communicationDurationSeconds: number;
  sessionCount: number;
  longestSessionSeconds: number;
  firstActivityAt?: string;
  lastActivityAt?: string;
  sourceObservationIds: string[];
};

function localBaseUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  if (! ["127.0.0.1", "localhost", "::1"].includes(url.hostname)) throw new Error("activitywatch_localhost_only");
  return url.toString().replace(/\/$/, "");
}
function text(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function identifier(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}
function category(data: Record<string, unknown>): ExternalObservation["category"] {
  const app = `${text(data.app) ?? ""} ${text(data.app_name) ?? ""} ${text(data.title) ?? ""}`.toLowerCase();
  if (/code|visual studio|cursor|terminal|powershell|vim|emacs/.test(app)) return "coding";
  if (/word|notion|obsidian|writer|markdown/.test(app)) return "writing";
  if (/chrome|edge|firefox|safari|browser/.test(app)) return "browser";
  if (/slack|teams|discord|zoom|mail|outlook|chat/.test(app)) return "communication";
  if (/afk|idle|away/.test(app)) return "idle";
  return "other";
}
function safeProjectLabel(data: Record<string, unknown>): string | undefined {
  const value = text(data.project) ?? text(data.project_name) ?? text(data.repository);
  return value && /^[a-zA-Z0-9._ -]{1,80}$/.test(value) ? value : undefined;
}
export function normalizeActivityWatchEvent(bucketId: string, event: ActivityWatchEvent, importedAt = new Date().toISOString()): ExternalObservation | null {
  if (!event.timestamp || !Number.isFinite(Date.parse(event.timestamp))) return null;
  const data = event.data ?? {};
  const durationSeconds = typeof event.duration === "number" && Number.isFinite(event.duration) && event.duration >= 0 ? Math.min(event.duration, 86400) : undefined;
  const bucket = bucketId.toLowerCase();
  const isAfk = /afk|idle/.test(bucket) || category(data) === "idle";
  if (isAfk) return null;
  const sourceEventId = identifier(event.id);
  const fingerprint = createHash("sha256").update(JSON.stringify([bucketId, sourceEventId ?? "", event.timestamp, durationSeconds, category(data), safeProjectLabel(data) ?? ""])).digest("hex").slice(0, 32);
  return { id: `activitywatch_${fingerprint}`, source: "activitywatch", sourceEventId, observedAt: new Date(event.timestamp).toISOString(), localDate: event.timestamp.slice(0, 10), ...(durationSeconds === undefined ? {} : { durationSeconds }), semanticRole: durationSeconds && durationSeconds > 60 ? "task_continuation" : "observed_behavior", category: category(data), ...(safeProjectLabel(data) ? { projectLabel: safeProjectLabel(data) } : {}), privacyLevel: safeProjectLabel(data) ? "sensitive" : "normal", importedAt };
}
export function summarizeActivityWatchDaily(observations: ExternalObservation[]): ActivityWatchDailySummary[] {
  const byDate = new Map<string, ExternalObservation[]>();
  for (const observation of observations) {
    const localDate = observation.localDate;
    byDate.set(localDate, [...(byDate.get(localDate) ?? []), observation]);
  }
  return [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([localDate, items]) => {
    const ordered = [...items].sort((left, right) => left.observedAt.localeCompare(right.observedAt));
    const durationFor = (category: ExternalObservation["category"]) => ordered.filter((item) => item.category === category).reduce((total, item) => total + (item.durationSeconds ?? 0), 0);
    const durations = ordered.map((item) => item.durationSeconds ?? 0);
    return {
      localDate,
      activeDurationSeconds: durations.reduce((total, value) => total + value, 0),
      codingDurationSeconds: durationFor("coding"),
      writingDurationSeconds: durationFor("writing"),
      browserDurationSeconds: durationFor("browser"),
      communicationDurationSeconds: durationFor("communication"),
      sessionCount: ordered.length,
      longestSessionSeconds: durations.length ? Math.max(...durations) : 0,
      ...(ordered[0] ? { firstActivityAt: ordered[0].observedAt, lastActivityAt: ordered.at(-1)?.observedAt } : {}),
      sourceObservationIds: ordered.map((item) => item.id)
    };
  });
}
export class ActivityWatchAdapter {
  readonly baseUrl: string;
  private readonly fetchImpl: ActivityWatchFetch;
  constructor(config: { baseUrl?: string; fetchImpl?: ActivityWatchFetch } = {}) { this.baseUrl = localBaseUrl(config.baseUrl ?? "http://127.0.0.1:5600"); this.fetchImpl = config.fetchImpl ?? fetch; }
  private async get<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`);
    if (!response.ok) throw new Error(`activitywatch_http_${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) throw new Error("activitywatch_non_json_response");
    return await response.json() as T;
  }
  async status(): Promise<{ running: boolean; baseUrl: string }> { try { await this.get("/api/0/info"); return { running: true, baseUrl: this.baseUrl }; } catch { return { running: false, baseUrl: this.baseUrl }; } }
  async buckets(): Promise<ActivityWatchBucket[]> { const value = await this.get<Record<string, ActivityWatchBucket>>("/api/0/buckets"); return Object.entries(value).map(([id, bucket]) => ({ ...bucket, id })); }
  async events(bucketId: string, startAt: string, endAt: string): Promise<ActivityWatchEvent[]> { const encoded = encodeURIComponent(bucketId); return this.get<ActivityWatchEvent[]>(`/api/0/buckets/${encoded}/events?starttime=${encodeURIComponent(startAt)}&endtime=${encodeURIComponent(endAt)}`); }
  async preview(bucketIds: string[], startAt: string, endAt: string): Promise<ExternalObservation[]> { const all = (await Promise.all(bucketIds.map(async (bucketId) => (await this.events(bucketId, startAt, endAt)).map((event) => normalizeActivityWatchEvent(bucketId, event))))).flat(); return all.filter((item): item is ExternalObservation => Boolean(item)); }
}
