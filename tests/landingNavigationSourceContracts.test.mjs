import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const catalog=read('src/lib/moduleLanding.ts');
const planned=read('src/lib/plannedModules.ts');
const app=read('src/App.tsx');
const landing=read('src/components/ModuleLandingWorkspace.tsx');
const navigation=read('src/lib/navigation.ts');

function tiles(){
 return [...catalog.matchAll(/tile\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'/g)]
  .map(([,id,label,description,path,perm])=>({id,label,description,path,perm}));
}
const appRoutes=[...app.matchAll(/<Route\s+path="([^"]+)"/g)].map(x=>x[1]);
const plannedIds=new Set([...planned.matchAll(/\{\s*id:\s*"([^"]+)"/g)].map(x=>x[1]));
const reachable=(path)=>{
 const pathname=path.split('?')[0];
 return appRoutes.some(route=>route!=='*'&&(
   route===pathname||
   (route.endsWith('/*')&&(pathname===route.slice(0,-2)||pathname.startsWith(route.slice(0,-1))))||
   (route==='/workspace/:moduleId'&&/^\/workspace\/[^/]+$/.test(pathname))
 ));
};

test('all eight canonical landings own globally unique feature identities',()=>{
 const definitions=[...catalog.matchAll(/^    id: '(home|master|sales|commerce|procurement|finance|hr|organization)',/gm)].map(x=>x[1]);
 assert.deepEqual(definitions,['home','master','sales','commerce','procurement','finance','hr','organization']);
 const entries=tiles();
 assert.ok(entries.length>=90,'Landing registry unexpectedly shrank');
 assert.equal(entries.length,new Set(entries.map(x=>x.id)).size,'Duplicate feature ID would corrupt cross-module references');
 assert.ok(entries.every(x=>x.path.startsWith('/')&&x.perm&&x.label));
});
test('each declared capability has an actual React Router destination, not wildcard fallback',()=>{
 const missing=tiles().filter(x=>!reachable(x.path));
 assert.deepEqual(missing,[]);
});
test('each unfinished tile resolves to a registered planned module, never a nonexistent page',()=>{
 const unresolved=tiles().filter(x=>x.path.startsWith('/planned?item='))
   .filter(x=>!plannedIds.has(new URLSearchParams(x.path.split('?')[1]).get('item')||''));
 assert.deepEqual(unresolved,[]);
});
test('landing and navigation use the same role permission function and deny missing RBAC',()=>{
 assert.match(landing,/makeCanAccess\(new RBACService\(state\)\)/);
 assert.match(landing,/canAccess\(item\.perm\)/);
 assert.match(landing,/canAccess\(`module:\$\{definition\.id\}`\)/);
 assert.match(navigation,/if \(!rbac\) return ALWAYS_ALLOWED\.has\(perm\)/);
 assert.match(app,/<Route path="\/workspace\/:moduleId" element=\{<ModuleLandingWorkspace state=\{state\}/);
});
test('analytical report source is not claimed LIVE simply because a provider is configured',()=>{
 const report=read('src/components/ReportsWorkspace.tsx');
 assert.match(report,/engine\?\.hasSnapshot\(\) === true/);
 assert.match(report,/sync\.phase !== 'error'/);
 assert.doesNotMatch(report,/hasLiveSql:\s*true\s*,/);
 assert.match(report,/coaMirror: canViewFinance \?/);
 assert.match(report,/filter\(row => canOn\('finance','VIEW',scopeOf\(row\)\)\)/);
 assert.match(report,/salesTargets: \(state\.salesTargets \|\| \[\]\)\.filter\(row => canOn\('reports', 'VIEW', scopeOf\(row\)\)\)/);
});

test('finance analytics and user administration shortcuts respect destination RBAC',()=>{
 assert.match(catalog,/\/reports\?tab=finance', 'finance\.reports'/);
 assert.match(catalog,/\/reports\?tab=receivables', 'finance\.reports'/);
 assert.match(navigation,/'finance\.reports': r => r\.canAccessWorkspace\('finance'\) && r\.canAccessWorkspace\('reports'\)/);
 assert.match(catalog,/\/definitions\?tab=users', 'users'/);
 assert.match(catalog,/\/definitions\?tab=users&sub=permissions', 'users'/);
});


test('deep links in every landing point to implemented and recognized workspace tabs',()=>{
 const hierarchy=read('src/lib/workspaceHierarchy.ts');
 const operations=read('src/components/OperationsControlWorkspace.tsx');
 const onboarding=read('src/components/onboarding/OnboardingAdminWorkspace.tsx');
 const calendar=read('src/components/CalendarWorkspace.tsx');
 const reports=read('src/components/ReportsHub.tsx');
 const audits=read('src/components/AuditWorkspace.tsx');
 const viewSections={
  '/finance':hierarchy.slice(hierarchy.indexOf('export const FINANCE_AREAS'),hierarchy.indexOf('export const OPERATIONS_AREAS')),
  '/operations':operations.slice(operations.indexOf('const TABS:'),operations.indexOf('const money =')),
  '/definitions':hierarchy.slice(hierarchy.indexOf('export const DEFINITIONS_TABS'),hierarchy.indexOf('export const SETTINGS_USER_SUBS')),
  '/settings':hierarchy.slice(hierarchy.indexOf('export const SETTINGS_TABS'),hierarchy.indexOf('export function areaOf')),
  '/reports':reports.slice(reports.indexOf("['sales', 'distribution', 'team', 'inventory', 'finance', 'receivables']"),reports.indexOf("['sales', 'distribution', 'team', 'inventory', 'finance', 'receivables']")+100),
  '/onboarding':onboarding.slice(onboarding.indexOf('const TABS:'),onboarding.indexOf('const maskNid')),
  '/calendar':calendar.slice(calendar.indexOf('const calendarTabs'),calendar.indexOf('const calendarTabs')+105),
  '/audit':audits.slice(audits.indexOf('const MODULES:'),audits.indexOf('export function AuditWorkspace')),
 };
 const invalid=tiles().flatMap(tile=>{
  const [pathname,search]=tile.path.split('?');
  const params=new URLSearchParams(search||'');
  const selected=params.get('tab')||(pathname==='/audit'?params.get('module'):null);
  if(!selected)return [];
  const source=viewSections[pathname];
  if(!source)return [{tile:tile.id,reason:'No workspace tab catalogue for '+pathname}];
  const found=new RegExp('(?:\\b|[\\x27\\x22])'+selected+'(?:\\b|[\\x27\\x22])').test(source);
  return found?[]:[{tile:tile.id,reason:'Unknown destination tab '+selected+' in '+pathname}];
 });
 assert.deepEqual(invalid,[]);
});
