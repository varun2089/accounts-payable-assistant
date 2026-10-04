import type { SubmitFinanceDecisionInput, SubmitFinanceDecisionResult } from '../types.js';
import {
  resetSubmitFinanceDecisionStore,
  submitFinanceDecision,
} from './submitFinanceDecision.js';

const WIDTH: number = 76;

const rule = (label?: string): void => {
  if (!label) {
    console.log('─'.repeat(WIDTH));
    return;
  }
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, WIDTH - label.length - 4))}`);
};

const printResult = (result: SubmitFinanceDecisionResult): void => {
  console.log(`confirmationId      : ${result.confirmationId}`);
  console.log(`idempotencyKey      : ${result.idempotencyKey}`);
  console.log(`wasAlreadyProcessed : ${result.wasAlreadyProcessed}`);
  console.log(`action              : ${result.action}`);
  console.log(`processedAt         : ${result.processedAt}`);
};

const check = (label: string, passed: boolean): void => {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
  if (!passed) process.exitCode = 1;
};

const captureError = async (input: SubmitFinanceDecisionInput): Promise<Error | null> => {
  try {
    await submitFinanceDecision(input);
    return null;
  } catch (error: unknown) {
    return error instanceof Error ? error : new Error(String(error));
  }
};

const main = async (): Promise<void> => {
  resetSubmitFinanceDecisionStore();

  const input: SubmitFinanceDecisionInput = {
    idempotencyKey: 'FIN-005:BFM-1042:APPROVE_FOR_POSTING',
    caseId: 'FIN-005',
    action: 'APPROVE_FOR_POSTING',
    invoiceNumber: 'BFM-1042',
    vendorId: 'VEND-1005',
    amount: 7800,
    currency: 'AUD',
    approvedBy: 'EMP-2163',
  };

  rule('First submission (simulated posting)');
  const first: SubmitFinanceDecisionResult = await submitFinanceDecision(input);
  printResult(first);
  check('wasAlreadyProcessed is false', first.wasAlreadyProcessed === false);
  check("confirmationId starts with 'SIM-'", first.confirmationId.startsWith('SIM-'));

  rule('FIN-005: replay with the same idempotencyKey');
  const replay: SubmitFinanceDecisionResult = await submitFinanceDecision(input);
  printResult(replay);
  check('wasAlreadyProcessed is true', replay.wasAlreadyProcessed === true);
  check('confirmationId is identical', replay.confirmationId === first.confirmationId);
  check('processedAt is identical', replay.processedAt === first.processedAt);

  rule('Same idempotencyKey with a different amount is refused');
  const mismatched: Error | null = await captureError({ ...input, amount: 8700 });
  console.log(`threw   : ${mismatched !== null}`);
  console.log(`message : ${mismatched?.message ?? '(no error thrown)'}`);
  check('call threw an error', mismatched !== null);
  check(
    'message mentions idempotencyKey reuse',
    mismatched?.message.includes('idempotencyKey reuse detected') === true,
  );

  rule('Same idempotencyKey with a different caseId is refused');
  const mismatchedCase: Error | null = await captureError({ ...input, caseId: 'FIN-001' });
  console.log(`threw   : ${mismatchedCase !== null}`);
  console.log(`message : ${mismatchedCase?.message ?? '(no error thrown)'}`);
  check('call threw an error', mismatchedCase !== null);
  check(
    'message mentions idempotencyKey reuse',
    mismatchedCase?.message.includes('idempotencyKey reuse detected') === true,
  );

  rule('Same idempotencyKey with a different approvedBy is refused');
  const mismatchedApprover: Error | null = await captureError({
    ...input,
    approvedBy: 'EMP-2041',
  });
  console.log(`threw   : ${mismatchedApprover !== null}`);
  console.log(`message : ${mismatchedApprover?.message ?? '(no error thrown)'}`);
  check('call threw an error', mismatchedApprover !== null);
  check(
    'message mentions idempotencyKey reuse',
    mismatchedApprover?.message.includes('idempotencyKey reuse detected') === true,
  );

  rule('Original payload still replays after refused calls');
  const afterMismatch: SubmitFinanceDecisionResult = await submitFinanceDecision(input);
  printResult(afterMismatch);
  check(
    'original payload still replays the first confirmation',
    afterMismatch.confirmationId === first.confirmationId,
  );

  rule('Empty approvedBy is refused');
  const refused: Error | null = await captureError({
    ...input,
    idempotencyKey: 'FIN-005:BFM-1043:APPROVE_FOR_POSTING',
    invoiceNumber: 'BFM-1043',
    approvedBy: '',
  });
  console.log(`threw   : ${refused !== null}`);
  console.log(`message : ${refused?.message ?? '(no error thrown)'}`);
  check('call threw an error', refused !== null);
  check(
    'message mentions approvedBy',
    refused?.message.includes('requires an approvedBy value') === true,
  );

  rule('Whitespace-only approvedBy is refused');
  const refusedBlank: Error | null = await captureError({
    ...input,
    idempotencyKey: 'FIN-005:BFM-1044:APPROVE_FOR_POSTING',
    invoiceNumber: 'BFM-1044',
    approvedBy: '   ',
  });
  console.log(`threw   : ${refusedBlank !== null}`);
  console.log(`message : ${refusedBlank?.message ?? '(no error thrown)'}`);
  check('call threw an error', refusedBlank !== null);

  rule('After reset: same idempotencyKey is new again');
  resetSubmitFinanceDecisionStore();
  const afterReset: SubmitFinanceDecisionResult = await submitFinanceDecision(input);
  printResult(afterReset);
  check('wasAlreadyProcessed is false', afterReset.wasAlreadyProcessed === false);
  check('confirmationId is new', afterReset.confirmationId !== first.confirmationId);

  rule();
};

main().catch((error: unknown): void => {
  console.error(error);
  process.exitCode = 1;
});
