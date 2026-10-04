import { access, unlink } from 'node:fs/promises';

import type { AuditEvent, ProcessingRequest, RunRecord } from '../types.js';
import {
  appendAuditEvent,
  createRun,
  loadRun,
  runFilePath,
  saveRun,
} from './runStore.js';

const WIDTH: number = 76;

const rule = (label?: string): void => {
  if (!label) {
    console.log('─'.repeat(WIDTH));
    return;
  }
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, WIDTH - label.length - 4))}`);
};

const check = (label: string, passed: boolean): void => {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
  if (!passed) process.exitCode = 1;
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const delay = (ms: number): Promise<void> =>
  new Promise<void>((resolve: () => void): void => {
    setTimeout(resolve, ms);
  });

const captureError = async (fn: () => Promise<unknown>): Promise<Error | null> => {
  try {
    await fn();
    return null;
  } catch (error: unknown) {
    return error instanceof Error ? error : new Error(String(error));
  }
};

const main = async (): Promise<void> => {
  const request: ProcessingRequest = {
    caseId: 'FIN-001',
    invoiceRef: 'HOS-118877',
    vendorId: 'VEND-1001',
    poNumber: 'PO-5001',
    amount: 12500,
    currency: 'AUD',
    notes:
      'Invoice HOS-118877 dated 2026-09-26 bills purchase order PO-5001, line 1: ' +
      '40 ergonomic task chairs, line total AUD 12,500.00.',
  };

  rule('Create run');
  const created: RunRecord = await createRun(request);
  console.log(JSON.stringify(created, null, 2));
  console.log(`file : ${runFilePath(created.runId)}`);
  check("status is 'RUNNING'", created.status === 'RUNNING');
  check('caseId copied from request', created.caseId === request.caseId);
  check('outcome is null', created.outcome === null);
  check('auditEvents is empty', created.auditEvents.length === 0);
  check('createdAt equals updatedAt', created.createdAt === created.updatedAt);
  check('file exists on disk', await fileExists(runFilePath(created.runId)));

  rule('Load run');
  const loaded: RunRecord | null = await loadRun(created.runId);
  console.log(`loaded : ${loaded ? loaded.runId : 'null'}`);
  check('run was found', loaded !== null);
  check('loaded run matches created run', JSON.stringify(loaded) === JSON.stringify(created));

  rule('Append two audit events');
  await appendAuditEvent(created.runId, 'TOOL_CALLED', { tool: 'get_vendor_record' });
  await appendAuditEvent(created.runId, 'TOOL_RETURNED', { tool: 'get_vendor_record', ok: true });
  const withEvents: RunRecord | null = await loadRun(created.runId);
  const events: AuditEvent[] = withEvents?.auditEvents ?? [];
  events.forEach((event: AuditEvent, index: number): void => {
    console.log(
      `  [${index}] ${event.timestamp}  ${event.eventType}  ${JSON.stringify(event.detail)}`,
    );
  });
  check('two events recorded', events.length === 2);
  check('first event is TOOL_CALLED', events[0]?.eventType === 'TOOL_CALLED');
  check('second event is TOOL_RETURNED', events[1]?.eventType === 'TOOL_RETURNED');
  check(
    'correlationId is the runId on both',
    events.every((event: AuditEvent): boolean => event.correlationId === created.runId),
  );

  rule('Update status via saveRun');
  if (withEvents) {
    const updatedAtBefore: string = withEvents.updatedAt;
    await delay(5);
    withEvents.status = 'COMPLETED';
    await saveRun(withEvents);
    const completed: RunRecord | null = await loadRun(created.runId);
    console.log(`status    : ${completed?.status}`);
    console.log(`updatedAt : ${updatedAtBefore} -> ${completed?.updatedAt}`);
    check("status is 'COMPLETED'", completed?.status === 'COMPLETED');
    check('updatedAt changed', completed !== null && completed.updatedAt !== updatedAtBefore);
    check('createdAt unchanged', completed?.createdAt === created.createdAt);
    check('audit events preserved', completed?.auditEvents.length === 2);
  } else {
    check('run available for status update', false);
  }

  rule('Load unknown runId');
  const unknownRunId: string = '00000000-0000-4000-8000-000000000000';
  const missing: RunRecord | null = await loadRun(unknownRunId);
  console.log(`loaded : ${missing === null ? 'null' : 'a record'}`);
  check('returns null', missing === null);
  const appendError: Error | null = await captureError(
    (): Promise<void> => appendAuditEvent(unknownRunId, 'TOOL_CALLED', null),
  );
  console.log(`append : ${appendError?.message ?? '(no error thrown)'}`);
  check('appendAuditEvent on unknown run throws', appendError !== null);

  rule('Clean up');
  await unlink(runFilePath(created.runId));
  check('test run file removed', !(await fileExists(runFilePath(created.runId))));

  rule();
};

main().catch((error: unknown): void => {
  console.error(error);
  process.exitCode = 1;
});
