import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const panel = read('src/components/ReportEnginePanels.tsx');
const workspace = read('src/components/ReportsWorkspace.tsx');
const hub = read('src/components/ReportsHub.tsx');

for (const name of ['lifecycleSegments', 'rfm', 'cohortRetention', 'topPercentShare', 'visitFunnel', 'deliveryPerformance', 'returnsAnalytics']) {
  assert.ok(panel.includes(name), `missing shared analytics engine: ${name}`);
}
assert.ok(workspace.includes('<ReportsHub'), 'the active report workspace must render ReportsHub');
assert.ok(workspace.includes('reportHubState'), 'report cards must receive the scoped data projection');
assert.ok(hub.includes('NeoHeatmapChart'), 'Neo heatmap chart must remain in the active reports redesign');
assert.equal((hub.match(/num: \d+/g) || []).length, 11, 'active report catalogue must retain 11 definitions');
assert.ok(hub.includes('[' + "'sales', 'distribution', 'team', 'inventory', 'finance', 'receivables'" + ']'), 'report domains remain grouped rather than 11 horizontal tabs');
assert.ok(panel.includes('r.financialDocumentConfirmed === true') && panel.includes('periodReturns'), 'unconfirmed or out-of-period returns must not enter financial return analytics');
assert.ok(panel.includes('promisedAt:r.promisedAt||r.expectedDeliveryAt'), 'delivery promise time must be sourced from explicit delivery event fields');
assert.ok(panel.includes("growth:null"), 'customer growth must remain unclassified without a comparison period');
assert.ok(panel.includes('reconcileReceivables') && panel.includes('buildAgingBuckets'), 'the retained finance analytics panel must reuse canonical receivable and aging engines');
assert.ok(panel.includes('state.salesTargets') && !panel.includes('1500000000'), 'sales target must come from configured targets');
assert.ok(panel.includes('returns.amountRate == null') && !panel.includes('۲.۴٪'), 'return rate must be derived, never hard-coded');
console.log('reportEngineUiContracts: PASS (active ReportsHub + retained analytics panel contracts)');
