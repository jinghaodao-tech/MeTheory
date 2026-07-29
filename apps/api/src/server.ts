import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateEvidence, directionForObservation, RULE_VERSION, type ObservationInput } from "../../../packages/domain/src/index.ts";
import { buildEpisodes } from "../../../packages/domain/src/hypothesis/episodes.ts";
import { evaluateHypothesis } from "../../../packages/domain/src/hypothesis/evaluators.ts";
import { validateHypothesisSpec } from "../../../packages/domain/src/hypothesis/spec.ts";
import type { EntryWriteInput } from "../../../packages/records/src/index.ts";
import { createAiQueryService } from "./aiQueryService.ts";
import { SqliteEntryRepository } from "./entryRepository.ts";
import { SqliteSearchDocumentRepository } from "./searchDocumentRepository.ts";
import { SqliteTemplateRepository } from "./templateRepository.ts";
import { SqlitePrivacyRepository } from "./privacyRepository.ts";
import { SqliteSelfUnderstandingRepository } from "./selfUnderstandingRepository.ts";
import { loadPersonalContextSnapshot, requestPersonalContextTemplate } from "./personalContextClient.ts";
import { MockTemplateGenerationProvider, UnavailableTemplateGenerationProvider, DisabledTemplateGenerationProvider, ManualChatGPTTemplateProvider, OpenAITemplateGenerationProvider, TEMPLATE_PROMPT_VERSION, suggestSemanticRolesForTemplate, validateTemplateDraft } from "../../../packages/templates/src/index.ts";
import {
  generateSelfUnderstanding,
  interpretSelfUnderstanding,
  OpenAICompatibleLocalInterpretationProvider,
  toSelfUnderstandingHypothesisView,
  validateSelfModelStatement,
  type UnderstandingRecord,
  baselineItems,
  createBaselineResponse,
  IPIP_BASELINE_ITEM_SET_VERSION
} from "../../../packages/self-understanding/src/index.ts";
import { analyzePersonalContextSnapshot } from "../../../packages/self-understanding/src/personalContext.ts";
import { ActivityWatchAdapter, activityWatchObservationIdentity, summarizeActivityWatchDaily } from "../../../packages/domain/src/activitywatch.ts";

const root = resolve(import.meta.dirname, "../../..");
const databasePath = process.env.METHEORY_DB ?? resolve(root, "data", "metheory.sqlite3");
const db = new DatabaseSync(databasePath);
db.exec(readFileSync(resolve(root, "db", "ts_mvp_schema.sql"), "utf8"));
const aiQueryService = createAiQueryService(db);
const entryRepository = new SqliteEntryRepository(db);
const searchDocumentRepository = new SqliteSearchDocumentRepository(db);
const templateRepository = new SqliteTemplateRepository(db);
const privacyRepository = new SqlitePrivacyRepository(db);
const selfUnderstandingRepository = new SqliteSelfUnderstandingRepository(db);

function ensureColumn(table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<Record<string, unknown>>;
  if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

ensureColumn("hypotheses", "state", "TEXT NOT NULL DEFAULT 'tracking'");
ensureColumn("entries", "source_updated_at", "TEXT");
ensureColumn("entries", "template_version_id", "TEXT");
if ((db.prepare("PRAGMA table_info(entries)").all() as Array<{ name: string }>).some((column) => column.name === "source_modified_at")) db.exec("UPDATE entries SET source_updated_at=source_modified_at WHERE source_updated_at IS NULL");
ensureColumn("hypotheses", "spec_json", "TEXT");
ensureColumn("hypotheses", "spec_version", "TEXT");
ensureColumn("responses", "capture_mode", "TEXT NOT NULL DEFAULT 'momentary_observation'");
ensureColumn("hypothesis_evaluations", "hypothesis_spec_version", "TEXT NOT NULL DEFAULT '1'");
ensureColumn("hypothesis_evaluations", "evaluator_version", "TEXT NOT NULL DEFAULT 'comparison-v1'");
ensureColumn("hypothesis_evaluations", "evaluated_at", "TEXT NOT NULL DEFAULT ''");
ensureColumn("hypothesis_evaluations", "window_start", "TEXT NOT NULL DEFAULT ''");
ensureColumn("hypothesis_evaluations", "window_end", "TEXT NOT NULL DEFAULT ''");
ensureColumn("hypothesis_evaluations", "result", "TEXT NOT NULL DEFAULT 'inconclusive'");
ensureColumn("hypothesis_evaluations", "cohort_metrics_json", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("hypothesis_evaluations", "observed_effect", "REAL");
ensureColumn("hypothesis_evaluations", "required_effect", "REAL NOT NULL DEFAULT 0");
ensureColumn("hypothesis_evaluations", "data_quality_json", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("entry_field_values", "source_content_hash", "TEXT");
ensureColumn("entry_field_values", "source_updated_at", "TEXT");
ensureColumn("entry_field_values", "confidence", "REAL");
ensureColumn("entry_field_values", "source", "TEXT");
ensureColumn("entry_field_values", "reviewed_at", "TEXT");
ensureColumn("entry_field_values", "updated_at", "TEXT");
ensureColumn("entry_template_fields", "sensitivity_level", "TEXT NOT NULL DEFAULT 'normal'");
ensureColumn("entry_template_fields", "classification_source", "TEXT NOT NULL DEFAULT 'system_rule'");
ensureColumn("entry_template_fields", "prohibited_secret_risk", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("entry_template_fields", "semantic_role", "TEXT");
ensureColumn("entry_template_fields", "semantic_role_source", "TEXT");
ensureColumn("entry_template_fields", "semantic_role_confidence", "REAL");
ensureColumn("entry_template_fields", "semantic_role_confirmed", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("entry_template_fields", "semantic_merge_allowed", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("hypothesis_reviews", "analysis_start_at", "TEXT");
ensureColumn("hypothesis_reviews", "analysis_end_at", "TEXT");
ensureColumn("hypothesis_reviews", "template_version_id", "TEXT");
ensureColumn("hypothesis_reviews", "field_pair_json", "TEXT NOT NULL DEFAULT '{}' ");
ensureColumn("hypothesis_reviews", "reviewed_at", "TEXT");
ensureColumn("self_model_candidates", "source_hypothesis_id", "TEXT");
ensureColumn("self_model_candidates", "supporting_period_start", "TEXT");
ensureColumn("self_model_candidates", "supporting_period_end", "TEXT");
ensureColumn("self_model_candidates", "user_note", "TEXT NOT NULL DEFAULT ''");
ensureColumn("self_model_candidates", "accepted_at", "TEXT");
ensureColumn("self_model_candidates", "last_reviewed_at", "TEXT");
ensureColumn("self_model_candidates", "construct_key", "TEXT");
ensureColumn("self_model_candidates", "tendency_scope", "TEXT");
ensureColumn("self_model_candidates", "source_analysis_periods_json", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("self_model_candidates", "supporting_field_pairs_json", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("self_model_candidates", "resolution_action", "TEXT NOT NULL DEFAULT 'new'");
ensureColumn("self_model_candidates", "target_self_belief_id", "TEXT");
ensureColumn("self_beliefs", "source_hypothesis_id", "TEXT");
ensureColumn("self_beliefs", "status", "TEXT NOT NULL DEFAULT 'active'");
ensureColumn("self_beliefs", "user_note", "TEXT NOT NULL DEFAULT ''");
ensureColumn("self_beliefs", "accepted_at", "TEXT");
ensureColumn("self_beliefs", "last_reviewed_at", "TEXT");
ensureColumn("self_beliefs", "supporting_period_start", "TEXT");
ensureColumn("self_beliefs", "supporting_period_end", "TEXT");
ensureColumn("self_beliefs", "construct_key", "TEXT");
ensureColumn("self_beliefs", "tendency_scope", "TEXT");
ensureColumn("self_beliefs", "source_analysis_periods_json", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("self_beliefs", "supporting_field_pairs_json", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("self_understanding_analysis_history", "condition_template_id", "TEXT");
ensureColumn("self_understanding_analysis_history", "condition_template_version_id", "TEXT");
ensureColumn("self_understanding_analysis_history", "condition_field_key", "TEXT");
ensureColumn("self_understanding_analysis_history", "condition_scale_fingerprint", "TEXT");
ensureColumn("self_understanding_analysis_history", "outcome_template_id", "TEXT");
ensureColumn("self_understanding_analysis_history", "outcome_template_version_id", "TEXT");
ensureColumn("self_understanding_analysis_history", "outcome_field_key", "TEXT");
ensureColumn("self_understanding_analysis_history", "outcome_scale_fingerprint", "TEXT");
ensureColumn("self_understanding_analysis_history", "source_entry_ids_json", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("self_understanding_analysis_history", "source_entry_fingerprint", "TEXT NOT NULL DEFAULT ''");
ensureColumn("self_understanding_analysis_history", "evidence_provenance_json", "TEXT NOT NULL DEFAULT '[]'");
ensureColumn("external_observations", "review_state", "TEXT NOT NULL DEFAULT 'imported'");
ensureColumn("external_observations", "local_date", "TEXT");
ensureColumn("external_observations", "source_bucket_id", "TEXT");
ensureColumn("external_observations", "source_identity", "TEXT");

type LegacyActivityWatchObservation = {
  id: string;
  user_id: string;
  source_bucket_id: string | null;
  source_event_id: string | null;
  source_identity: string | null;
  observed_at: string;
  local_date: string | null;
  duration_seconds: number | null;
  semantic_role: string;
  category: string;
  project_label: string | null;
  privacy_level: string;
  imported_at: string;
  user_confirmed: number;
  review_state: string;
  original_reference: string | null;
  transform_version: string | null;
};

function activityWatchReviewRank(reviewState: string): number {
  if (reviewState === "reviewed") return 2;
  if (reviewState === "excluded") return 1;
  return 0;
}

function migrateActivityWatchSourceIdentities(): void {
  const rows = db
    .prepare(
      `SELECT id,user_id,source_bucket_id,source_event_id,source_identity,
        observed_at,local_date,duration_seconds,semantic_role,category,project_label,
        privacy_level,imported_at,user_confirmed,review_state,original_reference,transform_version
       FROM external_observations WHERE source='activitywatch'`
    )
    .all() as LegacyActivityWatchObservation[];
  if (!rows.length) return;

  const groups = new Map<string, LegacyActivityWatchObservation[]>();
  const legacyRows: LegacyActivityWatchObservation[] = [];
  for (const row of rows) {
    if (!row.source_bucket_id || !row.source_event_id) {
      legacyRows.push(row);
      continue;
    }
    const identity = activityWatchObservationIdentity(row.source_bucket_id, row.source_event_id);
    const key = `${row.user_id}:${identity}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const updateIdentity = db.prepare("UPDATE external_observations SET source_identity=? WHERE id=?");
  const deleteObservation = db.prepare("DELETE FROM external_observations WHERE id=?");
  const updateWinner = db.prepare(
    `UPDATE external_observations SET
      source_identity=?, observed_at=?, local_date=?, duration_seconds=?, semantic_role=?,
      category=?, project_label=?, privacy_level=?, imported_at=?, original_reference=?,
      transform_version=?
     WHERE id=?`
  );

  db.exec("BEGIN IMMEDIATE");
  try {
    // Missing bucket/event ids cannot be reconstructed safely. Keep such records distinct.
    for (const row of legacyRows) updateIdentity.run(`legacy:${row.id}`, row.id);
    for (const [key, group] of groups) {
      const [, identity] = key.split(":", 2);
      const ranked = [...group].sort((left, right) => {
        const rankDifference = activityWatchReviewRank(right.review_state) - activityWatchReviewRank(left.review_state);
        if (rankDifference) return rankDifference;
        const importedDifference = String(right.imported_at).localeCompare(String(left.imported_at));
        return importedDifference || left.id.localeCompare(right.id);
      });
      const winner = ranked[0];
      const freshest = [...group].sort((left, right) => {
        const importedDifference = String(right.imported_at).localeCompare(String(left.imported_at));
        return importedDifference || left.id.localeCompare(right.id);
      })[0];
      for (const duplicate of ranked.slice(1)) deleteObservation.run(duplicate.id);
      updateWinner.run(
        identity,
        freshest.observed_at,
        freshest.local_date,
        freshest.duration_seconds,
        freshest.semantic_role,
        freshest.category,
        freshest.project_label,
        freshest.privacy_level,
        freshest.imported_at,
        freshest.original_reference,
        freshest.transform_version,
        winner.id
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

migrateActivityWatchSourceIdentities();
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS external_observations_source_identity_idx ON external_observations(user_id, source, source_identity) WHERE source_identity IS NOT NULL");

function migrateBaselineSelfPerceptionSource(): void {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='baseline_self_perceptions'").get() as { sql?: string } | undefined;
  if (!row?.sql?.includes("source = 'ipip'")) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`CREATE TABLE baseline_self_perceptions_next (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK(source = 'baseline_self_perception'),
      item_set_version TEXT NOT NULL,
      item_key TEXT NOT NULL,
      original_item_reference TEXT,
      statement_ja TEXT NOT NULL,
      response INTEGER NOT NULL CHECK(response >= 1 AND response <= 5),
      response_minimum INTEGER NOT NULL DEFAULT 1,
      response_maximum INTEGER NOT NULL DEFAULT 5,
      recorded_at TEXT NOT NULL,
      user_confirmed INTEGER NOT NULL DEFAULT 1 CHECK(user_confirmed IN(0,1)),
      use_for_self_understanding INTEGER NOT NULL DEFAULT 1 CHECK(use_for_self_understanding IN(0,1)),
      privacy_level TEXT NOT NULL DEFAULT 'normal' CHECK(privacy_level = 'normal'),
      provenance_json TEXT NOT NULL DEFAULT '{}',
      deleted_at TEXT,
      UNIQUE(user_id, item_set_version, item_key)
    ) STRICT`);
    db.exec(`INSERT INTO baseline_self_perceptions_next(
      id,user_id,source,item_set_version,item_key,original_item_reference,statement_ja,response,
      response_minimum,response_maximum,recorded_at,user_confirmed,use_for_self_understanding,
      privacy_level,provenance_json,deleted_at
    ) SELECT id,user_id,'baseline_self_perception',
      CASE WHEN item_set_version='ipip-paraphrase-ja-v1' THEN 'ipip-inspired-baseline-ja-v1' ELSE item_set_version END,
      item_key,original_item_reference,statement_ja,response,response_minimum,response_maximum,
      recorded_at,user_confirmed,use_for_self_understanding,privacy_level,provenance_json,deleted_at
      FROM baseline_self_perceptions`);
    db.exec("DROP TABLE baseline_self_perceptions");
    db.exec("ALTER TABLE baseline_self_perceptions_next RENAME TO baseline_self_perceptions");
    db.exec("CREATE INDEX IF NOT EXISTS baseline_self_perceptions_user_idx ON baseline_self_perceptions(user_id, deleted_at, recorded_at)");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

migrateBaselineSelfPerceptionSource();
function normalizeBaselineProvenance(): void {
  const rows = db.prepare("SELECT id,provenance_json FROM baseline_self_perceptions WHERE provenance_json LIKE '%ipip%'").all() as Array<{ id: string; provenance_json: string }>;
  const update = db.prepare("UPDATE baseline_self_perceptions SET provenance_json=? WHERE id=?");
  for (const row of rows) {
    try {
      const provenance = JSON.parse(row.provenance_json) as Record<string, unknown>;
      if (provenance.source !== "ipip") continue;
      provenance.source = "baseline_self_perception";
      update.run(JSON.stringify(provenance), row.id);
    } catch {
      // Keep malformed historical provenance intact instead of guessing its shape.
    }
  }
}
normalizeBaselineProvenance();
db.exec("CREATE TABLE IF NOT EXISTS ai_http_access_audit_logs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, client_id TEXT NOT NULL, client_type TEXT NOT NULL, purpose TEXT NOT NULL, requested_parameter_ids_json TEXT NOT NULL, allowed_parameter_ids_json TEXT NOT NULL, denied_parameter_ids_json TEXT NOT NULL, requested_start_at TEXT, requested_end_at TEXT, returned_record_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, created_at TEXT NOT NULL)");

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;

function fieldValue(row: Record<string, unknown>): unknown { if (Number(row.is_missing ?? 0) === 1) return null; if (row.boolean_value !== null && row.boolean_value !== undefined) return Number(row.boolean_value) === 1; if (row.integer_value !== null && row.integer_value !== undefined) return Number(row.integer_value); if (row.number_value !== null && row.number_value !== undefined) return Number(row.number_value); if (row.json_value !== null && row.json_value !== undefined) { try { return JSON.parse(String(row.json_value)); } catch { return null; } } return row.text_value ?? row.date_value ?? row.datetime_value ?? row.duration_seconds ?? null; }
function personalContextCandidate(snapshot: any, reviewStatus: "fits" | "does_not_fit" | "on_hold", createdAt: string) {
  const period = snapshot.period ?? {};
  return {
    schemaVersion: "personal-context-candidate-v1" as const,
    id: `context_${String(snapshot.id ?? snapshot.candidate?.id ?? "candidate")}`,
    sourceSystem: "metheory" as const,
    sourceHypothesisId: String(snapshot.id ?? snapshot.candidate?.id ?? ""),
    statement: String(snapshot.selfModelCandidate ?? snapshot.statement ?? ""),
    construct: String(snapshot.construct ?? "uncategorized"),
    tendencyScope: ["single_period_state", "state_dependent", "relatively_stable"].includes(String(snapshot.tendencyScope)) ? snapshot.tendencyScope : "single_period_state",
    reviewStatus,
    evidenceSummary: {
      supportingCount: Array.isArray(snapshot.supportingEvidence) ? snapshot.supportingEvidence.length : Array.isArray(snapshot.supportingEntryIds) ? snapshot.supportingEntryIds.length : 0,
      contradictingCount: Array.isArray(snapshot.contradictingEvidence) ? snapshot.contradictingEvidence.length : Array.isArray(snapshot.contradictingEntryIds) ? snapshot.contradictingEntryIds.length : 0,
      periodStartAt: String(period.startAt ?? ""),
      periodEndAt: String(period.endAt ?? "")
    },
    caution: ["これは診断や固定的な人格評価ではありません。", "記録数や未記録の条件により変わる可能性があります。"],
    createdAt
  };
}
function analyzeSelfUnderstanding(userId: string, input: Record<string, unknown>) { const endAt = typeof input.endAt === "string" ? input.endAt : now(); const startAt = typeof input.startAt === "string" ? input.startAt : new Date(Date.parse(endAt) - 28 * 86400000).toISOString(); const minimumEntryCount = Math.max(2, Math.min(100, Number(input.minimumEntryCount ?? 4))); const rows = db.prepare("SELECT e.id,e.recorded_at,e.title,f.field_key,f.label,f.value_type,f.options_json,ev.is_missing,ev.boolean_value,ev.integer_value,ev.number_value,ev.text_value,ev.json_value,ev.date_value,ev.datetime_value,ev.duration_seconds FROM entries e JOIN entry_field_values ev ON ev.entry_id=e.id JOIN entry_template_fields f ON f.id=ev.template_field_id WHERE e.user_id=? AND e.archived_at IS NULL AND ev.reviewed_at IS NOT NULL AND e.recorded_at>=? AND e.recorded_at<=? ORDER BY e.recorded_at").all(userId, startAt, endAt) as Array<Record<string, unknown>>; const entryCount = new Set(rows.map(row => String(row.id))).size; if (entryCount < minimumEntryCount) return { period: { startAt, endAt }, entryCount, minimumEntryCount, dataShortage: { needed: minimumEntryCount - entryCount, message: "Confirmed structured values are insufficient for a reliable hypothesis." }, hypotheses: [] }; const definitions = new Map<string, { id: string; nameJa: string; valueType: string; minimumValue?: number; maximumValue?: number; usableAsCondition: boolean; usableAsOutcome: boolean }>(); const allowedValues: Record<string, Array<{ valueKey: string; labelJa: string }>> = {}; const records = new Map<string, UnderstandingRecord>(); const observations: Array<{ episodeId: string; parameterId: string; value: unknown; isMissing: boolean; observedAt: string }> = []; for (const row of rows) { const parameterId = String(row.field_key); const valueType = row.value_type === "choice" ? "single_choice" : ["integer", "number", "scale", "duration_seconds"].includes(String(row.value_type)) ? "number" : String(row.value_type); if (!["boolean", "single_choice", "integer", "number"].includes(valueType)) continue; if (!definitions.has(parameterId)) { definitions.set(parameterId, { id: parameterId, nameJa: String(row.label ?? parameterId), valueType, minimumValue: 0, maximumValue: valueType === "boolean" || valueType === "single_choice" ? undefined : 100, usableAsCondition: true, usableAsOutcome: true }); try { const options = JSON.parse(String(row.options_json ?? "[]")) as Array<{ key?: string; label?: string }>; allowedValues[parameterId] = options.map(option => ({ valueKey: String(option.key ?? ""), labelJa: String(option.label ?? option.key ?? "") })).filter(option => option.valueKey); } catch { allowedValues[parameterId] = []; } } const value = fieldValue(row); observations.push({ episodeId: String(row.id), parameterId, value, isMissing: value === null, observedAt: String(row.recorded_at) }); const record = records.get(String(row.id)) ?? { id: String(row.id), recordedAt: String(row.recorded_at), title: String(row.title), conditionValues: {}, outcomeValues: {} }; record.conditionValues[parameterId] = value; record.outcomeValues[parameterId] = value; records.set(String(row.id), record); } const hypotheses = generateSelfUnderstanding({ parameters: [...definitions.values()], observations, records: [...records.values()], allowedValues, startAt, now: endAt, maximumCandidates: 5 } as any); return { period: { startAt, endAt }, entryCount, minimumEntryCount, hypotheses }; }
function analyzeSelfUnderstandingPractical(userId: string, input: Record<string, unknown>) { const endAt = typeof input.endAt === "string" ? input.endAt : now(); const startAt = typeof input.startAt === "string" ? input.startAt : new Date(Date.parse(endAt) - 28 * 86400000).toISOString(); const minimumEntryCount = Math.max(8, Math.min(100, Number(input.minimumEntryCount ?? 8))); const templateId = typeof input.templateId === "string" && input.templateId ? input.templateId : undefined; const fieldKeys = Array.isArray(input.fieldKeys) ? input.fieldKeys.filter((item): item is string => typeof item === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(item)).slice(0, 30) : []; const clauses = ["e.user_id=?", "e.archived_at IS NULL", "ev.reviewed_at IS NOT NULL", "e.recorded_at>=?", "e.recorded_at<=?"]; const params: string[] = [userId, startAt, endAt]; if (templateId) { clauses.push("e.template_id=?"); params.push(templateId); } if (fieldKeys.length) { clauses.push(`f.field_key IN (${fieldKeys.map(() => "?").join(",")})`); params.push(...fieldKeys); } const rows = db.prepare(`SELECT e.id,e.recorded_at,e.title,e.template_id,ev.template_version_id,f.field_key,f.label,f.value_type,f.options_json,f.minimum,f.maximum,ev.is_missing,ev.boolean_value,ev.integer_value,ev.number_value,ev.text_value,ev.json_value,ev.date_value,ev.datetime_value,ev.duration_seconds FROM entries e JOIN entry_field_values ev ON ev.entry_id=e.id JOIN entry_template_fields f ON f.id=ev.template_field_id WHERE ${clauses.join(" AND ")} ORDER BY e.recorded_at`).all(...params) as Array<Record<string, unknown>>; const entryCount = new Set(rows.map(row => String(row.id))).size; const templateVersionIds = [...new Set(rows.map(row => typeof row.template_version_id === "string" ? row.template_version_id : "").filter(Boolean))]; const options = { templateId: templateId ?? null, templateVersionId: templateVersionIds.length === 1 ? templateVersionIds[0] : null, templateVersionIds, fieldKeys }; if (entryCount < minimumEntryCount) return { status: "insufficient", statusLabelJa: "データ不足", period: { startAt, endAt }, filters: options, entryCount, minimumEntryCount, dataShortage: { needed: minimumEntryCount - entryCount, message: "確認済みの構造化記録が不足しています。条件と結果を同じEntryで記録してください。", recommendedFields: fieldKeys }, hypotheses: [] }; const definitions = new Map<string, { id: string; nameJa: string; valueType: string; minimumValue?: number; maximumValue?: number; usableAsCondition: boolean; usableAsOutcome: boolean }>(); const allowedValues: Record<string, Array<{ valueKey: string; labelJa: string }>> = {}; const records = new Map<string, UnderstandingRecord>(); const observations: Array<{ episodeId: string; parameterId: string; value: unknown; isMissing: boolean; observedAt: string }> = []; for (const row of rows) { const parameterId = String(row.field_key); const valueType = row.value_type === "choice" ? "single_choice" : ["integer", "number", "scale", "duration_seconds"].includes(String(row.value_type)) ? "number" : String(row.value_type); if (!["boolean", "single_choice", "integer", "number"].includes(valueType)) continue; if (!definitions.has(parameterId)) { definitions.set(parameterId, { id: parameterId, nameJa: String(row.label ?? parameterId), valueType, minimumValue: typeof row.minimum === "number" ? row.minimum : 0, maximumValue: typeof row.maximum === "number" ? row.maximum : valueType === "boolean" || valueType === "single_choice" ? undefined : 100, usableAsCondition: true, usableAsOutcome: true }); try { const choices = JSON.parse(String(row.options_json ?? "[]")) as Array<{ key?: string; label?: string }>; allowedValues[parameterId] = choices.map(choice => ({ valueKey: String(choice.key ?? ""), labelJa: String(choice.label ?? choice.key ?? "") })).filter(choice => choice.valueKey); } catch { allowedValues[parameterId] = []; } } const value = fieldValue(row); observations.push({ episodeId: String(row.id), parameterId, value, isMissing: value === null, observedAt: String(row.recorded_at) }); const record = records.get(String(row.id)) ?? { id: String(row.id), recordedAt: String(row.recorded_at), title: String(row.title), conditionValues: {}, outcomeValues: {} }; record.conditionValues[parameterId] = value; record.outcomeValues[parameterId] = value; records.set(String(row.id), record); } const hypotheses = generateSelfUnderstanding({ parameters: [...definitions.values()], observations, records: [...records.values()], allowedValues, now: endAt, config: { minimumTotalSamples: minimumEntryCount, maximumCandidates: 5 } }); return { status: hypotheses.length ? "ready" : "insufficient", statusLabelJa: hypotheses.length ? "分析候補あり" : "比較可能な差が不足", period: { startAt, endAt }, filters: options, entryCount, minimumEntryCount, hypotheses, explanationMode: "deterministic_fallback" }; }

async function analyzeSelfUnderstandingWithInterpretation(
  userId: string,
  input: Record<string, unknown>
) {
  const result = selfUnderstandingRepository.analyze(userId, input);
  if (!result.hypotheses.length) return result;
  const providerName = process.env.SELF_UNDERSTANDING_AI_PROVIDER ?? "disabled";
  let provider: OpenAICompatibleLocalInterpretationProvider | undefined;
  try {
    provider =
      providerName === "ollama" || providerName === "openai-compatible-local"
        ? new OpenAICompatibleLocalInterpretationProvider({
            id: providerName,
            baseUrl:
              process.env.SELF_UNDERSTANDING_AI_BASE_URL ??
              (providerName === "ollama"
                ? "http://127.0.0.1:11434/v1"
                : "http://127.0.0.1:1234/v1"),
            model: process.env.SELF_UNDERSTANDING_AI_MODEL ?? "llama3.2",
            structuredOutputCapability:
              process.env.SELF_UNDERSTANDING_AI_STRUCTURED_OUTPUT === "json_object" ||
              process.env.SELF_UNDERSTANDING_AI_STRUCTURED_OUTPUT === "prompt_only"
                ? process.env.SELF_UNDERSTANDING_AI_STRUCTURED_OUTPUT
                : "json_schema"
          })
        : undefined;
  } catch {
    provider = undefined;
  }
  const interpreted = await Promise.all(
    result.hypotheses.map(async (hypothesis) => {
      const interpretationResult = await interpretSelfUnderstanding(
        hypothesis.interpretationInput,
        provider
      );
      return {
        ...hypothesis,
        statement: interpretationResult.interpretation.statementJa,
        nextAction: interpretationResult.interpretation.nextExperiment.action,
        selfModelCandidate: interpretationResult.interpretation.selfModelCandidateJa,
        interpretation: interpretationResult.interpretation,
        explanationMode: interpretationResult.mode,
        explanationProviderId: interpretationResult.providerId,
        explanationValidationErrors: interpretationResult.validationErrors
      };
    })
  );
  return {
    ...result,
    hypotheses: interpreted.map((item) => toSelfUnderstandingHypothesisView(item, item.explanationMode)),
    hypothesisViews: interpreted.map((item) => toSelfUnderstandingHypothesisView(item, item.explanationMode)),
    legacyHypotheses: interpreted,
    explanationMode: interpreted.every((item) => item.explanationMode === "local_ai")
      ? "local_ai"
      : interpreted.some((item) => item.explanationMode === "local_ai")
        ? "mixed"
        : "deterministic_fallback"
  };
}

function json(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  response.end(body);
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function entryWriteInput(input: Record<string, unknown>, entryId?: string): EntryWriteInput {
  return {
    id: entryId ?? optionalString(input.id),
    userId: optionalString(input.userId) ?? "",
    templateId: optionalString(input.templateId),
    episodeId: optionalString(input.episodeId),
    externalSource: optionalString(input.externalSource),
    externalSourceId: optionalString(input.externalSourceId),
    title: optionalString(input.title) ?? "",
    body: optionalString(input.body) ?? "",
    recordedAt: optionalString(input.recordedAt),
    sourceUpdatedAt: input.sourceUpdatedAt === null ? null : optionalString(input.sourceUpdatedAt ?? input.sourceModifiedAt),
  };
}

function includeArchived(url: URL): boolean {
  return ["1", "true"].includes(url.searchParams.get("includeArchived") ?? "");
}

function pathParts(request: IncomingMessage): string[] {
  return new URL(request.url ?? "/", "http://localhost").pathname.split("/").filter(Boolean);
}

function userExists(userId: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM users WHERE id = ?").get(userId));
}

function aiClientAllowed(clientId: string, clientType: string): boolean {
  const configured = (process.env.METHEORY_AI_CLIENTS ?? "local-dev").split(",").map((value) => value.trim()).filter(Boolean);
  return configured.includes(clientId) && ["custom_gpt", "mcp", "openai_api", "other"].includes(clientType);
}
function aiPurposeAllowed(purpose: string): boolean {
  const configured = (process.env.METHEORY_AI_PURPOSES ?? "read_only_ai").split(",").map((value) => value.trim()).filter(Boolean);
  return configured.includes(purpose);
}
function aiAuthenticatedUser(request: IncomingMessage, requestedUserId: string): boolean { if (process.env.METHEORY_API_AUTH_MODE !== 'production') return true; const authenticated = request.headers['x-metheory-authenticated-user-id']; return typeof authenticated === 'string' && authenticated === requestedUserId; }

function aiUserId(request: IncomingMessage, url: URL): string {
  return String(url.searchParams.get("userId") ?? request.headers["x-metheory-user-id"] ?? "");
}

function aiParameterIds(rows: Array<Record<string, unknown>>): string[] { return [...new Set(rows.map((row) => String(row.field)).filter((field) => /^[a-z][a-z0-9_]{1,63}$/.test(field)))]; }

function writeAiAudit(input: { userId: string; clientId: string; clientType: string; purpose: string; parameterIds: string[]; allowed: string[]; denied: string[]; startAt?: string; endAt?: string; count: number; status: string }) {
  db.prepare("INSERT INTO ai_http_access_audit_logs(id,user_id,client_id,client_type,purpose,requested_parameter_ids_json,allowed_parameter_ids_json,denied_parameter_ids_json,requested_start_at,requested_end_at,returned_record_count,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id("ai_audit"), input.userId, input.clientId, input.clientType, input.purpose, JSON.stringify(input.parameterIds), JSON.stringify(input.allowed), JSON.stringify(input.denied), input.startAt ?? null, input.endAt ?? null, input.count, input.status, now());
}

function aiAggregate(input: Record<string, unknown>, request?: IncomingMessage): Record<string, unknown> {
  const userId = String(input.userId ?? ""); const clientId = String(input.clientId ?? ""); const clientType = String(input.clientType ?? "other"); const purpose = String(input.purpose ?? ""); const parameterIds = Array.isArray(input.parameterIds) ? input.parameterIds.map(String).slice(0, 10) : []; const startAt = String(input.startAt ?? ""); const endAt = String(input.endAt ?? "");
  if (!userExists(userId)) throw new Error("user_not_found"); if (request && !aiAuthenticatedUser(request, userId)) throw new Error("authenticated_user_required"); if (!aiClientAllowed(clientId, clientType)) throw new Error("ai_client_not_allowed"); if (!aiPurposeAllowed(purpose)) throw new Error("ai_purpose_not_allowed"); if (!parameterIds.length || parameterIds.length > 10 || parameterIds.some((parameterId) => !/^[a-z][a-z0-9_]{1,63}$/.test(parameterId))) throw new Error("ai_scope_required");
  const aggregate = aiQueryService.queryAggregates({ userId, clientId, clientType, purpose, parameterIds, startAt, endAt, groupBy: typeof input.groupBy === 'string' ? input.groupBy as 'time_period' : undefined }); writeAiAudit({ userId, clientId, clientType, purpose, parameterIds, allowed: parameterIds.filter((parameterId) => !aggregate.deniedParameterIds.includes(parameterId)), denied: aggregate.deniedParameterIds, startAt, endAt, count: aggregate.groups.length, status: aggregate.deniedParameterIds.length ? aggregate.groups.length ? "partially_allowed" : "denied" : "allowed" }); return aggregate;
}

function createCheckin(userId: string, kind: string, hypothesisId: string | null): Record<string, unknown> {
  const checkinId = id("checkin");
  const hypothesis = hypothesisId
    ? db.prepare("SELECT spec_json FROM hypotheses WHERE id = ?").get(hypothesisId) as Record<string, unknown> | undefined
    : undefined;
  const spec = hypothesis?.spec_json ? validateHypothesisSpec(JSON.parse(hypothesis.spec_json as string)) : null;
  const requiredFields = spec
    ? [...new Set([...spec.scope.map((condition) => condition.field), ...spec.cohorts.flatMap((cohort) => cohort.conditions.map((condition) => condition.field)), spec.outcome.field])]
    : undefined;
  const question = kind === "random"
    ? { text: "What are you doing right now?", type: "single_choice", field: "activity_type", options: ["work", "rest", "move", "eat", "other"] }
    : { text: "What was the outcome of this activity?", type: "single_choice", field: "outcome", options: ["completed", "interrupted", "not_applicable"], ...(requiredFields ? { requiredFields } : {}) };
  db.prepare("INSERT INTO checkins(id, user_id, hypothesis_id, kind, question_json, scheduled_at, expires_at, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(checkinId, userId, hypothesisId, kind, JSON.stringify(question), now(), new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), RULE_VERSION);
  return { id: checkinId, userId, hypothesisId, kind, question, responseStatus: "pending", policyVersion: RULE_VERSION };
}

function observationValue(value: unknown): ObservationInput["value"] {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  throw new Error("invalid_observation_value");
}

function saveResponse(checkinId: string, input: Record<string, unknown>): Record<string, unknown> {
  const idempotencyKey = optionalString(input.idempotencyKey);
  if (!idempotencyKey) throw new Error("idempotency_key_required");
  const missingReason = optionalString(input.missingReason) ?? null;
  const existing = db.prepare("SELECT * FROM responses WHERE idempotency_key = ?").get(idempotencyKey) as Record<string, unknown> | undefined;
  if (existing) return existing;
  const checkin = db.prepare("SELECT * FROM checkins WHERE id = ?").get(checkinId) as Record<string, unknown> | undefined;
  if (!checkin) throw new Error("checkin_not_found");
  const responseId = id("response");
  const question = JSON.parse(checkin.question_json as string) as { field?: string };
  const aliases: Record<string, string> = {
    activityType: "activity_type",
    activityContext: "activity_context",
  };
  const observationFields = ["activity_context", "energy", "activity_type", "outcome", "satisfaction", "mood", "stress"];
  const observations = observationFields
    .map((field) => ({ field, value: input[field] ?? input[Object.keys(aliases).find((alias) => aliases[alias] === field) ?? ""] }))
    .filter((observation) => observation.value !== undefined);
  if (observations.length === 0 && question.field) observations.push({ field: question.field, value: null });
  const observationIds = observations.map(() => id("obs"));
  const payload = JSON.stringify(input);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO responses(id, checkin_id, idempotency_key, client_created_at, server_received_at, payload_json, missing_reason, capture_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(responseId, checkinId, idempotencyKey, optionalString(input.clientCreatedAt) ?? now(), now(), payload, missingReason, "momentary_observation");
    for (const [index, observationInput] of observations.entries()) {
      const observation: ObservationInput = {
        field: observationInput.field,
        value: observationValue(observationInput.value),
        certainty: missingReason ? "low" : "high",
        source: "user_confirmed",
        missing: Boolean(missingReason) || observationInput.value === null,
      };
      db.prepare("INSERT INTO observations(id, response_id, field, value_json, certainty, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(observationIds[index], responseId, observation.field, JSON.stringify(observation.value), observation.certainty, observation.source, now());
    }
    db.prepare("UPDATE checkins SET response_status = 'answered' WHERE id = ?").run(checkinId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { id: responseId, checkinId, idempotencyKey, observationId: observationIds[0] ?? null, observationIds };
}

function evaluateStoredHypothesis(hypothesisId: string, evaluatedAt = now()): Record<string, unknown> {
  const hypothesis = db.prepare("SELECT id, spec_json FROM hypotheses WHERE id = ?").get(hypothesisId) as Record<string, unknown> | undefined;
  if (!hypothesis) throw new Error("hypothesis_not_found");
  if (!hypothesis.spec_json) throw new Error("hypothesis_spec_required");
  const spec = validateHypothesisSpec(JSON.parse(hypothesis.spec_json as string));
  const rows = db.prepare("SELECT r.id AS response_id, c.id AS checkin_id, COALESCE(r.server_received_at, c.scheduled_at) AS captured_at, r.capture_mode, o.field, o.value_json, o.certainty, o.source FROM responses r JOIN checkins c ON c.id = r.checkin_id JOIN observations o ON o.response_id = r.id WHERE c.hypothesis_id = ? ORDER BY r.server_received_at, o.created_at")
    .all(hypothesisId) as Array<Record<string, unknown>>;
  const episodes = buildEpisodes(rows.map((row) => ({ responseId: row.response_id as string, checkinId: row.checkin_id as string, capturedAt: row.captured_at as string, captureMode: row.capture_mode as "momentary_observation" | "retrospective_entry", field: row.field as string, value: JSON.parse(row.value_json as string), source: row.source as "user_confirmed" | "ai_inferred" | "system", certainty: row.certainty as "high" | "medium" | "low" })));
  const evaluation = evaluateHypothesis(hypothesisId, spec, episodes, evaluatedAt);
  const legacyStatus = evaluation.result === "supports" ? "supported" : evaluation.result === "challenges" ? "challenged" : "inconclusive";
  const evaluationId = id("eval");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO hypothesis_evaluations(id, hypothesis_id, hypothesis_spec_version, evaluator_version, evaluated_at, window_start, window_end, result, cohort_metrics_json, observed_effect, required_effect, data_quality_json, rule_version, status, support_count, challenge_count, insufficient_count, sample_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(evaluationId, hypothesisId, evaluation.hypothesisSpecVersion, evaluation.evaluatorVersion, evaluation.evaluatedAt, evaluation.windowStart, evaluation.windowEnd, evaluation.result, JSON.stringify(evaluation.cohortMetrics), evaluation.observedEffect, evaluation.requiredEffect, JSON.stringify(evaluation.dataQualityFlags), evaluation.evaluatorVersion, legacyStatus, evaluation.cohortMetrics[0].eligibleSamples && evaluation.cohortMetrics[0].metricValue !== null ? Math.round(evaluation.cohortMetrics[0].eligibleSamples * evaluation.cohortMetrics[0].metricValue) : 0, evaluation.cohortMetrics[1].eligibleSamples && evaluation.cohortMetrics[1].metricValue !== null ? Math.round(evaluation.cohortMetrics[1].eligibleSamples * evaluation.cohortMetrics[1].metricValue) : 0, evaluation.cohortMetrics.reduce((sum, metric) => sum + metric.missingSamples, 0), evaluation.samples.length, now());
    for (const sample of evaluation.samples) {
      db.prepare("INSERT INTO hypothesis_evaluation_samples(evaluation_id, response_id, cohort_key, included, outcome_json, exclusion_reason) VALUES (?, ?, ?, ?, ?, ?)").run(evaluationId, sample.responseId, sample.cohortKey, sample.included ? 1 : 0, JSON.stringify(sample.outcomeValue), sample.exclusionReason);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { id: evaluationId, ...evaluation };
}

function latestInsight(hypothesisId: string): Record<string, unknown> | null {
  return db.prepare("SELECT h.id, h.statement, h.state, e.result, e.cohort_metrics_json, e.observed_effect, e.data_quality_json, e.evaluated_at FROM hypotheses h LEFT JOIN hypothesis_evaluations e ON e.id = (SELECT id FROM hypothesis_evaluations WHERE hypothesis_id = h.id ORDER BY created_at DESC LIMIT 1) WHERE h.id = ?").get(hypothesisId) as Record<string, unknown> | null;
}

const server = createServer(async (request, response) => {
  const parts = pathParts(request);
  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  try {
    if (request.method === "GET" && parts.join("/") === "healthz") return json(response, 200, { status: "ok", service: "metheory-api" });
    if (parts[0] === "v1" && parts[1] === "templates") {
      if (request.method === "GET" && parts.length === 2) return json(response, 200, { items: templateRepository.list(requestUrl.searchParams.get("userId") ?? "") });
      if (request.method === "GET" && parts.length === 3) return json(response, 200, templateRepository.detail(requestUrl.searchParams.get("userId") ?? "", parts[2]));
      if (request.method === "POST" && parts.length === 3 && parts[2] === "generate-draft") { const input = await body(request); const requestInput = { userId: String(input.userId ?? ""), theme: String(input.theme ?? ""), purpose: typeof input.purpose === "string" ? input.purpose : undefined }; const kind = process.env.AI_PROVIDER ?? "disabled"; if (kind === "manual_chatgpt") { const provider = new ManualChatGPTTemplateProvider(); return json(response, 200, { provider: kind, promptVersion: TEMPLATE_PROMPT_VERSION, prompt: provider.buildPrompt(requestInput), saved: false }); } const provider = kind === "mock" ? new MockTemplateGenerationProvider() : kind === "openai" ? new OpenAITemplateGenerationProvider({ apiKey: process.env.OPENAI_API_KEY ?? "", model: process.env.OPENAI_TEMPLATE_MODEL ?? "gpt-5.4-mini", reasoning: process.env.OPENAI_TEMPLATE_REASONING ?? "none" }) : new DisabledTemplateGenerationProvider(); const draft = await provider.generateTemplateDraft(requestInput); return json(response, 200, { draft, provider: kind, promptVersion: TEMPLATE_PROMPT_VERSION, saved: false }); }
      if (request.method === "POST" && parts.length === 3 && parts[2] === "validate-draft") { const input = await body(request); const provider = new ManualChatGPTTemplateProvider(); return json(response, 200, { draft: provider.parseResponse(String(input.response ?? "")), valid: true }); }
      if (request.method === "POST" && parts.length === 3 && parts[2] === "suggest-semantic-roles") {
        const input = await body(request);
        const draft = validateTemplateDraft(input.draft);
        const suggestions = suggestSemanticRolesForTemplate({
          theme: draft.theme,
          description: draft.description,
          fields: draft.fields.map((field) => ({
            fieldKey: field.fieldKey,
            label: field.label,
            description: field.description,
            sensitivity: field.sensitivityLevel ?? field.sensitivity,
            currentRole: field.semanticRole
          }))
        });
        return json(response, 200, { suggestions, applied: false, approvalRequired: suggestions.some((item) => item.requiresConfirmation) });
      }
      if (request.method === "POST" && parts.length === 3) { const input = await body(request); return json(response, 201, templateRepository.save(String(input.userId ?? ""), input)); }
      if (request.method === "POST" && parts.length === 4 && parts[3] === "entries") { const input = await body(request); return json(response, 201, templateRepository.createEntry(String(input.userId ?? ""), parts[2], input)); }
      if (request.method === "DELETE" && parts.length === 3) { const input = await body(request); templateRepository.archive(String(input.userId ?? requestUrl.searchParams.get("userId") ?? ""), parts[2]); return json(response, 200, { archived: true }); }
    }
    if (parts[0] === "v1" && parts[1] === "ai" && request.method === "GET") {
      const userId = aiUserId(request, requestUrl); const clientId = requestUrl.searchParams.get("clientId") ?? String(request.headers["x-metheory-client-id"] ?? ""); const clientType = requestUrl.searchParams.get("clientType") ?? String(request.headers["x-metheory-client-type"] ?? "other"); const purpose = requestUrl.searchParams.get("purpose") ?? "read_only_ai";
      if (!userExists(userId)) return json(response, 404, { error: "user_not_found" }); if (!aiAuthenticatedUser(request, userId)) return json(response, 401, { error: "authenticated_user_required" }); if (!aiClientAllowed(clientId, clientType)) return json(response, 403, { error: "ai_client_not_allowed" }); if (!aiPurposeAllowed(purpose)) return json(response, 403, { error: "ai_purpose_not_allowed" });
      if (parts.length === 3 && parts[2] === "parameters") { const result = aiQueryService.listReadableParameters({ userId, clientId, clientType, purpose }); writeAiAudit({ userId, clientId, clientType, purpose, parameterIds: result.items.map((row) => String(row.parameterId)), allowed: result.items.map((row) => String(row.parameterId)), denied: [], count: result.items.length, status: "allowed" }); return json(response, 200, result); }
      if (parts.length === 4 && parts[2] === "parameters") { const parameterId = parts[3]; const result = aiQueryService.getReadableParameter({ userId, clientId, clientType, purpose, parameterId }); if ('denied' in result) return json(response, 403, { error: "parameter_not_allowed", deniedParameterIds: [parameterId] }); writeAiAudit({ userId, clientId, clientType, purpose, parameterIds: [parameterId], allowed: [parameterId], denied: [], count: 1, status: "allowed" }); return json(response, 200, result); }
      if (parts.length === 3 && parts[2] === "self-model") { const result = aiQueryService.getReadableSelfModel({ userId, clientId, clientType, purpose }); writeAiAudit({ userId, clientId, clientType, purpose, parameterIds: [], allowed: [], denied: [], count: result.items.length, status: result.accessLevel === 'none' ? "denied" : "allowed" }); return json(response, 200, result); }
      if (parts.length === 3 && parts[2] === "hypotheses") { const result = aiQueryService.getReadableHypotheses({ userId, clientId, clientType, purpose }); writeAiAudit({ userId, clientId, clientType, purpose, parameterIds: [], allowed: [], denied: [], count: result.items.length, status: "allowed" }); return json(response, 200, result); }
      if (parts.length === 4 && parts[2] === "hypotheses") { const row = db.prepare("SELECT id,statement,state,status,spec_json,spec_version,created_at FROM hypotheses WHERE user_id=? AND id=?").get(userId, parts[3]) as Record<string, unknown> | undefined; if (!row) return json(response, 404, { error: "hypothesis_not_found" }); const evaluation = db.prepare("SELECT result,cohort_metrics_json,observed_effect,data_quality_json,evaluated_at FROM hypothesis_evaluations WHERE hypothesis_id=? ORDER BY created_at DESC LIMIT 1").get(parts[3]); writeAiAudit({ userId, clientId, clientType, purpose, parameterIds: [], allowed: [], denied: [], count: 1, status: "allowed" }); return json(response, 200, { ...row, spec_json: undefined, evaluation: evaluation ?? null }); }
      if (parts.length === 5 && parts[2] === "hypotheses" && parts[4] === "evidence") { if (!db.prepare("SELECT 1 FROM hypotheses WHERE user_id=? AND id=?").get(userId, parts[3])) return json(response, 404, { error: "hypothesis_not_found" }); const result = aiQueryService.getReadableEvidence({ userId, clientId, clientType, purpose, hypothesisId: parts[3] }); writeAiAudit({ userId, clientId, clientType, purpose, parameterIds: [], allowed: [], denied: [], count: result.items.length, status: "allowed" }); return json(response, 200, result); }
      if (parts.length === 5 && parts[2] === "hypotheses" && parts[4] === "missing-parameters") { const row = db.prepare("SELECT spec_json FROM hypotheses WHERE user_id=? AND id=?").get(userId, parts[3]) as Record<string, unknown> | undefined; if (!row) return json(response, 404, { error: "hypothesis_not_found" }); const spec = row.spec_json ? JSON.parse(String(row.spec_json)) as Record<string, unknown> : {}; const fields = [...new Set([...(Array.isArray(spec.scope) ? spec.scope : []).map((item: any) => item.field), ...((Array.isArray(spec.cohorts) ? spec.cohorts : []).flatMap((cohort: any) => Array.isArray(cohort.conditions) ? cohort.conditions.map((item: any) => item.field) : [])), (spec.outcome as any)?.field].filter(Boolean))]; const items = fields.filter((field) => !db.prepare("SELECT 1 FROM observations o JOIN responses r ON r.id=o.response_id JOIN checkins c ON c.id=r.checkin_id WHERE c.user_id=? AND o.field=? LIMIT 1").get(userId, field)).map((parameterId) => ({ parameterId, reason: "no_observations" })); writeAiAudit({ userId, clientId, clientType, purpose, parameterIds: fields, allowed: fields, denied: [], count: items.length, status: "allowed" }); return json(response, 200, { items }); }
      if (parts.length === 3 && parts[2] === "snapshot") { const parameterIds = requestUrl.searchParams.getAll("parameterId"); const aggregate = parameterIds.length ? aiAggregate({ userId, clientId, clientType, purpose, parameterIds, startAt: requestUrl.searchParams.get("startAt") ?? new Date(Date.now() - 30 * 86400000).toISOString(), endAt: requestUrl.searchParams.get("endAt") ?? new Date().toISOString() }, request) : { accessLevel: "aggregate_only", groups: [], deniedParameterIds: [] }; const hypotheses = db.prepare("SELECT id,statement,state,status,created_at FROM hypotheses WHERE user_id=? AND state IN ('tracking','paused') ORDER BY created_at DESC").all(userId); return json(response, 200, { generatedAt: now(), accessLevel: "aggregate_only", hypotheses, aggregates: aggregate.groups, deniedParameterIds: aggregate.deniedParameterIds }); }
    }
    if (request.method === "POST" && parts.join("/") === "v1/ai/aggregates/query") return json(response, 200, aiAggregate(await body(request), request));
    if (request.method === "POST" && parts.join("/") === "v1/users") {
      const input = await body(request); const authSubject = String(input.authSubject ?? "local-user");
      const existing = db.prepare("SELECT id FROM users WHERE auth_subject=?").get(authSubject) as { id: string } | undefined;
      if (existing) return json(response, 200, { id: existing.id, existing: true });
      const userId = id("usr");
      db.prepare("INSERT INTO users(id, auth_subject, locale, timezone, created_at) VALUES (?, ?, ?, ?, ?)").run(userId, authSubject, optionalString(input.locale) ?? "ja-JP", optionalString(input.timezone) ?? "Asia/Tokyo", now());
      return json(response, 201, { id: userId });
    }
    if (parts[0] === "v1" && parts[1] === "privacy") {
      const queryUserId = requestUrl.searchParams.get("userId") ?? "";
      if (request.method === "GET" && parts.length === 3 && parts[2] === "status") { if (!userExists(queryUserId)) return json(response, 404, { error: "user_not_found" }); return json(response, 200, privacyRepository.status(queryUserId)); }
      if (request.method === "GET" && parts.length === 3 && parts[2] === "consents") { if (!userExists(queryUserId)) return json(response, 404, { error: "user_not_found" }); return json(response, 200, { items: privacyRepository.listConsents(queryUserId, requestUrl.searchParams.get("includeRevoked") === "true") }); }
      if (request.method === "GET" && parts.length === 3 && parts[2] === "audit-events") { if (!userExists(queryUserId)) return json(response, 404, { error: "user_not_found" }); return json(response, 200, { items: privacyRepository.listAuditEvents(queryUserId, Number(requestUrl.searchParams.get("limit") ?? 100)) }); }
      if (request.method === "GET" && parts.length === 4 && parts[2] === "consents") { if (!userExists(queryUserId)) return json(response, 404, { error: "user_not_found" }); const consent = privacyRepository.getConsent(queryUserId, parts[3]); return consent ? json(response, 200, consent) : json(response, 404, { error: "consent_not_found" }); }
      if (request.method === "POST" && parts.length === 3 && parts[2] === "consents") { const input = await body(request); const userId = String(input.userId ?? ""); if (!userExists(userId)) return json(response, 404, { error: "user_not_found" }); return json(response, 201, privacyRepository.grantConsent({ userId, workspaceId: typeof input.workspaceId === "string" ? input.workspaceId : null, templateId: typeof input.templateId === "string" ? input.templateId : null, templateVersionId: typeof input.templateVersionId === "string" ? input.templateVersionId : null, fieldKey: String(input.fieldKey ?? ""), consentType: input.consentType as any, providerId: typeof input.providerId === "string" ? input.providerId : null, destinationFingerprint: typeof input.destinationFingerprint === "string" ? input.destinationFingerprint : null, scope: input.scope as any, grantedAt: String(input.grantedAt ?? now()) })); }
      if (request.method === "POST" && parts.length === 3 && parts[2] === "external-ai-check") { const input = await body(request); const userId = String(input.userId ?? ""); if (!userExists(userId)) return json(response, 404, { error: "user_not_found" }); return json(response, 200, privacyRepository.externalAiDecision(userId, { templateId: typeof input.templateId === "string" ? input.templateId : undefined, templateVersionId: typeof input.templateVersionId === "string" ? input.templateVersionId : undefined, fieldKey: String(input.fieldKey ?? ""), providerId: String(input.providerId ?? ""), host: String(input.host ?? ""), connectionType: typeof input.connectionType === "string" ? input.connectionType : undefined, profileId: typeof input.profileId === "string" ? input.profileId : undefined })); }
      if (request.method === "POST" && parts.length === 5 && parts[2] === "consents" && parts[4] === "revoke") { if (!userExists(queryUserId)) return json(response, 404, { error: "user_not_found" }); return json(response, 200, privacyRepository.revokeConsent(queryUserId, parts[3])); }
      if (request.method === "GET" && parts.length === 3 && parts[2] === "fields") { if (!userExists(queryUserId)) return json(response, 404, { error: "user_not_found" }); return json(response, 200, { items: privacyRepository.listFields(queryUserId, requestUrl.searchParams.get("templateId") ?? undefined) }); }
      if (request.method === "GET" && parts.length === 5 && parts[2] === "fields") { if (!userExists(queryUserId)) return json(response, 404, { error: "user_not_found" }); return json(response, 200, { items: privacyRepository.fieldDetail(queryUserId, parts[3], parts[4]) }); }
      if (request.method === "POST" && parts.length === 5 && parts[2] === "templates" && parts[4] === "downgrade") { const input = await body(request); const userId = String(input.userId ?? ""); if (!userExists(userId)) return json(response, 404, { error: "user_not_found" }); return json(response, 200, templateRepository.downgradeHighlySensitiveField(userId, parts[3], String(input.fieldKey ?? ""), String(input.consentId ?? ""))); }
      if (request.method === "POST" && parts.length === 4 && parts[2] === "safe-delete" && parts[3] === "plan") { const input = await body(request); const userId = String(input.userId ?? ""); if (!userExists(userId)) return json(response, 404, { error: "user_not_found" }); return json(response, 201, privacyRepository.createSafeDeletePlan({ userId, templateId: typeof input.templateId === "string" ? input.templateId : undefined, templateVersionId: typeof input.templateVersionId === "string" ? input.templateVersionId : undefined, fieldKey: typeof input.fieldKey === "string" ? input.fieldKey : undefined, entryId: typeof input.entryId === "string" ? input.entryId : undefined, consentId: typeof input.consentId === "string" ? input.consentId : undefined }, Array.isArray(input.markdownFiles) ? input.markdownFiles : [], Number(input.backupCount ?? 0), Number(input.extractionCandidateCount ?? 0))); }
      if (request.method === "POST" && parts.length === 4 && parts[2] === "safe-delete" && parts[3] === "execute") { const input = await body(request); const userId = String(input.userId ?? ""); if (!userExists(userId)) return json(response, 404, { error: "user_not_found" }); return json(response, 200, privacyRepository.executeSafeDelete(userId, String(input.planId ?? ""), String(input.confirmation ?? ""))); }
      if (request.method === "GET" && parts.length === 5 && parts[2] === "safe-delete" && parts[3] === "status") { if (!userExists(queryUserId)) return json(response, 404, { error: "user_not_found" }); return json(response, 200, privacyRepository.getSafeDeletePlan(queryUserId, parts[4])); }
    }
    if (request.method === "POST" && parts.join("/") === "v1/entries") {
      const input = entryWriteInput(await body(request));
      if (!userExists(input.userId)) return json(response, 404, { error: "user_not_found" });
      const result = entryRepository.save(input);
      await searchDocumentRepository.indexEntry(result.entry);
      return json(response, result.created ? 201 : 200, result);
    }
    if (request.method === "PUT" && parts.length === 3 && parts[0] === "v1" && parts[1] === "entries") {
      const input = entryWriteInput(await body(request), parts[2]);
      if (!userExists(input.userId)) return json(response, 404, { error: "user_not_found" });
      const result = entryRepository.save(input);
      await searchDocumentRepository.indexEntry(result.entry);
      return json(response, 200, result);
    }
    if (request.method === "POST" && parts.length === 5 && parts[0] === "v1" && parts[1] === "entries" && parts[3] === "extraction" && parts[4] === "apply") {
      const input = await body(request);
      const userId = String(input.userId ?? "");
       const result = entryRepository.applyExtraction(userId, String(parts[2]), { templateVersionId: String(input.templateVersionId ?? ""), values: input.values && typeof input.values === "object" ? input.values as Record<string, unknown> : {}, confidence: input.confidence && typeof input.confidence === "object" ? input.confidence as Record<string, number> : {}, sourceContentHash: String(input.sourceContentHash ?? ""), sourceUpdatedAt: typeof input.sourceUpdatedAt === "string" ? input.sourceUpdatedAt : undefined, provider: typeof input.provider === "string" ? input.provider : undefined, model: typeof input.model === "string" ? input.model : undefined, privacyOverrides: input.privacyOverrides && typeof input.privacyOverrides === "object" ? input.privacyOverrides as Record<string, string> : undefined });
      return json(response, 200, result);
    }
    if (request.method === "GET" && parts.join("/") === "v1/exports/entries") {
      const userId = requestUrl.searchParams.get("userId") ?? "";
      if (!userExists(userId)) return json(response, 404, { error: "user_not_found" });
      return json(response, 200, entryRepository.export(userId));
    }
    if (request.method === "GET" && parts.length === 2 && parts[0] === "v1" && parts[1] === "entries") {
      const userId = requestUrl.searchParams.get("userId") ?? "";
      if (!userExists(userId)) return json(response, 404, { error: "user_not_found" });
      return json(response, 200, { items: entryRepository.list(userId, includeArchived(requestUrl)) });
    }
    if (request.method === "GET" && parts.length === 3 && parts[0] === "v1" && parts[1] === "entries") {
      const userId = requestUrl.searchParams.get("userId") ?? "";
      if (!userExists(userId)) return json(response, 404, { error: "user_not_found" });
      const entry = entryRepository.get(userId, parts[2], includeArchived(requestUrl));
      return entry ? json(response, 200, entry) : json(response, 404, { error: "entry_not_found" });
    }
    if (request.method === "DELETE" && parts.length === 3 && parts[0] === "v1" && parts[1] === "entries") {
      const userId = requestUrl.searchParams.get("userId") ?? "";
      if (!userExists(userId)) return json(response, 404, { error: "user_not_found" });
      const entry = entryRepository.archive(userId, parts[2]);
      searchDocumentRepository.remove(userId, "entry", entry.id);
      return json(response, 200, entry);
    }
    if (request.method === "POST" && parts.join("/") === "v1/search-documents/rebuild") {
      const input = await body(request); const userId = String(input.userId ?? "");
      if (!userExists(userId)) return json(response, 404, { error: "user_not_found" });
      return json(response, 200, await searchDocumentRepository.rebuildEntries(userId));
    }
    if (request.method === "GET" && parts.join("/") === "v1/search") {
      const userId = requestUrl.searchParams.get("userId") ?? "";
      const query = requestUrl.searchParams.get("q")?.trim() ?? "";
      const limit = Number(requestUrl.searchParams.get("limit") ?? "20");
      if (!userExists(userId)) return json(response, 404, { error: "user_not_found" });
      if (!query) return json(response, 400, { error: "search_query_required" });
      return json(response, 200, { items: await searchDocumentRepository.search(userId, query, Number.isFinite(limit) ? limit : 20) });
    }
    if (request.method === "POST" && parts.join("/") === "v1/self-understanding/analyze") {
      const input = await body(request); const userId = optionalString(input.userId) ?? ""; if (!userExists(userId)) return json(response, 404, { error: "user_not_found" }); return json(response, 200, await analyzeSelfUnderstandingWithInterpretation(userId, input));
    }
    if (request.method === "POST" && parts.join("/") === "v1/self-understanding/analyze-personal-context") {
      const input = await body(request); const userId = optionalString(input.userId) ?? ""; if (!userExists(userId)) return json(response, 404, { error: "user_not_found" });
      const endAt = optionalString(input.endAt) ?? now(); const startAt = optionalString(input.startAt) ?? new Date(Date.parse(endAt) - 28 * 86400000).toISOString();
      if (Number.isNaN(Date.parse(startAt)) || Number.isNaN(Date.parse(endAt)) || Date.parse(startAt) >= Date.parse(endAt)) return json(response, 400, { error: "analysis_period_invalid" });
      const snapshot = await loadPersonalContextSnapshot({ startAt, endAt });
      return json(response, 200, analyzePersonalContextSnapshot(snapshot, { startAt, endAt, minimumEntryCount: Number(input.minimumEntryCount ?? 8) }));
    }
    if (request.method === "POST" && parts.join("/") === "v1/experiments/personal-context-template-requests") {
      const input = await body(request); const userId = optionalString(input.userId) ?? ""; if (!userExists(userId)) return json(response, 404, { error: "user_not_found" });
      const hypothesisId = optionalString(input.hypothesisId); if (hypothesisId && !db.prepare("SELECT 1 FROM hypotheses WHERE id=? AND user_id=?").get(hypothesisId, userId)) return json(response, 404, { error: "hypothesis_not_found" });
      const requestedFields = Array.isArray(input.requestedFields) ? input.requestedFields.filter((field): field is Record<string, unknown> => Boolean(field) && typeof field === "object" && !Array.isArray(field)).map((field) => ({ fieldKey: optionalString(field.fieldKey) ?? "", label: optionalString(field.label) ?? "", valueType: optionalString(field.valueType) ?? "", required: field.required === true, options: Array.isArray(field.options) ? field.options.filter((option): option is { key: string; label: string } => Boolean(option) && typeof option === "object" && typeof (option as any).key === "string" && typeof (option as any).label === "string") : undefined, reason: optionalString(field.reason) ?? "" })) : [];
      const allowedValueTypes = new Set(["text", "long_text", "boolean", "single_choice", "multi_choice", "number", "date"]);
      if (!optionalString(input.title) || !optionalString(input.purpose) || !requestedFields.length || requestedFields.some((field) => !/^[a-z][a-z0-9_]{0,63}$/.test(field.fieldKey) || !field.label || !field.reason || !allowedValueTypes.has(field.valueType))) return json(response, 400, { error: "experiment_template_request_invalid" });
      const durationDays = typeof input.durationDays === "number" && Number.isInteger(input.durationDays) && input.durationDays >= 1 && input.durationDays <= 366 ? input.durationDays : null;
      const requestInput = { schemaVersion: "pcs-experiment-template-request-v1" as const, id: id("pcs_request"), sourceSystem: "metheory" as const, hypothesisId: hypothesisId ?? null, title: optionalString(input.title)!, purpose: optionalString(input.purpose)!, durationDays, requestedFields: requestedFields as Array<{ fieldKey: string; label: string; valueType: "text" | "long_text" | "boolean" | "single_choice" | "multi_choice" | "number" | "date"; required: boolean; options?: Array<{ key: string; label: string }>; reason: string }>, createdAt: now() };
      return json(response, 201, await requestPersonalContextTemplate(requestInput));
    }
    if (parts[0] === "v1" && parts[1] === "activitywatch") {
      const activityWatchEnabled = process.env.ACTIVITYWATCH_ENABLED === "true";
      const adapter = new ActivityWatchAdapter({ baseUrl: process.env.ACTIVITYWATCH_URL ?? "http://127.0.0.1:5600" });
      if (request.method === "GET" && parts[2] === "status") return json(response, 200, { enabled: activityWatchEnabled, ...(activityWatchEnabled ? await adapter.status() : { running: false, baseUrl: adapter.baseUrl }) });
      if (!activityWatchEnabled) return json(response, 409, { error: "activitywatch_disabled" });
      if (request.method === "GET" && parts[2] === "buckets") return json(response, 200, { items: await adapter.buckets() });
      if (request.method === "POST" && (parts[2] === "preview" || parts[2] === "import")) {
        const input = await body(request);
        const bucketIds = Array.isArray(input.bucketIds) ? input.bucketIds.filter((value): value is string => typeof value === "string").slice(0, 10) : [];
        const startAt = optionalString(input.startAt) ?? "";
        const endAt = optionalString(input.endAt) ?? "";
        if (!bucketIds.length || !startAt || !endAt || Date.parse(startAt) >= Date.parse(endAt)) return json(response, 400, { error: "activitywatch_period_invalid" });
        const userId = optionalString(input.userId) ?? "";
        const timezoneRow = userId ? db.prepare("SELECT timezone FROM users WHERE id=?").get(userId) as { timezone?: string } | undefined : undefined;
        const timezone = timezoneRow?.timezone || "UTC";
        let observations;
        try {
          observations = await adapter.preview(bucketIds, startAt, endAt, timezone);
        } catch (error) {
          return json(response, 400, { error: error instanceof Error ? error.message : "activitywatch_preview_invalid" });
        }
        if (parts[2] === "preview") return json(response, 200, { source: "activitywatch", startAt, endAt, count: observations.length, items: observations, dailySummaries: summarizeActivityWatchDaily(observations) });
        if (input.confirm !== true) return json(response, 400, { error: "activitywatch_import_confirmation_required" });
        if (!userExists(userId)) return json(response, 404, { error: "user_not_found" });
        let imported = 0;
        for (const observation of observations) {
          const result = db.prepare("INSERT INTO external_observations(id,user_id,source,source_bucket_id,source_event_id,source_identity,observed_at,local_date,duration_seconds,semantic_role,category,project_label,privacy_level,imported_at,user_confirmed,review_state,original_reference,transform_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,source,source_identity) WHERE source_identity IS NOT NULL DO UPDATE SET observed_at=excluded.observed_at,local_date=excluded.local_date,duration_seconds=excluded.duration_seconds,semantic_role=excluded.semantic_role,category=excluded.category,project_label=excluded.project_label,privacy_level=excluded.privacy_level,imported_at=excluded.imported_at,original_reference=excluded.original_reference,transform_version=excluded.transform_version").run(observation.id, userId, observation.source, observation.sourceBucketId, observation.sourceEventId ?? null, observation.sourceIdentity, observation.observedAt, observation.localDate, observation.durationSeconds ?? null, observation.semanticRole, observation.category, observation.projectLabel ?? null, observation.privacyLevel, observation.importedAt, 0, "imported", observation.sourceEventId ?? null, "activitywatch-v2");
          imported += Number(result.changes ?? 0);
        }
        return json(response, 201, { source: "activitywatch", count: observations.length, imported, skipped: observations.length - imported, reviewState: "imported" });
      }
      if (request.method === "GET" && parts[2] === "observations") {
        const userId = requestUrl.searchParams.get("userId") ?? "";
        if (!userExists(userId)) return json(response, 404, { error: "user_not_found" });
        return json(response, 200, { items: db.prepare("SELECT * FROM external_observations WHERE user_id=? AND source='activitywatch' ORDER BY observed_at DESC").all(userId) });
      }
      if (request.method === "POST" && parts.length === 5 && parts[2] === "observations" && parts[4] === "review") {
        const input = await body(request); const userId = optionalString(input.userId) ?? ""; const reviewState = optionalString(input.reviewState) ?? "";
        if (!userExists(userId)) return json(response, 404, { error: "user_not_found" });
        if (!['reviewed', 'excluded'].includes(reviewState)) return json(response, 400, { error: "activitywatch_review_state_invalid" });
        const result = db.prepare("UPDATE external_observations SET review_state=?,user_confirmed=? WHERE id=? AND user_id=? AND source='activitywatch'").run(reviewState, reviewState === "reviewed" ? 1 : 0, parts[3], userId);
        return Number(result.changes ?? 0) ? json(response, 200, { id: parts[3], reviewState }) : json(response, 404, { error: "activitywatch_observation_not_found" });
      }
    }
    if (parts[0] === "v1" && parts[1] === "self-understanding" && parts[2] === "baseline") {
      if (request.method === "GET" && parts.length === 3) return json(response, 200, { itemSetVersion: IPIP_BASELINE_ITEM_SET_VERSION, items: baselineItems() });
      const input = request.method === "POST" ? await body(request) : {};
      const userId = request.method === "GET" ? requestUrl.searchParams.get("userId") ?? "" : optionalString(input.userId) ?? "";
      const resolvedUserId = request.method === "DELETE" ? requestUrl.searchParams.get("userId") ?? "" : userId;
      if (!userExists(resolvedUserId)) return json(response, 404, { error: "user_not_found" });
      if (request.method === "GET" && parts.length === 4 && parts[3] === "responses") return json(response, 200, { items: db.prepare("SELECT * FROM baseline_self_perceptions WHERE user_id=? AND deleted_at IS NULL ORDER BY recorded_at").all(resolvedUserId) });
      if (request.method === "POST" && parts.length === 4 && parts[3] === "responses") {
        const item = createBaselineResponse({ id: id("baseline"), itemKey: String(input.itemKey ?? ""), response: Number(input.response), recordedAt: optionalString(input.recordedAt), useForSelfUnderstanding: input.useForSelfUnderstanding !== false });
        db.prepare("INSERT INTO baseline_self_perceptions(id,user_id,source,item_set_version,item_key,original_item_reference,statement_ja,response,response_minimum,response_maximum,recorded_at,user_confirmed,use_for_self_understanding,privacy_level,provenance_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,item_set_version,item_key) DO UPDATE SET response=excluded.response,recorded_at=excluded.recorded_at,user_confirmed=excluded.user_confirmed,use_for_self_understanding=excluded.use_for_self_understanding,deleted_at=NULL").run(item.id, resolvedUserId, item.source, item.itemSetVersion, item.itemKey, item.originalItemReference ?? null, item.statementJa, item.response, item.responseScale.minimum, item.responseScale.maximum, item.recordedAt, 1, item.useForSelfUnderstanding ? 1 : 0, item.privacyLevel, JSON.stringify({ source: item.source, importedAt: item.recordedAt, recordedAt: item.recordedAt, userConfirmed: true, transformVersion: item.itemSetVersion, privacyLevel: item.privacyLevel }));
        return json(response, 201, item);
      }
      if (request.method === "POST" && parts.length === 4 && parts[3] === "disable") { db.prepare("UPDATE baseline_self_perceptions SET use_for_self_understanding=0 WHERE user_id=? AND deleted_at IS NULL").run(resolvedUserId); return json(response, 200, { disabled: true }); }
      if (request.method === "DELETE" && parts.length === 3) { db.prepare("UPDATE baseline_self_perceptions SET deleted_at=? WHERE user_id=? AND deleted_at IS NULL").run(now(), resolvedUserId); return json(response, 200, { deleted: true }); }
    }
    if (request.method === "GET" && parts.join("/") === "v1/self-understanding/options") {
      const userId = requestUrl.searchParams.get("userId") ?? ""; if (!userExists(userId)) return json(response, 404, { error: "user_not_found" }); const templates = db.prepare("SELECT DISTINCT t.id,t.name FROM entry_templates t JOIN entries e ON e.template_id=t.id WHERE t.user_id=? AND e.archived_at IS NULL ORDER BY t.updated_at DESC").all(userId); const fields = db.prepare("SELECT DISTINCT e.template_id,f.field_key,f.label,f.value_type FROM entries e JOIN entry_field_values ev ON ev.entry_id=e.id JOIN entry_template_fields f ON f.id=ev.template_field_id WHERE e.user_id=? AND e.archived_at IS NULL AND ev.reviewed_at IS NOT NULL ORDER BY e.template_id,f.label").all(userId); return json(response, 200, { templates, fields });
    }
    if (request.method === "GET" && parts.join("/") === "v1/self-understanding/reviews") {
      const userId = requestUrl.searchParams.get("userId") ?? ""; if (!userExists(userId)) return json(response, 404, { error: "user_not_found" }); return json(response, 200, { items: db.prepare("SELECT * FROM hypothesis_reviews WHERE user_id=? ORDER BY created_at DESC").all(userId) });
    }
    if (request.method === "POST" && parts.join("/") === "v1/self-understanding/reviews") {
      const input = await body(request);
      const userId = optionalString(input.userId) ?? "";
      const rating = optionalString(input.rating) ?? "";
      const candidateId = optionalString(input.candidateId) ?? "";
      if (!userExists(userId)) return json(response, 404, { error: "user_not_found" });
      if (!["fits", "does_not_fit", "on_hold"].includes(rating)) return json(response, 400, { error: "hypothesis_review_invalid" });
      const snapshot = selfUnderstandingRepository.latestSnapshot(userId, candidateId) as any;
      if (!snapshot) return json(response, 404, { error: "self_understanding_candidate_not_found" });
      const period = snapshot.period as { startAt: string; endAt: string };
      const fieldPair = {
        condition: snapshot.interpretationInput.condition.fieldKey,
        outcome: snapshot.interpretationInput.outcome.fieldKey
      };
      const createdAt = now();
      const reviewId = id("hyp_review");
      db.prepare("INSERT INTO hypothesis_reviews(id,user_id,candidate_id,rating,note,analysis_start_at,analysis_end_at,template_version_id,field_pair_json,reviewed_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(reviewId, userId, candidateId, rating, optionalString(input.note) ?? "", period.startAt, period.endAt, optionalString(input.templateVersionId) ?? null, JSON.stringify(fieldPair), createdAt, createdAt);
      let selfModelCandidateId: string | null = null;
      if (rating === "fits") {
        const statement = String(snapshot.selfModelCandidate ?? "");
        if (!validateSelfModelStatement(statement)) return json(response, 400, { error: "self_model_statement_invalid" });
        selfModelCandidateId = id("self_model_candidate");
        db.prepare(`INSERT INTO self_model_candidates(
          id,user_id,candidate_id,statement,status,source_hypothesis_id,
          supporting_period_start,supporting_period_end,construct_key,tendency_scope,
          source_analysis_periods_json,supporting_field_pairs_json,
          resolution_action,target_self_belief_id,user_note,created_at,last_reviewed_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          selfModelCandidateId,
          userId,
          candidateId,
          statement,
          "proposed",
          candidateId,
          period.startAt,
          period.endAt,
          snapshot.construct,
          snapshot.tendencyScope,
          JSON.stringify([period]),
          JSON.stringify([{ conditionFieldKey: fieldPair.condition, outcomeFieldKey: fieldPair.outcome }]),
          "new",
          null,
          optionalString(input.note) ?? "",
          createdAt,
          createdAt
        );
      }
      const relatedItems = selfUnderstandingRepository.relatedSelfModelItems(userId, String(snapshot.construct));
      return json(response, 201, { id: reviewId, candidateId, rating, selfModelUpdate: selfModelCandidateId ? "proposed" : "none", selfModelCandidateId, relatedItems, availableResolutionActions: ["create_new", "propose_update", "keep_separate"], resolutionActionAliases: ["new", "update_existing", "separate"] });
    }
    if (request.method === "POST" && parts.join("/") === "v1/self-understanding/context-candidates") {
      const input = await body(request);
      const userId = optionalString(input.userId) ?? "";
      const candidateId = optionalString(input.candidateId) ?? "";
      const rating = optionalString(input.rating) ?? "fits";
      if (!userExists(userId)) return json(response, 404, { error: "user_not_found" });
      if (!candidateId || !["fits", "does_not_fit", "on_hold"].includes(rating)) return json(response, 400, { error: "context_candidate_invalid" });
      const snapshot = selfUnderstandingRepository.latestSnapshot(userId, candidateId) as any;
      if (!snapshot) return json(response, 404, { error: "self_understanding_candidate_not_found" });
      return json(response, 201, { item: personalContextCandidate(snapshot, rating as "fits" | "does_not_fit" | "on_hold", now()) });
    }
    if (request.method === "GET" && parts.join("/") === "v1/self-understanding/context-export") {
      const userId = requestUrl.searchParams.get("userId") ?? "";
      if (!userExists(userId)) return json(response, 404, { error: "user_not_found" });
      const accepted = db.prepare("SELECT id,statement,construct_key,tendency_scope,created_at,last_reviewed_at FROM self_beliefs WHERE user_id=? AND status='active' ORDER BY created_at").all(userId) as any[];
      const proposed = db.prepare("SELECT id,statement,source_hypothesis_id,status,created_at FROM self_model_candidates WHERE user_id=? AND status='proposed' ORDER BY created_at").all(userId) as any[];
      return json(response, 200, {
        schemaVersion: "personal-context-migration-v1",
        exportedAt: now(),
        acceptedItems: accepted.map((item) => ({ legacyId: item.id, statement: item.statement, construct: item.construct_key ?? undefined, tendencyScope: item.tendency_scope ?? undefined, createdAt: item.created_at, lastReviewedAt: item.last_reviewed_at ?? undefined })),
        proposedItems: proposed.map((item) => ({ legacyId: item.id, statement: item.statement, sourceHypothesisId: item.source_hypothesis_id ?? undefined, status: item.status, createdAt: item.created_at }))
      });
    }
    if (request.method === "GET" && parts.join("/") === "v1/self-understanding/self-model-candidates") {
      const userId = requestUrl.searchParams.get("userId") ?? ""; if (!userExists(userId)) return json(response, 404, { error: "user_not_found" }); return json(response, 200, { items: db.prepare("SELECT * FROM self_model_candidates WHERE user_id=? ORDER BY created_at DESC").all(userId) });
    }
    if (request.method === "GET" && parts.join("/") === "v1/self-understanding/self-model-options") {
      const userId = requestUrl.searchParams.get("userId") ?? "";
      const candidateId = requestUrl.searchParams.get("candidateId") ?? "";
      if (!userExists(userId)) return json(response, 404, { error: "user_not_found" });
      const candidate = db.prepare("SELECT construct_key FROM self_model_candidates WHERE user_id=? AND id=?").get(userId, candidateId) as { construct_key: string | null } | undefined;
      if (!candidate) return json(response, 404, { error: "self_model_candidate_not_found" });
      const relatedItems = candidate.construct_key ? selfUnderstandingRepository.relatedSelfModelItems(userId, candidate.construct_key) : [];
      return json(response, 200, { candidateId, constructKey: candidate.construct_key, actions: ["create_new", "propose_update", "keep_separate"], relatedActions: ["new", "update_existing", "separate"], relatedItems, automaticMerge: false });
    }
    if (request.method === "POST" && parts.join("/") === "v1/self-understanding/self-model-candidates/edit") {
      const input = await body(request);
      const userId = optionalString(input.userId) ?? "";
      const candidateId = optionalString(input.candidateId) ?? "";
      const statement = optionalString(input.statement)?.trim() ?? "";
      const requestedResolution = optionalString(input.resolutionAction) ?? "create_new";
      const resolutionAction = requestedResolution === "create_new" ? "new" : requestedResolution === "keep_separate" || requestedResolution === "propose_update" ? "separate" : requestedResolution;
      const targetSelfBeliefId = optionalString(input.targetSelfBeliefId) ?? null;
      if (!userExists(userId)) return json(response, 404, { error: "user_not_found" });
      if (!validateSelfModelStatement(statement)) return json(response, 400, { error: "self_model_statement_invalid" });
      if (!["new", "update_existing", "separate"].includes(resolutionAction)) return json(response, 400, { error: "self_model_resolution_invalid" });
      if (resolutionAction === "update_existing") {
        const candidate = db.prepare("SELECT construct_key FROM self_model_candidates WHERE user_id=? AND id=?").get(userId, candidateId) as { construct_key: string | null } | undefined;
        const target = targetSelfBeliefId ? db.prepare("SELECT id FROM self_beliefs WHERE user_id=? AND id=? AND construct_key=? AND status!='archived'").get(userId, targetSelfBeliefId, candidate?.construct_key ?? "") : undefined;
        if (!target) return json(response, 400, { error: "self_model_update_target_invalid" });
      }
      const result = db.prepare("UPDATE self_model_candidates SET statement=?,user_note=?,resolution_action=?,target_self_belief_id=?,last_reviewed_at=? WHERE user_id=? AND id=? AND status='proposed'").run(statement, optionalString(input.userNote) ?? "", resolutionAction, targetSelfBeliefId, now(), userId, candidateId);
      if (!result.changes) return json(response, 404, { error: "self_model_candidate_not_found" });
      return json(response, 200, { candidateId, statement, resolutionAction, conflictOption: requestedResolution, targetSelfBeliefId });
    }
    if (request.method === "POST" && parts.join("/") === "v1/self-understanding/self-model-candidates/review") {
      const input = await body(request);
      const userId = optionalString(input.userId) ?? "";
      const candidateId = optionalString(input.candidateId) ?? "";
      const status = optionalString(input.status) ?? "";
      if (!userExists(userId)) return json(response, 404, { error: "user_not_found" });
      if (!["accepted", "rejected"].includes(status)) return json(response, 400, { error: "self_model_review_invalid" });
      const requestedResolution = optionalString(input.resolutionAction);
      if (requestedResolution) {
        const normalizedResolution = requestedResolution === "create_new" ? "new" : requestedResolution === "keep_separate" || requestedResolution === "propose_update" ? "separate" : requestedResolution;
        if (!["new", "update_existing", "separate"].includes(normalizedResolution)) return json(response, 400, { error: "self_model_resolution_invalid" });
        db.prepare("UPDATE self_model_candidates SET resolution_action=? WHERE user_id=? AND id=? AND status='proposed'").run(normalizedResolution, userId, candidateId);
      }
      const candidate = db.prepare(`SELECT statement,source_hypothesis_id,
        supporting_period_start,supporting_period_end,user_note,construct_key,
        tendency_scope,source_analysis_periods_json,supporting_field_pairs_json,
        resolution_action,target_self_belief_id
        FROM self_model_candidates
        WHERE user_id=? AND id=? AND status='proposed'`).get(userId, candidateId) as any;
      if (!candidate) return json(response, 404, { error: "self_model_candidate_not_found" });
      if (!validateSelfModelStatement(String(candidate.statement))) return json(response, 400, { error: "self_model_statement_invalid" });
      const reviewedAt = now();
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("UPDATE self_model_candidates SET status=?,reviewed_at=?,accepted_at=?,last_reviewed_at=? WHERE user_id=? AND id=?").run(status, reviewedAt, status === "accepted" ? reviewedAt : null, reviewedAt, userId, candidateId);
        let beliefId: string | null = null;
        if (status === "accepted" && candidate.resolution_action === "update_existing" && candidate.target_self_belief_id) {
          const updated = db.prepare(`UPDATE self_beliefs SET statement=?,source_hypothesis_id=?,
            user_note=?,last_reviewed_at=?,supporting_period_start=?,supporting_period_end=?,
            tendency_scope=?,source_analysis_periods_json=?,supporting_field_pairs_json=?
            WHERE user_id=? AND id=? AND construct_key=? AND status!='archived'`).run(
            candidate.statement, candidate.source_hypothesis_id, candidate.user_note,
            reviewedAt, candidate.supporting_period_start, candidate.supporting_period_end,
            candidate.tendency_scope, candidate.source_analysis_periods_json,
            candidate.supporting_field_pairs_json, userId,
            candidate.target_self_belief_id, candidate.construct_key
          );
          if (!updated.changes) throw new Error("self_model_update_target_invalid");
          beliefId = candidate.target_self_belief_id;
        } else if (status === "accepted") {
          beliefId = id("belief");
          db.prepare(`INSERT INTO self_beliefs(
            id,user_id,statement,source_kind,source_hypothesis_id,status,user_note,
            accepted_at,last_reviewed_at,supporting_period_start,supporting_period_end,
            construct_key,tendency_scope,source_analysis_periods_json,
            supporting_field_pairs_json,created_at
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
            beliefId, userId, candidate.statement, "user",
            candidate.source_hypothesis_id, "active", candidate.user_note,
            reviewedAt, reviewedAt, candidate.supporting_period_start,
            candidate.supporting_period_end, candidate.construct_key,
            candidate.tendency_scope, candidate.source_analysis_periods_json,
            candidate.supporting_field_pairs_json, reviewedAt
          );
        }
        db.exec("COMMIT");
        return json(response, 200, { candidateId, status, selfBeliefId: beliefId, resolutionAction: candidate.resolution_action });
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
    if (request.method === "POST" && parts.length === 2 && parts[0] === "v1" && parts[1] === "self-beliefs") {
      const input = await body(request); const userId = optionalString(input.userId) ?? ""; const statement = optionalString(input.statement) ?? ""; if (!userExists(userId)) return json(response, 404, { error: "user_not_found" });
      if (!validateSelfModelStatement(statement)) return json(response, 400, { error: "self_belief_statement_invalid" });
      const beliefId = id("belief"); db.prepare("INSERT INTO self_beliefs(id, user_id, statement, source_kind, created_at) VALUES (?, ?, ?, 'user', ?)").run(beliefId, userId, statement, now());
      return json(response, 201, { id: beliefId, userId, statement });
    }
    if (request.method === "POST" && parts.length === 2 && parts[0] === "v1" && parts[1] === "hypotheses") {
      const input = await body(request); const userId = optionalString(input.userId) ?? ""; if (!userExists(userId)) return json(response, 404, { error: "user_not_found" });
      const spec = input.spec ? validateHypothesisSpec(input.spec) : null;
      const hypothesisId = id("hyp"); db.prepare("INSERT INTO hypotheses(id, user_id, self_belief_id, template_key, statement, state, status, spec_json, spec_version, rule_version, created_at) VALUES (?, ?, ?, ?, ?, 'tracking', 'tracking', ?, ?, ?, ?)").run(hypothesisId, userId, optionalString(input.selfBeliefId) ?? null, optionalString(input.templateKey) ?? "belief_vs_observation", optionalString(input.statement) ?? "", spec ? JSON.stringify(spec) : null, spec?.schemaVersion ?? null, RULE_VERSION, now());
      return json(response, 201, { id: hypothesisId, state: "tracking", specVersion: spec?.schemaVersion ?? null });
    }
    if (request.method === "POST" && parts.join("/") === "v1/checkins/next") {
      const input = await body(request); const userId = input.userId as string; if (!userExists(userId)) return json(response, 404, { error: "user_not_found" });
      const hypothesis = db.prepare("SELECT id FROM hypotheses WHERE user_id = ? AND status = 'tracking' ORDER BY created_at LIMIT 1").get(userId) as { id: string } | undefined;
      const kind = input.kind === "follow_up" ? "follow_up" : input.kind === "hypothesis" && hypothesis ? "hypothesis" : "random";
      return json(response, 201, createCheckin(userId, kind, kind === "hypothesis" ? hypothesis!.id : null));
    }
    if (request.method === "POST" && parts.length === 4 && parts[0] === "v1" && parts[1] === "checkins" && parts[3] === "responses") {
      return json(response, 201, saveResponse(parts[2], await body(request)));
    }
    if (request.method === "POST" && parts.length === 4 && parts[0] === "v1" && parts[1] === "hypotheses" && parts[3] === "evaluate") {
      const input = await body(request);
      return json(response, 201, evaluateStoredHypothesis(parts[2], (input.evaluatedAt as string | undefined) ?? now()));
    }
    if (request.method === "GET" && parts.length === 4 && parts[0] === "v1" && parts[1] === "hypotheses" && parts[3] === "evaluations") {
      const rows = db.prepare("SELECT * FROM hypothesis_evaluations WHERE hypothesis_id = ? ORDER BY created_at DESC").all(parts[2]) as Array<Record<string, unknown>>;
      return json(response, 200, { items: rows });
    }
    if (request.method === "GET" && parts.length === 3 && parts[0] === "v1" && parts[1] === "hypotheses") {
      return json(response, 200, latestInsight(parts[2]));
    }
    return json(response, 404, { error: "not_found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    const status = message.endsWith("_not_found") ? 404 : message.includes('not_allowed') ? 403 : message.includes('authenticated_user') ? 401 : 400;
    return json(response, status, { error: message });
  }
});

const port = Number(process.env.PORT ?? 8100);
server.listen(port, "127.0.0.1", () => console.log(`MeTheory TypeScript API listening on http://127.0.0.1:${port}`));
