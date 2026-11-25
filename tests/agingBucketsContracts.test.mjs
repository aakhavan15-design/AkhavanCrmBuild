import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildAgingBuckets, normalizeAgingBounds, isReceivableInvoice, allocateLifo, estimateLedgerAging } from '../src/services/agingBuckets.ts';

// buckets: no overlap, sum == total, open-ended last bucket, configurable bounds
const items = [{ days: -5, amount: 100 }, { days: 0, amount: 50 }, { days: 1, amount: 10 }, { days: 15, amount: 20 }, { days: 16, amount: 30 }, { days: 45, amount: 40 }, { days: 61, amount: 60 }, { days: 400, amount: 70 }];
const def = buildAgingBuckets(items);
assert.equal(def.buckets.length, 5);
assert.deepEqual(def.buckets.map(b => b.amount), [150, 60, 40, 60, 70]);
assert.ok(def.balanced && def.total === 380 && def.bucketSum === 380);
assert.equal(def.buckets.at(-1).toDay, null, 'last bucket is open-ended');

const custom = buildAgingBuckets(items, [7, 90]);
assert.deepEqual(custom.buckets.map(b => b.amount), [150, 10, 150, 70]);
assert.ok(custom.balanced);
assert.deepEqual(normalizeAgingBounds([60, '30', 30, 0, -4, 'x', 15.7]), [15, 30, 60]);
assert.deepEqual(normalizeAgingBounds(undefined), [30, 60, 90], 'defaults are 30/60/90 and only defaults');
assert.deepEqual(normalizeAgingBounds([]), [30, 60, 90], 'invalid config falls back to defaults');
assert.equal(buildAgingBuckets([{ days: 5, amount: -10 }, { days: 5, amount: NaN }]).total, 0, 'invalid amounts are ignored');

// cancelled / void / draft / deleted invoices are not receivables
for (const status of ['CANCELLED', 'VOID', 'DRAFT', 'REJECTED']) assert.equal(isReceivableInvoice({ status }), false, status);
assert.equal(isReceivableInvoice({ status: 'UNPAID', deletedAt: '2026-01-01' }), false);
assert.equal(isReceivableInvoice({ status: 'UNPAID' }), true);

// engine uses the shared helpers (no parallel aging logic) and exposes the reconciliation check
const engine = fs.readFileSync(new URL('../src/services/collectionEngine.ts', import.meta.url), 'utf8');
assert.match(engine, /isReceivableInvoice\(inv\)/);
assert.match(engine, /buildAgingBuckets\(agingItems, \(state\.settings as Record<string, unknown> \| undefined\)\?\.agingBucketBounds\)/);
assert.match(engine, /agingReconciliation = \{/);
// Same-date invoices must use the same numeric tie-break in both paths.
const invoices = [
  { id: 'a', number: '2', total: 7, date: '2026-01-01', dueDate: '2026-02-01' },
  { id: 'b', number: '10', total: 12, date: '2026-01-01', dueDate: '2026-02-02' },
  { id: 'c', number: '1', total: 3, date: '2025-12-01', dueDate: '2026-01-01' },
];
const reference = new Date('2026-03-01T00:00:00Z');
for (const ordered of [invoices, [...invoices].reverse()]) {
  const allocation = allocateLifo(15, ordered);
  assert.deepEqual(allocation.rows.map(r => [r.id, r.covered]), [['b',12],['a',3],['c',0]]);
  const report = estimateLedgerAging([{id:'customer', balance:15, invoices:ordered}], reference);
  assert.deepEqual(report.customers[0].covered.map(r => [r.invoiceNumber,r.covered]), [['10',12],['2',3]]);
  assert.equal(report.unattributed,0);
}
const missing = estimateLedgerAging([{balance:20,invoices:[{id:'bad',total:12,date:'2026-01-01',dueDate:'2026-02-30'}]}],reference);
assert.equal(missing.items.length,0);
assert.equal(missing.unattributed,20);
assert.equal(missing.customers[0].covered[0].days,null);
assert.equal(allocateLifo(15,[{id:'invalid',total:Infinity}]).unattributed,15);
console.log('agingBucketsContracts: PASS');
