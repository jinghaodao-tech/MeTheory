import type { PcsAnalysisSnapshotV2 } from "../../../packages/contracts/src/pcsAnalysisSnapshotV2.ts";
import { validatePcsAnalysisSnapshotV2 } from "../../../packages/contracts/src/pcsAnalysisSnapshotV2.ts";

export class PcsClientError extends Error { readonly code: string; readonly status: number; constructor(code: string, status = 502) { super(code); this.code = code; this.status = status; } }
function assertLocal(url: URL) { if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) throw new PcsClientError("pcs_remote_endpoint_prohibited", 400); }
export async function fetchLiveSnapshot(input: { profileId: string; from: string; to: string; timezone: string }): Promise<PcsAnalysisSnapshotV2> {
  const base = process.env.PCS_API_URL; const clientId = process.env.PCS_CLIENT_ID; const token = process.env.PCS_CLIENT_TOKEN;
  if (!base || !clientId || !token) throw new PcsClientError("pcs_client_not_configured", 501);
  let url: URL; try { url = new URL("/v1/snapshots", base); assertLocal(url); } catch (error) { if (error instanceof PcsClientError) throw error; throw new PcsClientError("pcs_url_invalid", 400); }
  url.search = new URLSearchParams({ profileId: input.profileId, from: input.from, to: input.to, timezone: input.timezone }).toString();
  let response: Response; try { response = await fetch(url, { headers: { "X-PCS-Client-Id": clientId, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) }); } catch { throw new PcsClientError("pcs_unavailable", 502); }
  if (response.status === 401) throw new PcsClientError("pcs_unauthorized", 401);
  if (response.status === 403) throw new PcsClientError("pcs_profile_forbidden", 403);
  if (!response.ok) throw new PcsClientError("pcs_snapshot_invalid", 502);
  let payload: unknown; try { payload = await response.json(); } catch { throw new PcsClientError("pcs_snapshot_invalid", 502); }
  const validated = validatePcsAnalysisSnapshotV2(payload);
  if (!validated.ok) throw new PcsClientError("pcs_snapshot_invalid", 502);
  return validated.snapshot;
}
