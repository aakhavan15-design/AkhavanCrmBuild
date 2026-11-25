import type { DetailBalancesResult, SubsidiaryBalance } from './receivableReconciliation';
import type { CoaMirror } from '../types';

/** Read model only. The ledger provider owns signed balances and includes opening documents once. */
export interface PersonnelLedgerIdentity { userId: string; name: string; detailCode: string | null }
export interface PersonnelFinanceRow extends PersonnelLedgerIdentity {
  balance: number | null;
  accounts: SubsidiaryBalance[];
  reason: string | null;
}
export function personnelAccountCodes(coa: readonly CoaMirror[], root: string): Set<string> {
  if (!root || !coa.some(a => a.code === root)) return new Set();
  const codes = new Set([root]);
  // Use actual hierarchy, never guessed account prefixes or Persian labels.
  for (let i = 0; i < coa.length; i++) {
    let changed = false;
    for (const a of coa) if (a.parentCode && codes.has(a.parentCode) && !codes.has(a.code)) {
      codes.add(a.code); changed = true;
    }
    if (!changed) break;
  }
  return codes;
}
export function buildPersonnelFinanceRows(people: readonly PersonnelLedgerIdentity[], ledger: DetailBalancesResult | null, codes: ReadonlySet<string>): PersonnelFinanceRow[] {
  const duplicates = new Map<string, number>();
  for (const p of people) if (p.detailCode) duplicates.set(p.detailCode, (duplicates.get(p.detailCode) || 0) + 1);
  return people.map(person => {
    const unknown = (reason: string): PersonnelFinanceRow => ({ ...person, balance: null, accounts: [], reason });
    if (!person.detailCode || duplicates.get(person.detailCode) !== 1) return unknown('کد تفصیلی معتبر و یکتا نیست');
    if (!codes.size) return unknown('گروه حساب از کدینگ واقعی انتخاب نشده است');
    if (!ledger || ledger.source !== 'SQLSERVER_BACKEND' || ledger.status !== 'LIVE' || ledger.currency !== 'IRR') return unknown('دفتر قطعی ریالی در دسترس نیست');
    const matches = ledger.balances.filter(b => b.detailKey === person.detailCode);
    if (matches.length !== 1 || matches[0].status !== 'COMPLETE') return unknown('پوشش گردش تفصیلی تأیید نشده است');
    const accounts = matches[0].subsidiaries.filter(a => a.subsidiaryCode !== null && codes.has(a.subsidiaryCode));
    if (!accounts.length || accounts.some(a => !Number.isSafeInteger(a.balance))) return unknown('گردش معتبر در گروه انتخابی موجود نیست');
    const balance = accounts.reduce((sum, a) => sum + a.balance, 0);
    if (!Number.isSafeInteger(balance)) return unknown('جمع مانده خارج از دقت عددی قابل اطمینان است');
    return { ...person, accounts, balance, reason: null };
  });
}
export function selectedPersonnelBalance(row: PersonnelFinanceRow, code: string | null): number | null {
  if (row.balance === null) return null;
  if (!code) return row.balance;
  const matches = row.accounts.filter(a => a.subsidiaryCode === code);
  if (!matches.length || matches.some(a => !Number.isSafeInteger(a.balance))) return null;
  const total = matches.reduce((sum, a) => sum + a.balance, 0);
  return Number.isSafeInteger(total) ? total : null;
}
