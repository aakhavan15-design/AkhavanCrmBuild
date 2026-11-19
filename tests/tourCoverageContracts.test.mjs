import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ALL_TOUR_STEPS, TOUR_MODULES, moduleForPath, routeForModule, getStepsForModuleAndRole } from '../src/services/tourEngine.ts';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const readTree = dir => fs.readdirSync(new URL('../' + dir, import.meta.url), { withFileTypes: true }).flatMap(entry => {
  const relative = `${dir}/${entry.name}`;
  return entry.isDirectory() ? readTree(relative) : /\.tsx?$/.test(entry.name) ? [read(relative)] : [];
}).join('\n');

test('every route in App.tsx has a tour module with at least one step', () => {
  const app = read('src/App.tsx');
  const paths = [...app.matchAll(/<Route path="\/([a-z_\-]*)(?:\/\*)?"/g)].map(m => m[1]);
  assert.ok(paths.length >= 20, 'routes found: ' + paths.length);
  for (const seg of paths) {
    const mod = moduleForPath('/' + seg);
    assert.notEqual(mod, 'global', 'route /' + seg + ' has no tour module');
    assert.ok(getStepsForModuleAndRole(mod, 'مدیر سیستم').length >= 1, 'no steps for ' + mod);
    assert.ok(routeForModule(mod), 'no route for ' + mod);
  }
});

test('every module has steps and every step module is registered', () => {
  const ids = new Set(TOUR_MODULES.map(m => m.id));
  for (const m of ids) assert.ok(ALL_TOUR_STEPS.some(s => s.module === m), 'module without steps: ' + m);
  for (const s of ALL_TOUR_STEPS) assert.ok(ids.has(s.module), 'unregistered module: ' + s.module);
  assert.equal(new Set(ALL_TOUR_STEPS.map(s => s.id)).size, ALL_TOUR_STEPS.length, 'step ids must be unique');
});

test('tour target selectors resolve to real DOM ids (or fall back to #tour-page)', () => {
  const dom = readTree('src/components') + readTree('src/workspaces');
  for (const s of ALL_TOUR_STEPS) {
    if (!s.targetSelector) continue;
    const parts = s.targetSelector.split(',').map(x => x.trim());
    const ok = parts.some(p => p.startsWith('#') && dom.includes('id="' + p.slice(1) + '"'));
    assert.ok(ok, s.id + ' has no resolvable target: ' + s.targetSelector);
  }
});

test('tour is mounted in App, has a header help button, and ThemeToggle is gone', () => {
  assert.match(read('src/App.tsx'), /<InteractiveTour\b/);
  assert.match(read('src/components/Layout.tsx'), /triggerTourMenu\(\)/);
  assert.equal(fs.existsSync(new URL('../src/components/ThemeToggle.tsx', import.meta.url)), false);
});


test('reports tour uses an actual mounted reports workspace, not an unmounted legacy panel', () => {
  const reports = read('src/components/ReportsWorkspace.tsx');
  assert.match(reports, /<ReportsHub/);
  const reportSteps = ALL_TOUR_STEPS.filter(step => step.module === 'reports');
  assert.ok(reportSteps.length >= 1);
  for (const step of reportSteps) assert.notEqual(step.targetSelector?.trim(), '#tour-page');
});

test('tour target resolution follows late workspace changes and respects reduced motion', () => {
  const source = read('src/components/InteractiveTour.tsx');
  assert.match(source, /new MutationObserver\(scheduleUpdate\)/, 'late-mounted workspace targets must be re-resolved');
  assert.match(source, /mutationObserver\.disconnect\(\)/, 'mutation observer must be cleaned up');
  assert.match(source, /new ResizeObserver\(scheduleUpdate\)/, 'workspace resizing must reposition the spotlight');
  assert.match(source, /resizeObserver\?\.disconnect\(\)/, 'resize observer must be cleaned up');
  assert.match(source, /prefers-reduced-motion:\s*reduce/, 'automatic target scrolling must respect reduced motion');
  assert.match(source, /if \(part === '#tour-page'\) continue/, 'the full workspace must never be used as a fake spotlight target');
  assert.match(source, /'\[data-tour-actions\]', '\[data-tour-heading\]'/, 'module-specific steps must fall back to a real page heading after action controls');
});


test('every routed workspace exposes a semantic page heading or shared toolbar target', () => {
  const targets = [
    ['home', 'src/components/HomeWorkspace.tsx'],
    ['dashboard', 'src/components/DashboardWorkspace.tsx'],
    ['command', 'src/components/CommandCenterWorkspace.tsx'],
    ['accounts', 'src/components/CustomersWorkspace.tsx'],
    ['leads', 'src/components/LeadsWorkspace.tsx'],
    ['opportunities', 'src/components/NegotiationsWorkspace.tsx'],
    ['quotes', 'src/components/QuotesWorkspace.tsx'],
    ['activities', 'src/components/ActivitiesWorkspace.tsx'],
    ['tasks', 'src/components/TasksWorkspace.tsx'],
    ['finance', 'src/components/FinanceWorkspace.tsx'],
    ['operations', 'src/components/OperationsControlWorkspace.tsx'],
    ['geo-intelligence', 'src/components/GeoIntelligenceWorkspace.tsx'],
    ['cases', 'src/components/EnterpriseWorkspaces.tsx'],
    ['marketing', 'src/components/EnterpriseWorkspaces.tsx'],
    ['knowledge', 'src/components/EnterpriseWorkspaces.tsx'],
    ['internal_automation', 'src/components/InternalAutomationWorkspace.tsx'],
    ['groups', 'src/components/GroupsWorkspace.tsx'],
    ['calendar', 'src/components/CalendarWorkspace.tsx'],
    ['reports', 'src/components/ReportsWorkspace.tsx'],
    ['settings', 'src/components/SettingsWorkspace.tsx'],
    ['sync-center', 'src/components/SyncCenterWorkspace.tsx'],
    ['onboarding', 'src/components/onboarding/OnboardingAdminWorkspace.tsx'],
    ['personnel-file', 'src/components/onboarding/PersonnelFilePage.tsx'],
    ['profile', 'src/workspaces/ProfileWorkspace.tsx'],
    ['workspace', 'src/components/ModuleLandingWorkspace.tsx'],
  ];
  const sharedToolbar = read('src/components/ui/PageToolbar.tsx');
  assert.match(sharedToolbar, /data-tour-heading/, 'shared PageToolbar must expose its real title');
  assert.match(sharedToolbar, /data-tour-actions/, 'shared PageToolbar must expose its action controls');
  for (const [module, file] of targets) {
    const source = read(file);
    const hasExplicitAnchor = source.includes('data-tour-heading') || source.includes('<PageToolbar');
    assert.ok(hasExplicitAnchor, `${module} has no semantic tour anchor in ${file}`);
    assert.ok(TOUR_MODULES.some(item => item.id === module), `${module} is not registered in tour engine`);
  }
  assert.match(read('src/components/Layout.tsx'), /id="ttl"/, 'global shell keeps its stable header anchor');
});


test('the seven module selectors resolve to real workspace elements, not only the page fallback', () => {
  const anchors = {
    'dash-kpis': 'src/components/DashboardWorkspace.tsx',
    'acc-metrics': 'src/components/CustomersWorkspace.tsx',
    'acc-dock': 'src/components/Customer360.tsx',
    'quote-actions': 'src/components/QuotesWorkspace.tsx',
    'fin-tabs': 'src/components/FinanceWorkspace.tsx',
    'ops-summary': 'src/components/OperationsControlWorkspace.tsx',
    'task-filters': 'src/components/TasksWorkspace.tsx',
  };
  for (const [id, file] of Object.entries(anchors)) {
    assert.ok(read(file).includes(`id="${id}"`), `missing real target #${id} in ${file}`);
    assert.ok(ALL_TOUR_STEPS.some(step => step.targetSelector?.split(',').map(part => part.trim()).includes(`#${id}`)), `no tour step targets #${id}`);
  }
});


test('tour contains 27 unique modules and no step relies only on generic page fallback', () => {
  assert.equal(TOUR_MODULES.length, 27); // 26 original modules + /audit
  assert.equal(new Set(TOUR_MODULES.map(m => m.id)).size, 27);
  for (const module of TOUR_MODULES) assert.ok(ALL_TOUR_STEPS.some(step => step.module === module.id), `missing steps for ${module.id}`);
  for (const step of ALL_TOUR_STEPS) assert.notEqual(step.targetSelector?.trim(), '#tour-page', `generic target only: ${step.id}`);
});
