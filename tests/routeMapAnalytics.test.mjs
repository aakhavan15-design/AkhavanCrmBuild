import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRouteMapFilters} from '../server/routeMapAnalytics.mjs';

test('multi-select ERP filters retain distinct source codes and never interpolate into SQL',()=>{
 const f=parseRouteMapFilters({
  dateFrom:'2026-11-01',dateTo:'2026-11-22',
  salesRepIds:['SELLER-01','SELLER-02'],
  supervisorIds:['SUPER-1','SUPER-2'],
  supplierIds:['ZAMZAM','ZAMZAM','HYPE'],
  brandIds:['ZAMZAM'],customerCategoryIds:['WHOLESALE','COOP'],
  productIds:['001','002']
 });
 assert.deepEqual(f.repIds,['SELLER-01','SELLER-02']);
 assert.deepEqual(f.supervisorIds,['SUPER-1','SUPER-2']);
 assert.deepEqual(f.supplierIds,['ZAMZAM','HYPE']);
 assert.deepEqual(f.customerCategoryIds,['WHOLESALE','COOP']);
});
test('invalid report periods are rejected',()=>{
 assert.throws(()=>parseRouteMapFilters({dateFrom:'2026-11-30',dateTo:'2026-11-01'}));
 assert.throws(()=>parseRouteMapFilters({dateFrom:'2026-02-30',dateTo:'2026-03-01'}));
 assert.throws(()=>parseRouteMapFilters({dateFrom:'2024-01-01',dateTo:'2026-11-01'}));
});
test('invalid route ID and unreasonable filter cardinality fail closed',()=>{
 assert.throws(()=>parseRouteMapFilters({dateFrom:'2026-11-01',dateTo:'2026-11-22',routeIds:['some-random-id']}));
 assert.throws(()=>parseRouteMapFilters({dateFrom:'2026-11-01',dateTo:'2026-11-22',productIds:Array.from({length:41},(_,i)=>'P'+i)}));
});
