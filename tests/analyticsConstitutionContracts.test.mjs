import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const migration = read('database/sqlserver/v1/024_analytics_calculation_lineage.sql');
const constitution = read('docs/CONSTITUTION_FA.md');

test('2026 development constitution covers source independence and truth labels', () => {
  for (const token of ['DEMO', 'LIVE', 'PARTIAL', 'STALE', 'UNAVAILABLE', 'NULL', 'Provider', 'Cross-filter', 'Drill-down', 'RBAC']) assert.ok(constitution.includes(token), `missing ${token}`);
});

test('calculation history migration is additive and idempotent', () => {
  for (const name of ['analytics.CalculationRun', 'analytics.CalculationRunSource', 'analytics.MetricSnapshot']) {
    assert.match(migration, new RegExp(`OBJECT_ID\\(N'${name.replace('.', '\\.')}',N'U'\\) IS NULL`));
    assert.equal((migration.match(new RegExp(`CREATE TABLE ${name.replace('.', '\\.')}\\b`, 'g')) || []).length, 1);
  }
  assert.match(migration, /ALTER TABLE analytics\.KpiDefinition ADD ConfigurationJson/);
  assert.match(migration, /COL_LENGTH\(N'analytics\.KpiDefinition',N'ConfigurationJson'\) IS NULL/);
});

test('calculation snapshots preserve algorithm, formula, as-of, lineage and demo status', () => {
  for (const token of ['AlgorithmVersion','FormulaVersion','AsOfUtc','ParametersJson','QualitySummaryJson','InputFingerprint','SourceStatusCode','IsDemo','WatermarkUtc','CoveragePct','DimensionHash']) assert.ok(migration.includes(token), `missing ${token}`);
});

test('new analytics tables are tenant-scoped and attached to the existing RLS policy', () => {
  for (const name of ['CalculationRun','CalculationRunSource','MetricSnapshot']) {
    assert.match(migration, new RegExp(`ON analytics\\.${name}`));
  }
  assert.match(migration, /security\.TenantIsolationPolicy/);
  assert.doesNotMatch(migration, /CREATE SECURITY POLICY/i);
});
