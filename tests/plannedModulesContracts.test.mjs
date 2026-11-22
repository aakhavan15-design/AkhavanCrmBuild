import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const landing = read('src/lib/moduleLanding.ts');
const planned = read('src/lib/plannedModules.ts');
const app = read('src/App.tsx');
const page = read('src/components/PlannedModulePage.tsx');
const component = read('src/components/ModuleLandingWorkspace.tsx');
const navigation = read('src/lib/navigation.ts');
const onboarding = read('src/components/onboarding/OnboardingAdminWorkspace.tsx');
const personnel = read('src/components/onboarding/PersonnelFilePage.tsx');
const profile = read('src/workspaces/ProfileWorkspace.tsx');
const finance = read('src/components/FinanceWorkspace.tsx');

const tiles = new Map([...landing.matchAll(/tile\('([^']+)',\s*'[^']+',\s*'[^']+',\s*'([^']+)'/g)].map(([, id, path]) => [id, path]));
const catalogIds = [...planned.matchAll(/\{ id: "([^"]+)", title:/g)].map(m => m[1]);
const legacyTiles = new Map([...page.matchAll(/'([^']+)': '([^']+)',/g)].map(([, id, tile]) => [id, tile]));

test('every planned unit from the organisation spec has a menu tile and a catalogue entry', () => {
  assert.equal(catalogIds.length, 27);
  assert.equal(new Set(catalogIds).size, 27);
  for (const id of catalogIds) assert.ok(tiles.has(legacyTiles.get(id) ?? id), `missing menu tile for ${id}`);
  for (const [id, path] of tiles) {
    if (path.startsWith('/planned')) {
      assert.ok(catalogIds.includes(id), `missing requirements for ${id}`);
      assert.equal(path, `/planned?item=${id}`);
    }
  }
});

test('units are placed under the correct workspace groups', () => {
  const group = title => landing.split(`title: '${title}',\n        tiles: [`)[1]?.split('],')[0] || '';
  assert.ok(group('جذب و پرسنل').includes("'hr-recruitment'"));
  for (const id of ['hr-payroll', 'hr-payslip']) assert.ok(group('حقوق و دستمزد').includes(`'${id}'`), id);
  for (const id of ['hr-training', 'hr-evaluation']) assert.ok(group('آموزش و رشد').includes(`'${id}'`), id);
  for (const id of ['legal-contracts', 'legal-archive', 'legal-renewal', 'legal-cases', 'legal-expiry']) assert.ok(group('حقوقی و قراردادها').includes(`'${id}'`), id);
  for (const id of ['fin-commission', 'fin-targets']) assert.ok(group('اهداف، گزارش و پایش فروش').includes(`'${id}'`), id);
  for (const id of ['fin-invoice-profit', 'fin-dispatch-profit', 'fin-cash-discount']) assert.ok(group('حسابداری، سودآوری و پایش').includes(`'${id}'`), id);
  assert.ok(group('سفارش و فاکتور').includes("'fin-invoice-discount'"));
  for (const id of ['dist-route-planning', 'dist-operations']) assert.ok(group('توزیع و مسیرها').includes(`'${id}'`), id);
  assert.ok(group('برگشتی و گزارش توزیع').includes("'dist-settlement-sales'"));
});

test('recruitment, learning and invoice margin use the real, permission-checked views', () => {
  assert.equal(legacyTiles.get('hr-applicants'), 'hr-recruitment');
  assert.equal(tiles.get('hr-recruitment'), '/onboarding?tab=apps');
  assert.equal(tiles.get('hr-training'), '/onboarding?tab=learning');
  assert.equal(tiles.get('fin-invoice-profit'), '/finance?tab=invoices&view=margin');
  assert.match(page, /canAccess\(tile\.perm\)[\s\S]+Navigate to=\{tile\.path\}/);
  assert.match(navigation, /'hr\.learningCatalog':[^\n]+hasPermission\('users\.manage'\) && r\.canSeeRecord\(\)/);
  assert.match(onboarding, /useTabParam\(visibleTabs, 'apps'\)/);
  assert.match(onboarding, /tab === 'learning'.*<LearningCatalogPanel/);
  assert.match(profile, /navigate\('\/personnel-file\?tab=learning'\)/);
  assert.match(personnel, /useTabParam\(STEPS\.map\(item => item\.id\), advanceLink \? 'payroll' : 'identity'\)/);
  assert.match(finance, /canReadInvoiceEvidence \? invoices\.find\(invoice => invoice\.id === costInvoiceId\)/);
  assert.match(finance, /<InvoiceFifoSheet[^\n]+invoiceId=\{costInvoice\.id\}/);
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
