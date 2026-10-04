import { vendors } from '../fixtures/vendors.js';
import type { ToolResult, VendorRecord } from '../types.js';

const normaliseId = (id: string): string => id.trim().toLowerCase();

export const getVendorRecord = async (vendorId: string): Promise<ToolResult<VendorRecord>> => {
  const vendor: VendorRecord | undefined = vendors.find(
    (candidate: VendorRecord): boolean =>
      normaliseId(candidate.vendorId) === normaliseId(vendorId),
  );

  if (!vendor) {
    return {
      ok: false,
      errorCode: 'NOT_FOUND',
      message: `no vendor record found for vendor ID '${vendorId}'`,
    };
  }

  return { ok: true, data: vendor };
};
