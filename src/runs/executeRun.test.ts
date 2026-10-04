import '../env.js';

import { buildCaseMessage } from '../agent/buildCaseMessage.js';
import { getModelName } from '../llm/client.js';
import type { AuditEvent, ProcessingRequest, RunRecord } from '../types.js';
import { executeRun, startNewRun } from './executeRun.js';
import { loadRun, runFilePath } from './runStore.js';

const WIDTH: number = 76;

const REQUEST: ProcessingRequest = {
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

const printRun = (run: RunRecord): void => {
  console.log(`runId        : ${run.runId}`);
  console.log(`caseId       : ${run.caseId}`);
  console.log(`status       : ${run.status}`);
  console.log(`outcome kind : ${run.outcome ? run.outcome.kind : 'null'}`);
  console.log(`createdAt    : ${run.createdAt}`);
  console.log(`updatedAt    : ${run.updatedAt}`);
  console.log(`auditEvents  : ${run.auditEvents.length}`);
  run.auditEvents.forEach((event: AuditEvent, index: number): void => {
    console.log(`  [${index}] ${event.timestamp}  ${event.eventType}`);
    console.log(`      ${JSON.stringify(event.detail)}`);
  });
};

const main = async (): Promise<void> => {
  if (!process.env['ANTHROPIC_API_KEY']) {
    console.warn(
      '[agent] WARNING: ANTHROPIC_API_KEY is not set — the agent loop makes real Anthropic ' +
        'API calls and cannot run without it. Set ANTHROPIC_API_KEY and run this script again.',
    );
    process.exitCode = 1;
    return;
  }

  rule('Start new run');
  console.log(`model   : ${getModelName()}`);
  console.log('case message:');
  console.log(buildCaseMessage(REQUEST));

  rule('Steps');
  const run: RunRecord = await startNewRun(REQUEST);

  rule('Returned RunRecord');
  printRun(run);
  console.log(`file         : ${runFilePath(run.runId)}`);

  rule('Outcome');
  console.log(JSON.stringify(run.outcome, null, 2));

  rule('Reloaded from disk');
  const reloaded: RunRecord | null = await loadRun(run.runId);
  if (reloaded) printRun(reloaded);
  check('run file was found on disk', reloaded !== null);
  check(
    'reloaded run matches returned run',
    JSON.stringify(reloaded) === JSON.stringify(run),
  );
  check("status is no longer 'RUNNING'", reloaded !== null && reloaded.status !== 'RUNNING');
  check(
    'first audit event is RUN_STARTED',
    reloaded?.auditEvents[0]?.eventType === 'RUN_STARTED',
  );
  check('two audit events recorded', reloaded?.auditEvents.length === 2);

  rule('Execute the finished run again');
  const repeated: RunRecord = await executeRun(run.runId);
  printRun(repeated);
  const afterRepeat: RunRecord | null = await loadRun(run.runId);
  check('returned record is identical', JSON.stringify(repeated) === JSON.stringify(run));
  check(
    'outcome is unchanged',
    JSON.stringify(repeated.outcome) === JSON.stringify(run.outcome),
  );
  check(
    'audit event count is unchanged',
    repeated.auditEvents.length === run.auditEvents.length,
  );
  check(
    'only one RUN_STARTED event',
    repeated.auditEvents.filter(
      (event: AuditEvent): boolean => event.eventType === 'RUN_STARTED',
    ).length === 1,
  );
  check('file on disk is unchanged', JSON.stringify(afterRepeat) === JSON.stringify(run));

  rule();
};

main().catch((error: unknown): void => {
  console.error(error);
  process.exitCode = 1;
});
