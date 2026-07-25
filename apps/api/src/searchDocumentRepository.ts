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

export class SqliteSearchDocumentRepository {
  private readonly db: DatabaseSync;
  private readonly tokenizer: Tokenizer;

  constructor(db: DatabaseSync, tokenizer: Tokenizer = new LightweightTokenizer()) {
    this.db = db;
    this.tokenizer = tokenizer;
  }

  async indexEntry(entry: Entry): Promise<SearchDocument | null> {
    if (entry.archivedAt) {
      this.remove(entry.userId, "entry", entry.id);
      return null;
    }
    const searchText = `${entry.title}\n${entry.body}`;
    const tokens = await this.tokenizer.tokenize(searchText);
    const timestamp = new Date().toISOString();
    const existing = this.db.prepare("SELECT id FROM search_documents WHERE user_id=? AND source_kind='entry' AND source_id=?").get(entry.userId, entry.id) as { id: string } | undefined;
    const document: SearchDocument = {
      id: existing?.id ?? `search_${randomUUID().replaceAll("-", "")}`,
      userId: entry.userId,
      sourceKind: "entry",
      sourceId: entry.id,
      title: entry.title,
      searchText,
      tags: [],
      tokens,
      docLength: tokens.length,
      recordedAt: entry.recordedAt,
      updatedAt: timestamp,
    };
    if (existing) {
      this.db.prepare("UPDATE search_documents SET title=?, search_text=?, tags_json=?, tokens_json=?, doc_length=?, recorded_at=?, updated_at=? WHERE id=?")
        .run(document.title, document.searchText, JSON.stringify(document.tags), JSON.stringify(document.tokens), document.docLength, document.recordedAt, document.updatedAt, document.id);
    } else {
      this.db.prepare("INSERT INTO search_documents(id,user_id,source_kind,source_id,title,search_text,tags_json,tokens_json,doc_length,recorded_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .run(document.id, document.userId, document.sourceKind, document.sourceId, document.title, document.searchText, JSON.stringify(document.tags), JSON.stringify(document.tokens), document.docLength, document.recordedAt, document.updatedAt);
    }
    return document;
  }

  remove(userId: string, sourceKind: SearchDocument["sourceKind"], sourceId: string): void {
    this.db.prepare("DELETE FROM search_documents WHERE user_id=? AND source_kind=? AND source_id=?").run(userId, sourceKind, sourceId);
  }

  async rebuildEntries(entries: Entry[]): Promise<number> {
    for (const entry of entries) await this.indexEntry(entry);
    return entries.length;
  }

  async search(userId: string, query: string, limit?: number): Promise<SearchResult[]> {
    const queryTokens = await this.tokenizer.tokenize(query);
    const rows = this.db.prepare("SELECT * FROM search_documents WHERE user_id=? ORDER BY recorded_at DESC, source_id").all(userId) as SearchDocumentRow[];
    return rankSearchDocuments(queryTokens, rows.map(toDocument), limit);
  }
}
