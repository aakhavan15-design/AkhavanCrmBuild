import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestRoutePolygonFromCustomers,inspectRouteCoordinates } from '../src/lib/geoRouteAnalysis.ts';
import { inspectErpRouteMembership } from '../src/lib/erpRouteGeoView.ts';

const cluster=Array.from({length:10},(_,i)=>({
  id:'C'+i,name:'مشتری '+i,latitude:31.88+(i%3)*.003,longitude:54.36+Math.floor(i/3)*.003,
  externalId:'ERP-C'+i,tenantId:'TENANT1',sourceSystemCode:'ERP1'
}));
const outlier={id:'CX',name:'خارج از مسیر',latitude:33.1,longitude:56.4,
  externalId:'ERP-CX',tenantId:'TENANT1',sourceSystemCode:'ERP1'};
test('80-percent suggestion excludes far-away location without altering route membership',()=>{
 const r=suggestRoutePolygonFromCustomers([...cluster,outlier]);
 assert.equal(r.status,'READY');
 assert.ok(r.actualCoveragePercent>=80);
 assert.ok(r.excluded.some(c=>c.id==='CX'));
 const anomalies=inspectRouteCoordinates([...cluster,outlier],[
  {id:'V1',customerId:'C1',latitude:31.885,longitude:54.366},
  {id:'V2',customerId:'C2',latitude:33.1,longitude:56.4},
  {id:'V3',customerId:'C3'}
 ],r.geometry);
 assert.ok(anomalies.customersOutside.some(c=>c.id==='CX'));
 assert.ok(anomalies.visitsOutside.some(v=>v.id==='V2'));
 assert.ok(anomalies.unknownVisits.includes('V3'));
});
test('missing coordinates are explicit and fewer than 3 points cannot generate a fake polygon',()=>{
 const r=suggestRoutePolygonFromCustomers([{id:'C1',name:'الف'},cluster[0]]);
 assert.equal(r.geometry,null);
 assert.equal(r.status,'INSUFFICIENT_COORDINATES');
 assert.equal(r.missingCoordinates.length,1);
});
test('one customer can belong to several routes; one route can have many reps and a supervisor',()=>{
 const route={externalId:'R1',routeCode:'ONE',routeName:'مسیر یک',tenantId:'TENANT1',sourceSystemCode:'ERP1'};
 const memberships=[{externalId:'M1',tenantId:'TENANT1',sourceSystemCode:'ERP1',routeExternalId:'R1',externalCustomerId:'ERP-C1',subRouteCode:'SUB1',effectiveFrom:'2026-01-01'},
  {externalId:'M2',tenantId:'TENANT1',sourceSystemCode:'ERP1',routeExternalId:'R1',externalCustomerId:'ERP-C2',subRouteCode:'SUB2',effectiveFrom:'2026-01-01'},
  {externalId:'M3',tenantId:'TENANT1',sourceSystemCode:'ERP1',routeExternalId:'R2',externalCustomerId:'ERP-C1',subRouteCode:'SUB3',effectiveFrom:'2026-01-01'}];
 const staff=['REP-A','REP-B','SUP-C'].map((id,i)=>({externalId:'X'+i,tenantId:'TENANT1',sourceSystemCode:'ERP1',routeExternalId:'R1',externalStaffId:id,staffRoleCode:i===2?'SUPERVISOR':'SALES_REP',effectiveFrom:'2026-01-01'}));
 const r=inspectErpRouteMembership(route,cluster,memberships,staff,'2026-11-22');
 assert.equal(r.customers.length,2);
 assert.deepEqual(r.sellerIds,['REP-A','REP-B']);
 assert.deepEqual(r.supervisorIds,['SUP-C']);
 assert.deepEqual(r.subRoutes.map(x=>x.code),['SUB1','SUB2']);
});
test('external customer cross-tenant collisions do not leak assignments',()=>{
 const route={externalId:'R1',routeCode:'ONE',routeName:'مسیر یک',tenantId:'TENANT1',sourceSystemCode:'ERP1'};
 const members=[{externalId:'M1',tenantId:'TENANT1',sourceSystemCode:'ERP1',routeExternalId:'R1',externalCustomerId:'ERP-C1',effectiveFrom:'2026-01-01'}];
 const r=inspectErpRouteMembership(route,[{...cluster[1],tenantId:'TENANT2'}],members,[],'2026-11-22');
 assert.equal(r.customers.length,0);assert.equal(r.unmappedCount,1);
});
