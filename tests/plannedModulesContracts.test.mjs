import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const landing = read('src/lib/moduleLanding.ts');
const planned = read('src/lib/plannedModules.ts');
const app = read('src/App.tsx');
const page = read('src/components/PlannedModulePage.tsx');
const component = read('src/components/ModuleLandingWorkspace.tsx');

const plannedTileIds = [...landing.matchAll(/tile\('([^']+)',\s*'[^']+',\s*'[^']+',\s*'\/planned\?item=([^']+)'/g)];
const catalogIds = [...planned.matchAll(/\{ id: "([^"]+)", title:/g)].map(m => m[1]);

test('every planned unit from the organisation spec has a menu tile and a catalogue entry', () => {
  assert.equal(plannedTileIds.length, 27, 'expected 27 planned tiles');
  for (const [, id, item] of plannedTileIds) assert.equal(id, item, `tile id and item must match: ${id}`);
  assert.deepEqual([...new Set(plannedTileIds.map(m => m[1]))].sort(), [...catalogIds].sort());
  assert.equal(new Set(catalogIds).size, catalogIds.length);
});

test('units are placed under the correct workspace groups', () => {
  const group = title => landing.split(`{ title: '${title}`)[1]?.split('] },')[0] || '';
  for (const id of ['hr-recruitment', 'hr-applicants', 'hr-payroll', 'hr-payslip', 'hr-training', 'hr-evaluation']) assert.ok(group('منابع انسانی و آموزش').includes(`'${id}'`), id);
  for (const id of ['legal-contracts', 'legal-archive', 'legal-renewal', 'legal-cases', 'legal-expiry']) assert.ok(group('حقوقی و قراردادها').includes(`'${id}'`), id);
  for (const id of ['fin-commission', 'fin-invoice-discount', 'fin-invoice-profit', 'fin-dispatch-profit', 'fin-cash-discount', 'fin-targets']) assert.ok(group('پورسانت، تخفیف و سود').includes(`'${id}'`), id);
  for (const id of ['dist-route-planning', 'dist-settlement-sales', 'dist-operations']) assert.ok(group('برنامه‌ریزی مسیر و عملیات توزیع').includes(`'${id}'`), id);
});

test('planned pages never claim completion or show fabricated data', () => {
  assert.match(app, /<Route path="\/planned" element={<PlannedModulePage state={state} \/>} \/>/);
  assert.match(page, /در دست تکمیل — ساخته‌نشده/);
  assert.match(page, /canAccess\(item\.perm\)/);
  assert.match(component, /isPlannedTile\(item\)/);
  assert.doesNotMatch(planned, /status:\s*'(DONE|COMPLETE|LIVE)'/);
  const deliverables = planned.split('PLANNED_DELIVERABLES')[1].split('];')[0];
  assert.ok((deliverables.match(/'/g) || []).length >= 14, 'all delivery items from the spec must be listed');
});

test('planned entries reuse existing routes for related sections', () => {
  const routes = new Set([...app.matchAll(/<Route path="([^"]+)"/g)].map(m => m[1].replace(/\/\*$/, '')));
  for (const [, path] of planned.matchAll(/existing: \{ label: "[^"]+", path: "([^"]+)"/g)) assert.ok(routes.has(path.split('?')[0]), `missing route for ${path}`);
});
