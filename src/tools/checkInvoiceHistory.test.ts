import { invoiceHistory } from '../fixtures/invoiceHistory.js';
import type { DuplicateCheckResult, InvoiceRecord } from '../types.js';
import { checkInvoiceHistory } from './checkInvoiceHistory.js';

type InvoiceCandidate = Omit<InvoiceRecord, 'paymentStatus'>;

const WIDTH: number = 76;

const rule = (label?: string): void => {
  if (!label) {
    console.log('─'.repeat(WIDTH));
    return;
  }
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, WIDTH - label.length - 4))}`);
};

const money = (value: number): string => value.toFixed(2);

const printCandidate = (candidate: InvoiceCandidate): void => {
  console.log(
    `candidate      : ${candidate.vendorId}  ${candidate.invoiceNumber}  ` +
      `${candidate.currency} ${money(candidate.amount)}  ${candidate.invoiceDate}  ` +
      `po=${candidate.poNumber}`,
  );
};

const printResult = (result: DuplicateCheckResult): void => {
  const matched: InvoiceRecord | null = result.matchedInvoice;
  console.log(`matchType      : ${result.matchType}`);
  console.log(
    `matchedInvoice : ${
      matched
        ? `${matched.vendorId}  ${matched.invoiceNumber}  ${matched.currency} ` +
          `${money(matched.amount)}  ${matched.invoiceDate}  po=${matched.poNumber}  ` +
          `(${matched.paymentStatus})`
        : 'null'
    }`,
  );
  console.log(`reasons        : ${result.reasons.length}`);
  result.reasons.forEach((reason: string): void => console.log(`  - ${reason}`));
};

const check = (label: string, passed: boolean): void => {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
  if (!passed) process.exitCode = 1;
};

const main = (): void => {
  rule('FIN-002: resubmission of paid invoice SCF-20931');
  const duplicate: InvoiceCandidate = {
    vendorId: 'VEND-1002',
    invoiceNumber: 'SCF-20931',
    amount: 5760,
    currency: 'AUD',
    invoiceDate: '2026-09-30',
    poNumber: 'PO-5002',
  };
  printCandidate(duplicate);
  const exact: DuplicateCheckResult = checkInvoiceHistory(duplicate, invoiceHistory);
  printResult(exact);
  check("matchType is 'EXACT'", exact.matchType === 'EXACT');
  check('matchedInvoice is SCF-20931', exact.matchedInvoice?.invoiceNumber === 'SCF-20931');
  check("matchedInvoice is 'paid'", exact.matchedInvoice?.paymentStatus === 'paid');

  rule('Fuzzy: new number, near amount and date to MIT-4471');
  const nearDuplicate: InvoiceCandidate = {
    vendorId: 'VEND-1003',
    invoiceNumber: 'MIT-4502',
    amount: 3210,
    currency: 'AUD',
    invoiceDate: '2026-09-05',
    poNumber: null,
  };
  printCandidate(nearDuplicate);
  const fuzzy: DuplicateCheckResult = checkInvoiceHistory(nearDuplicate, invoiceHistory);
  printResult(fuzzy);
  check("matchType is 'FUZZY'", fuzzy.matchType === 'FUZZY');
  check('matchedInvoice is MIT-4471', fuzzy.matchedInvoice?.invoiceNumber === 'MIT-4471');
  check('two fuzzy reasons reported', fuzzy.reasons.length === 2);

  rule('New invoice: no overlap with vendor history');
  const fresh: InvoiceCandidate = {
    vendorId: 'VEND-1004',
    invoiceNumber: 'KIC-77890',
    amount: 4650,
    currency: 'AUD',
    invoiceDate: '2026-10-01',
    poNumber: 'PO-5004',
  };
  printCandidate(fresh);
  const none: DuplicateCheckResult = checkInvoiceHistory(fresh, invoiceHistory);
  printResult(none);
  check("matchType is 'NONE'", none.matchType === 'NONE');
  check('matchedInvoice is null', none.matchedInvoice === null);
  check('reasons is empty', none.reasons.length === 0);

  rule('Vendor isolation: SCF-20931 submitted by a different vendor');
  const otherVendor: InvoiceCandidate = {
    vendorId: 'VEND-1001',
    invoiceNumber: 'SCF-20931',
    amount: 5760,
    currency: 'AUD',
    invoiceDate: '2026-10-01',
    poNumber: 'PO-5001',
  };
  printCandidate(otherVendor);
  const isolated: DuplicateCheckResult = checkInvoiceHistory(otherVendor, invoiceHistory);
  printResult(isolated);
  check("matchType is 'NONE'", isolated.matchType === 'NONE');
  check('matchedInvoice is null', isolated.matchedInvoice === null);

  rule();
};

main();
