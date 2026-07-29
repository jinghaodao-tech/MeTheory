#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const api = process.env.METHEORY_API_URL ?? "http://127.0.0.1:8100";
const userId = process.env.METHEORY_USER_ID ?? "local-user";
const databasePath = process.env.METHEORY_DB ?? join(root, "data", "metheory.sqlite3");

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${api}${path}`, init);
  const payload = await response.json() as any;
  if (!response.ok) throw new Error(payload.error ?? `api_${response.status}`);
  return payload;
}

function print(value: unknown) { console.log(JSON.stringify(value, null, 2)); }
function pidPath() { return join(root, ".metheory", "analysis-service.pid"); }
function serviceStart() {
  mkdirSync(join(root, ".metheory"), { recursive: true });
  if (existsSync(pidPath())) try { process.kill(Number(readFileSync(pidPath(), "utf8")), 0); return print({ started: false, reason: "already_running" }); } catch { rmSync(pidPath(), { force: true }); }
  const server = resolve(import.meta.dirname, "../../api/src/server.ts");
  const child = spawn(process.execPath, ["--experimental-strip-types", server], { env: { ...process.env, PORT: "8100", METHEORY_DB: databasePath }, detached: true, stdio: "ignore" });
  writeFileSync(pidPath(), String(child.pid)); child.unref(); print({ started: true, pid: child.pid, api });
}
function serviceStop() { if (!existsSync(pidPath())) return print({ stopped: false, reason: "not_running" }); try { process.kill(Number(readFileSync(pidPath(), "utf8"))); } catch { /* already stopped */ } rmSync(pidPath(), { force: true }); print({ stopped: true }); }
function serviceStatus() { let running = false; let pid: number | null = null; if (existsSync(pidPath())) { pid = Number(readFileSync(pidPath(), "utf8")); try { process.kill(pid, 0); running = true; } catch { pid = null; } } print({ running, pid, api, databasePath }); }

async function selfUnderstanding(command: string, args: string[]) {
  if (command === "analyze") { const startAt = args.find((item) => item.startsWith("--from="))?.slice(7); const endAt = args.find((item) => item.startsWith("--to="))?.slice(5); return print(await request("/v1/self-understanding/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, startAt, endAt, minimumEntryCount: 8 }) })); }
  if (command === "review" && args[0] && args[1]) return print(await request("/v1/self-understanding/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, candidateId: args[0], rating: args[1], statement: args.slice(2).join(" ") }) }));
  if (command === "self-model") return print(await request(`/v1/self-understanding/self-model-candidates?userId=${encodeURIComponent(userId)}`));
  if (command === "self-model-review" && args[0] && args[1]) return print(await request("/v1/self-understanding/self-model-candidates/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, candidateId: args[0], status: args[1] }) }));
  if (command === "baseline") return print(await request(`/v1/self-understanding/baseline/responses?userId=${encodeURIComponent(userId)}`));
  throw new Error("self_understanding_command_invalid");
}

async function activityWatch(command: string, args: string[]) {
  if (command === "status" || command === "buckets") return print(await request(`/v1/activitywatch/${command}`));
  if (command === "list") return print(await request(`/v1/activitywatch/observations?userId=${encodeURIComponent(userId)}`));
  const startAt = args.find((item) => item.startsWith("--from="))?.slice(7) ?? ""; const endAt = args.find((item) => item.startsWith("--to="))?.slice(5) ?? "";
  const bucketIds = args.filter((item) => item.startsWith("--bucket=")).map((item) => item.slice(9));
  if (!startAt || !endAt || !bucketIds.length) throw new Error("activitywatch_period_and_bucket_required");
  return print(await request(`/v1/activitywatch/${command === "preview" ? "preview" : "import"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, startAt, endAt, bucketIds, confirm: args.includes("--confirm") }) }));
}

async function privacy(command: string) {
  if (command === "status") return print(await request(`/v1/privacy/status?userId=${encodeURIComponent(userId)}`));
  if (command === "consents") return print(await request(`/v1/privacy/consents?userId=${encodeURIComponent(userId)}&includeRevoked=true`));
  if (command === "audit") return print(await request(`/v1/privacy/audit-events?userId=${encodeURIComponent(userId)}`));
  throw new Error("privacy_command_invalid");
}

async function main() {
  const [, , command, sub, ...args] = process.argv;
  if (command === "service" && sub === "start") return serviceStart();
  if (command === "service" && sub === "stop") return serviceStop();
  if (command === "service" && sub === "status") return serviceStatus();
  if (command === "personal-context" && sub === "export-migration") return print(await request(`/v1/self-understanding/context-export?userId=${encodeURIComponent(userId)}`));
  if (command === "self-understanding" && sub === "context-candidate" && args[0] === "export") return print(await request("/v1/self-understanding/context-candidates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, candidateId: args[1], rating: args[2] ?? "fits" }) }));
  if (command === "self-understanding") return selfUnderstanding(sub ?? "", args);
  if (command === "activitywatch") return activityWatch(sub ?? "", args);
  if (command === "privacy") return privacy(sub ?? "");
  throw new Error("usage: service|self-understanding|personal-context|activitywatch|privacy");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
