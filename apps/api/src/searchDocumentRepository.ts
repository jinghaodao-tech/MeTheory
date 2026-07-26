import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Entry } from "../../../packages/records/src/index.ts";
import { LightweightTokenizer, rankSearchDocuments, type SearchDocument, type SearchResult, type Tokenizer } from "../../../packages/search-core/src/index.ts";

type SearchDocumentRow = {
  id: string;
  user_id: string;
  source_kind: SearchDocument["sourceKind"];
  source_id: string;
  title: string;
  search_text: string;
  tags_json: string;
  tokens_json: string;
  doc_length: number;
  recorded_at: string;
  updated_at: string;
};

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

type RebuildResult = {
  sourceKind: "entry";
  deleted: number;
  removed: number;
  indexed: number;
};

function stringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toDocument(row: SearchDocumentRow): SearchDocument {
  return {
    id: row.id,
    userId: row.user_id,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    title: row.title,
    searchText: row.search_text,
    tags: stringArray(row.tags_json),
    tokens: stringArray(row.tokens_json),
    docLength: row.doc_length,
    recordedAt: row.recorded_at,
    updatedAt: row.updated_at,
  };
}

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

export class SqliteSearchDocumentRepository {
  private readonly db: DatabaseSync;
  private readonly tokenizer: Tokenizer;

  constructor(db: DatabaseSync, tokenizer: Tokenizer = new LightweightTokenizer()) {
    this.db = db;
    this.tokenizer = tokenizer;
  }

  private async entryDocument(entry: Entry, existingId?: string): Promise<SearchDocument> {
    const searchText = `${entry.title}\n${entry.body}`;
    const tokens = await this.tokenizer.tokenize(searchText);
    return {
      id: existingId ?? `search_${randomUUID().replaceAll("-", "")}`,
      userId: entry.userId,
      sourceKind: "entry",
      sourceId: entry.id,
      title: entry.title,
      searchText,
      tags: [],
      tokens,
      docLength: tokens.length,
      recordedAt: entry.recordedAt,
      updatedAt: new Date().toISOString(),
    };
  }

  private insert(document: SearchDocument): void {
    this.db.prepare("INSERT INTO search_documents(id,user_id,source_kind,source_id,title,search_text,tags_json,tokens_json,doc_length,recorded_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run(document.id, document.userId, document.sourceKind, document.sourceId, document.title, document.searchText, JSON.stringify(document.tags), JSON.stringify(document.tokens), document.docLength, document.recordedAt, document.updatedAt);
  }

  async indexEntry(entry: Entry): Promise<SearchDocument | null> {
    if (entry.archivedAt) {
      this.remove(entry.userId, "entry", entry.id);
      return null;
    }
    const existing = this.db.prepare("SELECT id FROM search_documents WHERE user_id=? AND source_kind='entry' AND source_id=?").get(entry.userId, entry.id) as { id: string } | undefined;
    const document = await this.entryDocument(entry, existing?.id);
    if (existing) {
      this.db.prepare("UPDATE search_documents SET title=?, search_text=?, tags_json=?, tokens_json=?, doc_length=?, recorded_at=?, updated_at=? WHERE id=?")
        .run(document.title, document.searchText, JSON.stringify(document.tags), JSON.stringify(document.tokens), document.docLength, document.recordedAt, document.updatedAt, document.id);
    } else this.insert(document);
    return document;
  }

  remove(userId: string, sourceKind: SearchDocument["sourceKind"], sourceId: string): void {
    this.db.prepare("DELETE FROM search_documents WHERE user_id=? AND source_kind=? AND source_id=?").run(userId, sourceKind, sourceId);
  }

  async rebuildEntries(userId: string): Promise<RebuildResult> {
    let transactionStarted = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      transactionStarted = true;
      const deleted = Number(this.db.prepare("DELETE FROM search_documents WHERE user_id=? AND source_kind='entry'").run(userId).changes);
      const entries = (this.db.prepare("SELECT * FROM entries WHERE user_id=? AND archived_at IS NULL ORDER BY recorded_at DESC, created_at DESC").all(userId) as EntryRow[]).map(toEntry);
      const documents = await Promise.all(entries.map((entry) => this.entryDocument(entry)));
      for (const document of documents) this.insert(document);
      this.db.exec("COMMIT");
      transactionStarted = false;
      return { sourceKind: "entry", deleted, removed: deleted, indexed: documents.length };
    } catch (error) {
      if (transactionStarted) this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async search(userId: string, query: string, limit?: number): Promise<SearchResult[]> {
    const queryTokens = await this.tokenizer.tokenize(query);
    const rows = this.db.prepare("SELECT * FROM search_documents WHERE user_id=? ORDER BY recorded_at DESC, source_id").all(userId) as SearchDocumentRow[];
    return rankSearchDocuments(queryTokens, rows.map(toDocument), limit);
  }
}
