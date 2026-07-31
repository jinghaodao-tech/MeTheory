import test from "node:test";
import assert from "node:assert/strict";
import { PcsClientError, PcsIntegrationClient } from "../apps/api/src/personalContextClient.ts";

test("PCS client requires credentials before making an integration request", async () => {
  await assert.rejects(
    () => new PcsIntegrationClient({ baseUrl: "http://127.0.0.1:8300" }).getAnalysisSnapshot({ profileId: "profile-1", from: "2026-07-01T00:00:00.000Z", to: "2026-07-02T00:00:00.000Z" }),
    (error: unknown) => error instanceof PcsClientError && error.code === "pcs_client_not_configured"
  );
});

test("PCS client refuses non-local endpoints", async () => {
  await assert.rejects(
    () => new PcsIntegrationClient({ baseUrl: "https://pcs.example.test", clientId: "client", token: "token" }).getAnalysisSnapshot({ profileId: "profile-1", from: "2026-07-01T00:00:00.000Z", to: "2026-07-02T00:00:00.000Z" }),
    /pcs_localhost_required/
  );
});
