import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchLiveSnapshot, PcsClientError } from "../apps/api/src/pcsClient.ts";
test("Live PCS client refuses missing configuration", async () => { const old=[process.env.PCS_API_URL,process.env.PCS_CLIENT_ID,process.env.PCS_CLIENT_TOKEN]; delete process.env.PCS_API_URL; delete process.env.PCS_CLIENT_ID; delete process.env.PCS_CLIENT_TOKEN; await assert.rejects(fetchLiveSnapshot({profileId:"p",from:"2026-01-01",to:"2026-01-02",timezone:"UTC"}), (error:unknown)=>error instanceof PcsClientError && error.code === "pcs_client_not_configured"); if(old[0]!==undefined)process.env.PCS_API_URL=old[0]; if(old[1]!==undefined)process.env.PCS_CLIENT_ID=old[1]; if(old[2]!==undefined)process.env.PCS_CLIENT_TOKEN=old[2]; });
