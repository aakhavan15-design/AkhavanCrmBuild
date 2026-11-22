import { fixedUnits } from './financialFeedContract.mjs';

/** Read-only ledger projection from migration 027; never fabricate balances. */
export function projectLedgerBalances(rows, { detailKey, byPeriod = false, scope } = {}) {
  const details = new Map();
  const exactTotals = new Map();
  for (const row of rows) {
    const key = String(row.ExternalDetailCode);
    if (detailKey && key !== detailKey) continue;
    const subsidiaryCode = row.ExternalAccountCode == null ? null : String(row.ExternalAccountCode);
    const periodCode = byPeriod && row.ExternalPeriodCode != null ? String(row.ExternalPeriodCode) : null;
    const debitUnits = fixedUnits(String(row.TotalDebit)), creditUnits = fixedUnits(String(row.TotalCredit));
    const debit = Number(debitUnits)/10000, credit = Number(creditUnits)/10000;
    const lineCount = Number(row.CountedLineCount), unmapped = Number(row.UnmappedStatusLineCount);
    if (![debit, credit, lineCount, unmapped].every(Number.isFinite)) throw new Error('Invalid ledger projection');
    let item = details.get(key);
    if (!item) { item = { detailKey: key, accountId: row.LinkedAccountId ?? null, subsidiaries: [], total: { debit: 0, credit: 0, balance: 0, nature: 'SETTLED', lineCount: 0 }, status: 'COMPLETE' }; details.set(key, item); }
    if ([debitUnits,creditUnits].some(value => value>BigInt(Number.MAX_SAFE_INTEGER))) {
      return { status:'UNAVAILABLE',source:'SQLSERVER_BACKEND',balances:[],reason:'برای نمایش بدون گردکردن مبلغ، از مرور دفتر و تراز استفاده کنید.' };
    }
    const balance = Number(debitUnits-creditUnits)/10000;
    item.subsidiaries.push({ subsidiaryCode, periodCode, source: scope?.source, currency: scope?.currency, role: scope?.role ?? undefined, debit, credit, balance, nature: balance > 0 ? 'DEBIT' : balance < 0 ? 'CREDIT' : 'SETTLED', lineCount });
    const exact = exactTotals.get(key) ?? {debit:0n,credit:0n};
    exact.debit += debitUnits;
    exact.credit += creditUnits;
    exactTotals.set(key,exact);
    if ([exact.debit,exact.credit].some(value => value>BigInt(Number.MAX_SAFE_INTEGER))) {
      return { status:'UNAVAILABLE',source:'SQLSERVER_BACKEND',balances:[],reason:'برای نمایش بدون گردکردن مبلغ، از مرور دفتر و تراز استفاده کنید.' };
    }
    item.total.debit = Number(exact.debit)/10000;
    item.total.credit = Number(exact.credit)/10000;
    item.total.lineCount += lineCount;
    item.total.balance = Number(exact.debit-exact.credit)/10000;
    item.total.nature = item.total.balance > 0 ? 'DEBIT' : item.total.balance < 0 ? 'CREDIT' : 'SETTLED';
    if (scope?.verified===false || subsidiaryCode === null || unmapped > 0) item.status = 'HAS_UNMAPPED';
  }
  const balances = [...details.values()];
  return { status: balances.length ? 'LIVE' : 'EMPTY', source: 'SQLSERVER_BACKEND', sourceSystem: scope?.source, currency: scope?.currency, asOf:scope?.asOf ?? null, balances };
}
