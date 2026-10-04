import { runAgentCase } from '../agent/loop.js';
import type { AgentRunOutcome, ProcessingRequest, RunRecord, RunStatus } from '../types.js';
import { appendAuditEvent, createRun, loadRun, saveRun } from './runStore.js';

const STEP_BUDGET_EXCEEDED: string =
  'step budget was exceeded before the agent produced a final answer';

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const statusFor = (outcome: AgentRunOutcome): RunStatus => {
  switch (outcome.kind) {
    case 'COMPLETED':
      return 'COMPLETED';
    case 'NEEDS_APPROVAL':
      return 'NEEDS_APPROVAL';
    case 'MALFORMED_OUTPUT':
    case 'MAX_STEPS_EXCEEDED':
    case 'UNSUPPORTED_RECOMMENDATION':
      return 'FAILED';
  }
};

const auditEventFor = (outcome: AgentRunOutcome): { eventType: string; detail: unknown } => {
  switch (outcome.kind) {
    case 'COMPLETED':
      return {
        eventType: 'RUN_COMPLETED',
        detail: {
          recommendation: outcome.output.recommendation,
          confidence: outcome.output.confidence,
          proposedAction: outcome.output.proposedAction,
        },
      };
    case 'NEEDS_APPROVAL':
      return {
        eventType: 'APPROVAL_NEEDED',
        detail: {
          proposedAction: outcome.proposedAction,
          recommendation: outcome.output.recommendation,
        },
      };
    case 'MALFORMED_OUTPUT':
      return {
        eventType: 'RUN_FAILED',
        detail: { outcomeKind: outcome.kind, validationErrors: outcome.validationErrors },
      };
    case 'MAX_STEPS_EXCEEDED':
      return {
        eventType: 'RUN_FAILED',
        detail: { outcomeKind: outcome.kind, reason: STEP_BUDGET_EXCEEDED },
      };
    case 'UNSUPPORTED_RECOMMENDATION':
      return {
        eventType: 'RUN_FAILED',
        detail: {
          outcomeKind: outcome.kind,
          claimedAction: outcome.claimedAction,
          reason: outcome.reason,
        },
      };
  }
};

const reloadRun = async (runId: string): Promise<RunRecord> => {
  const run: RunRecord | null = await loadRun(runId);
  if (!run) throw new Error(`run '${runId}' does not exist`);
  return run;
};

export const executeRun = async (runId: string): Promise<RunRecord> => {
  const run: RunRecord = await reloadRun(runId);
  if (run.status !== 'RUNNING') return run;

  await appendAuditEvent(runId, 'RUN_STARTED', {
    caseId: run.caseId,
    invoiceRef: run.request.invoiceRef,
  });

  let outcome: AgentRunOutcome;
  try {
    outcome = await runAgentCase(run.request);
  } catch (error: unknown) {
    await appendAuditEvent(runId, 'RUN_FAILED', { error: errorMessage(error) });
    const failed: RunRecord = await reloadRun(runId);
    failed.status = 'FAILED';
    await saveRun(failed);
    return failed;
  }

  const event: { eventType: string; detail: unknown } = auditEventFor(outcome);
  await appendAuditEvent(runId, event.eventType, event.detail);

  const updated: RunRecord = await reloadRun(runId);
  updated.outcome = outcome;
  updated.status = statusFor(outcome);
  await saveRun(updated);
  return updated;
};

export const startNewRun = async (request: ProcessingRequest): Promise<RunRecord> => {
  const run: RunRecord = await createRun(request);
  return executeRun(run.runId);
};
