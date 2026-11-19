import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL('../'+p, import.meta.url),'utf8');
const app=read('src/App.tsx'), nav=read('src/lib/navigation.ts'), catalogue=read('src/lib/moduleLanding.ts'), component=read('src/components/ModuleLandingWorkspace.tsx');
const ids=[...catalogue.matchAll(/^    id: '([a-z-]+)'/gm)].map(m=>m[1]);
const expected=['home','master','sales','commerce','procurement','finance','hr','organization'];
test('eight approved workspace destinations and shared landing',()=>{
 assert.deepEqual(ids,expected);
 assert.match(app, /<Route path="\/workspace\/:moduleId" element={<ModuleLandingWorkspace state={state} \/>} \/>/);
 assert.match(component,/getModuleLanding\(moduleId\)/);
 assert.match(component,/canAccess\(item\.perm\)/);
});
test('navigation derives from one catalog; no independent reports section',()=>{
 assert.match(nav,/NAV_SECTIONS: NavSection\[\] = MODULE_LANDINGS\.map/);
 assert.match(nav,/path: `\/workspace\/\$\{mod\.id\}`/);
 assert.equal(ids.includes('reports'),false);
 assert.match(app,/<Route path="\/reports"/);
});
test('old workspace deep links resolve to approved owners',()=>{
 for(const [oldId,newId] of [['customers','sales'],['work','home'],['reports','sales']]){
   assert.match(catalogue,new RegExp(`${oldId}: '${newId}'`));
 }
 assert.match(nav,/resolveModuleLandingId\(seg\)/);
});
test('landing tile paths refer to registered routes and preserve ERP boundaries',()=>{
 const routePaths=new Set([...app.matchAll(/<Route path="([^"]+)"/g)].map(m=>m[1].replace(/\/\*$/,'')));
 const tiles=[...catalogue.matchAll(/tile\('[^']+',\s*'[^']+',\s*'[^']+',\s*'([^']+)'/g)].map(m=>m[1]);
 assert.ok(tiles.length>=35);
 for(const path of tiles) assert.ok(routePaths.has(path.split('?')[0]),`missing route ${path}`);
 assert.match(catalogue,/tile\('quotes',[^\n]*'\/quotes'/);
 assert.match(catalogue,/tile\('orders',[^\n]*'\/operations\?tab=orders'/);
 assert.match(catalogue,/tile\('invoices',[^\n]*'\/finance\?tab=invoices'/);
});
test('compact accessible RTL landing retains RBAC, search, icon grid and disclosure',()=>{
 assert.match(component,/dir="rtl"/);
 assert.match(component,/aria-label=\{`جست‌وجو در \$\{definition\.title\}`\}/);
 assert.match(component,/grid-cols-4/);
 assert.match(component,/focus-visible:ring-2/);
 assert.match(component,/visibleGroups/);
 assert.match(component,/aria-label="پاک کردن جست‌وجو"/);
 assert.match(component,/expandedGroups/);
 assert.match(component,/role="status"/);
});
