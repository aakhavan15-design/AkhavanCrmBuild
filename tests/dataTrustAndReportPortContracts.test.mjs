import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const trust = read('src/lib/dataTrust.ts');
const ports = read('src/lib/dataPorts.ts');
const workspace = read('src/components/ReportsWorkspace.tsx');
const hub = read('src/components/ReportsHub.tsx');
const engine = read('src/components/ReportEnginePanels.tsx');

for (const status of ['LIVE', 'LOCAL', 'DEMO', 'PARTIAL', 'STALE', 'UNAVAILABLE']) {
  assert.ok(trust.includes(`'${status}'`) || trust.includes(`"${status}"`), `missing status ${status}`);
}
assert.ok(trust.includes('resolveDataSourceStatus'));
assert.ok(trust.includes('sourceStatusNote'));
assert.ok(trust.includes('DATA_SOURCE_STATUS_LABELS'));
assert.ok(trust.includes("DEMO: 'آزمایشی'"), 'DEMO status label must use the correct enum key');
assert.ok(ports.includes('readReportCollections'));
assert.ok(ports.includes('ReportCollections'));
assert.ok(ports.includes('portFromAppState'));
for (const key of ['invoices', 'payments', 'cheques', 'expenses', 'journalLines', 'coaMirror', 'visits', 'salesReturns', 'paymentAllocations', 'salesTargets']) {
  assert.ok(ports.includes(key), `ReportCollections must include ${key}`);
}
assert.ok(workspace.includes('portFromAppState'));
assert.ok(workspace.includes('readReportCollections'));
assert.ok(workspace.includes('resolveDataSourceStatus'));
assert.ok(workspace.includes('DATA_SOURCE_STATUS_LABELS'));
assert.ok(workspace.includes('sourceStatusNote'));
assert.ok(workspace.includes('reportHubState'), 'ReportsHub must receive a permission-scoped AppState view');
assert.ok(workspace.includes('visibleInvoices') && workspace.includes('visiblePayments') && workspace.includes('visibleCheques'));
assert.ok(workspace.includes('visibleActivities') && workspace.includes('visibleTasks'));
assert.ok(workspace.includes('paymentAllocations: (reportCols.paymentAllocations || []).filter'), 'payment allocations must be limited to visible invoices and payments');
assert.ok(hub.includes('NeoHeatmapChart'));
assert.ok(hub.includes('REPORT_DEFS'));
assert.equal((hub.match(/num: \d+/g) || []).length, 11, 'ReportsHub must define the 11 active report cards');
assert.ok(engine.includes('resolveDataSourceStatus'), 'the retained analytical panel keeps source-status disclosure');
console.log('dataTrustAndReportPortContracts: PASS');
