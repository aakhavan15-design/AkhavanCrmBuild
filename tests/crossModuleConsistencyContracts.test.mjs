import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (rel) => readFileSync(join(root, rel), 'utf8');

// --- Single source of truth: receivable / aging engines ---
const receivableEngine = read('src/lib/receivableReconciliation.ts');
const aging = read('src/services/agingBuckets.ts');
assert.ok(receivableEngine.includes('export function reconcileReceivables'), 'canonical receivable engine');
assert.ok(aging.includes('buildAgingBuckets') || aging.includes('export function buildAgingBuckets'), 'canonical aging engine');

const reportPanels = read('src/components/ReportEnginePanels.tsx');
const financeWs = read('src/components/FinanceWorkspace.tsx');
const reportsWs = read('src/components/ReportsWorkspace.tsx');
const customer360 = read('src/components/Customer360.tsx');

assert.ok(reportPanels.includes('reconcileReceivables'), 'report 7 must use canonical receivable engine');
assert.ok(reportPanels.includes('buildAgingBuckets'), 'report 7 must use canonical aging');
assert.ok(reportsWs.includes('reportHubState') && reportsWs.includes('readReportCollections'), 'active ReportsWorkspace uses the permission-scoped DataPort read model');
assert.ok(!/function\s+reconcileReceivables\s*\(/.test(reportPanels), 'panels must not redefine reconcileReceivables');

// --- Invoice ↔ payment linkage: allocation is the join path ---
assert.ok(receivableEngine.includes('paymentAllocations') || receivableEngine.includes('allocation'), 'allocations participate in receivable truth');
assert.ok(reportPanels.includes('paymentAllocations') || reportsWs.includes('portPaymentAllocations') || reportsWs.includes('paymentAllocations'), 'reports consume allocations');

// --- Returns must require financial confirmation (no silent inclusion) ---
assert.ok(reportPanels.includes('financialDocumentConfirmed'), 'returns analytics gate on financial confirmation');

// --- Metric registry is the KPI catalog (no parallel hard-coded targets in report UI) ---
const registry = read('src/lib/metricRegistry.ts');
assert.ok(registry.includes('AR_OUTSTANDING') || registry.includes('code:'), 'metricRegistry present');
assert.doesNotMatch(reportsWs, /1500000000/, 'no hard-coded 1.5B target in reports workspace');
assert.ok(reportPanels.includes('state.salesTargets') || reportPanels.includes('salesTargets'), 'sales targets from state/config not hard-coded amount');

// --- DataPort path for reports (28.10) ---
assert.ok(reportsWs.includes('readReportCollections') && reportsWs.includes('portFromAppState'), 'ReportsWorkspace on DataPort');

// --- Source status vocabulary surfaces ---
const trust = read('src/lib/dataTrust.ts');
for (const s of ['LIVE', 'LOCAL', 'DEMO', 'PARTIAL', 'STALE', 'UNAVAILABLE']) {
  assert.ok(trust.includes(`'${s}'`), `status ${s}`);
}

// --- Customer risk / credit uses shared policy helpers when present ---
const orgPolicy = read('src/lib/orgPolicy.ts');
assert.ok(orgPolicy.includes('getDefaultCreditLimit'), 'canonical credit limit policy');
assert.ok(customer360.includes('getDefaultCreditLimit') || customer360.includes('creditLimit'), 'Customer360 respects credit fields');

console.log('crossModuleConsistencyContracts: PASS');
