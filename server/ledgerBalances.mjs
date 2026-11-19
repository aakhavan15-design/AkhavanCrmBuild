/** Read-only ledger projection from migration 027; never fabricate balances. */
export function projectLedgerBalances(rows, { detailKey, byPeriod = false } = {}) {
  const details = new Map();
  for (const row of rows) {
    const key = String(row.ExternalDetailCode);
    if (detailKey && key !== detailKey) continue;
    const subsidiaryCode = row.ExternalAccountCode == null ? null : String(row.ExternalAccountCode);
    const periodCode = byPeriod && row.ExternalPeriodCode != null ? String(row.ExternalPeriodCode) : null;
    const debit = Number(row.TotalDebit), credit = Number(row.TotalCredit);
    const lineCount = Number(row.CountedLineCount), unmapped = Number(row.UnmappedStatusLineCount);
    if (![debit, credit, lineCount, unmapped].every(Number.isFinite)) throw new Error('Invalid ledger projection');
    let item = details.get(key);
    if (!item) { item = { detailKey: key, subsidiaries: [], total: { debit: 0, credit: 0, balance: 0, nature: 'SETTLED', lineCount: 0 }, status: 'COMPLETE' }; details.set(key, item); }
    const balance = debit - credit;
    item.subsidiaries.push({ subsidiaryCode, periodCode, debit, credit, balance, nature: balance > 0 ? 'DEBIT' : balance < 0 ? 'CREDIT' : 'SETTLED', lineCount });
    item.total.debit += debit; item.total.credit += credit; item.total.lineCount += lineCount;
    item.total.balance = item.total.debit - item.total.credit;
    item.total.nature = item.total.balance > 0 ? 'DEBIT' : item.total.balance < 0 ? 'CREDIT' : 'SETTLED';
    if (subsidiaryCode === null || unmapped > 0) item.status = 'HAS_UNMAPPED';
  }
  const balances = [...details.values()];
  return { status: balances.length ? 'LIVE' : 'EMPTY', source: 'SQLSERVER_BACKEND', balances };
}
