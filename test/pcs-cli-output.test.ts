import test from "node:test";
import assert from "node:assert/strict";
import { formatPcsAnalysis, summarizePcsAnalysis } from "../apps/cli/src/personalContextOutput.ts";

test("PCS CLI summarizes analysis without raw values", () => {
  const summary = summarizePcsAnalysis({
    status: "ready",
    snapshotId: "snapshot-1",
    profileId: "profile-1",
    analysisRunId: "run-1",
    period: { startAt: "2026-07-01T00:00:00.000Z", endAt: "2026-08-01T00:00:00.000Z", timezone: "Asia/Tokyo" },
    dataQuality: { recordCount: 12, usableValueCount: 24, excludedFieldCount: 1, excludedValueCount: 2 },
    candidateAudit: { comparisonCount: 3, preSignificanceCandidates: 1, significanceRejectedCandidates: 1, acceptedCandidatesBeforeLimit: 0 },
    excludedFields: [{ templateId: "template-1", templateVersionId: "1", fieldKey: "stress", label: "Stress", reason: "privacy_not_allowed" }],
    hypotheses: [{
      id: "hypothesis-1",
      statement: "明確な条件では開始が早い可能性があります。",
      construct: "task_initiation",
      tendencyScope: "state_dependent",
      status: "emerging",
      confidence: 0.75,
      dataShortage: [],
      supportingEvidence: [{ episodeId: "entry-1" }],
      contradictingEvidence: []
    }]
  } as never);
  assert.equal(summary.hypotheses[0]?.supportingEvidenceCount, 1);
  assert.deepEqual(summary.candidateAudit, { comparisonCount: 3, preSignificanceCandidates: 1, significanceRejectedCandidates: 1, acceptedCandidatesBeforeLimit: 0 });
  assert.equal(JSON.stringify(summary).includes("conditionValue"), false);
  assert.match(formatPcsAnalysis(summary), /PCS実データ分析/);
  assert.match(formatPcsAnalysis(summary), /記録数: 12/);
});

test("PCS CLI explains an empty real-data period", () => {
  const output = formatPcsAnalysis({
    status: "insufficient",
    snapshotId: "snapshot-empty",
    profileId: "profile-1",
    period: { startAt: "2026-07-01T00:00:00.000Z", endAt: "2026-08-01T00:00:00.000Z", timezone: "Asia/Tokyo" },
    dataQuality: { recordCount: 0, usableValueCount: 0, excludedFieldCount: 0, excludedValueCount: 0 },
    excludedFields: [],
    hypotheses: []
  });
  assert.match(output, /Markdownを登録/);
});
