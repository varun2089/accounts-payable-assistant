import type { AuthorityCheckResult } from '../types.js';
import { AUTHORITY_LIMITS, checkDelegatedAuthority } from './checkDelegatedAuthority.js';

const WIDTH: number = 76;

const NO_RISK_FLAGS: {
  isNewVendor: boolean;
  hasRecentBankChange: boolean;
  isOverseasAccount: boolean;
  isManualPayment: boolean;
  hasFraudFlag: boolean;
} = {
  isNewVendor: false,
  hasRecentBankChange: false,
  isOverseasAccount: false,
  isManualPayment: false,
  hasFraudFlag: false,
};

const rule = (label?: string): void => {
  if (!label) {
    console.log('─'.repeat(WIDTH));
    return;
  }
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, WIDTH - label.length - 4))}`);
};

const money = (value: number | null): string =>
  value === null ? 'no upper limit' : `AUD ${value.toLocaleString('en-AU')}`;

const printResult = (amountAud: number, result: AuthorityCheckResult): void => {
  console.log(`amountAud              : ${money(amountAud)}`);
  console.log(`requiredApproverRole   : ${result.requiredApproverRole}`);
  console.log(`requiresSecondApproval : ${result.requiresSecondApproval}`);
  console.log(`secondApprovalReason   : ${result.secondApprovalReason}`);
};

const check = (label: string, passed: boolean): void => {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
  if (!passed) process.exitCode = 1;
};

const main = (): void => {
  rule('Authority limits');
  for (const entry of AUTHORITY_LIMITS) {
    console.log(`${entry.role.padEnd(20)} ${money(entry.limit)}`);
  }

  rule('AUD 8,000, no risk flags');
  const small: AuthorityCheckResult = checkDelegatedAuthority({
    amountAud: 8_000,
    ...NO_RISK_FLAGS,
  });
  printResult(8_000, small);
  check(
    "requiredApproverRole is 'COST_CENTRE_MANAGER'",
    small.requiredApproverRole === 'COST_CENTRE_MANAGER',
  );
  check('requiresSecondApproval is false', small.requiresSecondApproval === false);
  check('secondApprovalReason is null', small.secondApprovalReason === null);

  rule('FIN-001: AUD 12,500, no risk flags');
  const fin001: AuthorityCheckResult = checkDelegatedAuthority({
    amountAud: 12_500,
    ...NO_RISK_FLAGS,
  });
  printResult(12_500, fin001);
  check(
    "requiredApproverRole is 'DEPARTMENT_DIRECTOR'",
    fin001.requiredApproverRole === 'DEPARTMENT_DIRECTOR',
  );
  check('requiresSecondApproval is false', fin001.requiresSecondApproval === false);

  rule('FIN-003: AUD 12,500 with recent bank change');
  const fin003: AuthorityCheckResult = checkDelegatedAuthority({
    amountAud: 12_500,
    ...NO_RISK_FLAGS,
    hasRecentBankChange: true,
  });
  printResult(12_500, fin003);
  check(
    "requiredApproverRole is 'DEPARTMENT_DIRECTOR'",
    fin003.requiredApproverRole === 'DEPARTMENT_DIRECTOR',
  );
  check('requiresSecondApproval is true', fin003.requiresSecondApproval === true);
  check(
    'secondApprovalReason mentions bank change',
    fin003.secondApprovalReason?.includes('bank account change') === true,
  );

  rule('AUD 8,000 manual payment');
  const manual: AuthorityCheckResult = checkDelegatedAuthority({
    amountAud: 8_000,
    ...NO_RISK_FLAGS,
    isManualPayment: true,
  });
  printResult(8_000, manual);
  check(
    "requiredApproverRole is 'COST_CENTRE_MANAGER'",
    manual.requiredApproverRole === 'COST_CENTRE_MANAGER',
  );
  check('requiresSecondApproval is true', manual.requiresSecondApproval === true);
  check(
    "secondApprovalReason is 'manual payment'",
    manual.secondApprovalReason === 'manual payment',
  );

  rule('AUD 1,500,000, no risk flags');
  const large: AuthorityCheckResult = checkDelegatedAuthority({
    amountAud: 1_500_000,
    ...NO_RISK_FLAGS,
  });
  printResult(1_500_000, large);
  check("requiredApproverRole is 'CEO'", large.requiredApproverRole === 'CEO');

  rule();
};

main();
