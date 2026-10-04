import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AuditEvent, ProcessingRequest, RunRecord } from '../types.js';

const MODULE_DIR: string = path.dirname(fileURLToPath(import.meta.url));

export const RUNS_DIR: string = path.resolve(MODULE_DIR, '../../runs');

const RUN_ID_RE: RegExp = /^[A-Za-z0-9-]+$/;

const isValidRunId = (runId: string): boolean => RUN_ID_RE.test(runId);

const isNotFoundError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code: unknown }).code === 'ENOENT';

export const runFilePath = (runId: string): string => path.join(RUNS_DIR, `${runId}.json`);

const writeRunFile = async (run: RunRecord): Promise<void> => {
  if (!isValidRunId(run.runId)) throw new Error(`invalid runId '${run.runId}'`);

  await mkdir(RUNS_DIR, { recursive: true });
  const filePath: string = runFilePath(run.runId);
  const tempPath: string = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
  await rename(tempPath, filePath);
};

export const createRun = async (request: ProcessingRequest): Promise<RunRecord> => {
  const now: string = new Date().toISOString();
  const run: RunRecord = {
    runId: randomUUID(),
    caseId: request.caseId,
    request,
    status: 'RUNNING',
    outcome: null,
    auditEvents: [],
    createdAt: now,
    updatedAt: now,
  };
  await writeRunFile(run);
  return run;
};

export const saveRun = async (run: RunRecord): Promise<void> => {
  run.updatedAt = new Date().toISOString();
  await writeRunFile(run);
};

export const loadRun = async (runId: string): Promise<RunRecord | null> => {
  if (!isValidRunId(runId)) return null;

  try {
    return JSON.parse(await readFile(runFilePath(runId), 'utf8')) as RunRecord;
  } catch (error: unknown) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
};

export const appendAuditEvent = async (
  runId: string,
  eventType: string,
  detail: unknown,
): Promise<void> => {
  const run: RunRecord | null = await loadRun(runId);
  if (!run) throw new Error(`cannot append audit event: run '${runId}' does not exist`);

  const event: AuditEvent = {
    timestamp: new Date().toISOString(),
    correlationId: runId,
    eventType,
    detail,
  };
  run.auditEvents.push(event);
  await saveRun(run);
};
