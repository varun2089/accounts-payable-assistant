import { purchaseOrders } from '../fixtures/purchaseOrders.js';
import type { PurchaseOrder, ToolResult } from '../types.js';

const normaliseId = (id: string): string => id.trim().toLowerCase();

export const POS_THAT_TIMEOUT: Set<string> = new Set<string>(['po-5004']);

export const getPurchaseOrder = async (
  poNumber: string,
  options?: { simulateTimeout?: boolean },
): Promise<ToolResult<PurchaseOrder>> => {
  if (options?.simulateTimeout === true || POS_THAT_TIMEOUT.has(normaliseId(poNumber))) {
    return {
      ok: false,
      errorCode: 'TIMEOUT',
      message: 'purchase order service did not respond in time',
    };
  }

  const po: PurchaseOrder | undefined = purchaseOrders.find(
    (candidate: PurchaseOrder): boolean =>
      normaliseId(candidate.poNumber) === normaliseId(poNumber),
  );

  if (!po) {
    return {
      ok: false,
      errorCode: 'NOT_FOUND',
      message: `no purchase order found for PO number '${poNumber}'`,
    };
  }

  return { ok: true, data: po };
};
