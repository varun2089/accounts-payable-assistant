import { submitFinanceDecision } from '../tools/submitFinanceDecision.js';
import type {
  AuditEvent,
  RunRecord,
  SubmitFinanceDecisionInput,
  SubmitFinanceDecisionResult,
} from '../types.js';
import { appendAuditEvent, loadRun, saveRun } from './runStore.js';

const APPROVAL_RESOLVED: string = 'APPROVAL_RESOLVED';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isResolutionFor = (event: AuditEvent, requestId: string): boolean =>
  event.eventType === APPROVAL_RESOLVED &&
  isRecord(event.detail) &&
  event.detail['requestId'] === requestId;

const reloadRun = async (runId: string): Promise<RunRecord> => {
  const run: RunRecord | null = await loadRun(runId);
  if (!run) throw new Error(`cannot resolve approval: run '${runId}' does not exist`);
  return run;
};

export const resolveApproval = async (
  runId: string,
  decision: 'APPROVE' | 'REJECT',
  decidedBy: string,
  requestId: string,
): Promise<RunRecord> => {
  const run: RunRecord = await reloadRun(runId);

  const priorResolution: AuditEvent | undefined = run.auditEvents.find(
    (event: AuditEvent): boolean => isResolutionFor(event, requestId),
  );
  if (priorResolution) {
    const detail: unknown = priorResolution.detail;
    if (!isRecord(detail) || detail['decision'] !== decision || detail['decidedBy'] !== decidedBy) {
      throw new Error(
        'requestId reuse detected with a different decision or approver - refusing to replay a mismatched approval callback',
      );
    }
    return run;
  }

  if (run.status !== 'NEEDS_APPROVAL') {
    throw new Error(
      `cannot resolve approval: run '${runId}' has status '${run.status}', not 'NEEDS_APPROVAL'`,
    );
  }

  if (decidedBy.trim() === '') {
    throw new Error('cannot resolve approval: decidedBy is required so the decision is attributable');
  }

  if (decision === 'REJECT') {
    await appendAuditEvent(runId, APPROVAL_RESOLVED, { requestId, decision: 'REJECT', decidedBy });
    const rejected: RunRecord = await reloadRun(runId);
    rejected.status = 'REJECTED';
    await saveRun(rejected);
    return rejected;
  }

  if (!run.outcome || run.outcome.kind !== 'NEEDS_APPROVAL') {
    throw new Error(
      `cannot resolve approval: run '${runId}' has status 'NEEDS_APPROVAL' but its outcome is ` +
        `'${run.outcome ? run.outcome.kind : 'null'}'`,
    );
  }

  if (run.request.invoiceRef.trim() === '') {
    throw new Error(`cannot resolve approval: run '${runId}' has no invoice reference`);
  }

  const input: SubmitFinanceDecisionInput = {
    idempotencyKey: `${runId}:${run.outcome.proposedAction}`,
    caseId: run.caseId,
    action: run.outcome.proposedAction,
    invoiceNumber: run.request.invoiceRef,
    vendorId: run.request.vendorId,
    amount: run.request.amount,
    currency: run.request.currency,
    approvedBy: decidedBy,
  };
  const submitted: SubmitFinanceDecisionResult = await submitFinanceDecision(input);

  await appendAuditEvent(runId, APPROVAL_RESOLVED, {
    requestId,
    decision: 'APPROVE',
    decidedBy,
    confirmationId: submitted.confirmationId,
  });
  const approved: RunRecord = await reloadRun(runId);
  approved.status = 'COMPLETED';
  await saveRun(approved);
  return approved;
};
