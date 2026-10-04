import type { VendorRecord } from '../types.js';

const RECENT_BANK_CHANGE_AT: string = new Date(
  Date.now() - 1 * 24 * 60 * 60 * 1000,
).toISOString();

export const vendors: VendorRecord[] = [
  {
    vendorId: 'VEND-1001',
    name: 'Harbourline Office Supplies Pty Ltd',
    status: 'active',
    bankAccountLast4: '8842',
    bankAccountUpdatedAt: '2024-03-18T02:15:00Z',
    riskFlags: [],
    lastUpdated: '2026-07-22T04:30:00Z',
  },
  {
    vendorId: 'VEND-1002',
    name: 'Southern Cross Freight Pty Ltd',
    status: 'active',
    bankAccountLast4: '3107',
    bankAccountUpdatedAt: '2023-11-06T23:40:00Z',
    riskFlags: [],
    lastUpdated: '2026-05-14T01:05:00Z',
  },
  {
    vendorId: 'VEND-1003',
    name: 'Meridian IT Services Pty Ltd',
    status: 'active',
    bankAccountLast4: '5596',
    bankAccountUpdatedAt: RECENT_BANK_CHANGE_AT,
    riskFlags: ['recent-bank-change'],
    lastUpdated: RECENT_BANK_CHANGE_AT,
  },
  {
    vendorId: 'VEND-1004',
    name: 'Kestrel Industrial Components Pty Ltd',
    status: 'active',
    bankAccountLast4: '2260',
    bankAccountUpdatedAt: '2025-02-11T00:20:00Z',
    riskFlags: [],
    lastUpdated: '2026-08-03T06:45:00Z',
  },
  {
    vendorId: 'VEND-1005',
    name: 'Bluegum Facilities Management Pty Ltd',
    status: 'active',
    bankAccountLast4: '7413',
    bankAccountUpdatedAt: '2024-09-30T03:00:00Z',
    riskFlags: [],
    lastUpdated: '2026-06-19T22:10:00Z',
  },
];
