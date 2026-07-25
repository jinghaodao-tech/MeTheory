import type { Entry } from '../../../../../packages/records/src/index.ts';
import { LightweightTokenizer, rankSearchDocuments, type SearchDocument, type SearchResult } from '../../../../../packages/search-core/src/index.ts';
import { dbPromise, newId } from '../db';

type SearchDocumentRow = {
  id: string;
  user_id: string;
  source_kind: SearchDocument['sourceKind'];
  source_id: string;
  title: string;
  search_text: string;
  tags_json: string;
  tokens_json: string;
  doc_length: number;
  recorded_at: string;
  updated_at: string;
};

const tokenizer = new LightweightTokenizer();

function strings(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function toDocument(row: SearchDocumentRow): SearchDocument {
  return { id: row.id, userId: row.user_id, sourceKind: row.source_kind, sourceId: row.source_id, title: row.title, searchText: row.search_text, tags: strings(row.tags_json), tokens: strings(row.tokens_json), docLength: row.doc_length, recordedAt: row.recorded_at, updatedAt: row.updated_at };
}

export async function indexEntrySearchDocument(entry: Entry): Promise<void> {
  const db = await dbPromise;
  if (entry.archivedAt) {
    await removeSearchDocument(entry.userId, 'entry', entry.id);
    return;
  }
  const searchText = `${entry.title}\n${entry.body}`;
  const tokens = await tokenizer.tokenize(searchText);
  const existing = await db.getFirstAsync<{ id: string }>("SELECT id FROM search_documents WHERE user_id=? AND source_kind='entry' AND source_id=?", entry.userId, entry.id);
  const document = { id: existing?.id ?? newId('search'), userId: entry.userId, sourceKind: 'entry' as const, sourceId: entry.id, title: entry.title, searchText, tags: [], tokens, docLength: tokens.length, recordedAt: entry.recordedAt, updatedAt: new Date().toISOString() };
  if (existing) {
    await db.runAsync('UPDATE search_documents SET title=?,search_text=?,tags_json=?,tokens_json=?,doc_length=?,recorded_at=?,updated_at=? WHERE id=?', document.title, document.searchText, JSON.stringify(document.tags), JSON.stringify(document.tokens), document.docLength, document.recordedAt, document.updatedAt, document.id);
  } else {
    await db.runAsync('INSERT INTO search_documents(id,user_id,source_kind,source_id,title,search_text,tags_json,tokens_json,doc_length,recorded_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', document.id, document.userId, document.sourceKind, document.sourceId, document.title, document.searchText, JSON.stringify(document.tags), JSON.stringify(document.tokens), document.docLength, document.recordedAt, document.updatedAt);
  }
}

export async function removeSearchDocument(userId: string, sourceKind: SearchDocument['sourceKind'], sourceId: string): Promise<void> {
  const db = await dbPromise;
  await db.runAsync('DELETE FROM search_documents WHERE user_id=? AND source_kind=? AND source_id=?', userId, sourceKind, sourceId);
}

export async function rebuildEntrySearchDocuments(userId: string): Promise<number> {
  const db = await dbPromise;
  const rows = await db.getAllAsync<Entry & { user_id?: string }>('SELECT id,id AS userId,template_id AS templateId,episode_id AS episodeId,external_source AS externalSource,external_source_id AS externalSourceId,title,body,recorded_at AS recordedAt,created_at AS createdAt,updated_at AS updatedAt,archived_at AS archivedAt FROM entries WHERE user_id=? AND archived_at IS NULL', userId);
  for (const row of rows) await indexEntrySearchDocument({ ...row, userId });
  return rows.length;
}

export async function searchLocalDocuments(userId: string, query: string, limit?: number): Promise<SearchResult[]> {
  const db = await dbPromise;
  const queryTokens = await tokenizer.tokenize(query);
  const rows = await db.getAllAsync<SearchDocumentRow>('SELECT * FROM search_documents WHERE user_id=? ORDER BY recorded_at DESC,source_id', userId);
  return rankSearchDocuments(queryTokens, rows.map(toDocument), limit);
}
