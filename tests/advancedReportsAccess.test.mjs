import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const workspace=read('src/components/ReportsWorkspace.tsx');
const engine=read('src/components/ReportEnginePanels.tsx');
const landing=read('src/lib/moduleLanding.ts');

test('both topic and 11-panel deep analytics remain inside the existing Reports workspace',()=>{
  assert.match(workspace,/<ReportsHub[\s\S]*?state=\{reportHubState\}/);
  assert.match(workspace,/<ReportEnginePanels[\s\S]*?state=\{reportHubState\}/);
  assert.match(workspace,/reportParams\.get\('view'\) === 'analytical'/);
  assert.match(landing,/advanced-analytics'[\s\S]*?'\/reports\?view=analytical'/);
  assert.match(engine,/const REPORTS = \[/);
});
test('deep-linkable analytical report IDs are validated and follow URL selection',()=>{
  assert.match(engine,/Number\.isInteger\(report\) && report >= 1 && report <= REPORTS\.length/);
  assert.match(engine,/next\.set\('report', String\(i \+ 1\)\)/);
});
test('advanced reports only receive scoped finance, people and geography collections',()=>{
  assert.match(workspace,/visibleInvoices=\{visibleInvoices\}/);
  assert.match(workspace,/visiblePayments=\{visiblePayments\}/);
  assert.match(workspace,/visibleAccounts=\{visibleAccounts\}/);
  assert.match(workspace,/geoZones: can\('geo', 'VIEW'\)/);
  assert.match(workspace,/zoneAssignments: can\('geo', 'VIEW'\)/);
  assert.match(workspace,/visibleAccounts\.some\(a => a\.id === accountId\)/);
});
