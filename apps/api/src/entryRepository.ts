import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { type Entry, type EntryWriteInput, validateEntryWriteInput } from "../../../packages/records/src/index.ts";
import { containsProhibitedSecretValue } from "../../../packages/privacy/src/index.ts";

type EntryRow = {
  id: string;
  user_id: string;
  template_id: string | null;
  episode_id: string | null;
  external_source: string | null;
  external_source_id: string | null;
  source_updated_at: string | null;
  title: string;
  body: string;
  recorded_at: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

function toEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    userId: row.user_id,
    templateId: row.template_id,
    episodeId: row.episode_id,
    externalSource: row.external_source,
    externalSourceId: row.external_source_id,
    sourceUpdatedAt: row.source_updated_at,
    title: row.title,
    body: row.body,
    recordedAt: row.recorded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

export class SqliteEntryRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private byId(userId: string, entryId: string): EntryRow | undefined {
    return this.db.prepare("SELECT * FROM entries WHERE user_id=? AND id=?").get(userId, entryId) as EntryRow | undefined;
  }

  get(userId: string, entryId: string, includeArchived = false): Entry | null {
    const row = includeArchived
      ? this.byId(userId, entryId)
      : this.db.prepare("SELECT * FROM entries WHERE user_id=? AND id=? AND archived_at IS NULL").get(userId, entryId) as EntryRow | undefined;
    return row ? toEntry(row) : null;
  }

  list(userId: string, includeArchived = false): Entry[] {
    const sql = includeArchived
      ? "SELECT * FROM entries WHERE user_id=? ORDER BY recorded_at DESC, created_at DESC"
      : "SELECT * FROM entries WHERE user_id=? AND archived_at IS NULL ORDER BY recorded_at DESC, created_at DESC";
    return (this.db.prepare(sql).all(userId) as EntryRow[]).map(toEntry);
  }

  save(input: EntryWriteInput): { entry: Entry; created: boolean } {
    const draft = validateEntryWriteInput(input);
    const existing = draft.id
      ? this.byId(draft.userId, draft.id)
      : draft.externalSource && draft.externalSourceId
        ? this.db.prepare("SELECT * FROM entries WHERE user_id=? AND external_source=? AND external_source_id=? ORDER BY created_at LIMIT 1").get(draft.userId, draft.externalSource, draft.externalSourceId) as EntryRow | undefined
        : undefined;
    if (draft.id && !existing) throw new Error("entry_not_found");

    const timestamp = new Date().toISOString();
    if (existing) {
      const recordedAt = existing.recorded_at;
      const sourceUpdatedAt = draft.sourceUpdatedAt === undefined ? existing.source_updated_at : draft.sourceUpdatedAt;
      this.db.prepare("UPDATE entries SET template_id=?, episode_id=?, external_source=?, external_source_id=?, source_updated_at=?, title=?, body=?, recorded_at=?, updated_at=?, archived_at=NULL WHERE id=? AND user_id=?")
        .run(draft.templateId, draft.episodeId, draft.externalSource, draft.externalSourceId, sourceUpdatedAt, draft.title, draft.body, recordedAt, timestamp, existing.id, draft.userId);
      return {
        created: false,
        entry: {
          ...toEntry(existing),
          templateId: draft.templateId,
          episodeId: draft.episodeId,
          externalSource: draft.externalSource,
          externalSourceId: draft.externalSourceId,
          sourceUpdatedAt,
          title: draft.title,
          body: draft.body,
          recordedAt,
          updatedAt: timestamp,
          archivedAt: null,
        },
      };
    }

    const entry: Entry = {
      id: `entry_${randomUUID().replaceAll("-", "")}`,
      userId: draft.userId,
      templateId: draft.templateId,
      episodeId: draft.episodeId,
      externalSource: draft.externalSource,
      externalSourceId: draft.externalSourceId,
      title: draft.title,
      body: draft.body,
      recordedAt: draft.recordedAt ?? timestamp,
      sourceUpdatedAt: draft.sourceUpdatedAt ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    };
    this.db.prepare("INSERT INTO entries(id,user_id,template_id,episode_id,external_source,external_source_id,source_updated_at,title,body,recorded_at,created_at,updated_at,archived_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(entry.id, entry.userId, entry.templateId, entry.episodeId, entry.externalSource, entry.externalSourceId, entry.sourceUpdatedAt, entry.title, entry.body, entry.recordedAt, entry.createdAt, entry.updatedAt, entry.archivedAt);
    return { entry, created: true };
  }

  applyExtraction(userId: string, entryId: string, input: { templateVersionId: string; values: Record<string, unknown>; confidence?: Record<string, number>; sourceContentHash: string; sourceUpdatedAt?: string; provider?: string; model?: string; privacyOverrides?: Record<string, string> }): { entryId: string; applied: number } {
    const entry = this.byId(userId, entryId);
    if (!entry || entry.archived_at) throw new Error("entry_not_found");
    const fields = this.db.prepare("SELECT * FROM entry_template_fields WHERE template_version_id=? ORDER BY display_order").all(input.templateVersionId) as Array<Record<string, unknown>>;
    const timestamp = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      let applied = 0;
      for (const field of fields) {
        const key = String(field.field_key);
        if (!Object.prototype.hasOwnProperty.call(input.values, key)) continue;
        const value = input.values[key];
        const fieldType = String(field.value_type);
        const sensitivityLevel = String(field.sensitivity_level ?? "normal");
        const suggestedSecret = /(password|passwd|api[_-]?key|secret|token|cookie|session|credential|private[_-]?key)/i.test(`${key} ${String(field.label ?? "")}`);
        if (sensitivityLevel === "highly_sensitive" && !input.privacyOverrides?.[key]) throw new Error("highly_sensitive_value_override_required");
        if (sensitivityLevel === "sensitive" && !this.db.prepare("SELECT 1 FROM privacy_consents WHERE user_id=? AND template_version_id=? AND field_key=? AND consent_type='sensitive_field_processing' AND revoked_at IS NULL LIMIT 1").get(userId, input.templateVersionId, key)) throw new Error("privacy_consent_required");
        const values = { text: null as string | null, integer: null as number | null, number: null as number | null, boolean: null as number | null, json: null as string | null, date: null as string | null, datetime: null as string | null, duration: null as number | null };
        if (value === null || value === undefined || value === "") {
          // Missing is represented separately from false and zero.
        } else if (fieldType === "boolean") values.boolean = value === true ? 1 : value === false ? 0 : (() => { throw new Error("extraction_value_type_invalid"); })();
        else if (["integer", "scale"].includes(fieldType)) { if (typeof value !== "number" || !Number.isInteger(value)) throw new Error("extraction_value_type_invalid"); values.integer = value; }
        else if (["number"].includes(fieldType)) { if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("extraction_value_type_invalid"); values.number = value; }
        else if (fieldType === "duration_seconds") { if (typeof value !== "number" || !Number.isInteger(value)) throw new Error("extraction_value_type_invalid"); values.duration = value; }
        else if (["date", "datetime"].includes(fieldType)) { if (typeof value !== "string") throw new Error("extraction_value_type_invalid"); if (fieldType === "date") values.date = value; else values.datetime = value; }
        else if (["choice", "multi_choice"].includes(fieldType)) { const selected = fieldType === "multi_choice" ? value : [value]; if (!Array.isArray(selected) || selected.some(item => typeof item !== "string")) throw new Error("extraction_value_type_invalid"); const allowed = JSON.parse(String(field.options_json ?? "[]")) as Array<{ key?: string }>; if (selected.some(item => !allowed.some(option => option.key === item))) throw new Error("extraction_value_not_allowed"); if (fieldType === "multi_choice") values.json = JSON.stringify(selected); else values.text = String(selected[0]); }
        else { if (typeof value !== "string") throw new Error("extraction_value_type_invalid"); values.text = value; }
        if (value !== null && (suggestedSecret || Boolean(field.prohibited_secret_risk) || containsProhibitedSecretValue(value))) throw new Error("prohibited_secret_value");
        if (sensitivityLevel === "highly_sensitive" && !this.db.prepare("SELECT 1 FROM privacy_consents WHERE id=? AND user_id=? AND template_version_id=? AND field_key=? AND consent_type='highly_sensitive_downgrade' AND revoked_at IS NULL").get(...([input.privacyOverrides?.[key] ?? null, userId, input.templateVersionId, key] as any[]))) throw new Error("highly_sensitive_value_override_required");
        const result = this.db.prepare("UPDATE entry_field_values SET text_value=?, integer_value=?, number_value=?, boolean_value=?, json_value=?, date_value=?, datetime_value=?, duration_seconds=?, is_missing=?, source_content_hash=?, source_updated_at=?, confidence=?, source=?, reviewed_at=?, updated_at=? WHERE entry_id=? AND template_version_id=? AND template_field_id=?")
          .run(values.text, values.integer, values.number, values.boolean, values.json, values.date, values.datetime, values.duration, value === null || value === undefined || value === "" ? 1 : 0, input.sourceContentHash, input.sourceUpdatedAt ?? null, input.confidence?.[key] ?? null, input.provider ?? "reviewed_extraction", timestamp, timestamp, entryId, input.templateVersionId, String(field.id));
        if (result.changes && sensitivityLevel === "highly_sensitive" && input.privacyOverrides?.[key]) this.db.prepare("INSERT OR REPLACE INTO privacy_value_overrides(entry_id,template_version_id,field_key,original_level,effective_level,consent_id,created_at) VALUES(?,?,?,?,?,?,?)").run(entryId, input.templateVersionId, key, "highly_sensitive", "sensitive", input.privacyOverrides[key], timestamp);
        applied += Number(result.changes);
      }
      this.db.exec("COMMIT");
      return { entryId, applied };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  archive(userId: string, entryId: string): Entry {
    const existing = this.get(userId, entryId);
    if (!existing) throw new Error("entry_not_found");
    const archivedAt = new Date().toISOString();
    this.db.prepare("UPDATE entries SET archived_at=?, updated_at=? WHERE id=? AND user_id=?").run(archivedAt, archivedAt, entryId, userId);
    return { ...existing, archivedAt, updatedAt: archivedAt };
  }

  export(userId: string): { formatVersion: string; exportedAt: string; entries: Entry[] } {
    return { formatVersion: "entries-export-v1", exportedAt: new Date().toISOString(), entries: this.list(userId, true) };
  }
}
