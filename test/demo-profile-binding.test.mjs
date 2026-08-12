import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("demo profile binding uses the MeTheory PCS API field name", () => {
  const source = readFileSync("apps/demo-web/server.mjs", "utf8");
  assert.match(source, /body: JSON\.stringify\(\{ userId: state\.userId, profileId: state\.profileId \}\)/);
  assert.doesNotMatch(source, /body: JSON\.stringify\(\{ userId: state\.userId, pcsProfileId:/);
});

test("demo state reads the current paginated PCS analysis route", () => {
  const source = readFileSync("apps/demo-web/server.mjs", "utf8");
  assert.match(source, /\/v1\/pcs\/analysis-runs\?userId=/);
  assert.doesNotMatch(source, /\/v1\/pcs\/analysis-history\?userId=/);
});
