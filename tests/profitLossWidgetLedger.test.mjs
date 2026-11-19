// F0-09: ProfitLossWidget فقط از دفتر کل؛ بدون عدد نمونه؛ نبود داده = Empty State/NULL.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { buildLedgerPnlInputs, pnlSeriesByJalali } from '../src/lib/ledgerPnl.ts';
import { DEFAULT_REPORT_BUCKETS } from '../src/lib/accountingMapping.ts';

const src = readFileSync('src/components/finance/ProfitLossWidget.tsx', 'utf8');
assert.ok(!/\b\d{9,}\b/.test(src), 'هیچ عدد نمونهٔ ۹+ رقمی در ویجت نباید باشد');
assert.ok(!/state\??\.invoices|state\??\.expenses|\)\?\.expenses/.test(src), 'ویجت نباید از فاکتور/هزینهٔ خام حدس بزند');
assert.ok(/EmptyState/.test(src) && /pnlSeriesByJalali/.test(src));

// بدون داده → سری خالی
const empty = buildLedgerPnlInputs([], []);
assert.deepEqual(pnlSeriesByJalali(empty.rawLines, empty.accounts, DEFAULT_REPORT_BUCKETS, 'month', 12), []);
assert.deepEqual(buildLedgerPnlInputs(undefined, undefined), { rawLines: [], accounts: [] });

// داده: ۱۴۰۴ فروردین (2025-04) و تیر (2025-07) → دو ماه، یک سال، دو فصل
const coa = [
  { id: 'a1', code: '4101', name: 'فروش', nature: 'CREDIT' },
  { id: 'a2', code: '5201', name: 'هزینه', nature: 'DEBIT' },
  { id: 'a3', code: '5101', name: 'بها', nature: 'DEBIT' },
  { id: 'a4', code: '4201', name: 'برگشت از فروش', nature: 'DEBIT' },
];
const jl = [
  { ledgerAccountId: 'a1', creditAmount: 1000, debitAmount: 0, documentDate: '2025-04-10', status: 'POSTED' },
  { ledgerAccountId: 'a2', creditAmount: 0, debitAmount: 300, documentDate: '2025-04-12', status: 'POSTED' },
  { ledgerAccountId: 'a3', creditAmount: 0, debitAmount: 400, documentDate: '2025-04-15', status: 'POSTED' },
  { ledgerAccountId: 'a4', creditAmount: 0, debitAmount: 100, documentDate: '2025-04-20', status: 'POSTED' },
  { ledgerAccountId: 'a1', creditAmount: 500, debitAmount: 0, documentDate: '2025-07-05', status: 'POSTED' },
  { ledgerAccountId: 'a4', creditAmount: 0, debitAmount: 50, documentDate: '2025-07-07', status: 'POSTED' },
  { ledgerAccountId: 'a1', creditAmount: 9999, debitAmount: 0, documentDate: '2025-07-06', status: 'DRAFT' },
];
const { rawLines, accounts } = buildLedgerPnlInputs(jl, coa);
const months = pnlSeriesByJalali(rawLines, accounts, DEFAULT_REPORT_BUCKETS, 'month', 12);
assert.equal(months.length, 2);
assert.equal(months[0].revenue, 900); assert.equal(months[0].expenses, 300); assert.equal(months[0].profit, 200); // 900-400(بها)-300
// ماه دوم: بها/هزینه ثبت‌نشده → NULL (نه ۰)؛ سند DRAFT نادیده گرفته می‌شود
assert.equal(months[1].revenue, 450); assert.equal(months[1].expenses, null); assert.equal(months[1].profit, null);
assert.equal(pnlSeriesByJalali(rawLines, accounts, DEFAULT_REPORT_BUCKETS, 'year', 4).length, 1);
assert.equal(pnlSeriesByJalali(rawLines, accounts, DEFAULT_REPORT_BUCKETS, 'quarter', 4).length, 2);
console.log('profitLossWidgetLedger: PASS');
