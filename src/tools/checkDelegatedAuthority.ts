import type { ApproverRole, AuthorityCheckResult } from '../types.js';

export const AUTHORITY_LIMITS: { role: ApproverRole; limit: number | null }[] = [
  { role: 'COST_CENTRE_MANAGER', limit: 10_000 },
  { role: 'DEPARTMENT_DIRECTOR', limit: 50_000 },
  { role: 'EXECUTIVE_DIRECTOR', limit: 250_000 },
  { role: 'CFO', limit: 1_000_000 },
  { role: 'CEO', limit: null },
];

const resolveApproverRole = (amountAud: number): ApproverRole =>
  AUTHORITY_LIMITS.find(
    (entry: { role: ApproverRole; limit: number | null }): boolean =>
      entry.limit === null || entry.limit >= amountAud,
  )?.role ?? 'CEO';

export const checkDelegatedAuthority = (input: {
  amountAud: number;
  isNewVendor: boolean;
  hasRecentBankChange: boolean;
  isOverseasAccount: boolean;
  isManualPayment: boolean;
  hasFraudFlag: boolean;
}): AuthorityCheckResult => {
  const reasons: string[] = [
    ...(input.isNewVendor ? ['new vendor (first 30 days)'] : []),
    ...(input.hasRecentBankChange ? ['recent bank account change'] : []),
    ...(input.isOverseasAccount ? ['overseas account'] : []),
    ...(input.isManualPayment ? ['manual payment'] : []),
    ...(input.hasFraudFlag ? ['fraud indicator present'] : []),
  ];

  return {
    requiredApproverRole: resolveApproverRole(input.amountAud),
    requiresSecondApproval: reasons.length > 0,
    secondApprovalReason: reasons.length > 0 ? reasons.join('; ') : null,
    authorityLimits: AUTHORITY_LIMITS.map(
      (entry: {
        role: ApproverRole;
        limit: number | null;
      }): { role: ApproverRole; limit: number | null } => ({ ...entry }),
    ),
  };
};
