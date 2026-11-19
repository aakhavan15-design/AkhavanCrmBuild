import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FINANCE_AREAS, OPERATIONS_AREAS, REPORT_VIEWS, SETTINGS_TABS, SETTINGS_USER_SUBS, AUTOMATION_TABS } from '../src/lib/workspaceHierarchy.ts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const nav = read('src/lib/navigation.ts');
const app = read('src/App.tsx');
const landing = read('src/lib/moduleLanding.ts');

const moduleIds = ['home', 'customers', 'sales', 'commerce', 'finance', 'work', 'reports', 'organization'];
const navIds = [...nav.matchAll(/\{ id: '([a-z_]+)', label: '[^']+', icon:/g)].map(m => m[1]);
const navPaths = [...nav.matchAll(/path: '(\/workspace\/[a-z-]+)'/g)].map(m => m[1]);
const routePaths = [...app.matchAll(/<Route path="([^"]+)"/g)].map(m => m[1].replace(/\/\*$/, ''));
const tilePaths = [...landing.matchAll(/tile\('[^']+',\s*'[^']+',\s*'[^']+',\s*'([^']+)'/g)].map(m => m[1]);

// 1) Exactly eight primary workspaces; each has one drawer/sidebar entry.
assert.deepEqual(navIds, moduleIds, 'primary navigation must expose exactly the eight approved module entries');
assert.equal(new Set(navIds).size, navIds.length, 'module navigation ids must be unique');
assert.deepEqual(navPaths, moduleIds.map(id => `/workspace/${id}`));
assert.match(app, /<Route path="\/workspace\/:moduleId" element={<ModuleLandingWorkspace state={state} \/>} \/>/);
assert.match(nav, /MODULE_ACCESS_PERMS\[moduleId\]/, 'module visibility must be based on accessible child destinations');

// 2) Every icon tile points to a real legacy Route; the landing route is the only new route.
assert.ok(tilePaths.length >= 35, `expected a complete landing catalogue, got ${tilePaths.length}`);
for (const target of tilePaths) {
  const base = target.split('?')[0];
  assert.ok(routePaths.includes(base), `tile path ${target} has no matching legacy Route`);
}

// 3) Existing specialist routes stay intact; only profile/personnel self-service are outside module tiles.
for (const route of ['/', '/command', '/dashboard', '/leads', '/accounts', '/opportunities', '/quotes', '/activities', '/tasks', '/finance', '/operations', '/geo-intelligence', '/cases', '/marketing', '/knowledge', '/internal_automation', '/groups', '/calendar', '/reports', '/settings', '/onboarding', '/personnel-file', '/profile']) {
  assert.ok(routePaths.includes(route), `legacy route ${route} must remain registered`);
}
assert.ok(tilePaths.some(p => p.startsWith('/finance?tab=invoices')), 'official invoice tile must reuse FinanceWorkspace');
assert.ok(tilePaths.some(p => p.startsWith('/operations?tab=orders')), 'ERP orders must remain separate from CPQ');
assert.ok(tilePaths.some(p => p === '/quotes'), 'CPQ remains its own CRM route');
assert.ok(!tilePaths.some(p => p.includes('purchasing')), 'a formal ERP purchasing module must not be advertised');
assert.ok(!tilePaths.some(p => p === '/profile' || p === '/personnel-file'), 'personal profile/file remain outside managerial module landing');
assert.match(read('src/workspaces/ProfileWorkspace.tsx'), /navigate\('\/personnel-file'\)/, 'personnel self-service must be reachable from the user profile');

// 4) Shared workspace views remain URL-driven and uniquely grouped in the canonical hierarchy.
const financeViews = FINANCE_AREAS.flatMap(a => a.views.map(v => v.id));
const opsViews = OPERATIONS_AREAS.flatMap(a => a.views.map(v => v.id));
assert.equal(new Set(financeViews).size, financeViews.length, 'finance view ownership must be unique');
assert.equal(new Set(opsViews).size, opsViews.length, 'operations view ownership must be unique');
assert.equal(financeViews.length, 9, 'finance keeps all 9 internal views');
assert.equal(opsViews.length, 11, 'operations keeps all 11 internal views');
for (const [file, ids] of [['FinanceWorkspace', financeViews], ['OperationsControlWorkspace', opsViews]]) {
  const source = read(`src/components/${file}.tsx`);
  assert.match(source, /useTabParam/);
  for (const id of ids) assert.ok(source.includes(`'${id}'`), `${file} must preserve internal view ${id}`);
}
const reports = read('src/components/ReportsWorkspace.tsx');
const reportsHub = read('src/components/ReportsHub.tsx');
assert.match(reportsHub, /useTabParam/);
for (const view of REPORT_VIEWS) assert.ok(reportsHub.includes(`'${view.id}'`), `report domain ${view.id} remains supported`);
const settings = read('src/components/SettingsWorkspace.tsx');
for (const tab of SETTINGS_TABS) assert.ok(settings.toLowerCase().includes(tab), `settings tab ${tab} remains supported`);
for (const sub of SETTINGS_USER_SUBS.filter(s => s !== 'list')) assert.ok(settings.includes(sub), `settings user subview ${sub} remains supported`);
const automation = read('src/components/InternalAutomationWorkspace.tsx');
for (const tab of AUTOMATION_TABS) assert.ok(automation.toLowerCase().includes(tab), `automation view ${tab} remains supported`);

// 5) Route ownership keeps secondary destinations in their single canonical module.
assert.match(nav, /moduleOwnerOfRoute/);
assert.match(nav, /tab === 'credit' \? 'finance'/);
assert.match(nav, /tab === 'policies' \? 'organization'/);
assert.match(nav, /tab === 'invoices' \? 'commerce' : 'finance'/);
assert.match(read('src/services/tourEngine.ts'), /if \(seg === 'workspace'\) return 'workspace'/);
console.log(`navigationHierarchyContracts: PASS (${moduleIds.length} module entries, ${tilePaths.length} tiles, ${routePaths.length} legacy routes preserved)`);
