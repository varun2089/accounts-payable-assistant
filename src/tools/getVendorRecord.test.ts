import type { ToolResult, VendorRecord } from '../types.js';
import { getVendorRecord } from './getVendorRecord.js';

const WIDTH: number = 76;

const rule = (label?: string): void => {
  if (!label) {
    console.log('─'.repeat(WIDTH));
    return;
  }
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, WIDTH - label.length - 4))}`);
};

const printResult = (result: ToolResult<VendorRecord>): void => {
  console.log(`ok                   : ${result.ok}`);
  if (!result.ok) {
    console.log(`errorCode            : ${result.errorCode}`);
    console.log(`message              : ${result.message}`);
    return;
  }
  console.log(`vendorId             : ${result.data.vendorId}`);
  console.log(`name                 : ${result.data.name}`);
  console.log(`status               : ${result.data.status}`);
  console.log(`bankAccountLast4     : ${result.data.bankAccountLast4}`);
  console.log(`bankAccountUpdatedAt : ${result.data.bankAccountUpdatedAt}`);
  console.log(`riskFlags            : [${result.data.riskFlags.join(', ')}]`);
  console.log(`lastUpdated          : ${result.data.lastUpdated}`);
};

const check = (label: string, passed: boolean): void => {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
  if (!passed) process.exitCode = 1;
};

const main = async (): Promise<void> => {
  rule('Existing vendor: VEND-1001');
  const found: ToolResult<VendorRecord> = await getVendorRecord('VEND-1001');
  printResult(found);
  check('ok is true', found.ok === true);
  check('data.vendorId is VEND-1001', found.ok && found.data.vendorId === 'VEND-1001');

  rule('Case-insensitive lookup: vend-1003');
  const lowerCase: ToolResult<VendorRecord> = await getVendorRecord('vend-1003');
  printResult(lowerCase);
  check('ok is true', lowerCase.ok === true);
  check('data.vendorId is VEND-1003', lowerCase.ok && lowerCase.data.vendorId === 'VEND-1003');

  rule('Unknown vendor: VEND-9999');
  const missing: ToolResult<VendorRecord> = await getVendorRecord('VEND-9999');
  printResult(missing);
  check('ok is false', missing.ok === false);
  check("errorCode is 'NOT_FOUND'", !missing.ok && missing.errorCode === 'NOT_FOUND');

  rule();
};

main().catch((error: unknown): void => {
  console.error(error);
  process.exitCode = 1;
});
