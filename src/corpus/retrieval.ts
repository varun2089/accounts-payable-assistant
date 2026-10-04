import { VoyageAIClient } from 'voyageai';

import type {
  Corpus,
  DocumentChunk,
  RetrievalMode,
  RetrievedChunk,
} from '../types.js';
import { loadCorpus } from './load.js';

const EMBEDDING_MODEL: string = 'voyage-4-lite';
const EMBED_BATCH_SIZE: number = 96;
const MAX_RETRIES: number = 2;
const RETRY_DELAYS_MS: number[] = [10_000, 10_000];
const DEFAULT_TOP_K: number = 5;

const STOPWORDS: Set<string> = new Set<string>([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'how', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'this', 'to',
  'was', 'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with', 'do',
  'does', 'can', 'should', 'must', 'if', 'any', 'all', 'about',
]);

type IndexEntry = {
  chunk: DocumentChunk;
  embedding: number[] | null;
  termFrequencies: Map<string, number>;
};

type RetrievalIndex = {
  mode: RetrievalMode;
  entries: IndexEntry[];
  idf: Map<string, number>;
};

let client: VoyageAIClient | null = null;
let indexPromise: Promise<RetrievalIndex> | null = null;
let activeMode: RetrievalMode | null = null;

const getClient = (): VoyageAIClient => {
  if (!client) client = new VoyageAIClient({ apiKey: process.env['VOYAGE_API_KEY'] });
  return client;
};

const delay = (ms: number): Promise<void> =>
  new Promise<void>((resolve: () => void): void => {
    setTimeout(resolve, ms);
  });

const isRateLimitError = (err: unknown): boolean => {
  if (err instanceof Error) {
    const message: string = err.message;
    if (
      message.includes('429') ||
      message.includes('rate limit') ||
      message.includes('rate_limit')
    ) {
      return true;
    }
  }
  if (typeof err === 'object' && err !== null && 'statusCode' in err) {
    return (err as { statusCode: number }).statusCode === 429;
  }
  return false;
};

const withRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (attempt < MAX_RETRIES && isRateLimitError(err)) {
        const waitMs: number = RETRY_DELAYS_MS[attempt] ?? 10_000;
        console.log(
          `Rate limited by Voyage AI, retrying in ${waitMs / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})...`,
        );
        await delay(waitMs);
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
};

const embedTexts = async (
  texts: string[],
  inputType: 'document' | 'query',
): Promise<number[][]> => {
  const embeddings: number[][] = [];

  for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
    const batch: string[] = texts.slice(start, start + EMBED_BATCH_SIZE);
    const response = await withRetry(() =>
      getClient().embed({ input: batch, model: EMBEDDING_MODEL, inputType }),
    );
    const data = response.data;
    if (!data || data.length !== batch.length) {
      throw new Error('Voyage AI returned an unexpected number of embeddings');
    }
    for (const item of data) {
      const embedding: number[] | undefined = item.embedding;
      if (!embedding) throw new Error('Voyage AI returned an empty embedding');
      embeddings.push(embedding);
    }
  }

  return embeddings;
};

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((token: string): boolean => token.length > 1 && !STOPWORDS.has(token));

const countTerms = (tokens: string[]): Map<string, number> => {
  const counts: Map<string, number> = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
};

const chunkEmbeddingText = (chunk: DocumentChunk): string =>
  `${chunk.documentTitle}\n${chunk.heading}\n${chunk.text}`;

const chunkKeywordTokens = (chunk: DocumentChunk): string[] => [
  ...tokenize(chunk.documentTitle),
  ...tokenize(chunk.heading),
  ...tokenize(chunk.heading),
  ...tokenize(chunk.text),
];

const buildIdf = (entries: IndexEntry[]): Map<string, number> => {
  const documentFrequency: Map<string, number> = new Map<string, number>();

  for (const entry of entries) {
    for (const term of entry.termFrequencies.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const idf: Map<string, number> = new Map<string, number>();
  const total: number = entries.length;
  for (const [term, frequency] of documentFrequency) {
    idf.set(term, Math.log(1 + total / frequency));
  }

  return idf;
};

export const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length !== b.length) {
    throw new Error(`Embedding length mismatch: ${a.length} vs ${b.length}`);
  }

  let dot: number = 0;
  let normA: number = 0;
  let normB: number = 0;

  for (let i = 0; i < a.length; i += 1) {
    const x: number = a[i]!;
    const y: number = b[i]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  const denominator: number = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
};

  const keywordScore = (
    queryTerms: Map<string, number>,
    entry: IndexEntry,
    idf: Map<string, number>,
  ): number => {
    let matched: number = 0;
    let possible: number = 0;

    for (const term of queryTerms.keys()) {
      const weight: number = idf.get(term) ?? Math.log(2);
      possible += weight;
      const termFrequency: number = entry.termFrequencies.get(term) ?? 0;
      if (termFrequency > 0) matched += weight * (termFrequency / (termFrequency + 1.2));
    }

    return possible === 0 ? 0 : matched / possible;
  };

const buildEntries = (corpus: Corpus): IndexEntry[] =>
  corpus.chunks.map(
    (chunk: DocumentChunk): IndexEntry => ({
      chunk,
      embedding: null,
      termFrequencies: countTerms(chunkKeywordTokens(chunk)),
    }),
  );

const buildIndex = async (corpus: Corpus): Promise<RetrievalIndex> => {
  const entries: IndexEntry[] = buildEntries(corpus);

  if (!process.env['VOYAGE_API_KEY']) {
    console.warn(
        '[retrieval] WARNING: VOYAGE_API_KEY is not set — running in FALLBACK mode ' +
        '(keyword term-overlap scoring, no embeddings). Set VOYAGE_API_KEY for semantic retrieval.',
    );
    activeMode = 'keyword';
    return { mode: 'keyword', entries, idf: buildIdf(entries) };
  }

  try {
    const embeddings: number[][] = await embedTexts(
        entries.map((entry: IndexEntry): string => chunkEmbeddingText(entry.chunk)),
        'document',
    );
    entries.forEach((entry: IndexEntry, i: number): void => {
      entry.embedding = embeddings[i] ?? null;
    });
    console.log(
        `[retrieval] Embedded ${entries.length} chunks with Voyage AI (${EMBEDDING_MODEL}).`,
    );
    activeMode = 'embeddings';
    return { mode: 'embeddings', entries, idf: new Map() };
  } catch (err) {
    console.warn(
        `[retrieval] WARNING: Voyage AI embedding failed (${err instanceof Error ? err.message : String(err)}) — ` +
        'running in FALLBACK mode (keyword term-overlap scoring).',
    );
    activeMode = 'keyword';
    return { mode: 'keyword', entries, idf: buildIdf(entries) };
  }
};

export const initRetrieval = async (corpus?: Corpus): Promise<RetrievalMode> => {
  if (!indexPromise) {
    const resolved: Corpus = corpus ?? (await loadCorpus());
    indexPromise = buildIndex(resolved);
  }
  return (await indexPromise).mode;
};

export const getRetrievalMode = (): RetrievalMode | null => activeMode;

export const resetRetrieval = (): void => {
  indexPromise = null;
  activeMode = null;
};

const toRetrievedChunk = (entry: IndexEntry, score: number): RetrievedChunk => ({
  chunkId: entry.chunk.id,
  documentId: entry.chunk.documentId,
  title: entry.chunk.documentTitle,
  version: entry.chunk.documentVersion,
  effectiveDate: entry.chunk.documentEffectiveDate,
  status: entry.chunk.documentStatus,
  classification: entry.chunk.documentClassification,
  heading: entry.chunk.heading,
  text: entry.chunk.text,
  score,
});

export const retrieveFinanceDocuments = async (
  query: string,
  topK: number = DEFAULT_TOP_K,
): Promise<RetrievedChunk[]> => {
  if (query.trim() === '') return [];

  await initRetrieval();
  const index: RetrievalIndex = await indexPromise!;

  let scored: RetrievedChunk[];

  if (index.mode === 'embeddings') {
    const [queryEmbedding] = await embedTexts([query], 'query');
    if (!queryEmbedding) throw new Error('Voyage AI returned no query embedding');
    scored = index.entries.map((entry: IndexEntry): RetrievedChunk =>
      toRetrievedChunk(
        entry,
        entry.embedding ? cosineSimilarity(queryEmbedding, entry.embedding) : 0,
      ),
    );
  } else {
    const queryTerms: Map<string, number> = countTerms(tokenize(query));
    scored = index.entries.map((entry: IndexEntry): RetrievedChunk =>
      toRetrievedChunk(entry, keywordScore(queryTerms, entry, index.idf)),
    );
  }

  return scored
    .filter((result: RetrievedChunk): boolean => result.score > 0)
    .sort((a: RetrievedChunk, b: RetrievedChunk): number => b.score - a.score)
    .slice(0, Math.max(0, topK));
};
