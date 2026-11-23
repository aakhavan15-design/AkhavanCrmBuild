// F0-05: مانده بدهی در فهرست مشتریان فقط با مجوز finance.view محاسبه/نمایش داده شود.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { computeCustomerLedgerBalances } from '../src/lib/receivableReconciliation.ts';
const s = readFileSync('src/components/CustomersWorkspace.tsx', 'utf8');
assert.ok(/const canSeeBalance = can\('finance', 'VIEW'\);/.test(s), 'باید مجوز مالی چک شود');
assert.ok(/canSeeBalance \? \{ key: ledgerKey, balances: await provider\.getDetailSubsidiaryBalances\(\s*provider.name==='SQLSERVER_BACKEND' \? \{ \.\.\.ledgerScope, role:'RECEIVABLE' \} : undefined/.test(s), 'مانده از دفتر منتخب و پشت مجوز مالی خوانده شود');
assert.ok(!/state\.journalLines/.test(s), 'نباید مستقیم از state.journalLines خواند (قانون اساسی §D)');
assert.ok(/resolveCustomerBalanceView\(/.test(s), 'نمای مانده از نتیجهٔ Provider ساخته شود');
assert.ok(!/invoice\.balance|Number\(invoice\.balance\)/.test(s), 'مانده نباید از Invoice.balance بیاید');
assert.ok(/\{canSeeBalance && \(\s*<div className="text-end shrink-0">[\s\S]*?<Wallet[\s\S]*?\n\s*\)\}/.test(s), 'نمایش کیف‌پول/بدهی باید شرطی باشد');
const wallet = s.split('\n').findIndex(l => l.includes('<Wallet size'));
const guard = s.split('\n').findIndex((l, i) => l.includes('{canSeeBalance && (') && i < wallet);
assert.ok(guard > 0 && guard < wallet && wallet - guard < 4, 'Wallet باید داخل گارد باشد');
// نگاشت RBAC: finance.VIEW ⇒ finance.view
const rbac = readFileSync('src/lib/rbac.ts', 'utf8');
assert.ok(/finance:\s+\{ VIEW: \['finance\.view'\]/.test(rbac));

// مانده = Σ بدهکار − Σ بستانکار؛ باطل/پیش‌نویس حذف؛ بدون سطر = نامشخص
const m = computeCustomerLedgerBalances([
  { accountId: 'c1', debitAmount: 1000, creditAmount: 0, status: 'POSTED' },
  { accountId: 'c1', debitAmount: 0, creditAmount: 400, status: 'POSTED' },
  { accountId: 'c1', debitAmount: 0, creditAmount: 250 },
  { accountId: 'c1', debitAmount: 9999, creditAmount: 0, status: 'DRAFT' },
  { accountId: 'c1', debitAmount: 777, creditAmount: 0, isVoided: true },
  { accountId: 'c2', debitAmount: 0, creditAmount: 300, status: 'FINAL' },
  { debitAmount: 5, creditAmount: 0 },
]);
// A journal line without explicit confirmed/final status is NOT posted.
assert.equal(m.get('c1').balance, 600); assert.equal(m.get('c1').debit, 1000); assert.equal(m.get('c1').credit, 400); assert.equal(m.get('c1').lineCount, 2);
assert.equal(m.get('c2').balance, -300); // بستانکار
assert.equal(m.has('c3'), false);
assert.equal(computeCustomerLedgerBalances(undefined).size, 0);
console.log('customerListBalancePermission: PASS');
