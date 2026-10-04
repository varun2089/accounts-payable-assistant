import './env.js';

import { Command } from 'commander';

import { runEvals } from './evals/runEvals.js';
import { startNewRun } from './runs/executeRun.js';
import { resolveApproval } from './runs/resolveApproval.js';
import { loadRun } from './runs/runStore.js';
import type { ProcessingRequest, RunRecord } from './types.js';

type StartRunOptions = {
  caseId: string;
  invoiceRef: string;
  vendorId: string;
  poNumber: string;
  amount: string;
  currency: string;
  notes: string;
};

type ResolveOptions = {
  decidedBy: string;
  requestId: string;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const fail = (message: string): void => {
  console.error(message);
  process.exitCode = 1;
};

const startRun = async (options: StartRunOptions): Promise<void> => {
  const amount: number = Number(options.amount);
  if (options.amount.trim() === '' || !Number.isFinite(amount)) {
    fail(`--amount must be a number, received '${options.amount}'`);
    return;
  }

  const request: ProcessingRequest = {
    caseId: options.caseId,
    invoiceRef: options.invoiceRef,
    vendorId: options.vendorId,
    poNumber: options.poNumber,
    amount,
    currency: options.currency,
    notes: options.notes,
  };
  const run: RunRecord = await startNewRun(request);
  console.log(`runId  : ${run.runId}`);
  console.log(`status : ${run.status}`);
};

const getRun = async (runId: string): Promise<void> => {
  const run: RunRecord | null = await loadRun(runId);
  if (!run) {
    fail('Run not found');
    return;
  }
  console.log(JSON.stringify(run, null, 2));
};

const resolve = async (
  runId: string,
  decision: 'APPROVE' | 'REJECT',
  options: ResolveOptions,
): Promise<void> => {
  const run: RunRecord = await resolveApproval(
    runId,
    decision,
    options.decidedBy,
    options.requestId,
  );
  console.log(`runId  : ${run.runId}`);
  console.log(`status : ${run.status}`);
};

const program: Command = new Command();

program
  .name('ap-assistant')
  .description('Accounts-payable assistant: start, inspect and resolve invoice processing runs');

program
  .command('start-run')
  .description('Start a new run for an invoice case')
  .requiredOption('--case-id <caseId>', 'case identifier')
  .requiredOption('--invoice-ref <invoiceRef>', 'invoice number')
  .requiredOption('--vendor-id <vendorId>', 'vendor identifier')
  .requiredOption('--po-number <poNumber>', 'purchase order number')
  .requiredOption('--amount <amount>', 'invoice total')
  .requiredOption('--currency <currency>', 'ISO 4217 currency code')
  .option('--notes <notes>', 'free-text case notes (treated as untrusted)', '')
  .action((options: StartRunOptions): Promise<void> => startRun(options));

program
  .command('get-run <runId>')
  .description('Print a run record as JSON')
  .action((runId: string): Promise<void> => getRun(runId));

program
  .command('approve <runId>')
  .description('Approve a run that is waiting for approval')
  .requiredOption('--decided-by <decidedBy>', 'identifier of the approver')
  .requiredOption('--request-id <requestId>', 'idempotency key for this approval callback')
  .action(
    (runId: string, options: ResolveOptions): Promise<void> => resolve(runId, 'APPROVE', options),
  );

program
  .command('reject <runId>')
  .description('Reject a run that is waiting for approval')
  .requiredOption('--decided-by <decidedBy>', 'identifier of the approver')
  .requiredOption('--request-id <requestId>', 'idempotency key for this approval callback')
  .action(
    (runId: string, options: ResolveOptions): Promise<void> => resolve(runId, 'REJECT', options),
  );

program
  .command('list-evals')
  .description('Run the five evaluation cases and print pass/fail (makes real API calls)')
  .action((): Promise<void> => runEvals());

program.parseAsync(process.argv).catch((error: unknown): void => {
  fail(errorMessage(error));
});
