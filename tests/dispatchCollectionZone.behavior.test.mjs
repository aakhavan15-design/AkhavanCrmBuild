import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDispatchCollectionZone} from '../src/lib/dispatchCollectionZone.mjs';
const p=(lat,lon)=>({latitude:lat,longitude:lon});
const stops=[
 {customerId:'a',point:p(31.890,54.360)},
 {customerId:'b',point:p(31.890,54.370)},
 {customerId:'c',point:p(31.900,54.370)},
 {customerId:'d',point:p(31.900,54.360)},
 {customerId:'e',point:null},
 {customerId:'f',point:null},
 {customerId:'g',point:null}];
const receivables=[
 {customerId:'inside',point:p(31.8905,54.3605),officialBalanceRials:100,name:'داخل'},
 {customerId:'outside',point:p(31.95,54.43),officialBalanceRials:200,name:'بیرون'},
 {customerId:'missing',point:null,officialBalanceRials:300,name:'بدون مختصات'}];
test('zone: 7 planned customers, 4 geocoded, conservative inside boundary and two-color marker categories',()=>{
 const x=buildDispatchCollectionZone({dispatchNumber:'H100',invoiceStops:stops,receivableCustomers:receivables,sourceComplete:true,radiusMeters:200});
 assert.equal(x.status,'AVAILABLE');assert.equal(x.totalStopCount,7);assert.equal(x.mappedStopCount,4);assert.equal(x.missingGeoStopCount,3);
 assert.equal(x.suggestedCount,1);assert.equal(x.markers.filter(m=>m.kind==='DISPATCH').length,4);
 assert.equal(x.markers.filter(m=>m.kind==='COLLECTION').length,1);
 assert.equal(x.rows.find(r=>r.customerId==='outside').included,false);
});
test('zone: manual outside and all receivables toggles never claim inside status',()=>{
 const opt={dispatchNumber:'H100',invoiceStops:stops,receivableCustomers:receivables,sourceComplete:true,radiusMeters:200};
 const a=buildDispatchCollectionZone({...opt,manualOutsideIds:['outside']});
 assert.equal(a.rows.find(r=>r.customerId==='outside').manualOutside,true);
 assert.equal(a.rows.find(r=>r.customerId==='outside').inZone,false);
 assert.equal(a.markers.filter(m=>m.kind==='COLLECTION').length,2);
 const b=buildDispatchCollectionZone({...opt,showAllReceivables:true});
 assert.equal(b.rows.find(r=>r.customerId==='outside').included,true);
 assert.equal(b.rows.find(r=>r.customerId==='missing').included,true);
 assert.equal(b.markers.filter(m=>m.kind==='COLLECTION').length,2);
});
test('zone: missing data, too few GPS, collinear points, and overly wide territory fail closed',()=>{
 const a={dispatchNumber:'H100',receivableCustomers:receivables,sourceComplete:true};
 assert.equal(buildDispatchCollectionZone({...a,invoiceStops:stops.slice(0,2)}).status,'UNAVAILABLE');
 assert.equal(buildDispatchCollectionZone({...a,invoiceStops:stops,sourceComplete:false}).status,'UNAVAILABLE');
 assert.equal(buildDispatchCollectionZone({...a,invoiceStops:[{customerId:'1',point:p(32,54)},{customerId:'2',point:p(32,54.001)},{customerId:'3',point:p(32,54.002)}]}).status,'UNAVAILABLE');
 assert.equal(buildDispatchCollectionZone({...a,invoiceStops:[{customerId:'1',point:p(31,53)},{customerId:'2',point:p(32,54)},{customerId:'3',point:p(33,53)}]}).status,'UNAVAILABLE');
});
