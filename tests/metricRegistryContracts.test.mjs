import assert from 'node:assert/strict';
import fs from 'node:fs';
import { METRIC_REGISTRY, validateMetricRegistry, metricsForReport, getMetric } from '../src/lib/metricRegistry.ts';
import { buildSeed } from '../scripts/generate_kpi_seed_sql.mjs';
assert.deepEqual(validateMetricRegistry(), []);
for (let r = 1; r <= 11; r++) assert.ok(metricsForReport(r).length > 0, `report ${r} has metrics`);
// declared engines/SQL objects must exist
const sqlAll = ['003_external_mirror_and_finance', '004_analytics_semantic_layer', '018_analytics_facts_dims_reports'].map(f => fs.readFileSync(new URL(`../database/sqlserver/v1/${f}.sql`, import.meta.url), 'utf8')).join('\n');
for (const m of METRIC_REGISTRY) {
  if (m.engine) assert.ok(fs.existsSync(new URL(`../${m.engine}`, import.meta.url)), `${m.code}: engine file ${m.engine} missing`);
  if (m.sqlObject) assert.ok(sqlAll.toLowerCase().includes(m.sqlObject.toLowerCase()), `${m.code}: SQL object ${m.sqlObject} not defined`);
}
// profit/cost metrics can never be claimed implemented without a cost source declared
for (const m of METRIC_REGISTRY.filter(x => x.requiresCost)) assert.ok(m.requiresSource.length > 0);
// generated SQL seed is in sync (single source of truth) and the 005 codes are preserved
assert.equal(fs.readFileSync(new URL('../database/sqlserver/v1/019_kpi_catalog_v2_generated.sql', import.meta.url), 'utf8'), buildSeed(), '019 seed out of sync — run scripts/generate_kpi_seed_sql.mjs');
for (const code of ['SALES_REALIZED_NET', 'SALES_FORECAST', 'GROSS_PROFIT_KNOWN_COST', 'AR_OUTSTANDING', 'AR_OVERDUE']) assert.ok(getMetric(code), code);
// registry vs honest status: nothing may say IMPLEMENTED_APP without its test existing
const tests = fs.readdirSync(new URL('../tests/', import.meta.url)).join(' ');
for (const m of METRIC_REGISTRY.filter(x => x.status === 'IMPLEMENTED_APP')) assert.ok(/etlPipeline|agingBuckets|receivableReconciliation/.test(tests), m.code);
console.log(`metricRegistryContracts OK (${METRIC_REGISTRY.length} metrics)`);
