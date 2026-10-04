import type { DuplicateCheckResult, InvoiceRecord } from '../types.js';

const FUZZY_DATE_WINDOW_DAYS: number = 14;
const FUZZY_AMOUNT_VARIANCE: number = 0.005;
const MS_PER_DAY: number = 24 * 60 * 60 * 1000;

const EXACT_REASON: string =
  'vendor, invoice number, currency and amount all match an existing record';
const DATE_REASON: string = 'invoice date within 14 days of an existing record';
const AMOUNT_REASON: string = 'amount within 0.5% of an existing record';
const PO_REASON: string = 'same purchase order as an existing record';

const normaliseInvoiceNumber = (invoiceNumber: string): string =>
  invoiceNumber.trim().toLowerCase();

const toCents = (amount: number): number => Math.round(amount * 100);

const daysBetween = (first: string, second: string): number =>
  Math.abs(Date.parse(first) - Date.parse(second)) / MS_PER_DAY;

const fuzzyReasons = (
  candidate: {
    vendorId: string;
    invoiceNumber: string;
    amount: number;
    currency: string;
    invoiceDate: string;
    poNumber: string | null;
  },
  record: InvoiceRecord,
): string[] => {
  const reasons: string[] = [];

  if (daysBetween(candidate.invoiceDate, record.invoiceDate) <= FUZZY_DATE_WINDOW_DAYS) {
    reasons.push(DATE_REASON);
  }

  if (
    candidate.currency === record.currency &&
    Math.abs(candidate.amount - record.amount) < Math.abs(record.amount) * FUZZY_AMOUNT_VARIANCE
  ) {
    reasons.push(AMOUNT_REASON);
  }

  if (candidate.poNumber !== null && candidate.poNumber === record.poNumber) {
    reasons.push(PO_REASON);
  }

  return reasons;
};

export const checkInvoiceHistory = (
  candidate: {
    vendorId: string;
    invoiceNumber: string;
    amount: number;
    currency: string;
    invoiceDate: string;
    poNumber: string | null;
  },
  history: InvoiceRecord[],
): DuplicateCheckResult => {
  const vendorHistory: InvoiceRecord[] = history.filter(
    (record: InvoiceRecord): boolean => record.vendorId === candidate.vendorId,
  );

  const exactMatch: InvoiceRecord | undefined = vendorHistory.find(
    (record: InvoiceRecord): boolean =>
      normaliseInvoiceNumber(record.invoiceNumber) ===
        normaliseInvoiceNumber(candidate.invoiceNumber) &&
      record.currency === candidate.currency &&
      toCents(record.amount) === toCents(candidate.amount),
  );
  if (exactMatch) {
    return { matchType: 'EXACT', matchedInvoice: exactMatch, reasons: [EXACT_REASON] };
  }

  for (const record of vendorHistory) {
    const reasons: string[] = fuzzyReasons(candidate, record);
    if (reasons.length > 0) {
      return { matchType: 'FUZZY', matchedInvoice: record, reasons };
    }
  }

  return { matchType: 'NONE', matchedInvoice: null, reasons: [] };
};
