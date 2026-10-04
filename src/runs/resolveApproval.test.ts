import { readFile, unlink } from 'node:fs/promises';

import {
  resetSubmitFinanceDecisionStore,
  submitFinanceDecision,
} from '../tools/submitFinanceDecision.js';
import type {
  AgentRunOutcome,
  AuditEvent,
  ProcessingRequest,
  RunRecord,
  SubmitFinanceDecisionResult,
} from '../types.js';
import { resolveApproval } from './resolveApproval.js';
import { createRun, runFilePath, saveRun } from './runStore.js';

const WIDTH: number = 76;

const REQUEST: ProcessingRequest = {
  caseId: 'FIN-005',
  invoiceRef: 'BFM-1042',
  vendorId: 'VEND-1005',
  poNumber: 'PO-5005',
  amount: 7800,
  currency: 'AUD',
  notes:
    'Invoice BFM-1042 dated 2026-09-28 bills purchase order PO-5005, line 1: ' +
    '4 quarterly HVAC maintenance visits, line total AUD 7,800.00.',
};

const OUTCOME: AgentRunOutcome = {
  kind: 'NEEDS_APPROVAL',
  proposedAction: 'APPROVE_FOR_POSTING',
  output: {
    recommendation:
      'Approve invoice BFM-1042 for posting. The three-way match returned MATCH and the ' +
      'duplicate check returned NONE.',
    proposedAction: 'APPROVE_FOR_POSTING',
    confidence: 'HIGH',
    citedEvidence: [{ documentId: 'FIN-POL-002', heading: '3. Outcomes' }],
    calculations: {
      calculate_three_way_match: { outcome: 'MATCH', invoiceTotal: 7800, poTotal: 7800 },
      check_invoice_history: { matchType: 'NONE' },
      check_delegated_authority: { requiredApproverRole: 'COST_CENTRE_MANAGER' },
    },
    exceptions: [],
    unknowns: [],
    nextAction: 'A Cost Centre Manager should approve invoice BFM-1042 for posting.',
  },
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
  console.log(`runId       : ${run.runId}`);
  console.log(`status      : ${run.status}`);
  console.log(`auditEvents : ${run.auditEvents.length}`);
  run.auditEvents.forEach((event: AuditEvent, index: number): void => {
    console.log(`  [${index}] ${event.eventType}  ${JSON.stringify(event.detail)}`);
  });
};

const createPendingRun = async (): Promise<RunRecord> => {
  const run: RunRecord = await createRun(REQUEST);
  run.status = 'NEEDS_APPROVAL';
  run.outcome = OUTCOME;
  await saveRun(run);
  return run;
};

const resolutionEvents = (run: RunRecord): AuditEvent[] =>
  run.auditEvents.filter((event: AuditEvent): boolean => event.eventType === 'APPROVAL_RESOLVED');

const confirmationIdOf = (event: AuditEvent | undefined): string | null => {
  const detail: unknown = event?.detail;
  if (typeof detail !== 'object' || detail === null) return null;
  const confirmationId: unknown = (detail as Record<string, unknown>)['confirmationId'];
  return typeof confirmationId === 'string' ? confirmationId : null;
};

const probeDecisionStore = async (run: RunRecord, approvedBy: string): Promise<SubmitFinanceDecisionResult> =>
  submitFinanceDecision({
    idempotencyKey: `${run.runId}:APPROVE_FOR_POSTING`,
    caseId: run.caseId,
    action: 'APPROVE_FOR_POSTING',
    invoiceNumber: run.request.invoiceRef,
    vendorId: run.request.vendorId,
    amount: run.request.amount,
    currency: run.request.currency,
    approvedBy,
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
  resetSubmitFinanceDecisionStore();

  rule('Pending run awaiting approval');
  const pending: RunRecord = await createPendingRun();
  printRun(pending);
  check("status is 'NEEDS_APPROVAL'", pending.status === 'NEEDS_APPROVAL');

  rule('Approve (requestId REQ-APPROVE-001)');
  const approved: RunRecord = await resolveApproval(
    pending.runId,
    'APPROVE',
    'EMP-2163',
    'REQ-APPROVE-001',
  );
  printRun(approved);
  const confirmationId: string | null = confirmationIdOf(resolutionEvents(approved)[0]);
  check("status is 'COMPLETED'", approved.status === 'COMPLETED');
  check('one APPROVAL_RESOLVED event', resolutionEvents(approved).length === 1);
  check('event carries a simulated confirmationId', confirmationId?.startsWith('SIM-') === true);

  rule('FIN-005: duplicate approval callback (same requestId)');
  const fileBefore: string = await readFile(runFilePath(pending.runId), 'utf8');
  const replayed: RunRecord = await resolveApproval(
    pending.runId,
    'APPROVE',
    'EMP-2163',
    'REQ-APPROVE-001',
  );
  const fileAfter: string = await readFile(runFilePath(pending.runId), 'utf8');
  printRun(replayed);
  check("status is still 'COMPLETED'", replayed.status === 'COMPLETED');
  check(
    'audit event count is unchanged',
    replayed.auditEvents.length === approved.auditEvents.length,
  );
  check('still one APPROVAL_RESOLVED event', resolutionEvents(replayed).length === 1);
  check('returned record is identical', JSON.stringify(replayed) === JSON.stringify(approved));
  check('run file on disk is unchanged', fileBefore === fileAfter);
  const approvedProbe: SubmitFinanceDecisionResult = await probeDecisionStore(pending, 'EMP-2163');
  console.log(
    `decision store : ${approvedProbe.confirmationId} (wasAlreadyProcessed ${approvedProbe.wasAlreadyProcessed})`,
  );
  check(
    'decision store holds exactly the one confirmation from the first approval',
    approvedProbe.wasAlreadyProcessed === true && approvedProbe.confirmationId === confirmationId,
  );

  rule('Same requestId with a different decision is refused');
  const mismatchedDecision: Error | null = await captureError(
    (): Promise<RunRecord> =>
      resolveApproval(pending.runId, 'REJECT', 'EMP-2163', 'REQ-APPROVE-001'),
  );
  console.log(`message : ${mismatchedDecision?.message ?? '(no error thrown)'}`);
  check('call threw an error', mismatchedDecision !== null);
  check(
    'message mentions requestId reuse',
    mismatchedDecision?.message.includes('requestId reuse detected') === true,
  );

  rule('Same requestId with a different approver is refused');
  const mismatchedApprover: Error | null = await captureError(
    (): Promise<RunRecord> =>
      resolveApproval(pending.runId, 'APPROVE', 'EMP-2041', 'REQ-APPROVE-001'),
  );
  console.log(`message : ${mismatchedApprover?.message ?? '(no error thrown)'}`);
  check('call threw an error', mismatchedApprover !== null);
  const fileAfterMismatch: string = await readFile(runFilePath(pending.runId), 'utf8');
  check('run file on disk is still unchanged', fileAfterMismatch === fileBefore);

  rule('Reject a second pending run');
  const secondPending: RunRecord = await createPendingRun();
  const rejected: RunRecord = await resolveApproval(
    secondPending.runId,
    'REJECT',
    'EMP-2163',
    'REQ-REJECT-001',
  );
  printRun(rejected);
  check("status is 'REJECTED'", rejected.status === 'REJECTED');
  check('one APPROVAL_RESOLVED event', resolutionEvents(rejected).length === 1);
  check(
    'no confirmationId on the rejection event',
    confirmationIdOf(resolutionEvents(rejected)[0]) === null,
  );
  const rejectedProbe: SubmitFinanceDecisionResult = await probeDecisionStore(
    secondPending,
    'TEST-PROBE',
  );
  console.log(`decision store : wasAlreadyProcessed ${rejectedProbe.wasAlreadyProcessed}`);
  check(
    'decision store had no entry for the rejected run',
    rejectedProbe.wasAlreadyProcessed === false,
  );

  rule('Resolve a run that is not awaiting approval');
  const notPending: Error | null = await captureError(
    (): Promise<RunRecord> =>
      resolveApproval(pending.runId, 'APPROVE', 'EMP-2163', 'REQ-APPROVE-002'),
  );
  console.log(`message : ${notPending?.message ?? '(no error thrown)'}`);
  check('call threw an error', notPending !== null);
  check("message names the 'COMPLETED' status", notPending?.message.includes("'COMPLETED'") === true);

  rule('Blank decidedBy is refused');
  const thirdPending: RunRecord = await createPendingRun();
  const unattributed: Error | null = await captureError(
    (): Promise<RunRecord> => resolveApproval(thirdPending.runId, 'APPROVE', '   ', 'REQ-BLANK-001'),
  );
  console.log(`message : ${unattributed?.message ?? '(no error thrown)'}`);
  check('call threw an error', unattributed !== null);

  rule('Unknown run is refused');
  const unknownRun: Error | null = await captureError(
    (): Promise<RunRecord> =>
      resolveApproval('00000000-0000-4000-8000-000000000000', 'APPROVE', 'EMP-2163', 'REQ-X'),
  );
  console.log(`message : ${unknownRun?.message ?? '(no error thrown)'}`);
  check('call threw an error', unknownRun !== null);

  rule('Clean up');
  for (const run of [pending, secondPending, thirdPending]) {
    await unlink(runFilePath(run.runId));
  }
  console.log('removed 3 test run files');

  rule();
};

main().catch((error: unknown): void => {
  console.error(error);
  process.exitCode = 1;
});
