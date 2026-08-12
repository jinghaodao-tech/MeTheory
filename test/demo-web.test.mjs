import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const serverPath = "apps/demo-web/server.mjs";
const indexPath = "apps/demo-web/index.html";

test("demo web entrypoint is valid and uses the local API", () => {
  execFileSync(process.execPath, ["--check", serverPath], { stdio: "pipe" });
  const server = readFileSync(serverPath, "utf8");
  const index = readFileSync(indexPath, "utf8");
  assert.match(server, /127\.0\.0\.1/);
  assert.match(server, /pcs-analysis-snapshot-v2\.json/);
  assert.match(index, /Fixture/);
  assert.match(index, /Self Model/);
  assert.match(index, /data-draft/);
  assert.match(index, /data-checkin/);
  assert.match(index, /比較可能な記録/);
  assert.match(index, /parameterLabel/);
  assert.doesNotMatch(index, /Condition: \$\{esc\(candidate\.candidate\.conditionParameterId\)\}/);
});

test("demo does not expose a cloud AI dependency", () => {
  const server = readFileSync(serverPath, "utf8");
  assert.doesNotMatch(server, /OPENAI_API_KEY|https:\/\/api\.openai\.com/);
});
