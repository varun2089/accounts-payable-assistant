import type {
  EvidenceCheckFailure,
  FinanceDecisionAction,
  ProcessingRequest,
  ToolCallRecord,
} from '../types.js';

const MATCH_TOOL: string = 'calculate_three_way_match';
const HISTORY_TOOL: string = 'check_invoice_history';
const RETRIEVAL_TOOL: string = 'retrieve_finance_documents';
const VENDOR_TOOL: string = 'get_vendor_record';
const AUTHORITY_TOOL: string = 'check_delegated_authority';

const NEVER_CALLED: string = 'was never called';

type CaseCallSelection =
  | { found: true; call: ToolCallRecord }
  | { found: false; failures: EvidenceCheckFailure[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const callsFor = (
  toolResultsByName: Record<string, ToolCallRecord[]>,
  tool: string,
): ToolCallRecord[] => toolResultsByName[tool] ?? [];

const fail = (
  tool: string,
  requirement: string,
  observed: string,
  latestResult: unknown,
): EvidenceCheckFailure[] => [{ tool, requirement, observed, latestResult }];

const normalise = (value: unknown): string | null =>
  typeof value === 'string' ? value.trim().toLowerCase() : null;

const toCents = (amount: number): number => Math.round(amount * 100);

const formatAmount = (amount: unknown): string =>
  typeof amount === 'number' ? amount.toFixed(2) : String(amount);

const inputField = (call: ToolCallRecord, field: string): unknown =>
  isRecord(call.input) ? call.input[field] : undefined;

const inputMatches = (call: ToolCallRecord, field: string, expected: string): boolean =>
  normalise(inputField(call, field)) === normalise(expected);

const valuesUsed = (calls: ToolCallRecord[], field: string): string =>
  [...new Set(calls.map((call: ToolCallRecord): string => `'${String(inputField(call, field))}'`))].join(
    ', ',
  );

const selectCaseCall = (
  toolResultsByName: Record<string, ToolCallRecord[]>,
  tool: string,
  requirement: string,
  matchesCase: (call: ToolCallRecord) => boolean,
  describeMismatch: (calls: ToolCallRecord[]) => string,
): CaseCallSelection => {
  const calls: ToolCallRecord[] = callsFor(toolResultsByName, tool);
  if (calls.length === 0) {
    return { found: false, failures: fail(tool, requirement, NEVER_CALLED, null) };
  }

  const caseCalls: ToolCallRecord[] = calls.filter(matchesCase);
  const latest: ToolCallRecord | undefined = caseCalls[caseCalls.length - 1];
  if (!latest) {
    return { found: false, failures: fail(tool, requirement, describeMismatch(calls), calls) };
  }

  return { found: true, call: latest };
};

const describeToolError = (result: unknown): string | null =>
  isRecord(result) && typeof result['toolError'] === 'string'
    ? `failed on its most recent call for this case: ${result['toolError']}`
    : null;

const describeNotOk = (result: unknown): string | null => {
  const toolError: string | null = describeToolError(result);
  if (toolError) return toolError;
  if (!isRecord(result)) return 'returned an unreadable result on its most recent call for this case';
  if (result['ok'] !== true) {
    return `returned errorCode '${String(result['errorCode'])}' on its most recent call for this case`;
  }
  return isRecord(result['data']) ? null : 'returned no data on its most recent call for this case';
};

const dataOf = (result: unknown): Record<string, unknown> =>
  isRecord(result) && isRecord(result['data']) ? result['data'] : {};

const checkAttempted = (
  toolResultsByName: Record<string, ToolCallRecord[]>,
  tool: string,
): EvidenceCheckFailure[] =>
  callsFor(toolResultsByName, tool).length > 0
    ? []
    : fail(tool, `${tool} must have been called at least once`, NEVER_CALLED, null);

const selectMatchCall = (
  toolResultsByName: Record<string, ToolCallRecord[]>,
  request: ProcessingRequest,
  requirement: string,
): CaseCallSelection =>
  selectCaseCall(
    toolResultsByName,
    MATCH_TOOL,
    requirement,
    (call: ToolCallRecord): boolean => inputMatches(call, 'poNumber', request.poNumber),
    (calls: ToolCallRecord[]): string =>
      `was called but never against this case's PO (${request.poNumber}); it was called with poNumber ${valuesUsed(calls, 'poNumber')}`,
  );

const selectHistoryCall = (
  toolResultsByName: Record<string, ToolCallRecord[]>,
  request: ProcessingRequest,
  requirement: string,
): CaseCallSelection =>
  selectCaseCall(
    toolResultsByName,
    HISTORY_TOOL,
    requirement,
    (call: ToolCallRecord): boolean =>
      inputMatches(call, 'vendorId', request.vendorId) &&
      inputMatches(call, 'invoiceNumber', request.invoiceRef),
    (calls: ToolCallRecord[]): string =>
      `was called but never for this case's vendor and invoice (${request.vendorId}, ${request.invoiceRef}); it was called with vendorId ${valuesUsed(calls, 'vendorId')} and invoiceNumber ${valuesUsed(calls, 'invoiceNumber')}`,
  );

const selectVendorCall = (
  toolResultsByName: Record<string, ToolCallRecord[]>,
  request: ProcessingRequest,
  requirement: string,
): CaseCallSelection =>
  selectCaseCall(
    toolResultsByName,
    VENDOR_TOOL,
    requirement,
    (call: ToolCallRecord): boolean => inputMatches(call, 'vendorId', request.vendorId),
    (calls: ToolCallRecord[]): string =>
      `was called but never for this case's vendor (${request.vendorId}); it was called with vendorId ${valuesUsed(calls, 'vendorId')}`,
  );

const checkMatchPassed = (
  toolResultsByName: Record<string, ToolCallRecord[]>,
  request: ProcessingRequest,
): EvidenceCheckFailure[] => {
  const requirement: string = `${MATCH_TOOL} must have been called against this case's PO (${request.poNumber}) and its most recent such result must have outcome 'MATCH' with an invoice total equal to the case amount (${request.amount.toFixed(2)})`;
  const selection: CaseCallSelection = selectMatchCall(toolResultsByName, request, requirement);
  if (!selection.found) return selection.failures;

  const notOk: string | null = describeNotOk(selection.call.result);
  if (notOk) return fail(MATCH_TOOL, requirement, notOk, selection.call);

  const data: Record<string, unknown> = dataOf(selection.call.result);
  const outcome: unknown = data['outcome'];
  const invoiceTotal: unknown = data['invoiceTotal'];
  const totalMatchesCase: boolean =
    typeof invoiceTotal === 'number' && toCents(invoiceTotal) === toCents(request.amount);

  return [
    ...(outcome === 'MATCH'
      ? []
      : fail(
          MATCH_TOOL,
          requirement,
          `returned outcome '${String(outcome)}' on its most recent call for this case`,
          selection.call,
        )),
    ...(totalMatchesCase
      ? []
      : fail(
          MATCH_TOOL,
          requirement,
          `was run with an invoice total of ${formatAmount(invoiceTotal)}, but the case's trusted amount is ${formatAmount(request.amount)}`,
          selection.call,
        )),
  ];
};

const checkNoDuplicate = (
  toolResultsByName: Record<string, ToolCallRecord[]>,
  request: ProcessingRequest,
): EvidenceCheckFailure[] => {
  const requirement: string = `${HISTORY_TOOL} must have been called for this case's vendor and invoice (${request.vendorId}, ${request.invoiceRef}) and its most recent such result must have matchType 'NONE'`;
  const selection: CaseCallSelection = selectHistoryCall(toolResultsByName, request, requirement);
  if (!selection.found) return selection.failures;

  const toolError: string | null = describeToolError(selection.call.result);
  if (toolError) return fail(HISTORY_TOOL, requirement, toolError, selection.call);

  const result: unknown = selection.call.result;
  const matchType: unknown = isRecord(result) ? result['matchType'] : undefined;
  return matchType === 'NONE'
    ? []
    : fail(
        HISTORY_TOOL,
        requirement,
        `returned matchType '${String(matchType)}' on its most recent call for this case`,
        selection.call,
      );
};

const checkPaidExactDuplicate = (
  toolResultsByName: Record<string, ToolCallRecord[]>,
  request: ProcessingRequest,
): EvidenceCheckFailure[] => {
  const requirement: string = `${HISTORY_TOOL} must have been called for this case's vendor and invoice (${request.vendorId}, ${request.invoiceRef}) and its most recent such result must be an 'EXACT' match to an invoice with paymentStatus 'paid'`;
  const selection: CaseCallSelection = selectHistoryCall(toolResultsByName, request, requirement);
  if (!selection.found) return selection.failures;

  const toolError: string | null = describeToolError(selection.call.result);
  if (toolError) return fail(HISTORY_TOOL, requirement, toolError, selection.call);

  const result: unknown = selection.call.result;
  const matchType: unknown = isRecord(result) ? result['matchType'] : undefined;
  if (matchType === 'FUZZY') {
    return fail(
      HISTORY_TOOL,
      requirement,
      "returned matchType 'FUZZY' on its most recent call for this case, which FIN-POL-005 treats as a hold for information, not a rejection",
      selection.call,
    );
  }
  if (matchType !== 'EXACT') {
    return fail(
      HISTORY_TOOL,
      requirement,
      `returned matchType '${String(matchType)}' on its most recent call for this case`,
      selection.call,
    );
  }

  const matchedInvoice: unknown = isRecord(result) ? result['matchedInvoice'] : undefined;
  const paymentStatus: unknown = isRecord(matchedInvoice)
    ? matchedInvoice['paymentStatus']
    : undefined;
  return paymentStatus === 'paid'
    ? []
    : fail(
        HISTORY_TOOL,
        requirement,
        `returned an 'EXACT' match to an invoice with paymentStatus '${String(paymentStatus)}', not 'paid', on its most recent call for this case, which needs review rather than rejection`,
        selection.call,
      );
};

const checkVendorClear = (
  toolResultsByName: Record<string, ToolCallRecord[]>,
  request: ProcessingRequest,
): EvidenceCheckFailure[] => {
  const requirement: string = `${VENDOR_TOOL} must have been called for this case's vendor (${request.vendorId}) and its most recent such result must be a vendor with status 'active' and no risk flags`;
  const selection: CaseCallSelection = selectVendorCall(toolResultsByName, request, requirement);
  if (!selection.found) return selection.failures;

  const notOk: string | null = describeNotOk(selection.call.result);
  if (notOk) return fail(VENDOR_TOOL, requirement, notOk, selection.call);

  const vendor: Record<string, unknown> = dataOf(selection.call.result);
  const status: unknown = vendor['status'];
  const riskFlags: unknown = vendor['riskFlags'];

  return [
    ...(status === 'active'
      ? []
      : fail(
          VENDOR_TOOL,
          requirement,
          `shows vendor status is not active (status '${String(status)}')`,
          selection.call,
        )),
    ...(!Array.isArray(riskFlags)
      ? fail(VENDOR_TOOL, requirement, 'returned a vendor with no readable riskFlags', selection.call)
      : riskFlags.length === 0
        ? []
        : fail(
            VENDOR_TOOL,
            requirement,
            `shows vendor has open risk flags: ${riskFlags.map(String).join(', ')}`,
            selection.call,
          )),
  ];
};

export const checkEvidence = (
  proposedAction: FinanceDecisionAction,
  toolResultsByName: Record<string, ToolCallRecord[]>,
  request: ProcessingRequest,
): EvidenceCheckFailure[] => {
  switch (proposedAction) {
    case 'APPROVE_FOR_POSTING':
      return [
        ...checkMatchPassed(toolResultsByName, request),
        ...checkNoDuplicate(toolResultsByName, request),
        ...checkVendorClear(toolResultsByName, request),
        ...checkAttempted(toolResultsByName, AUTHORITY_TOOL),
      ];
    case 'REJECT_DUPLICATE':
      return checkPaidExactDuplicate(toolResultsByName, request);
    case 'HOLD_FOR_INFORMATION':
    case 'REJECT_INVALID':
    case 'ESCALATE_CONTROL_REVIEW':
      return checkAttempted(toolResultsByName, RETRIEVAL_TOOL);
  }
};
