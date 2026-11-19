// F0-13: جدول مانده تفکیکی + Drill-down گردش هر معین در پرونده ۳۶۰.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { queryJournalLines, buildDetailBalancesResult, resolveCustomerBalanceView } from '../src/lib/receivableReconciliation.ts';

const L = (d, s, debit, credit, extra = {}) => ({ detailAccountId: d, subsidiaryCode: s, debitAmount: debit, creditAmount: credit, ...extra });
const lines = [L('C1', '1101', 100, 0, { id: 1 }), L('C1', '1102', 0, 30, { id: 2 }), L('C1', undefined, 5, 0, { id: 3 }), L('C2', '1101', 9, 0, { id: 4 })];

const m1101 = queryJournalLines(lines, { detailKey: 'C1', subsidiaryCode: '1101' });
assert.deepEqual(m1101.items.map(i => i.id), [1]);
assert.deepEqual(queryJournalLines(lines, { detailKey: 'C1', unmapped: true }).items.map(i => i.id), [3]);
assert.equal(queryJournalLines(lines, { detailKey: 'C1' }).total, 3);
const view = resolveCustomerBalanceView(buildDetailBalancesResult(lines, 'CLIENT_INDEXEDDB'), { id: 'C1' });
assert.equal(view.kind, 'OK');
assert.equal(view.detailKey, 'C1');
for (const row of view.subsidiaries) {
  const mv = row.subsidiaryCode ? queryJournalLines(lines, { detailKey: 'C1', subsidiaryCode: row.subsidiaryCode }) : queryJournalLines(lines, { detailKey: 'C1', unmapped: true });
  const sum = mv.items.reduce((a, r) => a + (Number(r.debitAmount) || 0) - (Number(r.creditAmount) || 0), 0);
  assert.equal(sum, row.balance, `drill-down ≠ balance for ${row.subsidiaryCode}`);
}
assert.equal(view.incomplete, true);

const panel = readFileSync('src/components/shared/SubsidiaryBalancesPanel.tsx', 'utf8');
assert.ok(/enabled \? p\.getDetailSubsidiaryBalances\(\) : null/.test(panel), 'بدون مجوز درخواستی ارسال نشود');
assert.ok(/p\.getJournalLines\(/.test(panel) && !/state\.journalLines/.test(panel), 'Drill-down فقط از DataProvider');
assert.ok(/فاقد نگاشت معین/.test(panel) && /جمع تفصیلی/.test(panel) && /aria-expanded/.test(panel));
assert.ok(/aria-busy/.test(panel), 'Skeleton');
assert.ok(!/localStorage|window\.storage/.test(panel));
const c360 = readFileSync('src/components/Customer360.tsx', 'utf8');
assert.ok(/<SubsidiaryBalancesPanel account=\{customer\} enabled=\{canViewFinance\}/.test(c360), 'پانل باید پشت مجوز مالی باشد');
console.log('subsidiaryBalancesPanel: PASS');
