import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const port = Number(process.env.DEMO_PORT ?? 8110);
const apiPort = Number(process.env.METHEORY_DEMO_API_PORT ?? 8111);
const apiBase = `http://127.0.0.1:${apiPort}`;
const dbPath = resolve(root, "data", "demo.sqlite3");
mkdirSync(resolve(root, "data"), { recursive: true });
const state = { mode: "fixture", userId: null, profileId: "profile_fixture", analysisId: null, run: null };
let apiProcess;

function send(response, status, payload, contentType = "application/json; charset=utf-8") {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  response.writeHead(status, { "content-type": contentType, "content-length": Buffer.byteLength(body) });
  response.end(body);
}

async function api(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, { ...options, headers: { "content-type": "application/json", ...(options.headers ?? {}) } });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { error: "api_invalid_json" }; }
  if (!response.ok) {
    const error = new Error(payload?.error ?? `api_http_${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function ensureDemoIdentity() {
  if (!state.userId) {
    const user = await api("/v1/users", { method: "POST", body: JSON.stringify({ authSubject: "demo-fixture-user", locale: "ja-JP", timezone: "Asia/Tokyo" }) });
    state.userId = user.id;
  }
  const binding = await api(`/v1/pcs/profile-binding?userId=${encodeURIComponent(state.userId)}`);
  if (!binding.binding || binding.binding.pcsProfileId !== state.profileId) {
    await api("/v1/pcs/profile-binding", { method: "POST", body: JSON.stringify({ userId: state.userId, profileId: state.profileId }) });
  }
}

async function waitForApi() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { await api("/healthz"); return; } catch { await new Promise((resolveWait) => setTimeout(resolveWait, 250)); }
  }
  throw new Error("metheory_api_start_timeout");
}

function startApi() {
  apiProcess = spawn(process.execPath, ["--experimental-strip-types", "apps/api/src/server.ts"], {
    cwd: root,
    env: { ...process.env, PORT: String(apiPort), METHEORY_DB: dbPath },
    stdio: "ignore",
    windowsHide: true
  });
  apiProcess.on("exit", (code) => { if (code && server.listening) console.error(`MeTheory API exited with code ${code}`); });
}

const indexPath = join(import.meta.dirname, "index.html");
const indexHtml = readFileSync(indexPath, "utf8");

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    if (url.pathname === "/health") return send(response, 200, { ok: true, service: "metheory-demo-web", api: apiBase });
    if (url.pathname === "/" || url.pathname === "/index.html") return send(response, 200, indexHtml, "text/html; charset=utf-8");
    if (url.pathname === "/api/demo/state") {
      await ensureDemoIdentity();
      const history = await api(`/v1/pcs/analysis-history?userId=${encodeURIComponent(state.userId)}`);
      const experiments = await api(`/v1/experiments?userId=${encodeURIComponent(state.userId)}`);
      const selfModel = await api(`/v1/self-understanding/self-model-candidates?userId=${encodeURIComponent(state.userId)}`);
      return send(response, 200, { mode: state.mode, userId: state.userId, profileId: state.profileId, analysisId: state.analysisId, run: state.run ?? history.items?.[0] ?? null, history: history.items ?? [], experiments: experiments.items ?? [], selfModel: selfModel.items ?? [], notes: ["Fixture mode is deterministic and local.", "Mobile is experimental; this web flow is the portfolio path."] });
    }
    if (url.pathname === "/api/demo/fixture/analyze" && request.method === "POST") {
      await ensureDemoIdentity();
      const fixture = JSON.parse(readFileSync(resolve(root, "fixtures", "pcs-analysis-snapshot-v2.json"), "utf8"));
      const result = await api("/v1/pcs/analyze", { method: "POST", body: JSON.stringify({ userId: state.userId, snapshot: fixture, minimumTotalSamples: 8, maximumCandidates: 5 }) });
      state.analysisId = result.analysisId;
      state.run = result.run;
      state.mode = "fixture";
      return send(response, 200, { ...result, mode: "fixture" });
    }
    if (url.pathname === "/api/demo/live-analyze" && request.method === "POST") {
      await ensureDemoIdentity();
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      const result = await api("/v1/pcs/live-analyze", { method: "POST", body: JSON.stringify({ ...input, userId: state.userId, profileId: state.profileId }) });
      state.analysisId = result.analysisId;
      state.run = result.run;
      state.mode = "live";
      return send(response, 200, { ...result, mode: "live" });
    }
    if (url.pathname.startsWith("/api/metheory/")) {
      await ensureDemoIdentity();
      const targetPath = url.pathname.slice("/api/metheory".length) + (url.search || "");
      const body = ["GET", "HEAD"].includes(request.method ?? "GET") ? undefined : await new Promise((resolveBody, rejectBody) => {
        const chunks = [];
        request.on("data", (chunk) => chunks.push(chunk));
        request.on("end", () => resolveBody(Buffer.concat(chunks)));
        request.on("error", rejectBody);
      });
      const result = await api(targetPath, { method: request.method, body });
      return send(response, 200, result);
    }
    return send(response, 404, { error: "not_found" });
  } catch (error) {
    const status = Number(error?.status) || 502;
    return send(response, status, { error: error?.message ?? "demo_request_failed", details: error?.payload ?? undefined });
  }
});

startApi();
await waitForApi();
server.listen(port, "127.0.0.1", () => console.log(`MeTheory demo: http://127.0.0.1:${port}`));

function shutdown() {
  server.close();
  if (apiProcess && !apiProcess.killed) apiProcess.kill();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
