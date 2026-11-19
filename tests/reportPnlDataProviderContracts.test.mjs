import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computeLedgerPnl, buildLedgerPnlInputs, pnlSeriesByJalali } from '../src/lib/ledgerPnl.ts';
import { DEFAULT_REPORT_BUCKETS } from '../src/lib/accountingMapping.ts';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('F0-14: Ledger P&L consumers must use DataProvider without silent local fallback', () => {
  it('DataProvider exposes getLedgerPnlData on interface and both providers with honest UNAVAILABLE/RESTRICTED states', () => {
    const src = read('src/services/dataProvider.ts');
    assert.match(src, /export interface LedgerPnlDataResult/);
    assert.match(src, /getLedgerPnlData\s*\(/);
    assert.match(src, /class ClientStorageDataProvider[\s\S]*async getLedgerPnlData\(/);
    assert.match(src, /class HttpBackendDataProvider[\s\S]*async getLedgerPnlData\(/);
    assert.match(src, /status:\s*'RESTRICTED'/);
    assert.match(src, /status:\s*'UNAVAILABLE'/);
    assert.match(src, /MAX_PNL_JOURNAL_PAGES/);
  });

  it('ReportEnginePanels routes both ledger P&L and ledger balances through DataProvider and guards errors', () => {
    const src = read('src/components/ReportEnginePanels.tsx');
    assert.equal(src.includes('buildLedgerPnlInputs(state.journalLines'), false, 'must not pass state.journalLines directly into buildLedgerPnlInputs');
    assert.equal(src.includes('state.coaMirror'), false, 'must not read state.coaMirror directly for P&L');
    assert.match(src, /provider\.getLedgerPnlData\(/);
    assert.match(src, /ledgerPnlError/);
    assert.match(src, /refreshLedgerPnl/);
    assert.match(src, /provider\.getDetailSubsidiaryBalances\(\)/);
    assert.match(src, /ledgerBalancesError/);
    assert.match(src, /availableLedgerBalances/);
    assert.match(src, /refreshLedgerBalances/);
  });

  it('ProfitLossWidget routes ledger P&L through DataProvider, enforces finance VIEW, and handles UNAVAILABLE', () => {
    const src = read('src/components/finance/ProfitLossWidget.tsx');
    assert.equal(src.includes('?.journalLines, (state'), false, 'must not read state.journalLines directly into buildLedgerPnlInputs');
    assert.match(src, /new RBACService\(effectiveState\)\.can\('finance', 'VIEW'\)/);
    assert.match(src, /provider\.getLedgerPnlData\(\)/);
    assert.match(src, /ledgerPnlError/);
    assert.match(src, /refreshPnl/);
    assert.match(src, /status === 'RESTRICTED'/);
    assert.match(src, /status === 'UNAVAILABLE'/);
  });

  it('GeoIntelligenceWorkspace and TasksWorkspace guard detail-balance provider errors against stale data', () => {
    const geo = read('src/components/GeoIntelligenceWorkspace.tsx');
    const tasks = read('src/components/TasksWorkspace.tsx');
    assert.match(geo, /error:\s*zoneLedgerError/);
    assert.match(geo, /availableZoneLedger/);
    assert.match(geo, /status:\s*'UNAVAILABLE'/);
    assert.match(tasks, /error:\s*collectionLedgerError/);
    assert.match(tasks, /availableCollectionLedger/);
    assert.match(tasks, /status:\s*'UNAVAILABLE'/);
  });

  it('pure ledgerPnl engine preserves null on missing operands and computes exact buckets on valid postings', () => {
    const coa = [
      { id: 'c-41', code: '4101', name: 'فروش کالا', level: 4, nature: 'CREDIT' },
      { id: 'c-42', code: '4201', name: 'برگشت از فروش', level: 4, nature: 'DEBIT' },
      { id: 'c-51', code: '5101', name: 'بهای تمام‌شده', level: 4, nature: 'DEBIT' },
      { id: 'c-52', code: '5201', name: 'هزینه فروش', level: 4, nature: 'DEBIT' },
    ];
    const lines = [
      { ledgerAccountId: 'c-41', debitAmount: 0, creditAmount: 1000000, documentDate: '2026-04-05', status: 'POSTED' },
      { ledgerAccountId: 'c-42', debitAmount: 100000, creditAmount: 0, documentDate: '2026-04-06', status: 'POSTED' },
      { ledgerAccountId: 'c-51', debitAmount: 600000, creditAmount: 0, documentDate: '2026-04-06', status: 'POSTED' },
      { ledgerAccountId: 'c-52', debitAmount: 150000, creditAmount: 0, documentDate: '2026-04-07', status: 'POSTED' },
      { ledgerAccountId: 'c-41', debitAmount: 0, creditAmount: 500000, documentDate: '2026-04-08', status: 'DRAFT' },
    ];
    const { rawLines, accounts } = buildLedgerPnlInputs(lines, coa);
    const pnl = computeLedgerPnl(rawLines, accounts, DEFAULT_REPORT_BUCKETS, { from: '2026-04-01', to: '2026-04-30' });
    assert.equal(pnl.values.GROSS_SALES, 1000000);
    assert.equal(pnl.values.SALES_RETURNS, 100000);
    assert.equal(pnl.values.NET_SALES, 900000);
    assert.equal(pnl.values.COGS, 600000);
    assert.equal(pnl.values.GROSS_PROFIT, 300000);
    assert.equal(pnl.values.OPERATING_EXPENSES, 150000);
    assert.equal(pnl.values.OPERATING_PROFIT, 150000);

    const empty = computeLedgerPnl([], accounts, DEFAULT_REPORT_BUCKETS);
    assert.equal(empty.values.NET_SALES, null);
    assert.equal(empty.values.OPERATING_PROFIT, null);

    const series = pnlSeriesByJalali(rawLines, accounts, DEFAULT_REPORT_BUCKETS, 'month', 12);
    assert.equal(series.length, 1);
    assert.equal(series[0].revenue, 900000);
    assert.equal(series[0].expenses, 150000);
    assert.equal(series[0].profit, 150000);
  });
});
