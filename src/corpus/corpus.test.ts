import '../env.js';

import type { Corpus, DocumentChunk, PolicyDocument, RetrievedChunk } from '../types.js';
import { loadCorpus, resolveDocsDir } from './load.js';
import { getRetrievalMode, initRetrieval, retrieveFinanceDocuments } from './retrieval.js';

const WIDTH: number = 76;

const rule = (label?: string): void => {
  if (!label) {
    console.log('─'.repeat(WIDTH));
    return;
  }
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, WIDTH - label.length - 4))}`);
};

const indent = (text: string, pad: string = '  '): string =>
  text
    .split('\n')
    .map((line: string): string => `${pad}${line}`)
    .join('\n');

const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

const printResults = (results: RetrievedChunk[]): void => {
  results.forEach((result: RetrievedChunk, i: number): void => {
    console.log(
      `\n  #${i + 1}  score ${result.score.toFixed(4)}  ${result.documentId} v${result.version} ` +
        `(${result.status} / ${result.classification}, effective ${result.effectiveDate})`,
    );
    console.log(`      ${result.title} → ${result.heading}`);
    console.log(`      ${truncate(result.text.replace(/\s+/g, ' '), 150)}`);
  });
};

const main = async (): Promise<void> => {
  const docsDir: string = await resolveDocsDir();
  const corpus: Corpus = await loadCorpus(docsDir);

  rule('Corpus');
  console.log(`Corpus directory : ${docsDir}`);
  console.log(`Total documents  : ${corpus.documents.length}`);
  console.log(`Total chunks     : ${corpus.chunks.length}`);

  rule('All documents');
  for (const doc of corpus.documents) {
    console.log(
      `${doc.id.padEnd(16)} v${doc.version.padEnd(5)} ${doc.status.padEnd(11)} ` +
        `${doc.classification.padEnd(20)} ${String(doc.chunks.length).padStart(2)} chunks  ${doc.title}`,
    );
  }

  const sampleDoc: PolicyDocument | undefined =
    corpus.documents.find((doc: PolicyDocument): boolean => doc.id === 'FIN-POL-002') ??
    corpus.documents[0];
  if (!sampleDoc) throw new Error('Corpus is empty — no documents were loaded.');

  rule('Sample document metadata');
  console.log(`id             : ${sampleDoc.id}`);
  console.log(`title          : ${sampleDoc.title}`);
  console.log(`version        : ${sampleDoc.version}`);
  console.log(`effectiveDate  : ${sampleDoc.effectiveDate}`);
  console.log(`status         : ${sampleDoc.status}`);
  console.log(`classification : ${sampleDoc.classification}`);
  console.log(`filename       : ${sampleDoc.filename}`);
  console.log(`body length    : ${sampleDoc.body.length} chars`);
  console.log(`chunk count    : ${sampleDoc.chunks.length}`);

  const sampleChunk: DocumentChunk | undefined =
    sampleDoc.chunks.find((chunk: DocumentChunk): boolean =>
      chunk.heading.toLowerCase().includes('tolerance'),
    ) ?? sampleDoc.chunks[0];
  if (!sampleChunk) throw new Error(`${sampleDoc.id} produced no chunks.`);

  rule('Sample chunk');
  console.log(`chunk id              : ${sampleChunk.id}`);
  console.log(`order                 : ${sampleChunk.order}`);
  console.log(`heading               : ${sampleChunk.heading}`);
  console.log(`headingLevel          : h${sampleChunk.headingLevel}`);
  console.log('carried parent fields :');
  console.log(`  documentId          : ${sampleChunk.documentId}`);
  console.log(`  documentTitle       : ${sampleChunk.documentTitle}`);
  console.log(`  documentVersion     : ${sampleChunk.documentVersion}`);
  console.log(`  documentEffectiveDate: ${sampleChunk.documentEffectiveDate}`);
  console.log(`  documentStatus      : ${sampleChunk.documentStatus}`);
  console.log(`  documentClassification: ${sampleChunk.documentClassification}`);
  console.log('text                  :');
  console.log(indent(sampleChunk.text, '    '));

  rule('Chunk heading check');
  const checkIds: string[] = ['FIN-POL-002', 'ADV-001', 'ADV-002', 'FIN-POL-003-OLD'];
  for (const checkId of checkIds) {
    const doc: PolicyDocument | undefined = corpus.documents.find(
      (candidate: PolicyDocument): boolean => candidate.id === checkId,
    );
    if (!doc) {
      console.log(`${checkId}: NOT FOUND`);
      continue;
    }
    console.log(`\n${doc.id} — ${doc.chunks.length} chunk(s)`);
    for (const chunk of doc.chunks) {
      console.log(
        `  [${chunk.order}] h${chunk.headingLevel}  "${chunk.heading}"  ` +
          `(${chunk.text.length} chars of text)`,
      );
    }
  }

  rule('Retrieval init');
  const mode: string = await initRetrieval(corpus);
  console.log(
    `Retrieval mode   : ${mode === 'embeddings' ? 'EMBEDDINGS (Voyage AI)' : 'FALLBACK keyword term-overlap'}`,
  );
  console.log(`VOYAGE_API_KEY   : ${process.env['VOYAGE_API_KEY'] ? 'set' : 'not set'}`);

  const queryA: string = 'three way match tolerance';
  rule(`Query A: "${queryA}" (top 3)`);
  console.log(`mode: ${getRetrievalMode()}`);
  printResults(await retrieveFinanceDocuments(queryA, 3));

  const queryB: string = 'vendor bank account detail change verification';
  rule(`Query B: "${queryB}" (top 5)`);
  console.log(`mode: ${getRetrievalMode()}`);
  const widened: RetrievedChunk[] = await retrieveFinanceDocuments(queryB, 15);
  const resultsB: RetrievedChunk[] = widened.slice(0, 5);
  printResults(resultsB);

  rule('Adversarial document reachability check');
  const adversarialRank: number = widened.findIndex(
    (result: RetrievedChunk): boolean => result.documentId === 'ADV-001',
  );
  const adversarial: RetrievedChunk | undefined =
    adversarialRank >= 0 ? widened[adversarialRank] : undefined;

  if (adversarial) {
    console.log(
      `RETRIEVABLE: ADV-001 "${adversarial.title}" at rank ${adversarialRank + 1} ` +
        `of ${widened.length}, score ${adversarial.score.toFixed(4)}`,
    );
    console.log(
      `  status=${adversarial.status}  classification=${adversarial.classification}  ` +
        `version=${adversarial.version}  effective=${adversarial.effectiveDate}`,
    );
    console.log(
      `  in top 5 for this query: ${resultsB.some((r: RetrievedChunk): boolean => r.documentId === 'ADV-001') ? 'YES' : 'no'}`,
    );
    console.log(indent(truncate(adversarial.text.replace(/\s+/g, ' '), 400), '  '));
  } else {
    console.log('NOT RETRIEVABLE: ADV-001 did not appear in the top 15 for this query.');
  }

  rule();
};

main().catch((error: unknown): void => {
  console.error(error);
  process.exitCode = 1;
});
