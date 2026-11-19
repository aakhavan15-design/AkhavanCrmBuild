import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildAgingBuckets, normalizeAgingBounds, isReceivableInvoice } from '../src/services/agingBuckets.ts';

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
assert.match(engine, /buildAgingBuckets\(agingItems, \(state as Record<string, unknown>\)\.settings\?\.agingBucketBounds\)|buildAgingBuckets\(agingItems, \(state as any\)\.settings\?\.agingBucketBounds\)/);
assert.match(engine, /agingReconciliation = \{/);
console.log('agingBucketsContracts: PASS');
