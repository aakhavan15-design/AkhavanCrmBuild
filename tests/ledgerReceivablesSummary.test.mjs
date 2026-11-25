// F0-16: مطالبات FinanceWorkspace فقط از مانده دفتری (Σبدهکار−Σبستانکار) و سررسید/Aging بدون تخصیص معتبر ERP «نامشخص».
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estimateLedgerAging } from '../src/services/agingBuckets.ts';
import { buildDetailBalancesResult, summarizeCustomerLedgerReceivables } from '../src/lib/receivableReconciliation.ts';

const L = (d, s, debit, credit) => ({ detailAccountId: d, subsidiaryCode: s, debitAmount: debit, creditAmount: credit, status:'POSTED' });
const res = buildDetailBalancesResult([
  L('C1', '1101', 100, 0), L('C1', '1102', 0, 30),   // بدهکار ۷۰ (دو معین مستقل)
  L('C2', '1101', 0, 40),                            // بستانکار ۴۰ → با مطالبات خنثی نمی‌شود
  L('C3', '1101', 50, 50),                           // تسویه
  L('C4', undefined, 20, 0),                         // فاقد معین ⇒ ناقص
], 'CLIENT_INDEXEDDB');
const accounts = [{ id: 'C1' }, { id: 'C2' }, { id: 'C3' }, { id: 'C4' }, { id: 'C9' }];

assert.deepEqual(summarizeCustomerLedgerReceivables(null, accounts), { kind: 'LOADING' });
assert.equal(summarizeCustomerLedgerReceivables({ status: 'UNAVAILABLE', source: 'SQLSERVER_BACKEND', balances: [], reason: 'x' }, accounts).kind, 'UNAVAILABLE');
assert.equal(summarizeCustomerLedgerReceivables(buildDetailBalancesResult([], 'CLIENT_INDEXEDDB'), accounts).kind, 'NO_LEDGER');

const s = summarizeCustomerLedgerReceivables(res, accounts);
assert.equal(s.kind, 'OK');
assert.equal(s.debtorTotal, 90, 'C1=70 + C4=20 (ناقص)');
assert.equal(s.creditorTotal, 40, 'بستانکار جدا؛ از مطالبات کم نمی‌شود');
assert.equal(s.debtorCount, 2); assert.equal(s.creditorCount, 1); assert.equal(s.settledCount, 1);
assert.equal(s.withoutLedgerCount, 1, 'C9 بدون گردش = نامشخص، نه صفر');
assert.equal(s.incomplete, true, 'سطر بدون معین ⇒ جمع ناقص');

// حساب بدون هیچ مشتری دارای گردش ⇒ NO_LEDGER (نه مانده صفر)
assert.equal(summarizeCustomerLedgerReceivables(res, [{ id: 'C9' }]).kind, 'NO_LEDGER');

// قرارداد ایستا FinanceWorkspace
const fin = readFileSync('src/components/FinanceWorkspace.tsx', 'utf8');
assert.ok(fin.includes('summarizeCustomerLedgerReceivables') && fin.includes('getDetailSubsidiaryBalances'), 'مطالبات از DataProvider/دفتر');
assert.ok(/canSeeLedger \? \{[\s\S]*?balances: await provider\.getDetailSubsidiaryBalances\(\{[\s\S]*?role:'RECEIVABLE'/.test(fin), 'بدون مجوز مالی درخواست نمی‌شود');
assert.ok(!/const totalReceivables\s*=\s*receivableReconciliation\.totalOutstanding/.test(fin), 'KPI مطالبات از مانده فاکتوری نیست');
assert.ok(fin.includes('estimateLedgerAging') && fin.includes('تخمینی') && fin.includes('نامشخص'), 'Aging تخمینی از مانده دفتری یا نامشخص');
assert.ok(!/receivableReconciliation\.invoices\.map\(row => \(\{ days/.test(fin), 'Aging از تخصیص CRM نیست');

// Aging تخمینی: از آخرین فاکتور به عقب (قاعدهٔ مالک)
const asOf = new Date('2026-11-16');
const inv = [ { total: 100, date: '2026-10-01', dueDate: '2026-11-10' }, { total: 100, date: '2026-08-01', dueDate: '2026-09-01' }, { total: 100, date: '2026-05-01', dueDate: '2026-06-01' } ];
const e = estimateLedgerAging([{ balance: 150, invoices: inv }], asOf);
assert.equal(e.items.length, 2, 'آخرین فاکتور کامل + نیمی از فاکتور قبل؛ قدیمی‌ترین دست‌نخورده');
assert.deepEqual(e.items.map(i => i.amount), [100, 50]);
assert.equal(e.items[0].days, 6); assert.equal(e.items[1].days, 76);
assert.equal(e.unattributed, 0);
// جزئیات هر مشتری: آخرین فاکتور اول، سپس فاکتور قبل؛ مبلغ پوشش‌یافته از کل فاکتور
const ed = estimateLedgerAging([{ id: 'C1', name: 'الف', balance: 150, invoices: inv.map((v, i) => ({ ...v, number: 'INV' + i })) }], asOf).customers[0];
assert.equal(ed.balance, 150); assert.deepEqual(ed.covered.map(c => c.invoiceNumber), ['INV0', 'INV1']);
assert.deepEqual(ed.covered.map(c => [c.covered, c.invoiceTotal]), [[100, 100], [50, 100]]);
const e2 = estimateLedgerAging([{ balance: 350, invoices: inv }, { balance: -5, invoices: inv }, { balance: 40, invoices: [{ total: 90, date: '2026-10-01' }] }], asOf);
assert.equal(e2.unattributed, 50 + 40, 'مازاد بر فاکتورها و فاکتور بی‌سررسید ⇒ بدون انتساب، نه حدس');
assert.ok(fin.includes('aging-customer-detail') && fin.includes('آخرین فاکتور') && fin.includes('فاکتور قبل'), 'کارت Aging جزئیات فاکتور هر مشتری را نشان می‌دهد');
console.log('ledgerReceivablesSummary: PASS');
