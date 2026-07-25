import { type Entry, type EntryWriteInput, validateEntryWriteInput } from '../../../../../packages/records/src/index.ts';
import { dbPromise, newId } from '../db';
import { indexEntrySearchDocument, removeSearchDocument } from './searchDocumentRepository';

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

export async function getEntry(userId: string, entryId: string, includeArchived = false): Promise<Entry | null> {
  const db = await dbPromise;
  const sql = includeArchived
    ? 'SELECT * FROM entries WHERE user_id=? AND id=?'
    : 'SELECT * FROM entries WHERE user_id=? AND id=? AND archived_at IS NULL';
  const row = await db.getFirstAsync<EntryRow>(sql, userId, entryId);
  return row ? toEntry(row) : null;
}

export async function listEntries(userId: string, includeArchived = false): Promise<Entry[]> {
  const db = await dbPromise;
  const sql = includeArchived
    ? 'SELECT * FROM entries WHERE user_id=? ORDER BY recorded_at DESC, created_at DESC'
    : 'SELECT * FROM entries WHERE user_id=? AND archived_at IS NULL ORDER BY recorded_at DESC, created_at DESC';
  return (await db.getAllAsync<EntryRow>(sql, userId)).map(toEntry);
}

export async function saveEntry(input: EntryWriteInput): Promise<{ entry: Entry; created: boolean }> {
  const draft = validateEntryWriteInput(input);
  const db = await dbPromise;
  const existing = draft.id
    ? await db.getFirstAsync<EntryRow>('SELECT * FROM entries WHERE user_id=? AND id=?', draft.userId, draft.id)
    : draft.externalSource && draft.externalSourceId
      ? await db.getFirstAsync<EntryRow>('SELECT * FROM entries WHERE user_id=? AND external_source=? AND external_source_id=? ORDER BY created_at LIMIT 1', draft.userId, draft.externalSource, draft.externalSourceId)
      : null;
  if (draft.id && !existing) throw new Error('entry_not_found');

  const timestamp = new Date().toISOString();
  if (existing) {
    await db.runAsync('UPDATE entries SET template_id=?, episode_id=?, external_source=?, external_source_id=?, title=?, body=?, recorded_at=?, updated_at=?, archived_at=NULL WHERE id=? AND user_id=?', draft.templateId, draft.episodeId, draft.externalSource, draft.externalSourceId, draft.title, draft.body, draft.recordedAt, timestamp, existing.id, draft.userId);
    const entry = { ...toEntry(existing), templateId: draft.templateId, episodeId: draft.episodeId, externalSource: draft.externalSource, externalSourceId: draft.externalSourceId, title: draft.title, body: draft.body, recordedAt: draft.recordedAt, updatedAt: timestamp, archivedAt: null };
    await indexEntrySearchDocument(entry);
    return { created: false, entry };
  }

  const entry: Entry = { id: newId('entry'), userId: draft.userId, templateId: draft.templateId, episodeId: draft.episodeId, externalSource: draft.externalSource, externalSourceId: draft.externalSourceId, title: draft.title, body: draft.body, recordedAt: draft.recordedAt, createdAt: timestamp, updatedAt: timestamp, archivedAt: null };
  await db.runAsync('INSERT INTO entries(id,user_id,template_id,episode_id,external_source,external_source_id,title,body,recorded_at,created_at,updated_at,archived_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', entry.id, entry.userId, entry.templateId, entry.episodeId, entry.externalSource, entry.externalSourceId, entry.title, entry.body, entry.recordedAt, entry.createdAt, entry.updatedAt, entry.archivedAt);
  await indexEntrySearchDocument(entry);
  return { entry, created: true };
}

export async function archiveEntry(userId: string, entryId: string): Promise<Entry> {
  const entry = await getEntry(userId, entryId);
  if (!entry) throw new Error('entry_not_found');
  const archivedAt = new Date().toISOString();
  const db = await dbPromise;
  await db.runAsync('UPDATE entries SET archived_at=?, updated_at=? WHERE user_id=? AND id=?', archivedAt, archivedAt, userId, entryId);
  await removeSearchDocument(userId, 'entry', entryId);
  return { ...entry, archivedAt, updatedAt: archivedAt };
}
