import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SqliteSelfUnderstandingRepository } from "../apps/api/src/selfUnderstandingRepository.ts";

// v1-scope.md item 4 ("Rate a hypothesis as fits / does not fit / on hold") had zero automated
// coverage: POST /v1/self-understanding/reviews was never called by any test. This is one of the
// product's core non-automation guarantees (a human decides whether a hypothesis fits; the system
// never auto-rates), so it should not stay unverified.
//
// The real HTTP endpoint POST /v1/self-understanding/analyze requires a live PCS server
// (loadPersonalContextSnapshot calls out over the network), which is too heavy for this test and
// unrelated to what we're verifying here. Instead we seed a candidate the same way that endpoint
// does internally -- by calling SqliteSelfUnderstandingRepository.analyze() directly against the
// same SQLite file the HTTP server uses -- using the same snapshot fixture already proven to
// produce a real hypothesis in test/self-understanding.test.ts ("Personal Context Studio snapshots
// are analyzed without copying records into MeTheory").

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
  return { schemaVersion: "pcs-context-analysis-snapshot-v1", generatedAt: "2026-07-10T00:00:00.000Z", records, excluded: { unconfirmed: 0, nonShareable: 0, invalid: 0 }, period };
}

test("hypothesis review: rating a candidate requires a human decision and is never automated", async () => {
  const port = 18500 + Math.floor(Math.random() * 200);
  const directory = mkdtempSync(join(tmpdir(), "metheory-hyp-review-"));
  const database = join(directory, "api.sqlite3");
  const child = spawn(process.execPath, ["--experimental-strip-types", "apps/api/src/server.ts"], { env: { ...process.env, PORT: String(port), METHEORY_DB: database }, stdio: "ignore" });
  const api = async (path: string, method = "GET", value?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: value ? { "content-type": "application/json" } : undefined, body: value ? JSON.stringify(value) : undefined });
    return { response, body: await response.json() as any };
  };
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100 && !ready; attempt += 1) { try { ready = (await fetch(`http://127.0.0.1:${port}/healthz`)).ok; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); } }
    assert.equal(ready, true);

    const user = (await api("/v1/users", "POST", { authSubject: `hyp-review-${port}` })).body as { id: string };

    // Seed two independent candidates directly through the repository, exactly the way the real
    // /v1/self-understanding/analyze endpoint does internally, minus the live PCS network call.
    const periodA = { startAt: "2026-07-01T00:00:00.000Z", endAt: "2026-07-10T00:00:00.000Z" };
    const periodB = { startAt: "2026-07-11T00:00:00.000Z", endAt: "2026-07-20T00:00:00.000Z" };
    const seedDb = new DatabaseSync(database);
    let candidateFits: string; let candidateHold: string;
    try {
      const repository = new SqliteSelfUnderstandingRepository(seedDb);
      const resultA = repository.analyze(user.id, pcsSnapshot("pcs_daily_a", periodA), periodA) as any;
      assert.ok(resultA.hypotheses.length >= 1, "fixture must produce at least one hypothesis");
      candidateFits = resultA.hypotheses[0].id;
      const resultB = repository.analyze(user.id, pcsSnapshot("pcs_daily_b", periodB), periodB) as any;
      assert.ok(resultB.hypotheses.length >= 1, "fixture must produce at least one hypothesis");
      candidateHold = resultB.hypotheses[0].id;
      assert.notEqual(candidateFits, candidateHold, "the two seeded candidates must be independent");
    } finally { seedDb.close(); }

    // Before any review, nothing has been rated.
    assert.deepEqual((await api(`/v1/self-understanding/reviews?userId=${user.id}`)).body.items, []);

    // Invalid rating value is rejected, not silently coerced.
    const invalid = await api("/v1/self-understanding/reviews", "POST", { userId: user.id, candidateId: candidateFits, rating: "definitely_true" });
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.body.error, "hypothesis_review_invalid");

    // A candidate that was never analyzed cannot be rated.
    const missing = await api("/v1/self-understanding/reviews", "POST", { userId: user.id, candidateId: "candidate_never_seeded", rating: "fits" });
    assert.equal(missing.response.status, 404);
    assert.equal(missing.body.error, "self_understanding_candidate_not_found");

    // Rating "fits" is the only rating that proposes a Self Model change -- and it only proposes,
    // it does not accept it (that guarantee is covered separately in self-model-review-api.test.ts).
    const fits = await api("/v1/self-understanding/reviews", "POST", { userId: user.id, candidateId: candidateFits, rating: "fits", note: "Matches how mornings actually go." });
    assert.equal(fits.response.status, 201);
    assert.equal(fits.body.rating, "fits");
    assert.equal(fits.body.selfModelUpdate, "proposed");
    assert.ok(fits.body.selfModelCandidateId);
    const proposedCandidates = (await api(`/v1/self-understanding/self-model-candidates?userId=${user.id}`)).body.items;
    assert.equal(proposedCandidates.length, 1);
    assert.equal(proposedCandidates[0].status, "proposed");
    assert.equal(proposedCandidates[0].id, fits.body.selfModelCandidateId);

    // "on_hold" (and by the same code path, "does_not_fit") never proposes a Self Model change.
    const hold = await api("/v1/self-understanding/reviews", "POST", { userId: user.id, candidateId: candidateHold, rating: "on_hold" });
    assert.equal(hold.response.status, 201);
    assert.equal(hold.body.selfModelUpdate, "none");
    assert.equal(hold.body.selfModelCandidateId, null);
    // The self-model-candidates list must still show only the one from the "fits" rating.
    assert.equal((await api(`/v1/self-understanding/self-model-candidates?userId=${user.id}`)).body.items.length, 1);

    // Both ratings are recorded in the review history, independent of whether they proposed anything.
    const reviews = (await api(`/v1/self-understanding/reviews?userId=${user.id}`)).body.items;
    assert.equal(reviews.length, 2);
    assert.deepEqual(new Set(reviews.map((review: any) => review.rating)), new Set(["fits", "on_hold"]));
  } finally {
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 150));
    try { rmSync(directory, { recursive: true, force: true }); } catch { /* Windows may release the SQLite handle after the test process exits. */ }
  }
});
