type ExperimentTemplateRequest = {
  schemaVersion: "pcs-experiment-template-request-v1";
  id: string;
  sourceSystem: "metheory";
  hypothesisId: string | null;
  title: string;
  purpose: string;
  durationDays: number | null;
  requestedFields: Array<{ fieldKey: string; label: string; valueType: "text" | "long_text" | "boolean" | "single_choice" | "multi_choice" | "number" | "date"; required: boolean; options?: Array<{ key: string; label: string }>; reason: string }>;
  createdAt: string;
};

export type PcsClientConfig = {
  baseUrl?: string;
  clientId?: string;
  token?: string;
  profileId?: string;
};

export type PcsClientErrorCode =
  | "pcs_client_not_configured"
  | "pcs_unauthorized"
  | "pcs_profile_forbidden"
  | "pcs_profile_mismatch"
  | "pcs_url_invalid"
  | "pcs_remote_endpoint_prohibited"
  | "pcs_snapshot_invalid"
  | "pcs_contract_revision_unsupported"
  | "pcs_timeout"
  | "pcs_unavailable";

export class PcsClientError extends Error {
  readonly code: PcsClientErrorCode;
  readonly status?: number;

  constructor(code: PcsClientErrorCode, status?: number) {
    super(code === "pcs_remote_endpoint_prohibited" ? "pcs_localhost_required" : code);
    this.name = "PcsClientError";
    this.code = code;
    this.status = status;
  }
}

function baseUrl(config: PcsClientConfig = {}): URL {
  let url: URL;
  try { url = new URL(config.baseUrl ?? process.env.PCS_API_URL ?? "http://127.0.0.1:8300"); } catch { throw new PcsClientError("pcs_url_invalid"); }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new PcsClientError("pcs_remote_endpoint_prohibited");
  return url;
}

function clientConfig(): PcsClientConfig {
  return { baseUrl: process.env.PCS_API_URL, clientId: process.env.PCS_CLIENT_ID, token: process.env.PCS_CLIENT_TOKEN, profileId: process.env.PCS_PROFILE_ID };
}

function mapError(status: number, error?: string): PcsClientErrorCode {
  if (status === 401) return "pcs_unauthorized";
  if (status === 403) return "pcs_profile_forbidden";
  if (status === 409 && error === "pcs_profile_mismatch") return "pcs_profile_mismatch";
  if (error === "pcs_contract_revision_unsupported") return "pcs_contract_revision_unsupported";
  if (status === 422 || error === "pcs_snapshot_invalid") return "pcs_snapshot_invalid";
  return "pcs_unavailable";
}

async function request(path: string, init?: RequestInit, config: PcsClientConfig = clientConfig()): Promise<unknown> {
  if (!config.clientId || !config.token) throw new PcsClientError("pcs_client_not_configured");
  const url = new URL(path, baseUrl(config));
  const headers = new Headers(init?.headers);
  headers.set("x-pcs-client-id", config.clientId);
  headers.set("authorization", `Bearer ${config.token}`);
  try {
    const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(10_000) });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new PcsClientError(mapError(response.status, payload.error), response.status);
    return payload;
  } catch (error) {
    if (error instanceof PcsClientError) throw error;
    if (error instanceof DOMException && error.name === "TimeoutError") throw new PcsClientError("pcs_timeout");
    throw new PcsClientError("pcs_unavailable");
  }
}

export class PcsIntegrationClient {
  private readonly config: PcsClientConfig;

  constructor(config: PcsClientConfig = clientConfig()) {
    this.config = config;
  }

  async getAnalysisSnapshot(input: { profileId: string; from: string; to: string; timezone?: string }): Promise<unknown> {
    const query = new URLSearchParams({ profileId: input.profileId, from: input.from, to: input.to, timezone: input.timezone ?? "UTC" });
    return request(`/v1/context/analysis-snapshot?${query.toString()}`, undefined, this.config);
  }
}

export function pcsProfileId(): string {
  const profileId = process.env.PCS_PROFILE_ID?.trim();
  if (!profileId) throw new PcsClientError("pcs_client_not_configured");
  return profileId;
}

async function requestLegacy(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(new URL(path, baseUrl()), init);
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `pcs_request_${response.status}`);
  return payload;
}

export async function loadPersonalContextSnapshot(input: { startAt: string; endAt: string }): Promise<unknown> {
  return new PcsIntegrationClient().getAnalysisSnapshot({ profileId: pcsProfileId(), from: input.startAt, to: input.endAt, timezone: process.env.PCS_TIMEZONE ?? "UTC" });
}

export async function requestPersonalContextTemplate(input: ExperimentTemplateRequest): Promise<unknown> {
  return request("/v1/integration-template-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
}
