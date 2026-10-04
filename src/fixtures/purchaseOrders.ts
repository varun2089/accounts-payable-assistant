import type { PurchaseOrder } from '../types.js';

export const purchaseOrders: PurchaseOrder[] = [
  {
    poNumber: 'PO-5001',
    vendorId: 'VEND-1001',
    currency: 'AUD',
    lines: [
      {
        lineNumber: 1,
        description: 'Ergonomic task chair, mesh back',
        quantity: 40,
        unitPrice: 312.5,
        currency: 'AUD',
      },
    ],
    approvalStatus: 'approved',
    approvedBy: 'EMP-2041',
    goodsReceipts: [
      {
        receiptId: 'GR-9001',
        lineNumber: 1,
        receivedDate: '2026-09-24',
        quantityReceived: 40,
      },
    ],
  },
  {
    poNumber: 'PO-5002',
    vendorId: 'VEND-1002',
    currency: 'AUD',
    lines: [
      {
        lineNumber: 1,
        description: 'Interstate pallet freight, Sydney to Melbourne',
        quantity: 12,
        unitPrice: 480,
        currency: 'AUD',
      },
    ],
    approvalStatus: 'approved',
    approvedBy: 'EMP-2118',
    goodsReceipts: [
      {
        receiptId: 'GR-9002',
        lineNumber: 1,
        receivedDate: '2026-09-04',
        quantityReceived: 12,
      },
    ],
  },
  {
    poNumber: 'PO-5003',
    vendorId: 'VEND-1003',
    currency: 'AUD',
    lines: [
      {
        lineNumber: 1,
        description: 'Managed endpoint security licence, annual',
        quantity: 150,
        unitPrice: 64,
        currency: 'AUD',
      },
    ],
    approvalStatus: 'approved',
    approvedBy: 'EMP-2075',
    goodsReceipts: [
      {
        receiptId: 'GR-9003',
        lineNumber: 1,
        receivedDate: '2026-09-29',
        quantityReceived: 150,
      },
    ],
  },
  {
    poNumber: 'PO-5004',
    vendorId: 'VEND-1004',
    currency: 'AUD',
    lines: [
      {
        lineNumber: 1,
        description: 'Hydraulic pump seal kit',
        quantity: 25,
        unitPrice: 186,
        currency: 'AUD',
      },
    ],
    approvalStatus: 'approved',
    approvedBy: 'EMP-2041',
    goodsReceipts: [],
  },
  {
    poNumber: 'PO-5005',
    vendorId: 'VEND-1005',
    currency: 'AUD',
    lines: [
      {
        lineNumber: 1,
        description: 'Quarterly HVAC preventative maintenance visit',
        quantity: 4,
        unitPrice: 1950,
        currency: 'AUD',
      },
    ],
    approvalStatus: 'approved',
    approvedBy: 'EMP-2163',
    goodsReceipts: [
      {
        receiptId: 'GR-9005',
        lineNumber: 1,
        receivedDate: '2026-09-26',
        quantityReceived: 4,
      },
    ],
  },
];
