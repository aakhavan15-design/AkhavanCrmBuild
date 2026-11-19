import assert from 'node:assert/strict';
import { generateSeedData, applyDemoSeed, isDemoId } from '../src/lib/seed.ts';

const state = generateSeedData({ includeDemo: false });
const report = applyDemoSeed(state, new Date('2026-11-07T12:00:00.000Z'));
assert.equal(report.skipped, 0, 'fresh QA dataset must not silently skip fixtures');
assert.equal(state.seedMetadata?.mode, 'LOCAL_TEST', 'QA seed must mark its data source explicitly');
assert.equal(state.seedMetadata?.generatedRecords, report.total, 'QA metadata count must match created records');
assert.ok(report.total >= 1800, `expected broad QA coverage, got ${report.total}`);
const minimums = {
  users: 8, accounts: 70, customers: 70, externalProducts: 15, suppliers: 5,
  quotes: 200, invoices: 90, payments: 80, paymentAllocations: 80, cheques: 60,
  tasks: 120, activities: 180, visits: 100, opportunities: 50, leads: 10,
  salesOrders: 50, dispatchPlans: 10, salesReturns: 20, reconciliationCases: 20,
  articles: 10, cases: 12, campaigns: 6, geoZones: 4, zoneAssignments: 30,
  financeRequests: 5, creditNotes: 8, expenses: 80,
};
for (const [key, min] of Object.entries(minimums)) {
  assert.ok((state[key] || []).length >= min, `${key} must have at least ${min} QA records`);
  for (const row of state[key] || []) assert.ok(isDemoId(row.id), `${key} record ${row.id} must be explicitly identified as QA data`);
}
const ids = key => new Set((state[key] || []).map(row => row.id));
const refs = [
  ['quotes', 'accountId', 'accounts'], ['quotes', 'ownerId', 'users'],
  ['tasks', 'accountId', 'accounts'], ['tasks', 'assigneeId', 'users'],
  ['invoices', 'quoteId', 'quotes'], ['paymentAllocations', 'paymentId', 'payments'],
  ['paymentAllocations', 'invoiceId', 'invoices'], ['activities', 'accountId', 'accounts'],
  ['visits', 'accountId', 'accounts'], ['salesOrders', 'accountId', 'accounts'],
  ['dispatchPlans', 'salesOrderId', 'salesOrders'], ['zoneAssignments', 'userId', 'users'],
];
for (const [source, field, target] of refs) {
  const targetIds = ids(target);
  const broken = (state[source] || []).filter(row => row[field] && !targetIds.has(row[field]));
  assert.equal(broken.length, 0, `${source}.${field} must reference existing ${target}`);
}
const production = generateSeedData({ includeDemo: false });
assert.equal(production.seedMetadata?.mode, 'EMPTY_PRODUCTION', 'production seed must remain empty and separate from QA fixtures');
assert.equal(production.currentUserId, '', 'production seed must not pre-authenticate a local user');
assert.deepEqual(production.accounts, [], 'production seed must not contain QA accounts');
console.log(`seedCoverageContracts.test.mjs: PASS (${report.total} linked QA records)`);
