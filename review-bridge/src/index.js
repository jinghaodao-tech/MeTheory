const json = (value, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

const fail = (status, code, message, details) =>
  json({ error: { code, message, ...(details ? { details } : {}) } }, status);

function allowedRepositories(env) {
  return new Set(
    String(env.ALLOWED_REPOSITORIES || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function requireBridgeAuth(request, env) {
  const expected = String(env.REVIEW_BRIDGE_TOKEN || "");
  const supplied = request.headers.get("authorization") || "";
  return expected.length > 0 && supplied === `Bearer ${expected}`;
}

function isSha(value) {
  return typeof value === "string" && /^[0-9a-f]{7,40}$/i.test(value);
}

function isRepository(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function capText(value, maximum) {
  const text = typeof value === "string" ? value : "";
  return {
    value: text.length > maximum ? text.slice(0, maximum) : text,
    truncated: text.length > maximum,
    length: text.length,
  };
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeIssue(issue) {
  return {
    file: typeof issue?.file === "string" ? issue.file : "",
    problem: typeof issue?.problem === "string" ? issue.problem.trim() : "",
    requiredOutcome:
      typeof issue?.requiredOutcome === "string"
        ? issue.requiredOutcome.trim()
        : "",
  };
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function rowToPayload(row) {
  if (!row) return null;
  return {
    id: row.id,
    repository: row.repository,
    prNumber: row.pr_number,
    headSha: row.head_sha,
    result: row.result,
    objective: row.objective,
    blockingIssues: JSON.parse(row.blocking_issues_json),
    suggestions: JSON.parse(row.suggestions_json),
    acceptanceCriteria: JSON.parse(row.acceptance_criteria_json),
    constraints: JSON.parse(row.constraints_json),
    reviewCycle: row.review_cycle,
    status: row.status,
    fingerprint: row.fingerprint,
    claimedAt: row.claimed_at,
    completedAt: row.completed_at,
    failureMessage: row.failure_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function fetchPullRequest(repository, prNumber, env) {
  if (!allowedRepositories(env).has(repository)) {
    return { response: fail(403, "repository_not_allowed", "Repository is not allowlisted.") };
  }

  const token = String(env.GITHUB_TOKEN || "");
  if (!token) {
    return { response: fail(500, "github_token_missing", "GITHUB_TOKEN is not configured.") };
  }

  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
    "user-agent": "metheory-review-bridge",
  };

  const metadataResponse = await fetch(
    `https://api.github.com/repos/${repository}/pulls/${prNumber}`,
    { headers },
  );

  if (!metadataResponse.ok) {
    return {
      response: fail(
        metadataResponse.status,
        "github_pr_fetch_failed",
        "Could not fetch pull request metadata.",
      ),
    };
  }

  const pr = await metadataResponse.json();
  const diffResponse = await fetch(
    `https://api.github.com/repos/${repository}/pulls/${prNumber}`,
    {
      headers: {
        ...headers,
        accept: "application/vnd.github.v3.diff",
      },
    },
  );

  if (!diffResponse.ok) {
    return {
      response: fail(
        diffResponse.status,
        "github_diff_fetch_failed",
        "Could not fetch pull request diff.",
      ),
    };
  }

  const diff = capText(await diffResponse.text(), 60_000);
  const body = capText(pr.body || "", 8_000);

  return {
    value: {
      repository,
      prNumber,
      title: pr.title,
       body: body.value,
       bodyTruncated: body.truncated,
       bodyCharCount: body.length,
      state: pr.state,
      draft: Boolean(pr.draft),
      baseRef: pr.base?.ref || "",
      headRef: pr.head?.ref || "",
      headSha: pr.head?.sha || "",
      changedFiles: pr.changed_files,
      additions: pr.additions,
      deletions: pr.deletions,
       diff: diff.value,
       diffTruncated: diff.truncated,
       diffCharCount: diff.length,
    },
  };
}

async function createInstruction(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, "invalid_json", "Request body must be valid JSON.");
  }

  const repository = body.repository;
  const prNumber = Number(body.prNumber);
  const headSha = body.headSha;
  const result = body.result;
  const reviewCycle = Number(body.reviewCycle ?? 1);

  if (!isRepository(repository) || !allowedRepositories(env).has(repository)) {
    return fail(400, "invalid_repository", "Repository is invalid or not allowlisted.");
  }
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return fail(400, "invalid_pr_number", "prNumber must be a positive integer.");
  }
  if (!isSha(headSha)) {
    return fail(400, "invalid_head_sha", "headSha must be a Git commit SHA.");
  }
  if (!["pass", "fail"].includes(result)) {
    return fail(400, "invalid_result", "result must be pass or fail.");
  }
  if (!Number.isInteger(reviewCycle) || reviewCycle < 1 || reviewCycle > 10) {
    return fail(400, "invalid_review_cycle", "reviewCycle must be between 1 and 10.");
  }

  const blockingIssues = safeArray(body.blockingIssues)
    .map(normalizeIssue)
    .filter((issue) => issue.problem && issue.requiredOutcome);
  const suggestions = safeArray(body.suggestions);
  const acceptanceCriteria = safeArray(body.acceptanceCriteria)
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim());
  const constraints = safeArray(body.constraints)
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim());

  if (result === "fail" && blockingIssues.length === 0) {
    return fail(400, "missing_blocking_issues", "A failed review needs at least one blocking issue.");
  }
  if (result === "pass" && blockingIssues.length > 0) {
    return fail(400, "unexpected_blocking_issues", "A passing review cannot contain blocking issues.");
  }

  const objective =
    typeof body.objective === "string" && body.objective.trim()
      ? body.objective.trim()
      : result === "pass"
        ? "修正必須項目なし"
        : "レビューで見つかった修正必須項目を解消する";

  const fingerprintInput = JSON.stringify({
    repository,
    prNumber,
    headSha,
    reviewCycle,
    result,
    blockingIssues,
  });
  const fingerprint = await sha256Hex(fingerprintInput);
  const id = `rev_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  const existingIdentity = await env.DB.prepare(
    `SELECT * FROM review_instructions
     WHERE repository = ? AND pr_number = ? AND head_sha = ? AND review_cycle = ?`
  )
    .bind(repository, prNumber, headSha, reviewCycle)
    .first();
  if (existingIdentity) {
    if (existingIdentity.fingerprint === fingerprint) {
      return json(rowToPayload(existingIdentity), 200);
    }
    return fail(409, "review_cycle_exists", "A different review already exists for this PR head and cycle.");
  }

  await env.DB.prepare(
    `INSERT OR IGNORE INTO review_instructions (
      id, repository, pr_number, head_sha, result, objective,
      blocking_issues_json, suggestions_json, acceptance_criteria_json,
      constraints_json, review_cycle, status, fingerprint, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
  )
    .bind(
      id,
      repository,
      prNumber,
      headSha,
      result,
      objective,
      JSON.stringify(blockingIssues),
      JSON.stringify(suggestions),
      JSON.stringify(acceptanceCriteria),
      JSON.stringify(constraints),
      reviewCycle,
      fingerprint,
      now,
      now,
    )
    .run();

  const row = await env.DB.prepare(
    `SELECT * FROM review_instructions WHERE fingerprint = ?`,
  )
    .bind(fingerprint)
    .first();

  if (row) return json(rowToPayload(row), 201);
  const racedIdentity = await env.DB.prepare(
    `SELECT * FROM review_instructions
     WHERE repository = ? AND pr_number = ? AND head_sha = ? AND review_cycle = ?`
  )
    .bind(repository, prNumber, headSha, reviewCycle)
    .first();
  if (racedIdentity?.fingerprint === fingerprint) return json(rowToPayload(racedIdentity), 200);
  if (racedIdentity) return fail(409, "review_cycle_exists", "A different review already exists for this PR head and cycle.");
  return fail(500, "review_insert_failed", "Review instruction could not be stored.");
}

async function latestInstruction(url, env) {
  const repository = url.searchParams.get("repository") || "";
  const prNumber = Number(url.searchParams.get("prNumber"));
  const status = url.searchParams.get("status") || "pending";

  if (!isRepository(repository) || !allowedRepositories(env).has(repository)) {
    return fail(400, "invalid_repository", "Repository is invalid or not allowlisted.");
  }
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return fail(400, "invalid_pr_number", "prNumber must be a positive integer.");
  }
  if (!["pending", "claimed", "completed", "failed", "stale"].includes(status)) {
    return fail(400, "invalid_status", "Unsupported status.");
  }

  const row = await env.DB.prepare(
    `SELECT * FROM review_instructions
     WHERE repository = ? AND pr_number = ? AND status = ?
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(repository, prNumber, status)
    .first();

  return row ? json(rowToPayload(row)) : new Response(null, { status: 204 });
}

async function transitionInstruction(id, target, request, env) {
  const existing = await env.DB.prepare(
    `SELECT * FROM review_instructions WHERE id = ?`,
  )
    .bind(id)
    .first();

  if (!existing) return fail(404, "instruction_not_found", "Instruction was not found.");

  const now = new Date().toISOString();
  let allowedFrom = [];
  let extraSql = "";
  let extraBindings = [];

  if (target === "claimed") {
    allowedFrom = ["pending", "failed"];
    extraSql = ", claimed_at = ?, failure_message = NULL";
    extraBindings = [now];
  } else if (target === "completed") {
    allowedFrom = ["claimed"];
    extraSql = ", completed_at = ?";
    extraBindings = [now];
  } else if (target === "failed") {
    allowedFrom = ["claimed"];
    let body = {};
    try {
      body = await request.json();
    } catch {}
    const message =
      typeof body.message === "string" ? body.message.slice(0, 4000) : "Unknown failure";
    extraSql = ", failure_message = ?";
    extraBindings = [message];
  } else if (target === "stale") {
    allowedFrom = ["pending", "claimed", "failed"];
  }

  if (!allowedFrom.includes(existing.status)) {
    return fail(409, "invalid_transition", `Cannot transition ${existing.status} to ${target}.`);
  }

  const transition = await env.DB.prepare(
    `UPDATE review_instructions
     SET status = ?, updated_at = ? ${extraSql}
     WHERE id = ? AND status IN (${allowedFrom.map(() => "?").join(",")})`,
  )
    .bind(target, now, ...extraBindings, id, ...allowedFrom)
    .run();

  if (!transition.meta || transition.meta.changes !== 1) {
    return fail(409, "transition_race", "The review changed state before this transition completed.");
  }

  const updated = await env.DB.prepare(
    `SELECT * FROM review_instructions WHERE id = ?`,
  )
    .bind(id)
    .first();

  return json(rowToPayload(updated));
}

async function releaseExpiredClaims(env) {
  const ttl = Math.max(5, Number(env.CLAIM_TTL_MINUTES || 30));
  const cutoff = new Date(Date.now() - ttl * 60_000).toISOString();
  await env.DB.prepare(
    `UPDATE review_instructions
     SET status = 'pending', claimed_at = NULL, updated_at = ?
     WHERE status = 'claimed' AND claimed_at < ?`,
  )
    .bind(new Date().toISOString(), cutoff)
    .run();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!requireBridgeAuth(request, env)) {
      return fail(401, "unauthorized", "Missing or invalid bearer token.");
    }

    if (url.pathname === "/health") {
      return json({ ok: true, service: "metheory-review-bridge" });
    }

    await releaseExpiredClaims(env);

    const prMatch = url.pathname.match(/^\/api\/pr\/([^/]+)\/([^/]+)\/(\d+)$/);
    if (request.method === "GET" && prMatch) {
      const repository = `${decodeURIComponent(prMatch[1])}/${decodeURIComponent(prMatch[2])}`;
      const result = await fetchPullRequest(repository, Number(prMatch[3]), env);
      return result.response || json(result.value);
    }

    if (request.method === "POST" && url.pathname === "/api/review-instructions") {
      return createInstruction(request, env);
    }

    if (request.method === "GET" && url.pathname === "/api/review-instructions/latest") {
      return latestInstruction(url, env);
    }

    const transitionMatch = url.pathname.match(
      /^\/api\/review-instructions\/([^/]+)\/(claim|complete|fail|stale)$/,
    );
    if (request.method === "POST" && transitionMatch) {
      const target = {
        claim: "claimed",
        complete: "completed",
        fail: "failed",
        stale: "stale",
      }[transitionMatch[2]];
      return transitionInstruction(decodeURIComponent(transitionMatch[1]), target, request, env);
    }

    return fail(404, "not_found", "Route not found.");
  },
};
