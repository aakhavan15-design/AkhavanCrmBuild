import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeFinancialDrivers} from '../src/lib/financialDrivers.ts';
const keys=['GROSS_SALES','SALES_RETURNS','COGS','OPERATING_EXPENSES'];
const accounts=keys.map(key=>({id:key,reportBucketCode:key,natureCode:key==='GROSS_SALES'?'CREDIT':'DEBIT'}));
const buckets=[...keys.map(key=>({key})),{key:'NET_SALES',calculationExpression:'GROSS_SALES - SALES_RETURNS'},{key:'GROSS_PROFIT',calculationExpression:'NET_SALES - COGS'},{key:'OPERATING_PROFIT',calculationExpression:'GROSS_PROFIT - OPERATING_EXPENSES'}];
const month=(date,amounts)=>keys.map((key,i)=>({ledgerAccountId:key,documentDate:date,status:'POSTED',debitAmount:i?amounts[i]:0,creditAmount:i?0:amounts[i]}));
const lines=[...month('2026-10-15',[1000,50,600,100]),...month('2026-11-15',[1200,100,700,180])];
const period={from:'2026-11-01',to:'2026-11-30'};
test('profit drivers reconcile and flag growing expense',()=>{
 const a=analyzeFinancialDrivers(lines,accounts,buckets,period,true);
 assert.equal(a.profitDelta,-30);
 assert.equal(a.reconciled,true);
 assert.equal(a.drivers.find(x=>x.key==='OPERATING_EXPENSES').profitImpact,-80);
 assert.ok(a.warnings.some(x=>x.key==='OPERATING_EXPENSES'));
});
test('untrusted or missing periods never create zero comparisons',()=>{
 assert.equal(analyzeFinancialDrivers(lines,accounts,buckets,period,false),null);
 const a=analyzeFinancialDrivers(lines.slice(4),accounts,buckets,period,true);
 assert.equal(a.profitDelta,null);
 assert.equal(a.reconciled,false);
});
