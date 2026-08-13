import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SqliteSelfUnderstandingRepository } from "../apps/api/src/selfUnderstandingRepository.ts";

// v1-scope.md item 5 ("Review a proposed Self Model change before accepting it; no candidate is
// automatically approved, started, notified, evaluated, or merged") had zero coverage for the
// guarantee itself: POST /v1/self-understanding/self-model-candidates/review -- the only code path
// that writes into self_beliefs -- was never called by any test. This is the product's core
// non-automation promise, so "a human must accept a Self Model change" should not rest on manual
// trust alone.

function pcsSnapshot(templatePrefix: string, period: { startAt: string; endAt: string }) {
  const start = Date.parse(period.startAt);
  const records = Array.from({ length: 8 }, (_, index) => {
    const clear = index % 2 === 0;
    return {
      id: `${templatePrefix}_entry_${index}`,
      recordedAt: new Date(start + index * 86400000).toISOString(),
      title: "Daily note",
      sourceDocumentId: `${templatePrefix}_doc_${index}`,
      values: [
        { fieldKey: "task_clarity", label: "Task clarity", valueType: "single_choice", value: clear ? "clear" : "unclear", templateId: templatePrefix, sourceDocumentId: `${templatePrefix}_doc_${index}`, allowedValues: [{ key: "clear", label: "Clear" }, { key: "unclear", label: "Unclear" }] },
        { fieldKey: "start_delay", label: "Start delay", valueType: "number", value: clear ? 10 : 60, templateId: templatePrefix, sourceDocumentId: `${templatePrefix}_doc_${index}` }
      ]
    };
  });
  return { schemaVersion: "pcs-context-analysis-snapshot-v1", generatedAt: "2026-07-10T00:00:00.000Z", records, excluded: { unconfirmed: 0, nonShareable: 0, invalid: 0 } };
}

test("self model review: accepting or rejecting a proposed change is never automatic", async () => {
  const port = 18700 + Math.floor(Math.random() * 200);
  const directory = mkdtempSync(join(tmpdir(), "metheory-self-model-review-"));
  const database = join(directory, "api.sqlite3");
  const child = spawn(process.execPath, ["--experimental-strip-types", "apps/api/src/server.ts"], { env: { ...process.env, PORT: String(port), METHEORY_DB: database }, stdio: "ignore" });
  const api = async (path: string, method = "GET", value?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: value ? { "content-type": "application/json" } : undefined, body: value ? JSON.stringify(value) : undefined });
    return { response, body: await response.json() as any };
  };
  const seedProposedCandidate = async (userId: string, templatePrefix: string, period: { startAt: string; endAt: string }) => {
    const seedDb = new DatabaseSync(database);
    let candidateId: string;
    try {
      const repository = new SqliteSelfUnderstandingRepository(seedDb);
      const result = repository.analyze(userId, pcsSnapshot(templatePrefix, period), period) as any;
      assert.ok(result.hypotheses.length >= 1, "fixture must produce at least one hypothesis");
      candidateId = result.hypotheses[0].id;
    } finally { seedDb.close(); }
    const review = await api("/v1/self-understanding/reviews", "POST", { userId, candidateId, rating: "fits" });
    assert.equal(review.response.status, 201);
    assert.equal(review.body.selfModelUpdate, "proposed");
    return review.body.selfModelCandidateId as string;
  };
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100 && !ready; attempt += 1) { try { ready = (await fetch(`http://127.0.0.1:${port}/healthz`)).ok; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); } }
    assert.equal(ready, true);

    const user = (await api("/v1/users", "POST", { authSubject: `self-model-review-${port}` })).body as { id: string };

    // --- Core guarantee: proposing a candidate (via a "fits" hypothesis review) must not, by
    // itself, create anything in self_beliefs. Only an explicit review call may do that. ---
    const acceptCandidateId = await seedProposedCandidate(user.id, "pcs_daily_accept", { startAt: "2026-07-01T00:00:00.000Z", endAt: "2026-07-10T00:00:00.000Z" });
    const beforeAnyReview = (await api(`/v1/self-understanding/context-export?userId=${user.id}`)).body;
    assert.deepEqual(beforeAnyReview.acceptedItems, []);
    assert.equal(beforeAnyReview.proposedItems.length, 1);

    // Invalid status value is rejected outright.
    const invalidStatus = await api("/v1/self-understanding/self-model-candidates/review", "POST", { userId: user.id, candidateId: acceptCandidateId, status: "auto_approved" });
    assert.equal(invalidStatus.response.status, 400);
    assert.equal(invalidStatus.body.error, "self_model_review_invalid");

    // A candidate that doesn't exist (or was already reviewed) cannot be reviewed again.
    const missing = await api("/v1/self-understanding/self-model-candidates/review", "POST", { userId: user.id, candidateId: "self_model_candidate_never_seeded", status: "accepted" });
    assert.equal(missing.response.status, 404);
    assert.equal(missing.body.error, "self_model_candidate_not_found");

    // --- Explicit acceptance is the only path that writes to self_beliefs. ---
    const accepted = await api("/v1/self-understanding/self-model-candidates/review", "POST", { userId: user.id, candidateId: acceptCandidateId, status: "accepted" });
    assert.equal(accepted.response.status, 200);
    assert.equal(accepted.body.status, "accepted");
    assert.ok(accepted.body.selfBeliefId);
    const afterAccept = (await api(`/v1/self-understanding/context-export?userId=${user.id}`)).body;
    assert.equal(afterAccept.acceptedItems.length, 1);
    assert.equal(afterAccept.acceptedItems[0].legacyId, accepted.body.selfBeliefId);
    // The candidate is no longer "proposed" -- reviewing it again must fail, not silently re-accept.
    const reReview = await api("/v1/self-understanding/self-model-candidates/review", "POST", { userId: user.id, candidateId: acceptCandidateId, status: "accepted" });
    assert.equal(reReview.response.status, 404);

    // --- Rejection is equally explicit and must never create a self belief. ---
    const rejectCandidateId = await seedProposedCandidate(user.id, "pcs_daily_reject", { startAt: "2026-07-11T00:00:00.000Z", endAt: "2026-07-20T00:00:00.000Z" });
    const rejected = await api("/v1/self-understanding/self-model-candidates/review", "POST", { userId: user.id, candidateId: rejectCandidateId, status: "rejected" });
    assert.equal(rejected.response.status, 200);
    assert.equal(rejected.body.status, "rejected");
    assert.equal(rejected.body.selfBeliefId, null);
    const afterReject = (await api(`/v1/self-understanding/context-export?userId=${user.id}`)).body;
    assert.equal(afterReject.acceptedItems.length, 1, "rejection must not add a second accepted item");
    const candidatesAfterReject = (await api(`/v1/self-understanding/self-model-candidates?userId=${user.id}`)).body.items;
    const rejectedRow = candidatesAfterReject.find((item: any) => item.id === rejectCandidateId);
    assert.equal(rejectedRow.status, "rejected");

    // --- "update_existing" must target a real, matching belief -- it cannot silently overwrite
    // an unrelated one, and it cannot proceed with a target that was never validated. ---
    const updateCandidateId = await seedProposedCandidate(user.id, "pcs_daily_update", { startAt: "2026-07-21T00:00:00.000Z", endAt: "2026-07-30T00:00:00.000Z" });
    const badTarget = await api("/v1/self-understanding/self-model-candidates/review", "POST", { userId: user.id, candidateId: updateCandidateId, status: "accepted", resolutionAction: "update_existing", targetSelfBeliefId: "belief_that_does_not_exist" });
    assert.equal(badTarget.response.status, 400);
    assert.equal(badTarget.body.error, "self_model_update_target_invalid");
  } finally {
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 150));
    try { rmSync(directory, { recursive: true, force: true }); } catch { /* Windows may release the SQLite handle after the test process exits. */ }
  }
});
