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

function baseUrl(): URL {
  const url = new URL(process.env.PCS_API_URL ?? "http://127.0.0.1:8300");
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("pcs_localhost_required");
  return url;
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const url = new URL(path, baseUrl());
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `pcs_request_${response.status}`);
  return payload;
}

export async function loadPersonalContextSnapshot(input: { startAt: string; endAt: string }): Promise<unknown> {
  const query = new URLSearchParams({ from: input.startAt, to: input.endAt });
  return request(`/v1/metheory/analysis-snapshot?${query.toString()}`);
}

export async function requestPersonalContextTemplate(input: ExperimentTemplateRequest): Promise<unknown> {
  return request("/v1/experiment-template-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
}
