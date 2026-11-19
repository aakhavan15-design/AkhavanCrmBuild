import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const finance = read('../src/components/FinanceWorkspace.tsx');
const customers = read('../src/components/CustomersWorkspace.tsx');
const quotes = read('../src/components/QuotesWorkspace.tsx');
const reports = read('../src/components/ReportsWorkspace.tsx');
const dashboard = read('../src/components/DashboardWorkspace.tsx');
const groups = read('../src/components/GroupsWorkspace.tsx');
const calendar = read('../src/components/CalendarWorkspace.tsx');
const css = read('../src/index.css');
const theme = read('../src/theme/colors.css');
for (const [name, source, cls] of [
  ['finance', finance, 'crm-page-finance'], ['customers', customers, 'crm-page-customers'],
  ['quotes', quotes, 'crm-page-quotes'], ['reports', reports, 'crm-page-reports'],
  ['dashboard', dashboard, 'crm-page-dashboard'], ['chat', groups, 'crm-page-groups'],
  ['calendar', calendar, 'crm-page-calendar'],
]) assert.ok(source.includes(cls), `${name} workspace root class missing`);
// Finance views are regrouped into areas (src/lib/workspaceHierarchy.ts); the in-page switcher lists only the current area's views.
assert.match(finance, /FINANCE_AREAS/);
assert.match(finance, /useTabParam<FinanceView>/);
assert.match(finance, /activeArea\.views\.length > 1/);
assert.doesNotMatch(finance, /<optgroup/);
assert.match(css, /env\(safe-area-inset-bottom/);
assert.match(css, /\.crm-page-finance \.crm-kpi-grid/);
assert.match(css, /\.crm-page-calendar/);
assert.match(theme, /--c-primary: var\(--c-cobalt\)/);
assert.match(theme, /--c-forest: #059669/);
assert.match(reports, /crm-page-reports/);
console.log('primaryWorkspaceRedesignContracts: PASS (18 assertions)');
