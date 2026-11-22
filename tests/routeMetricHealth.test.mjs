import test from 'node:test';
import assert from 'node:assert/strict';
import {assessRouteMetric} from '../src/lib/routeMetricHealth.ts';

const route=(netSales,customerCount=10,extra={})=>({
 customerCount,activeCustomerCount:5,netSales,invoiceCount:5,
 returnAmount:null,receivableAmount:null,profitAmount:null,targetAchievedPercent:null,
 attentionPercent:60,visitCount:8,...extra
});
test('cannot rate routes using money without comparable valid peers',()=>{
 const r=route(10000000);
 assert.equal(assessRouteMetric(r,[r],'netSales').tone,'unknown');
});
test('normalized per-customer sales do not reward an inflated customer base',()=>{
 const routes=[route(10000000,10),route(20000000,50),route(20000000,10),route(30000000,10)];
 assert.equal(assessRouteMetric(routes[1],routes,'netSales').tone,'bad');
 assert.equal(assessRouteMetric(routes[3],routes,'netSales').tone,'good');
});
test('approved target percentage is independently interpretable',()=>{
 assert.equal(assessRouteMetric(route(0,10,{targetAchievedPercent:115}),[],'targetAchievedPercent').tone,'good');
 assert.equal(assessRouteMetric(route(0,10,{targetAchievedPercent:70}),[],'targetAchievedPercent').tone,'bad');
 assert.equal(assessRouteMetric(route(0,10),[],'targetAchievedPercent').tone,'unknown');
});
test('unknown financial evidence cannot be converted to 0 percent active',()=>{
 const r=route(null,10,{activeCustomerCount:null});
 assert.equal(assessRouteMetric(r,[r],'customerCount').tone,'unknown');
});
test('high receivable intensity is a warning, not a positive performance score',()=>{
 const routes=[route(0,10,{receivableAmount:100}),route(0,10,{receivableAmount:200}),
  route(0,10,{receivableAmount:400}),route(0,10,{receivableAmount:1200})];
 assert.equal(assessRouteMetric(routes[3],routes,'receivableAmount').tone,'bad');
});
