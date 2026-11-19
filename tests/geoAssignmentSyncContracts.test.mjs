import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const source = readFileSync(new URL('../src/components/GeoIntelligenceWorkspace.tsx', import.meta.url), 'utf8');
test('zone assignments use stable entity identifiers and durable queue payloads', () => {
  assert.match(source, /const expiredIds = new Set\(expiredAssignments\.map\(item => item\.id\)\)/);
  assert.match(source, /queueGeoMutation\('zoneAssignments', assignment\.id, \{ \.\.\.assignment, effectiveTo: now \}\)/);
  assert.match(source, /queueGeoMutation\('zoneAssignments', assignment\.id, assignment, 'CREATE'\)/);
  assert.match(source, /if \(!newAssignments\.length && !expiredAssignments\.length\)/);
});
