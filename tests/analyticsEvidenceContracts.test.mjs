import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/components/ReportsHub.tsx', import.meta.url), 'utf8');
test('cleared receipt total and method distribution use identical payment status', () => {
  assert.match(src, /const totalPaid = payments\.filter\(p => p\.status === 'CLEARED'\)/);
  assert.match(src, /payments\.filter\(p => p\.status === 'CLEARED'\)\.forEach\(p =>/);
  assert.match(src, /p\.amount != null && Number\.isFinite/);
  assert.match(src, /hasPaymentData: payments\.some\(p => p\.status === 'CLEARED'/);
});
test('non-accounting delivery, visit, route and inventory tiles do not relabel sales charts',()=>{
  const ids=['routes','visit','delivery','discrepancy','catalog','proposals','team-activity'];
  for(const id of ids) assert.match(src,new RegExp("(?:'"+id+"'|"+id+"): \\{path:"));
  assert.match(src,/specializedDestination \? \(/);
  assert.match(src,/navigate\(specializedDestination\.path\)/);
});
