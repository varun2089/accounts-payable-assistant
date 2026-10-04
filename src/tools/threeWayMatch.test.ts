import { purchaseOrders } from '../fixtures/purchaseOrders.js';
import type {
  InvoiceLineInput,
  MatchLineResult,
  PurchaseOrder,
  PurchaseOrderLine,
  ThreeWayMatchResult,
} from '../types.js';
import { calculateThreeWayMatch } from './threeWayMatch.js';

const WIDTH: number = 76;

const rule = (label?: string): void => {
  if (!label) {
    console.log('─'.repeat(WIDTH));
    return;
  }
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, WIDTH - label.length - 4))}`);
};

const money = (value: number): string => value.toFixed(2);

const findPo = (poNumber: string): PurchaseOrder => {
  const po: PurchaseOrder | undefined = purchaseOrders.find(
    (candidate: PurchaseOrder): boolean => candidate.poNumber === poNumber,
  );
  if (!po) throw new Error(`Fixture purchase order ${poNumber} was not found.`);
  return po;
};

const exactInvoiceLines = (po: PurchaseOrder): InvoiceLineInput[] =>
  po.lines.map(
    (line: PurchaseOrderLine): InvoiceLineInput => ({
      lineNumber: line.lineNumber,
      amount: line.quantity * line.unitPrice,
    }),
  );

const printLine = (line: MatchLineResult): void => {
  console.log(`  line ${line.lineNumber}  ${line.description}`);
  console.log(`    poQuantity       : ${line.poQuantity}`);
  console.log(`    poUnitPrice      : ${money(line.poUnitPrice)}`);
  console.log(`    poLineTotal      : ${money(line.poLineTotal)}`);
  console.log(`    invoiceLineTotal : ${money(line.invoiceLineTotal)}`);
  console.log(`    receivedQuantity : ${line.receivedQuantity}`);
  console.log(`    difference       : ${money(line.difference)}`);
  console.log(`    toleranceAllowed : ${money(line.toleranceAllowed)}`);
  console.log(`    withinTolerance  : ${line.withinTolerance}`);
  console.log(`    failureReason    : ${line.failureReason}`);
};

const printResult = (result: ThreeWayMatchResult): void => {
  console.log(`outcome      : ${result.outcome}`);
  console.log(`poNumber     : ${result.poNumber}`);
  console.log(`invoiceTotal : ${money(result.invoiceTotal)}`);
  console.log(`poTotal      : ${money(result.poTotal)}`);
  console.log(`lines        : ${result.lines.length}`);
  result.lines.forEach(printLine);
  console.log(`failedLines  : ${result.failedLines.length}`);
  result.failedLines.forEach(printLine);
};

const check = (label: string, passed: boolean): void => {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
  if (!passed) process.exitCode = 1;
};

const main = (): void => {
  const fin001Po: PurchaseOrder = findPo('PO-5001');
  const fin004Po: PurchaseOrder = findPo('PO-5004');

  rule('FIN-001: invoice exactly matches PO-5001');
  const exact: ThreeWayMatchResult = calculateThreeWayMatch(
    fin001Po,
    exactInvoiceLines(fin001Po),
  );
  printResult(exact);
  check("outcome is 'MATCH'", exact.outcome === 'MATCH');
  check('failedLines is empty', exact.failedLines.length === 0);

  rule('FIN-001: invoice line over tolerance on PO-5001');
  const overTolerance: ThreeWayMatchResult = calculateThreeWayMatch(fin001Po, [
    { lineNumber: 1, amount: 12560 },
  ]);
  printResult(overTolerance);
  check(
    "outcome is 'HOLD_FOR_INFORMATION'",
    overTolerance.outcome === 'HOLD_FOR_INFORMATION',
  );
  check('failedLines has one entry', overTolerance.failedLines.length === 1);
  check(
    "failed line reason is 'PRICE_VARIANCE'",
    overTolerance.failedLines[0]?.failureReason === 'PRICE_VARIANCE',
  );

  rule('FIN-004: price matches PO-5004 but no goods receipt');
  const missingReceipt: ThreeWayMatchResult = calculateThreeWayMatch(
    fin004Po,
    exactInvoiceLines(fin004Po),
  );
  printResult(missingReceipt);
  const missingReceiptLine: MatchLineResult | undefined = missingReceipt.failedLines[0];
  check(
    "outcome is 'HOLD_FOR_INFORMATION'",
    missingReceipt.outcome === 'HOLD_FOR_INFORMATION',
  );
  check('failedLines has one entry', missingReceipt.failedLines.length === 1);
  check('failed line has zero price difference', missingReceiptLine?.difference === 0);
  check('failed line has zero received quantity', missingReceiptLine?.receivedQuantity === 0);
  check(
    "failed line reason is 'MISSING_RECEIPT'",
    missingReceiptLine?.failureReason === 'MISSING_RECEIPT',
  );

  rule();
};

main();
