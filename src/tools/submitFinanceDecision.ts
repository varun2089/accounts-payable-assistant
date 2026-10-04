import { randomUUID } from 'node:crypto';

import type { SubmitFinanceDecisionInput, SubmitFinanceDecisionResult } from '../types.js';

const SIMULATED_CONFIRMATION_PREFIX: string = 'SIM-';

const processedDecisions: Map<string, SubmitFinanceDecisionResult> = new Map<
  string,
  SubmitFinanceDecisionResult
>();

const processedDecisionInputs: Map<string, SubmitFinanceDecisionInput> = new Map<
  string,
  SubmitFinanceDecisionInput
>();

const hasSamePayload = (
  original: SubmitFinanceDecisionInput,
  replay: SubmitFinanceDecisionInput,
): boolean =>
  original.caseId === replay.caseId &&
  original.approvedBy === replay.approvedBy &&
  original.action === replay.action &&
  original.invoiceNumber === replay.invoiceNumber &&
  original.vendorId === replay.vendorId &&
  original.amount === replay.amount &&
  original.currency === replay.currency;

export const submitFinanceDecision = async (
  input: SubmitFinanceDecisionInput,
): Promise<SubmitFinanceDecisionResult> => {
  if (input.approvedBy.trim() === '') {
    throw new Error(
      'submitFinanceDecision requires an approvedBy value - this tool cannot be called without prior approval',
    );
  }

  const existing: SubmitFinanceDecisionResult | undefined = processedDecisions.get(
    input.idempotencyKey,
  );
  const originalInput: SubmitFinanceDecisionInput | undefined = processedDecisionInputs.get(
    input.idempotencyKey,
  );
  if (existing) {
    if (!originalInput || !hasSamePayload(originalInput, input)) {
      throw new Error(
        'idempotencyKey reuse detected with a different payload - refusing to replay a mismatched request',
      );
    }
    return { ...existing, wasAlreadyProcessed: true };
  }

  const result: SubmitFinanceDecisionResult = {
    confirmationId: `${SIMULATED_CONFIRMATION_PREFIX}${randomUUID()}`,
    idempotencyKey: input.idempotencyKey,
    wasAlreadyProcessed: false,
    action: input.action,
    processedAt: new Date().toISOString(),
  };
  processedDecisions.set(input.idempotencyKey, result);
  processedDecisionInputs.set(input.idempotencyKey, { ...input });

  return { ...result };
};

export const resetSubmitFinanceDecisionStore = (): void => {
  processedDecisions.clear();
  processedDecisionInputs.clear();
};
