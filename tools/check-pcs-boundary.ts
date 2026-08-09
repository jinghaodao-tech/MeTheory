import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = ["packages/self-understanding/src/pcsSnapshotAnalysis.ts", "apps/api/src/services/pcsAnalysisService.ts", "apps/api/src/pcsAnalysisRepository.ts"];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  assert.match(source, /personal-context-studio\/integration-contracts/, `${file} must use the official PCS contract`);
  assert.doesNotMatch(source, /packages[\\/]contracts[\\/]src[\\/]pcsAnalysisSnapshotV2/, `${file} must not import the legacy local V2 PCS contract`);
}
console.log(`PCS boundary check passed: ${files.length} files`);
