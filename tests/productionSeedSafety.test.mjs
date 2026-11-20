import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateSeedData } from '../src/lib/seed.ts';
const state = generateSeedData({ includeDemo: false });
for (const key of ['users','roles','permissionSets','customers','accounts','quotes','tasks','externalProducts','invoices','payments','paymentAllocations','cheques','salesOrders','dispatchPlans','salesReturns','financeRequests','creditNotes','reconciliationCases','activities','visits','opportunities','groups','notifications','coaMirror','accountMapRules']) {
  assert.deepEqual(state[key] || [], [], `production seed must not fabricate ${key}`);
}
assert.equal(state.currentUserId, '', 'production seed has no pre-authenticated local user');
assert.equal(state.seedMetadata.mode, 'EMPTY_PRODUCTION');
const demo = generateSeedData({ includeDemo: true });
assert.ok(demo.customers.length > 0, 'demo data remains explicitly available for development/tests');
const storage = readFileSync(new URL('../src/lib/storage.ts', import.meta.url), 'utf8');
assert.match(storage, /INCLUDE_DEMO_SEED = demoSeedPreference === 'true'\s*\|\| \(demoSeedPreference !== 'false' && import\.meta\.env\?\.DEV === true\)/);
console.log('production seed safety: PASS');
