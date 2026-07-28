import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../src/index.js";

class FakeD1Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async first() {
    const { sql, args } = this;
    if (sql.includes("WHERE repository = ? AND pr_number = ? AND head_sha = ? AND review_cycle = ?")) {
      return this.db.rows.find((row) => row.repository === args[0] && row.pr_number === args[1] && row.head_sha === args[2] && row.review_cycle === args[3]) ?? null;
    }
    if (sql.includes("WHERE fingerprint = ?")) return this.db.rows.find((row) => row.fingerprint === args[0]) ?? null;
    if (sql.includes("WHERE id = ?")) return this.db.rows.find((row) => row.id === args[0]) ?? null;
    if (sql.includes("WHERE repository = ? AND pr_number = ? AND status = ?")) {
      return this.db.rows.filter((row) => row.repository === args[0] && row.pr_number === args[1] && row.status === args[2]).sort((a, b) => a.created_at.localeCompare(b.created_at)).at(-1) ?? null;
    }
    return null;
  }

  async run() {
    const { sql, args } = this;
    if (sql.startsWith("INSERT OR IGNORE")) {
      const [id, repository, pr_number, head_sha, result, objective, blocking, suggestions, acceptance, constraints, review_cycle, fingerprint, created_at, updated_at] = args;
      if (!this.db.rows.some((row) => row.repository === repository && row.pr_number === pr_number && row.head_sha === head_sha && row.review_cycle === review_cycle) && !this.db.rows.some((row) => row.fingerprint === fingerprint)) {
        this.db.rows.push({ id, repository, pr_number, head_sha, result, objective, blocking_issues_json: blocking, suggestions_json: suggestions, acceptance_criteria_json: acceptance, constraints_json: constraints, review_cycle, status: "pending", fingerprint, claimed_at: null, completed_at: null, failure_message: null, created_at, updated_at });
      }
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith("UPDATE review_instructions\n     SET status")) {
      const target = args[0];
      const id = args[args.length - (sql.match(/status IN \(([^)]+)\)/)?.[1].split(",").length ?? 1) - 1];
      const row = this.db.rows.find((item) => item.id === id);
      const allowed = args.slice(args.length - (sql.match(/status IN \(([^)]+)\)/)?.[1].split(",").length ?? 1));
      if (!row || !allowed.includes(row.status)) return { meta: { changes: 0 } };
      row.status = target;
      row.updated_at = args[1];
      if (target === "claimed") row.claimed_at = args[2];
      if (target === "completed") row.completed_at = args[2];
      if (target === "failed") row.failure_message = args[2];
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  }
}

class FakeD1 {
  constructor() { this.rows = []; }
  prepare(sql) { return new FakeD1Statement(this, sql); }
}

const env = () => ({
  DB: new FakeD1(),
  REVIEW_BRIDGE_TOKEN: "test-token",
  ALLOWED_REPOSITORIES: "jinghaodao-tech/MeTheory"
});

async function call(environment, method, path, body, token = "test-token") {
  return worker.fetch(new Request(`https://bridge.example${path}`, {
    method,
    headers: token ? { authorization: `Bearer ${token}`, "content-type": "application/json" } : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  }), environment);
}

function reviewBody(overrides = {}) {
  return {
    repository: "jinghaodao-tech/MeTheory",
    prNumber: 12,
    headSha: "abcdef1234567",
    result: "fail",
    objective: "Fix blocking review issues",
    blockingIssues: [{ file: "apps/api/src/server.ts", problem: "problem", requiredOutcome: "outcome" }],
    suggestions: [],
    acceptanceCriteria: ["tests pass"],
    constraints: ["no unrelated changes"],
    reviewCycle: 1,
    ...overrides
  };
}

test("pull request responses cap large body and diff payloads", async () => {
  const environment = env();
  environment.GITHUB_TOKEN = "github-test-token";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const accept = new Headers(init?.headers).get("accept");
    if (accept === "application/vnd.github.v3.diff") {
      return new Response("d".repeat(200_000), { status: 200 });
    }
    return new Response(JSON.stringify({
      title: "Large PR",
      body: "b".repeat(20_000),
      state: "open",
      draft: false,
      base: { ref: "main" },
      head: { ref: "agent/ai-review-loop", sha: "abcdef1234567" },
      changed_files: 100,
      additions: 1000,
      deletions: 100,
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await call(environment, "GET", "/api/pr/jinghaodao-tech/MeTheory/12");
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.body.length, 8_000);
    assert.equal(payload.bodyTruncated, true);
    assert.equal(payload.bodyCharCount, 20_000);
    assert.equal(payload.diff.length, 60_000);
    assert.equal(payload.diffTruncated, true);
    assert.equal(payload.diffCharCount, 200_000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("review bridge requires bearer auth and allowlists the repository", async () => {
  const environment = env();
  assert.equal((await call(environment, "GET", "/health", undefined, "")).status, 401);
  assert.equal((await call(environment, "GET", "/health")).status, 200);
  assert.equal((await call(environment, "GET", "/api/review-instructions/latest?repository=jinghaodao-tech%2FMeTheory&prNumber=12&status=pending", undefined, "")).status, 401);
  const response = await call(environment, "POST", "/api/review-instructions", reviewBody({ repository: "someone/else" }));
  assert.equal(response.status, 400);
});

test("review cycle and fingerprint duplicates are idempotent", async () => {
  const environment = env();
  const first = await call(environment, "POST", "/api/review-instructions", reviewBody());
  assert.equal(first.status, 201);
  const duplicate = await call(environment, "POST", "/api/review-instructions", reviewBody());
  assert.equal(duplicate.status, 200);
  const conflict = await call(environment, "POST", "/api/review-instructions", reviewBody({ blockingIssues: [{ file: "apps/api/src/server.ts", problem: "different problem", requiredOutcome: "outcome" }] }));
  assert.equal(conflict.status, 409);
});

test("claim is a single conditional state transition", async () => {
  const environment = env();
  const created = await (await call(environment, "POST", "/api/review-instructions", reviewBody())).json();
  const claimed = await call(environment, "POST", `/api/review-instructions/${created.id}/claim`, {});
  assert.equal(claimed.status, 200);
  const secondClaim = await call(environment, "POST", `/api/review-instructions/${created.id}/claim`, {});
  assert.equal(secondClaim.status, 409);
  const completed = await call(environment, "POST", `/api/review-instructions/${created.id}/complete`, {});
  assert.equal(completed.status, 200);
});
