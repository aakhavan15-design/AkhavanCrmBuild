import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../src/lib/productZoneHeatmap.ts', import.meta.url), 'utf8');
const panel = fs.readFileSync(new URL('../src/components/ReportEnginePanels.tsx', import.meta.url), 'utf8');

test('heatmap helper has no hardcoded zone or city names', () => {
  for (const word of ['تهران', 'البرز', 'کرج', 'ALBORZ', 'SOUTH', 'NORTH', 'WEST']) assert.equal(src.includes(word), false, word);
});

test('panel uses helper and no local ZONES literal', () => {
  assert.ok(panel.includes("buildProductZoneHeatmap"));
  assert.equal(/const ZONES = \[/.test(panel), false);
  assert.ok(panel.includes('state.zoneAssignments') && panel.includes('state.geoZones'));
});

test('aggregation by active customer assignment, unassigned bucket, cancelled skipped', async () => {
  const { stripTypeScriptTypes } = await import('node:module');
  const js = stripTypeScriptTypes(src);
  const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  const r = mod.buildProductZoneHeatmap({
    products: [{ id: 'p1', name: 'کالا', costPrice: 60 }],
    zones: [{ id: 'z1', name: 'زون الف', status: 'ACTIVE' }, { id: 'z2', name: 'زون ب', status: 'ARCHIVED' }],
    assignments: [
      { entityType: 'CUSTOMER', entityId: 'c1', zoneId: 'z1' },
      { entityType: 'CUSTOMER', entityId: 'c2', zoneId: 'z1', effectiveTo: '2026-01-01' }
    ],
    orders: [
      { customerId: 'c1', status: 'OPEN', lines: [{ productId: 'p1', quantity: 1, unitPrice: 100 }] },
      { customerId: 'c2', status: 'OPEN', lines: [{ productId: 'p1', quantity: 1, unitPrice: 100 }] },
      { customerId: 'c1', status: 'CANCELLED', lines: [{ productId: 'p1', quantity: 5, unitPrice: 100 }] }
    ]
  });
  assert.deepEqual(r.zones, ['زون الف', mod.UNASSIGNED_ZONE_LABEL]);
  const row = r.rows[0].zoneStats;
  assert.equal(row['زون الف'].revenue, 100);
  assert.equal(row['زون الف'].margin, 40);
  assert.equal(row[mod.UNASSIGNED_ZONE_LABEL].count, 1);
});
