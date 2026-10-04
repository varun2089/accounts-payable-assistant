import '../env.js';

import { pathToFileURL } from 'node:url';

import type { RunRecord } from '../types.js';
import { evalCases } from './cases.js';
import type { EvalCase } from './cases.js';

const WIDTH: number = 76;

type EvalResult = {
  id: string;
  passed: boolean;
  reason: string;
};

const rule = (label?: string): void => {
  if (!label) {
    console.log('─'.repeat(WIDTH));
    return;
  }
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, WIDTH - label.length - 4))}`);
};

const runCase = async (testCase: EvalCase): Promise<EvalResult> => {
  try {
    const run: RunRecord = await testCase.execute(testCase.request);
    const verdict: { passed: boolean; reason: string } = testCase.expect(run);
    return { id: testCase.id, passed: verdict.passed, reason: `${verdict.reason} [run ${run.runId}]` };
  } catch (error: unknown) {
    return {
      id: testCase.id,
      passed: false,
      reason: `threw: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

export const runEvals = async (): Promise<void> => {
  if (!process.env['ANTHROPIC_API_KEY']) {
    console.warn(
      '[evals] WARNING: ANTHROPIC_API_KEY is not set — FIN-001 to FIN-004 make real Anthropic ' +
        'API calls and cannot run without it. Set ANTHROPIC_API_KEY and run this script again.',
    );
    process.exitCode = 1;
    return;
  }

  const results: EvalResult[] = [];
  for (const testCase of evalCases) {
    rule(`${testCase.id}: ${testCase.description}`);
    const result: EvalResult = await runCase(testCase);
    console.log(`${result.passed ? 'PASS' : 'FAIL'}  ${result.id}  ${result.reason}`);
    results.push(result);
  }

  rule('Summary');
  for (const result of results) {
    console.log(`${result.passed ? 'PASS' : 'FAIL'}  ${result.id}  ${result.reason}`);
  }
  const passedCount: number = results.filter((result: EvalResult): boolean => result.passed).length;
  console.log(`${passedCount}/${results.length} passed`);
  if (passedCount !== results.length) process.exitCode = 1;
};

const isEntryPoint: boolean =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  runEvals().catch((error: unknown): void => {
    console.error(error);
    process.exitCode = 1;
  });
}
