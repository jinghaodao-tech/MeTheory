export interface Tokenizer {
  tokenize(text: string): Promise<string[]>;
}

export type SearchDocumentSourceKind = "entry" | "hypothesis" | "evidence" | "parameter_value";

export type SearchDocument = {
  id: string;
  userId: string;
  sourceKind: SearchDocumentSourceKind;
  sourceId: string;
  title: string;
  searchText: string;
  tags: string[];
  tokens: string[];
  docLength: number;
  recordedAt: string;
  updatedAt: string;
};

export interface SearchDocumentBuilder {
  buildForEntry(entryId: string): Promise<SearchDocument | null>;
}

export type SearchResult = {
  sourceKind: SearchDocumentSourceKind;
  sourceId: string;
  title: string;
  snippet: string;
  score: number;
  matchedTerms: string[];
  recordedAt: string;
  reference: { kind: SearchDocumentSourceKind; id: string };
};

export class LightweightTokenizer implements Tokenizer {
  async tokenize(text: string): Promise<string[]> {
    const normalized = text.normalize("NFKC").toLocaleLowerCase("ja-JP");
    const tokens: string[] = [];
    for (const match of normalized.matchAll(/[a-z0-9][a-z0-9_'-]*/g)) tokens.push(match[0]);
    for (const match of normalized.matchAll(/[\u3040-\u30ff\u3400-\u9fff]+/g)) {
      const characters = Array.from(match[0]);
      tokens.push(match[0]);
      if (characters.length > 1) {
        for (let index = 0; index < characters.length - 1; index += 1) tokens.push(characters.slice(index, index + 2).join(""));
      }
    }
    return tokens;
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function countTerms(tokens: string[], terms: Set<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) if (terms.has(token)) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

function createSnippet(text: string, terms: string[]): string {
  const normalized = text.normalize("NFKC").toLocaleLowerCase("ja-JP");
  const index = terms.map((term) => normalized.indexOf(term)).filter((value) => value >= 0).sort((left, right) => left - right)[0] ?? 0;
  const start = Math.max(0, index - 48);
  const end = Math.min(text.length, start + 220);
  return `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}

export function rankSearchDocuments(queryTokens: string[], documents: SearchDocument[], limit = 20): SearchResult[] {
  const terms = unique(queryTokens);
  if (!terms.length || !documents.length) return [];
  const termSet = new Set(terms);
  const averageLength = documents.reduce((sum, document) => sum + Math.max(1, document.docLength), 0) / documents.length;
  const documentFrequency = new Map(terms.map((term) => [term, documents.filter((document) => document.tokens.includes(term)).length]));
  const k1 = 1.2;
  const b = 0.75;

  return documents.map((document) => {
    const counts = countTerms(document.tokens, termSet);
    const matchedTerms = terms.filter((term) => counts.has(term));
    const score = matchedTerms.reduce((total, term) => {
      const frequency = counts.get(term) ?? 0;
      const frequencyInDocuments = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (documents.length - frequencyInDocuments + 0.5) / (frequencyInDocuments + 0.5));
      const denominator = frequency + k1 * (1 - b + b * (Math.max(1, document.docLength) / averageLength));
      return total + idf * ((frequency * (k1 + 1)) / denominator);
    }, 0);
    return {
      sourceKind: document.sourceKind,
      sourceId: document.sourceId,
      title: document.title,
      snippet: createSnippet(document.searchText, matchedTerms),
      score,
      matchedTerms,
      recordedAt: document.recordedAt,
      reference: { kind: document.sourceKind, id: document.sourceId },
    };
  }).filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || right.recordedAt.localeCompare(left.recordedAt) || left.sourceId.localeCompare(right.sourceId))
    .slice(0, Math.max(1, Math.min(limit, 100)));
}
