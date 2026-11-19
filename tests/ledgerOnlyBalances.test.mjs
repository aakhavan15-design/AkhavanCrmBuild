// F0-13: هر مانده فقط از گردش مالی (Σبدهکار − Σبستانکار)؛ هیچ مانده‌ای از فاکتور/صورتحساب باز ساخته نمی‌شود.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const s = await readFile(new URL('../src/lib/financialIntelligence.ts', import.meta.url), 'utf8');
for (const old of ['مانده بدهی فعلی', 'مانده بدهی به تأمین‌کننده', 'مانده فاکتورهای باز مشتری', 'مانده صورتحساب‌های باز تأمین‌کننده'])
  assert.ok(!s.includes(old), `برچسب مانده اسنادی باید حذف شده باشد: ${old}`);
assert.match(s, /function ledgerBalanceFact/);
assert.match(s, /ledgerBalanceFact\(c, 'credit\.balance'/);
assert.match(s, /ledgerBalanceFact\(c, 'supplier\.balance'/);
assert.ok(!/key: 'credit\.balance'[^}]*bal\(/.test(s), 'credit.balance نباید از bal(فاکتور) بیاید');
assert.ok(!/value: sum\(open\.map\(bal\)\)|value: sum\(mb\.map\(out\)\)/.test(s), 'جمع فاکتور/صورتحساب باز نباید مانده شود');
console.log('PASS ledger-only balances (F0-13)');
