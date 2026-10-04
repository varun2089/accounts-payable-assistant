import type {
  GoodsReceipt,
  InvoiceLineInput,
  MatchLineResult,
  PurchaseOrder,
  PurchaseOrderLine,
  ThreeWayMatchResult,
} from '../types.js';

const GOODS_ABSOLUTE_TOLERANCE: number = 50;
const GOODS_PERCENT_TOLERANCE: number = 0.01;

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

const sumInvoiceLine = (invoiceLines: InvoiceLineInput[], lineNumber: number): number =>
  roundMoney(
    invoiceLines
      .filter((line: InvoiceLineInput): boolean => line.lineNumber === lineNumber)
      .reduce((total: number, line: InvoiceLineInput): number => total + line.amount, 0),
  );

const sumReceivedQuantity = (receipts: GoodsReceipt[], lineNumber: number): number =>
  receipts
    .filter((receipt: GoodsReceipt): boolean => receipt.lineNumber === lineNumber)
    .reduce(
      (total: number, receipt: GoodsReceipt): number => total + receipt.quantityReceived,
      0,
    );

const matchPoLine = (
  po: PurchaseOrder,
  poLine: PurchaseOrderLine,
  invoiceLines: InvoiceLineInput[],
): MatchLineResult => {
  const poLineTotal: number = roundMoney(poLine.quantity * poLine.unitPrice);
  const invoiceLineTotal: number = sumInvoiceLine(invoiceLines, poLine.lineNumber);
  const receivedQuantity: number = sumReceivedQuantity(po.goodsReceipts, poLine.lineNumber);
  const difference: number = roundMoney(Math.abs(invoiceLineTotal - poLineTotal));
  const toleranceAllowed: number = roundMoney(
    Math.min(GOODS_ABSOLUTE_TOLERANCE, poLineTotal * GOODS_PERCENT_TOLERANCE),
  );
  const receiptCoversLine: boolean =
    receivedQuantity > 0 && receivedQuantity >= poLine.quantity;
  const priceWithinTolerance: boolean = difference <= toleranceAllowed;
  const failureReason: MatchLineResult['failureReason'] = !receiptCoversLine
    ? 'MISSING_RECEIPT'
    : !priceWithinTolerance
      ? 'PRICE_VARIANCE'
      : null;

  return {
    lineNumber: poLine.lineNumber,
    description: poLine.description,
    poQuantity: poLine.quantity,
    poUnitPrice: poLine.unitPrice,
    poLineTotal,
    invoiceLineTotal,
    receivedQuantity,
    difference,
    toleranceAllowed,
    withinTolerance: failureReason === null,
    failureReason,
  };
};

const matchUnorderedLine = (
  po: PurchaseOrder,
  lineNumber: number,
  invoiceLines: InvoiceLineInput[],
): MatchLineResult => {
  const invoiceLineTotal: number = sumInvoiceLine(invoiceLines, lineNumber);

  return {
    lineNumber,
    description: '',
    poQuantity: 0,
    poUnitPrice: 0,
    poLineTotal: 0,
    invoiceLineTotal,
    receivedQuantity: sumReceivedQuantity(po.goodsReceipts, lineNumber),
    difference: roundMoney(Math.abs(invoiceLineTotal)),
    toleranceAllowed: 0,
    withinTolerance: false,
    failureReason: 'NO_MATCHING_PO_LINE',
  };
};

export const calculateThreeWayMatch = (
  po: PurchaseOrder,
  invoiceLines: InvoiceLineInput[],
): ThreeWayMatchResult => {
  const poLineNumbers: Set<number> = new Set<number>(
    po.lines.map((line: PurchaseOrderLine): number => line.lineNumber),
  );
  const unorderedLineNumbers: number[] = [
    ...new Set<number>(
      invoiceLines
        .map((line: InvoiceLineInput): number => line.lineNumber)
        .filter((lineNumber: number): boolean => !poLineNumbers.has(lineNumber)),
    ),
  ];

  const lines: MatchLineResult[] = [
    ...po.lines.map(
      (poLine: PurchaseOrderLine): MatchLineResult => matchPoLine(po, poLine, invoiceLines),
    ),
    ...unorderedLineNumbers.map(
      (lineNumber: number): MatchLineResult => matchUnorderedLine(po, lineNumber, invoiceLines),
    ),
  ];
  const failedLines: MatchLineResult[] = lines.filter(
    (line: MatchLineResult): boolean => !line.withinTolerance,
  );

  return {
    outcome: failedLines.length === 0 ? 'MATCH' : 'HOLD_FOR_INFORMATION',
    poNumber: po.poNumber,
    invoiceTotal: roundMoney(
      invoiceLines.reduce(
        (total: number, line: InvoiceLineInput): number => total + line.amount,
        0,
      ),
    ),
    poTotal: roundMoney(
      lines.reduce((total: number, line: MatchLineResult): number => total + line.poLineTotal, 0),
    ),
    lines,
    failedLines,
  };
};
