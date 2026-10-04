import type { GoodsReceipt, PurchaseOrder, PurchaseOrderLine, ToolResult } from '../types.js';
import { getPurchaseOrder } from './getPurchaseOrder.js';

const WIDTH: number = 76;

const rule = (label?: string): void => {
  if (!label) {
    console.log('─'.repeat(WIDTH));
    return;
  }
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, WIDTH - label.length - 4))}`);
};

const printResult = (result: ToolResult<PurchaseOrder>): void => {
  console.log(`ok             : ${result.ok}`);
  if (!result.ok) {
    console.log(`errorCode      : ${result.errorCode}`);
    console.log(`message        : ${result.message}`);
    return;
  }
  console.log(`poNumber       : ${result.data.poNumber}`);
  console.log(`vendorId       : ${result.data.vendorId}`);
  console.log(`currency       : ${result.data.currency}`);
  console.log(`approvalStatus : ${result.data.approvalStatus}`);
  console.log(`approvedBy     : ${result.data.approvedBy}`);
  console.log(`lines          : ${result.data.lines.length}`);
  result.data.lines.forEach((line: PurchaseOrderLine): void => {
    console.log(
      `  line ${line.lineNumber}  ${line.quantity} x ${line.unitPrice.toFixed(2)} ` +
        `${line.currency}  ${line.description}`,
    );
  });
  console.log(`goodsReceipts  : ${result.data.goodsReceipts.length}`);
  result.data.goodsReceipts.forEach((receipt: GoodsReceipt): void => {
    console.log(
      `  ${receipt.receiptId}  line ${receipt.lineNumber}  ` +
        `qty ${receipt.quantityReceived}  ${receipt.receivedDate}`,
    );
  });
};

const check = (label: string, passed: boolean): void => {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
  if (!passed) process.exitCode = 1;
};

const main = async (): Promise<void> => {
  rule('FIN-001: existing purchase order PO-5001');
  const found: ToolResult<PurchaseOrder> = await getPurchaseOrder('PO-5001');
  printResult(found);
  check('ok is true', found.ok === true);
  check('data.poNumber is PO-5001', found.ok && found.data.poNumber === 'PO-5001');

  rule('Unknown purchase order: PO-9999');
  const missing: ToolResult<PurchaseOrder> = await getPurchaseOrder('PO-9999');
  printResult(missing);
  check('ok is false', missing.ok === false);
  check("errorCode is 'NOT_FOUND'", !missing.ok && missing.errorCode === 'NOT_FOUND');

  rule('FIN-004: simulated timeout on PO-5004');
  const timedOut: ToolResult<PurchaseOrder> = await getPurchaseOrder('PO-5004', {
    simulateTimeout: true,
  });
  printResult(timedOut);
  check('ok is false', timedOut.ok === false);
  check("errorCode is 'TIMEOUT'", !timedOut.ok && timedOut.errorCode === 'TIMEOUT');

  rule();
};

main().catch((error: unknown): void => {
  console.error(error);
  process.exitCode = 1;
});
