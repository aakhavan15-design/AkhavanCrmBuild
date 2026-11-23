import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectErpRouteMembership} from '../src/lib/erpRouteGeoView.ts';
const src=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('nullable ERP subroute remains an authorized route membership',()=>{
 const route={externalId:'R1',tenantId:'tenant-A',sourceSystemCode:'ERP',routeCode:'R1',routeName:'مسیر'};
 const customer={id:'c1',name:'مشتری',externalId:'x1',tenantId:'tenant-A',sourceSystemCode:'ERP'};
 const member={externalId:'m1',tenantId:'tenant-A',sourceSystemCode:'ERP',routeExternalId:'R1',externalCustomerId:'x1',subRouteCode:null,effectiveFrom:'2026-01-01'};
 const report=inspectErpRouteMembership(route,[customer],[member],[],'2026-11-23');
 assert.equal(report.customers.length,1);
 assert.equal(report.unmappedCount,0);
 assert.deepEqual(report.subRoutes,[]);
});
test('unauthorized route metrics are removed before map rendering',()=>{
 const map=src('src/components/RouteMapOverview.tsx');
 assert.match(map,/visibleMetricIds=metrics\.filter\(id=>id==='customerCount'\|\|permitted\.has\(id\)\)/);
 assert.doesNotMatch(map,/id==='customerCount'\|\|id===primary\|\|id!=='customerCount'/);
});
test('FIFO valuation error state does not access undefined result variable',()=>{
 const panel=src('src/components/finance/FifoInventoryPanel.tsx');
 const valuation=panel.split('export function FifoLayerDialog')[0];
 assert.match(valuation,/error \|\| !data \|\| data\.status === 'UNAVAILABLE'/);
 assert.doesNotMatch(valuation,/!result/);
});
