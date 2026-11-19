// F0-16 (ReportEnginePanels): گزارش ۷ مطالبات فقط از مانده دفتری؛ سنی «تخمینی»؛ بدون مانده فاکتوری.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDetailBalancesResult } from '../src/lib/receivableReconciliation.ts';
import { buildLedgerAgingInputs, estimateLedgerAging } from '../src/services/agingBuckets.ts';

const L = (d, s, debit, credit) => ({ detailAccountId: d, subsidiaryCode: s, debitAmount: debit, creditAmount: credit });
const res = buildDetailBalancesResult([
  L('C1', '1101', 150, 0),            // بدهکار ۱۵۰
  L('C2', '1101', 0, 40),             // بستانکار ⇒ در سنی نمی‌آید
  L('C3', '1101', 50, 50),            // تسویه ⇒ نمی‌آید
], 'CLIENT_INDEXEDDB');
const accounts = [{ id: 'C1', name: 'الف' }, { id: 'C2', name: 'ب' }, { id: 'C3', name: 'ج' }, { id: 'C9', name: 'بدون گردش' }];
const invoices = [
  { customerId: 'C1', invoiceNumber: 'I2', totalAmount: 100, date: '2026-10-01', dueDate: '2026-11-10', status: 'CONFIRMED' },
  { customerId: 'C1', invoiceNumber: 'I1', totalAmount: 100, date: '2026-08-01', dueDate: '2026-09-01', status: 'CONFIRMED' },
  { accountId: 'C1', invoiceNumber: 'X', totalAmount: 999, date: '2026-11-01', dueDate: '2026-11-20', status: 'DRAFT' },
];

// بدون نتیجهٔ دفتر ⇒ ورودی خالی (نامشخص، نه صفر)
assert.deepEqual(buildLedgerAgingInputs(null, accounts, invoices), []);
const inputs = buildLedgerAgingInputs(res, accounts, invoices);
assert.equal(inputs.length, 1, 'فقط مشتری بدهکار؛ بستانکار/تسویه/بدون گردش حذف');
assert.equal(inputs[0].id, 'C1'); assert.equal(inputs[0].balance, 150, 'مانده از دفتر است نه جمع فاکتورها');
assert.equal(inputs[0].invoices.length, 2, 'فاکتور پیش‌نویس در پوشش نمی‌آید');
const est = estimateLedgerAging(inputs, new Date('2026-11-16'));
assert.deepEqual(est.items.map(i => i.amount), [100, 50]);
assert.equal(est.unattributed, 0);

// قرارداد ایستا: گزارش ۷ مانده فاکتوری ندارد
const p = readFileSync('src/components/ReportEnginePanels.tsx', 'utf8');
assert.ok(p.includes('getDetailSubsidiaryBalances') && /canSeeLedger \? provider\.getDetailSubsidiaryBalances\(\)/.test(p), 'از DataProvider و پشت مجوز مالی');
assert.ok(p.includes('summarizeCustomerLedgerReceivables') && p.includes('buildLedgerAgingInputs') && p.includes('estimateLedgerAging'));
assert.ok(!p.includes('receivables.totalOutstanding') && !p.includes('receivables.priorities') && !/receivables\.invoices/.test(p), 'مانده/اولویت/سنی از reconcileReceivables نیست');
assert.ok(!/outstanding:\s*Number\(inv\.balance/.test(p), 'Drill-down مانده هر فاکتور را از inv.balance نمی‌سازد');
assert.ok(p.includes('تخمینی') && p.includes('نامشخص'), 'برچسب تخمینی/نامشخص');
assert.ok(p.includes('reconcileReceivables') && p.includes('buildAgingBuckets'), 'موتورها حذف نشدند (قرارداد crossModule)');

const f = readFileSync('src/components/FinanceWorkspace.tsx', 'utf8');
assert.ok(f.includes('buildLedgerAgingInputs'), 'FinanceWorkspace از همان تابع مشترک');
const o = readFileSync('src/components/shared/OrderDetailsDrawer.tsx', 'utf8');
assert.ok(!o.includes('remainingBalance'), 'OrderDetailsDrawer مانده از پیش‌فاکتور/فاکتور نمی‌سازد');
assert.ok(o.includes('order-remaining-unknown'), 'مانده = نامشخص');
console.log('reportReceivablesLedgerOnly: PASS');
