import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  Corpus,
  DocumentChunk,
  DocumentFrontmatter,
  PolicyDocument,
} from '../types.js';

const MODULE_DIR: string = path.dirname(fileURLToPath(import.meta.url));

const DOCS_DIR_CANDIDATES: string[] = [
  path.join(MODULE_DIR, 'docs'),
  path.resolve(MODULE_DIR, '../../src/corpus/docs'),
];

const FRONTMATTER_RE: RegExp = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

type Section = {
  heading: string;
  headingLevel: number;
  text: string;
};

export const resolveDocsDir = async (): Promise<string> => {
  for (const candidate of DOCS_DIR_CANDIDATES) {
    try {
      if ((await stat(candidate)).isDirectory()) return candidate;
    } catch {
      continue;
    }
  }
  throw new Error(
    `Could not locate the corpus docs directory. Tried:\n  ${DOCS_DIR_CANDIDATES.join('\n  ')}`,
  );
};

const unquote = (value: string): string => {
  const quoted: RegExpExecArray | null = /^(['"])([\s\S]*)\1$/.exec(value);
  return quoted?.[2] ?? value;
};

const parseFrontmatterFields = (yaml: string): Record<string, string> => {
  const fields: Record<string, string> = {};

  for (const line of yaml.split(/\r?\n/)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const entry: RegExpExecArray | null = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!entry) continue;
    const value: string = entry[2]!.trim();
    if (value === '') continue;
    fields[entry[1]!] = unquote(value);
  }

  return fields;
};

export const parseFrontmatter = (
  yaml: string,
  filename: string,
): DocumentFrontmatter => {
  const fields: Record<string, string> = parseFrontmatterFields(yaml);
  const documentId: string | undefined = fields['document_id'];

  if (!documentId) {
    throw new Error(`${filename}: frontmatter is missing a required 'document_id'`);
  }

  return {
    document_id: documentId,
    title: fields['title'] ?? filename,
    version: fields['version'] ?? 'unknown',
    effective_date: fields['effective_date'] ?? 'unknown',
    status: fields['status'] ?? 'unknown',
    classification: fields['classification'] ?? 'unknown',
  };
};

const splitFrontmatter = (raw: string): { frontmatter: string; body: string } => {
  const match: RegExpExecArray | null = FRONTMATTER_RE.exec(raw);
  if (!match) return { frontmatter: '', body: raw };
  return { frontmatter: match[1]!, body: raw.slice(match[0].length) };
};

const toSection = (
  heading: string,
  headingLevel: number,
  lines: string[],
): Section => ({ heading, headingLevel, text: lines.join('\n').trim() });

export const splitIntoSections = (body: string, fallbackHeading: string): Section[] => {
  const lines: string[] = body.split(/\r?\n/);
  const preambleLines: string[] = [];
  const sections: Section[] = [];

  let preambleHeading: string | null = null;
  let current: { heading: string; lines: string[] } | null = null;

  for (const line of lines) {
    const h2: RegExpExecArray | null = /^\s{0,3}##\s+(.*?)\s*#*\s*$/.exec(line);
    if (h2) {
      if (current) sections.push(toSection(current.heading, 2, current.lines));
      current = { heading: h2[1]!.trim(), lines: [] };
      continue;
    }

    const h1: RegExpExecArray | null = /^\s{0,3}#\s+(.*?)\s*#*\s*$/.exec(line);
    if (h1 && !current && preambleHeading === null) {
      preambleHeading = h1[1]!.trim();
      continue;
    }

    if (current) current.lines.push(line);
    else preambleLines.push(line);
  }

  if (current) sections.push(toSection(current.heading, 2, current.lines));

  const preambleText: string = preambleLines.join('\n').trim();
  if (preambleText !== '') {
    sections.unshift({ heading: preambleHeading ?? fallbackHeading, headingLevel: 1, text: preambleText });
  }

  return sections;
};

export const parseDocument = (raw: string, filePath: string): PolicyDocument => {
  const filename: string = path.basename(filePath);
  const { frontmatter: rawFrontmatter, body } = splitFrontmatter(raw);
  const frontmatter: DocumentFrontmatter = parseFrontmatter(rawFrontmatter, filename);

  const id: string = frontmatter.document_id;
  const title: string = frontmatter.title;
  const version: string = frontmatter.version;
  const effectiveDate: string = frontmatter.effective_date;
  const status: string = frontmatter.status;
  const classification: string = frontmatter.classification;

  const chunks: DocumentChunk[] = splitIntoSections(body, title).map(
    (section: Section, order: number): DocumentChunk => ({
      id: `${id}#${order}`,
      order,
      documentId: id,
      documentTitle: title,
      documentVersion: version,
      documentEffectiveDate: effectiveDate,
      documentStatus: status,
      documentClassification: classification,
      heading: section.heading,
      headingLevel: section.headingLevel,
      text: section.text,
    }),
  );

  return {
    id,
    title,
    version,
    effectiveDate,
    status,
    classification,
    filename,
    path: filePath,
    body: body.trim(),
    chunks,
  };
};

export const loadCorpus = async (docsDir?: string): Promise<Corpus> => {
  const dir: string = docsDir ?? (await resolveDocsDir());
  const filenames: string[] = (await readdir(dir))
    .filter((name: string): boolean => name.toLowerCase().endsWith('.md'))
    .sort();

  const documents: PolicyDocument[] = await Promise.all(
    filenames.map(async (filename: string): Promise<PolicyDocument> => {
      const filePath: string = path.join(dir, filename);
      return parseDocument(await readFile(filePath, 'utf8'), filePath);
    }),
  );

  const seen: Map<string, string> = new Map<string, string>();
  for (const doc of documents) {
    const previous: string | undefined = seen.get(doc.id);
    if (previous) {
      throw new Error(
        `Duplicate document_id '${doc.id}' in ${doc.filename} (already used by ${previous})`,
      );
    }
    seen.set(doc.id, doc.filename);
  }

  return {
    documents,
    chunks: documents.flatMap((doc: PolicyDocument): DocumentChunk[] => doc.chunks),
  };
};
