import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { type Entry, type EntryWriteInput, validateEntryWriteInput } from "../../../packages/records/src/index.ts";

type EntryRow = {
  id: string;
  user_id: string;
  template_id: string | null;
  episode_id: string | null;
  external_source: string | null;
  external_source_id: string | null;
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
      this.db.prepare("UPDATE entries SET template_id=?, episode_id=?, external_source=?, external_source_id=?, title=?, body=?, recorded_at=?, updated_at=?, archived_at=NULL WHERE id=? AND user_id=?")
        .run(draft.templateId, draft.episodeId, draft.externalSource, draft.externalSourceId, draft.title, draft.body, draft.recordedAt, timestamp, existing.id, draft.userId);
      return {
        created: false,
        entry: {
          ...toEntry(existing),
          templateId: draft.templateId,
          episodeId: draft.episodeId,
          externalSource: draft.externalSource,
          externalSourceId: draft.externalSourceId,
          title: draft.title,
          body: draft.body,
          recordedAt: draft.recordedAt,
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
      recordedAt: draft.recordedAt,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    };
    this.db.prepare("INSERT INTO entries(id,user_id,template_id,episode_id,external_source,external_source_id,title,body,recorded_at,created_at,updated_at,archived_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(entry.id, entry.userId, entry.templateId, entry.episodeId, entry.externalSource, entry.externalSourceId, entry.title, entry.body, entry.recordedAt, entry.createdAt, entry.updatedAt, entry.archivedAt);
    return { entry, created: true };
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
