import '../env.js';

import { getModelName } from '../llm/client.js';
import type { AgentRunOutcome, ProcessingRequest } from '../types.js';
import { buildCaseMessage } from './buildCaseMessage.js';
import { runAgentCase } from './loop.js';

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

const main = async (): Promise<void> => {
  if (!process.env['ANTHROPIC_API_KEY']) {
    console.warn(
      '[agent] WARNING: ANTHROPIC_API_KEY is not set — the agent loop makes real Anthropic ' +
        'API calls and cannot run without it. Set ANTHROPIC_API_KEY and run this script again.',
    );
    process.exitCode = 1;
    return;
  }

  rule('Agent case');
  console.log(`model    : ${getModelName()}`);
  console.log('case message:');
  console.log(buildCaseMessage(REQUEST));

  rule('Steps');
  const outcome: AgentRunOutcome = await runAgentCase(REQUEST);

  rule('Outcome');
  console.log(`kind : ${outcome.kind}`);

  rule('Full AgentRunOutcome');
  console.log(JSON.stringify(outcome, null, 2));

  rule();
};

main().catch((error: unknown): void => {
  console.error(error);
  process.exitCode = 1;
});
