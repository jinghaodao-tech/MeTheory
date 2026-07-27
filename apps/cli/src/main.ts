#!/usr/bin/env node
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, watch, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { buildManualTemplatePrompt, type TemplateDraft } from "../../../packages/templates/src/index.ts";
import { createAiProvider, ManualExternalAiProvider, type MeTheoryAiProvider } from "../../../packages/ai-core/src/index.ts";
import { detectOllama, detectOpenAiCompatible, RuntimeManager } from "../../../packages/local-ai-runtime/src/index.ts";
import { extractEntryValues, extractionIsStale } from "../../../packages/entry-extraction/src/index.ts";
import { readMarkdownEntry, withEntryMetadata, resolveWorkspaceDatabase, validateWorkspaceConfig, type WorkspaceConfig } from "../../../packages/workspace-sync/src/index.ts";

const root = process.cwd();
const configPath = join(root, ".metheory", "workspace.json");
const config = existsSync(configPath) ? validateWorkspaceConfig(JSON.parse(readFileSync(configPath, "utf8"))) : null;
const api = process.env.METHEORY_API_URL ?? config?.service?.apiUrl ?? "http://127.0.0.1:8100";
const userId = process.env.METHEORY_USER_ID ?? "local-user";

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${api}${path}`, init);
  const data = await response.json() as any;
  if (!response.ok) throw new Error(data.error ?? `api_${response.status}`);
  return data;
}

function initWorkspace() {
  for (const directory of ["notes/inbox", "notes/journal", "notes/health", "notes/social", "notes/work", "notes/learning", "notes/other", "templates/drafts", "templates/exports", "attachments", ".metheory/cache", ".metheory/logs", ".metheory/backups"]) mkdirSync(join(root, directory), { recursive: true });
  mkdirSync(join(root, ".vscode"), { recursive: true });
  const workspace = { schemaVersion: 1, workspaceId: `workspace_${randomUUID().replaceAll("-", "")}`, name: "My MeTheory", database: { mode: "workspace", path: ".metheory/data.sqlite" }, service: { startupMode: "onDemand", shutdownMode: "idle", idleTimeoutMinutes: 15, apiUrl: "http://127.0.0.1:8100" }, ai: { provider: "disabled", autoStart: false, startupRetryCount: 1, startupTimeoutSeconds: 60, idleTimeoutMinutes: 15, templateGenerationModel: "", extractionModel: "", baseUrl: "", customRuntime: null }, backup: { enabled: true, beforeMigration: true, beforeBulkChange: true, periodic: true, retentionCount: 10 }, notes: { rootDirectory: "notes", maximumCategoryDepth: 2, defaultDirectory: "notes/inbox" } };
  if (!existsSync(configPath)) writeFileSync(configPath, JSON.stringify(workspace, null, 2));
  const schema = resolve(import.meta.dirname, "../../../db/ts_mvp_schema.sql");
  const database = join(root, ".metheory", "data.sqlite");
  if (!existsSync(database)) { const db = new DatabaseSync(database); db.exec(readFileSync(schema, "utf8")); db.close(); }
  if (!existsSync(join(root, "AGENTS.md"))) writeFileSync(join(root, "AGENTS.md"), "# MeTheory Workspace Rules\n\n- Edit notes/ Markdown normally.\n- Do not edit .metheory/ directly.\n- Use metheory CLI for SQLite-backed changes.\n- Preserve metheory_entry_id and recorded_at during sync.\n- Run workspace sync after bulk changes.\n");
  if (!existsSync(join(root, ".gitignore"))) writeFileSync(join(root, ".gitignore"), ".metheory/\nnode_modules/\n*.tmp\n*.temp\n*.bak\n*~\n");
  writeFileSync(join(root, ".vscode", "settings.json"), JSON.stringify({ "files.exclude": { "**/.metheory": true } }, null, 2));
  writeFileSync(join(root, ".vscode", "tasks.json"), JSON.stringify({ version: "2.0.0", tasks: ["service start", "service stop", "workspace status", "workspace sync", "workspace watch", "backup create", "verify"].map(label => ({ label: `MeTheory: ${label[0].toUpperCase()}${label.slice(1)}`, type: "shell", command: `npm run metheory -- ${label}`, problemMatcher: [] })) }, null, 2));
  console.log(JSON.stringify({ workspaceId: workspace.workspaceId, database }, null, 2));
}

function databasePath() { return config ? resolveWorkspaceDatabase(root, config) : join(root, ".metheory", "data.sqlite"); }
function markdownFiles(directory: string): string[] { return readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? markdownFiles(join(directory, item.name)) : item.name.endsWith(".md") ? [join(directory, item.name)] : []); }
function workspaceStatus() { const files = existsSync(join(root, "notes")) ? markdownFiles(join(root, "notes")) : []; const db = existsSync(databasePath()) ? new DatabaseSync(databasePath()) : null; const entries = db ? Number((db.prepare("SELECT COUNT(*) AS count FROM entries").get() as any).count) : 0; const lastSync = db ? (db.prepare("SELECT MAX(updated_at) AS value FROM entries").get() as any).value : null; const conflicts = files.filter((file) => { try { const entry = readMarkdownEntry(relative(root, file), readFileSync(file, "utf8")); return Boolean(entry.entryId) && !db?.prepare("SELECT 1 FROM entries WHERE id=?").get(String(entry.entryId)); } catch { return true; } }).length; db?.close(); const service = serviceSnapshot(); console.log(JSON.stringify({ workspaceId: config?.workspaceId, databasePath: databasePath(), databaseMode: config?.database?.mode ?? "workspace", service, markdownFiles: files.length, entries, unsyncedOrConflictFiles: conflicts, lastEntryUpdateAt: lastSync }, null, 2)); }
function serviceSnapshot() { const pidPath = join(root, ".metheory", "service.pid"); if (!existsSync(pidPath)) return { running: false, pid: null, api }; const pid = Number(readFileSync(pidPath, "utf8")); try { process.kill(pid, 0); return { running: true, pid, api }; } catch { return { running: false, pid: null, api }; } }
function backupCreate(reason = "manual") { if (!config?.backup.enabled) throw new Error("backup_disabled"); mkdirSync(join(root, ".metheory", "backups"), { recursive: true }); const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z/, "Z"); const backupId = `backup_${randomUUID().replaceAll("-", "")}`; const file = join(root, ".metheory", "backups", `${stamp}-${reason}.sqlite`); copyFileSync(databasePath(), file); const checksum = createHash("sha256").update(readFileSync(file)).digest("hex"); writeFileSync(`${file}.manifest.json`, JSON.stringify({ backupId, createdAt: new Date().toISOString(), reason, workspaceId: config.workspaceId, databaseFile: file, workspaceConfigPath: configPath, schemaVersion: config.schemaVersion, checksum }, null, 2)); const manifests = readdirSync(join(root, ".metheory", "backups")).filter((name) => name.endsWith(".manifest.json")).sort().reverse(); for (const stale of manifests.slice(config.backup.retentionCount)) { const manifestPath = join(root, ".metheory", "backups", stale); const manifest = JSON.parse(readFileSync(manifestPath, "utf8")); if (typeof manifest.databaseFile === "string") rmSync(manifest.databaseFile, { force: true }); rmSync(manifestPath, { force: true }); } console.log(JSON.stringify({ backupId, file, checksum }, null, 2)); }
function backupList() { const directory = join(root, ".metheory", "backups"); console.log(JSON.stringify(existsSync(directory) ? readdirSync(directory).filter(name => name.endsWith(".manifest.json")).map(name => JSON.parse(readFileSync(join(directory, name), "utf8"))) : [], null, 2)); }
function backupRestore(id: string) { const directory = join(root, ".metheory", "backups"); const manifest = readdirSync(directory).map(name => name.endsWith(".manifest.json") ? JSON.parse(readFileSync(join(directory, name), "utf8")) : null).find(item => item?.backupId === id && item.workspaceId === config?.workspaceId); if (!manifest) throw new Error("backup_not_found"); if (createHash("sha256").update(readFileSync(manifest.databaseFile)).digest("hex") !== manifest.checksum) throw new Error("backup_checksum_invalid"); const restored = new DatabaseSync(manifest.databaseFile); const integrity = restored.prepare("PRAGMA integrity_check").get() as { integrity_check: string }; restored.close(); if (integrity.integrity_check !== "ok") throw new Error("backup_integrity_invalid"); copyFileSync(databasePath(), `${databasePath()}.before-restore-${Date.now()}`); copyFileSync(manifest.databaseFile, databasePath()); console.log(JSON.stringify({ restored: id, integrity: integrity.integrity_check, searchRebuildRequired: true }, null, 2)); }
function serviceStart() { const pidPath = join(root, ".metheory", "service.pid"); if (existsSync(pidPath)) { try { process.kill(Number(readFileSync(pidPath, "utf8")), 0); console.log("service_already_running"); return; } catch { /* stale pid */ } } const server = resolve(import.meta.dirname, "../../api/src/server.ts"); const child = spawn(process.execPath, ["--experimental-strip-types", server], { env: { ...process.env, PORT: "8100", METHEORY_DB: databasePath() }, stdio: "ignore", detached: true }); writeFileSync(pidPath, String(child.pid)); child.unref(); console.log(JSON.stringify({ started: true, pid: child.pid, api }, null, 2)); }
function serviceStop() { const pidPath = join(root, ".metheory", "service.pid"); if (!existsSync(pidPath)) { console.log("service_not_running"); return; } try { process.kill(Number(readFileSync(pidPath, "utf8"))); } catch { /* already stopped */ } rmSync(pidPath, { force: true }); console.log("service_stopped"); }
function serviceStatus() { const pidPath = join(root, ".metheory", "service.pid"); let running = false; let pid: number | null = null; if (existsSync(pidPath)) { pid = Number(readFileSync(pidPath, "utf8")); try { process.kill(pid, 0); running = true; } catch { pid = null; } } console.log(JSON.stringify({ running, pid, api }, null, 2)); }

function aiProvider(): MeTheoryAiProvider { const setting = String(config?.ai?.provider ?? process.env.AI_PROVIDER ?? "disabled"); const provider = ["ollama", "openai-compatible-local", "mock", "manual", "disabled"].includes(setting) ? setting : "disabled"; return createAiProvider({ provider: provider as any, model: config?.ai?.extractionModel ?? config?.ai?.templateGenerationModel ?? process.env.LOCAL_AI_MODEL, baseUrl: config?.ai?.baseUrl || process.env.LOCAL_AI_BASE_URL }); }
async function aiStatus() { const [ollama, compatible] = await Promise.all([detectOllama(), detectOpenAiCompatible()]); const provider = aiProvider(); console.log(JSON.stringify({ provider: provider.id, ollama, openaiCompatible: compatible, model: config?.ai?.templateGenerationModel ?? process.env.LOCAL_AI_MODEL ?? null }, null, 2)); }
async function aiModels() { const [ollama, compatible] = await Promise.all([detectOllama(), detectOpenAiCompatible()]); console.log(JSON.stringify({ ollama, openaiCompatible: compatible, configured: { provider: config?.ai?.provider ?? process.env.AI_PROVIDER ?? "disabled", templateGenerationModel: config?.ai?.templateGenerationModel ?? null, extractionModel: config?.ai?.extractionModel ?? null } }, null, 2)); }
function setAiModel(purpose: string, model: string) { if (!config) throw new Error("workspace_not_initialized"); if (purpose !== "template" && purpose !== "extraction") throw new Error("ai_model_purpose_invalid"); const next = { ...config, ai: { ...config.ai, [purpose === "template" ? "templateGenerationModel" : "extractionModel"]: model } } satisfies WorkspaceConfig; validateWorkspaceConfig(next); writeFileSync(configPath, JSON.stringify(next, null, 2)); console.log(JSON.stringify({ purpose, model }, null, 2)); }
async function aiTest() { console.log(JSON.stringify(await aiProvider().healthCheck(), null, 2)); }
async function aiStart() { const runtime = config?.ai?.customRuntime; if (!runtime?.executablePath) { console.log(JSON.stringify({ started: false, reason: "runtime_manual_start_required" }, null, 2)); return; } const manager = new RuntimeManager(runtime); await manager.start(); console.log(JSON.stringify({ started: true, state: manager.state }, null, 2)); }
async function aiStop() { console.log(JSON.stringify({ stopped: false, reason: "runtime_owned_by_external_application" }, null, 2)); }

function draftDirectory() { const directory = join(root, "templates", "drafts"); mkdirSync(directory, { recursive: true }); return directory; }
function draftPath(id: string) { return join(draftDirectory(), `${id}.template.json`); }
async function generateTemplateDraft(theme: string) { if (!theme.trim()) throw new Error("template_theme_required"); const provider = aiProvider(); const input = { userId, theme: theme.trim() }; if (provider.id === "manual") { const id = `draft_${randomUUID().replaceAll("-", "")}`; const record = { id, status: "awaiting_manual_result", provider: provider.id, theme: input.theme, prompt: buildManualTemplatePrompt(input), createdAt: new Date().toISOString() }; writeFileSync(draftPath(id), JSON.stringify(record, null, 2)); console.log(JSON.stringify({ id, provider: provider.id, promptPath: `templates/drafts/${id}.template.json`, copyPrompt: true }, null, 2)); return; } const draft = await provider.generateTemplateDraft(input); const id = `draft_${randomUUID().replaceAll("-", "")}`; writeFileSync(draftPath(id), JSON.stringify({ id, status: "pending", provider: provider.id, theme: input.theme, draft, createdAt: new Date().toISOString() }, null, 2)); console.log(JSON.stringify({ id, provider: provider.id, status: "pending", path: `templates/drafts/${id}.template.json` }, null, 2)); }
function listTemplateDrafts() { const drafts = readdirSync(draftDirectory()).filter(name => name.endsWith(".template.json")).map(name => { const item = JSON.parse(readFileSync(join(draftDirectory(), name), "utf8")); return { id: item.id, status: item.status, provider: item.provider, theme: item.theme, createdAt: item.createdAt }; }); console.log(JSON.stringify(drafts, null, 2)); }
function showTemplateDraft(id: string) { console.log(readFileSync(draftPath(id), "utf8")); }
function setManualTemplateResult(id: string, resultFile: string) { const path = draftPath(id); const item = JSON.parse(readFileSync(path, "utf8")); const draft = new ManualExternalAiProvider().parseTemplate(readFileSync(resolve(root, resultFile), "utf8")); item.draft = draft; item.status = "pending"; item.validatedAt = new Date().toISOString(); writeFileSync(path, JSON.stringify(item, null, 2)); console.log(JSON.stringify({ id, status: item.status, validated: true }, null, 2)); }
async function approveTemplateDraft(id: string) { const path = draftPath(id); const item = JSON.parse(readFileSync(path, "utf8")); if (!item.draft) throw new Error("manual_result_required_before_approval"); const saved = await request("/v1/templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, ...item.draft }) }); item.status = "approved"; item.approvedAt = new Date().toISOString(); item.savedTemplateId = saved.id; writeFileSync(path, JSON.stringify(item, null, 2)); console.log(JSON.stringify({ approved: true, templateId: saved.id }, null, 2)); }

async function structureEntry(file: string) {
  const path = resolve(root, file);
  const text = readFileSync(path, "utf8");
  const entry = readMarkdownEntry(file, text);
  if (!entry.templateId) throw new Error("entry_template_required");
  if (!entry.autoStructure) throw new Error("entry_auto_structure_disabled");
  const template = await request(`/v1/templates/${encodeURIComponent(entry.templateId)}?userId=${encodeURIComponent(userId)}`);
  const version = template.currentVersion;
  const aiTemplate = {
    id: template.id,
    currentVersion: {
      id: version.id,
      fields: (version.fields as Array<any>).map((field) => ({
        fieldKey: field.field_key,
        label: field.label,
        description: field.description,
        inputType: field.input_type,
        valueType: field.value_type,
        required: Boolean(field.required),
        displayOrder: field.display_order,
        options: field.options,
        minimum: field.minimum ?? undefined,
        maximum: field.maximum ?? undefined,
        unit: field.unit ?? undefined,
        sensitivity: field.sensitivity,
        sensitivityLevel: field.sensitivity_level,
        classificationSource: field.classification_source
      }))
    }
  };
  const provider = aiProvider();
  const record = await extractEntryValues({ entryId: entry.entryId ?? "unregistered", template: aiTemplate, content: entry.body, sourceUpdatedAt: new Date(statSync(path).mtimeMs).toISOString(), provider });
  writeFileSync(join(draftDirectory(), `${record.id}.extraction.json`), JSON.stringify(record, null, 2));
  console.log(JSON.stringify({ status: record.status, id: record.id, path: `templates/drafts/${record.id}.extraction.json`, sourceContentHash: record.sourceContentHash, templateVersionId: version.id }, null, 2));
}
function listExtractions() { const records = readdirSync(draftDirectory()).filter(name => name.endsWith(".extraction.json")).map(name => { const item = JSON.parse(readFileSync(join(draftDirectory(), name), "utf8")); return { id: item.id, entryId: item.entryId, status: item.status, sourceContentHash: item.sourceContentHash, createdAt: item.createdAt }; }); console.log(JSON.stringify(records, null, 2)); }
async function applyExtractionReview(id: string, file: string, overrideArgs: string[] = []) { const path = join(draftDirectory(), `${id}.extraction.json`); const extraction = JSON.parse(readFileSync(path, "utf8")); const notePath = resolve(root, file); const entry = readMarkdownEntry(file, readFileSync(notePath, "utf8")); if (extractionIsStale(extraction, entry.body)) throw new Error("extraction_stale"); const values = Object.fromEntries(Object.entries(extraction.result.values).filter(([key]) => extraction.result.decisions?.[key] !== "unanswered")); const privacyOverrides = Object.fromEntries(overrideArgs.filter(item => item.includes("=")).map(item => item.split("=", 2))); const result = await request(`/v1/entries/${encodeURIComponent(extraction.entryId)}/extraction/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, entryId: extraction.entryId, templateVersionId: extraction.templateVersionId, values, confidence: extraction.result.confidence, sourceContentHash: extraction.sourceContentHash, sourceUpdatedAt: extraction.sourceUpdatedAt, provider: extraction.result.providerId, model: extraction.result.model, privacyOverrides }) }); extraction.status = "applied"; extraction.appliedAt = new Date().toISOString(); writeFileSync(path, JSON.stringify(extraction, null, 2)); console.log(JSON.stringify(result, null, 2)); }
function rejectExtraction(id: string) { const path = join(draftDirectory(), `${id}.extraction.json`); const extraction = JSON.parse(readFileSync(path, "utf8")); extraction.status = "rejected"; extraction.rejectedAt = new Date().toISOString(); writeFileSync(path, JSON.stringify(extraction, null, 2)); console.log(JSON.stringify({ id, status: extraction.status }, null, 2)); }
function showExtractionReview(id: string) { const extraction = JSON.parse(readFileSync(join(draftDirectory(), `${id}.extraction.json`), "utf8")); console.log(JSON.stringify({ id: extraction.id, entryId: extraction.entryId, templateVersionId: extraction.templateVersionId, status: extraction.status, provider: extraction.result?.providerId, model: extraction.result?.model, confidence: extraction.result?.confidence, values: extraction.result?.values ?? {}, decisions: extraction.result?.decisions ?? {}, sourceContentHash: extraction.sourceContentHash, createdAt: extraction.createdAt }, null, 2)); }
async function privacyStatus() { console.log(JSON.stringify(await request(`/v1/privacy/status?userId=${encodeURIComponent(userId)}`), null, 2)); }
async function privacyConsentsList() { console.log(JSON.stringify(await request(`/v1/privacy/consents?userId=${encodeURIComponent(userId)}&includeRevoked=true`), null, 2)); }
async function privacyAuditList() { console.log(JSON.stringify(await request(`/v1/privacy/audit-events?userId=${encodeURIComponent(userId)}`), null, 2)); }
async function privacySafeDeleteStatus(id: string) { console.log(JSON.stringify(await request(`/v1/privacy/safe-delete/status/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`), null, 2)); }
async function privacyConsentShow(id: string) { console.log(JSON.stringify(await request(`/v1/privacy/consents/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`), null, 2)); }
async function privacyConsentRevoke(id: string) { console.log(JSON.stringify(await request(`/v1/privacy/consents/${encodeURIComponent(id)}/revoke?userId=${encodeURIComponent(userId)}`, { method: "POST" }), null, 2)); }
async function privacyConsentGrant(args: string[]) { if (args[5] !== "--confirm") throw new Error("confirmation_required"); const [templateId, fieldKey, consentType, providerId, fingerprint] = args; console.log(JSON.stringify(await request("/v1/privacy/consents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, templateId, fieldKey, consentType, providerId: providerId || null, destinationFingerprint: fingerprint || null, scope: consentType === "external_ai_transfer" ? "single_value" : "field", grantedAt: new Date().toISOString() }) }), null, 2)); }
async function privacyFieldsList() { console.log(JSON.stringify(await request(`/v1/privacy/fields?userId=${encodeURIComponent(userId)}`), null, 2)); }
async function privacyFieldShow(templateId: string, fieldKey: string) { console.log(JSON.stringify(await request(`/v1/privacy/fields/${encodeURIComponent(templateId)}/${encodeURIComponent(fieldKey)}?userId=${encodeURIComponent(userId)}`), null, 2)); }
function markdownFilesAtRoot(): string[] { return existsSync(join(root, "notes")) ? markdownFiles(join(root, "notes")) : []; }
function extractionCandidates(selector: Record<string, string>) { const directory = draftDirectory(); return readdirSync(directory).filter(name => name.endsWith(".extraction.json")).map(name => ({ name, path: join(directory, name), record: JSON.parse(readFileSync(join(directory, name), "utf8")) })).filter(item => (!selector.entryId || item.record.entryId === selector.entryId) && (!selector.templateId || item.record.templateId === selector.templateId) && (!selector.fieldKey || Object.prototype.hasOwnProperty.call(item.record.result?.values ?? {}, selector.fieldKey))); }
async function privacySafeDeletePlan(selectorText: string) { const selector = JSON.parse(selectorText) as Record<string, string>; const needle = selector.fieldKey; const files = markdownFilesAtRoot().map(path => { const text = readFileSync(path, "utf8"); const matches = needle ? (text.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) ?? []).length : 0; const preview = needle && matches ? text.replace(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[REDACTED]").slice(0, 240) : undefined; return { path: relative(root, path), matches, preview }; }).filter(item => item.matches > 0); const candidates = extractionCandidates(selector); console.log(JSON.stringify(await request("/v1/privacy/safe-delete/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, ...selector, markdownFiles: files, extractionCandidateCount: candidates.length, backupCount: existsSync(join(root, ".metheory", "backups")) ? readdirSync(join(root, ".metheory", "backups")).filter(name => name.endsWith(".manifest.json")).length : 0 }) }), null, 2)); }
async function privacySafeDeleteExecute(planId: string, confirmation: string) { const result = await request("/v1/privacy/safe-delete/execute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, planId, confirmation }) }); const selector = result.selector as Record<string, string>; let extractionsDeleted = 0; for (const candidate of extractionCandidates(selector)) { rmSync(candidate.path, { force: true }); extractionsDeleted += 1; } const backupDirectory = join(root, ".metheory", "backups"); let backupsDeleted = 0; if (existsSync(backupDirectory)) for (const manifestName of readdirSync(backupDirectory).filter(name => name.endsWith(".manifest.json"))) { const manifestPath = join(backupDirectory, manifestName); const manifest = JSON.parse(readFileSync(manifestPath, "utf8")); if (manifest.workspaceId !== config?.workspaceId) continue; const backupFile = typeof manifest.databaseFile === "string" ? resolve(manifest.databaseFile) : ""; if (backupFile.startsWith(resolve(backupDirectory) + "\\") && existsSync(backupFile)) rmSync(backupFile, { force: true }); rmSync(manifestPath, { force: true }); backupsDeleted += 1; } console.log(JSON.stringify({ ...result, extractionsDeleted, backupsDeleted, markdownFilesChanged: 0 }, null, 2)); }
async function privacyDowngrade(templateId: string, fieldKey: string, consentId: string) { console.log(JSON.stringify(await request(`/v1/privacy/templates/${encodeURIComponent(templateId)}/downgrade`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, fieldKey, consentId }) }), null, 2)); }

async function syncFile(file: string) { const path = relative(root, resolve(root, file)); const absolute = resolve(root, file); const text = readFileSync(absolute, "utf8"); const entry = readMarkdownEntry(path, text); if (entry.entryId) { const duplicates = markdownFiles(join(root, "notes")).filter((candidate) => candidate !== absolute).filter((candidate) => { try { return readMarkdownEntry(relative(root, candidate), readFileSync(candidate, "utf8")).entryId === entry.entryId; } catch { return false; } }); if (duplicates.length) throw new Error(`sync_conflict_duplicate_entry_id:${entry.entryId}`); } const result = await request("/v1/entries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: entry.entryId, userId, externalSource: "vscode", externalSourceId: path, title: entry.title, body: entry.body, recordedAt: entry.recordedAt, sourceUpdatedAt: new Date(statSync(absolute).mtimeMs).toISOString() }) }); if (!entry.entryId) writeFileSync(absolute, withEntryMetadata(text, { metheory_entry_id: String(result.entry.id) })); console.log(JSON.stringify({ path, status: result.created ? "created" : "updated", created: result.created, id: result.entry.id })); }
async function watchWorkspace() { const notes = join(root, "notes"); let timer: NodeJS.Timeout | undefined; const watcher = watch(notes, { recursive: true }, (_, name) => { if (!name || !String(name).endsWith(".md")) return; if (timer) clearTimeout(timer); timer = setTimeout(() => void syncFile(join(notes, String(name))), 350); }); console.log("watching_notes"); await new Promise<void>(resolvePromise => process.on("SIGINT", () => { watcher.close(); if (timer) clearTimeout(timer); resolvePromise(); })); }
async function recordTemplate(templateId: string) { const detail = await request(`/v1/templates/${encodeURIComponent(templateId)}?userId=${encodeURIComponent(userId)}`); const fields = detail.currentVersion.fields as Array<any>; const values: Record<string, unknown> = {}; for (const field of fields) { const answer = globalThis.prompt?.(`${field.label}${field.required ? " *" : ""}`) ?? ""; if (field.value_type === "boolean") values[field.field_key] = answer.toLowerCase() === "true" || answer === "1"; else if (["integer", "number", "scale", "duration_seconds"].includes(field.value_type)) values[field.field_key] = Number(answer); else if (field.value_type === "multi_choice") values[field.field_key] = answer.split(",").map((item: string) => item.trim()).filter(Boolean); else values[field.field_key] = answer; } const created = await request(`/v1/templates/${encodeURIComponent(templateId)}/entries`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, values, title: detail.name, body: "" }) }); mkdirSync(join(root, "notes"), { recursive: true }); writeFileSync(join(root, "notes", `${new Date().toISOString().slice(0, 10)}-${created.id}.md`), `---\nmetheory_entry_id: ${created.id}\ntemplate_id: ${templateId}\ntemplate_version_id: ${created.templateVersionId}\nrecorded_at: ${new Date().toISOString()}\n---\n\n# ${detail.name}\n`); console.log(JSON.stringify({ id: created.id }, null, 2)); }

async function main() { const [, , command, sub, ...args] = process.argv;
  if (command === "workspace" && sub === "init") return initWorkspace();
  if (command === "workspace" && sub === "status") return workspaceStatus();
  if (command === "workspace" && sub === "watch") return watchWorkspace();
  if (command === "workspace" && sub === "sync") { for (const file of markdownFiles(join(root, "notes"))) await syncFile(file); return; }
  if (command === "entry" && sub === "sync" && args[0]) return syncFile(args[0]);
  if (command === "entry" && sub === "structure" && args[0]) return structureEntry(args[0]);
  if (command === "entry" && sub === "extraction-list") return listExtractions();
  if (command === "entry" && sub === "extraction-apply" && args[0] && args[1]) return applyExtractionReview(args[0], args[1], args.slice(2));
  if (command === "entry" && sub === "extraction-reject" && args[0]) return rejectExtraction(args[0]);
  if (command === "extraction" && sub === "review" && args[0]) return showExtractionReview(args[0]);
  if (command === "privacy" && sub === "status") return privacyStatus();
  if (command === "privacy" && sub === "consents" && args[0] === "list") return privacyConsentsList();
  if (command === "privacy" && sub === "audit" && args[0] === "list") return privacyAuditList();
  if (command === "privacy" && sub === "consent" && args[0] === "show" && args[1]) return privacyConsentShow(args[1]);
  if (command === "privacy" && sub === "consent" && args[0] === "revoke" && args[1]) return privacyConsentRevoke(args[1]);
  if (command === "privacy" && sub === "consent" && args[0] === "grant") return privacyConsentGrant(args.slice(1));
  if (command === "privacy" && sub === "fields" && args[0] === "list") return privacyFieldsList();
  if (command === "privacy" && sub === "fields" && args[0] === "show" && args[1] && args[2]) return privacyFieldShow(args[1], args[2]);
  if (command === "privacy" && sub === "safe-delete" && args[0] === "plan" && args[1]) return privacySafeDeletePlan(args[1]);
  if (command === "privacy" && sub === "safe-delete" && args[0] === "status" && args[1]) return privacySafeDeleteStatus(args[1]);
  if (command === "privacy" && sub === "safe-delete" && args[0] === "execute" && args[1] && args[2]) return privacySafeDeleteExecute(args[1], args.slice(2).join(" "));
  if (command === "privacy" && sub === "fields" && args[0] === "downgrade" && args[1] && args[2] && args[3]) return privacyDowngrade(args[1], args[2], args[3]);
  if (command === "entry" && sub === "list") return console.log(JSON.stringify(await request(`/v1/entries?userId=${encodeURIComponent(userId)}`), null, 2));
  if (command === "entry" && sub === "search") return console.log(JSON.stringify(await request(`/v1/search?userId=${encodeURIComponent(userId)}&q=${encodeURIComponent(args.join(" "))}`), null, 2));
  if (command === "ai" && ["detect", "status"].includes(sub ?? "")) return aiStatus();
  if (command === "ai" && sub === "models") return aiModels();
  if (command === "ai" && sub === "model" && args[0] && args[1]) return setAiModel(args[0], args.slice(1).join(" "));
  if (command === "ai" && sub === "test") return aiTest();
  if (command === "ai" && sub === "start") return aiStart();
  if (command === "ai" && sub === "stop") return aiStop();
  if (command === "template" && sub === "list") return console.log(JSON.stringify(await request(`/v1/templates?userId=${encodeURIComponent(userId)}`), null, 2));
  if (command === "template" && (sub === "generate" || sub === "suggest")) { const themeIndex = args.indexOf("--theme"); const theme = themeIndex >= 0 ? args[themeIndex + 1] ?? "" : args.filter(item => item !== "--json").join(" "); return generateTemplateDraft(theme); }
  if (command === "template" && sub === "draft" && args[0] === "list") return listTemplateDrafts();
  if (command === "template" && sub === "draft" && args[0] === "show" && args[1]) return showTemplateDraft(args[1]);
  if (command === "template" && sub === "draft" && args[0] === "set-result" && args[1] && args[2]) return setManualTemplateResult(args[1], args[2]);
  if (command === "template" && sub === "draft" && args[0] === "approve" && args[1]) return approveTemplateDraft(args[1]);
  if (command === "template" && sub === "record" && args[0]) return recordTemplate(args[0]);
  if (command === "service" && sub === "start") return serviceStart();
  if (command === "service" && sub === "stop") return serviceStop();
  if (command === "service" && sub === "status") return serviceStatus();
  if (command === "backup" && sub === "create") return backupCreate(args[0] ?? "manual");
  if (command === "backup" && sub === "list") return backupList();
  if (command === "backup" && sub === "restore" && args[0]) return backupRestore(args[0]);
  console.error("usage: workspace init|status|sync|watch; ai detect|status|start|stop|models|model <template|extraction> <name>|test; entry structure|extraction-list|extraction-apply <id> <note> [field=consent-id]|extraction-reject <id>|sync|list|search; extraction review <id>; privacy status|consents list|audit list|consent show|consent grant|consent revoke|fields list|fields show|fields downgrade|safe-delete plan|safe-delete status|safe-delete execute; template generate|suggest --theme <text>|draft list|draft show <id>|draft set-result <id> <file>|draft approve <id>|list|record; service start|stop|status; backup create|list|restore"); process.exitCode = 1;
}

main().catch(error => { mkdirSync(join(root, ".metheory", "logs"), { recursive: true }); appendFileSync(join(root, ".metheory", "logs", "cli.log"), `${new Date().toISOString()} ${error instanceof Error ? error.message : "error"}\n`); console.error(error instanceof Error ? error.message : "error"); process.exitCode = 1; });
