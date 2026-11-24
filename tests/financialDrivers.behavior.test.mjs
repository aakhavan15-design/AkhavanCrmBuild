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

test('expense Pareto retains account identity, positive shares and missing baseline',()=>{
 const detailed=[...accounts.filter(a=>a.id!=='OPERATING_EXPENSES'),{id:'rent',accountCode:'5201',titleFa:'اجاره',levelCode:'DETAIL',reportBucketCode:'OPERATING_EXPENSES',natureCode:'DEBIT'},{id:'fuel',accountCode:'5202',titleFa:'سوخت',levelCode:'DETAIL',reportBucketCode:'OPERATING_EXPENSES',natureCode:'DEBIT'}];
 const expense=(id,date,value)=>({ledgerAccountId:id,documentDate:date,status:'POSTED',debitAmount:value,creditAmount:0});
 const a=analyzeFinancialDrivers([expense('rent','2026-10-15',100),expense('rent','2026-11-15',150),expense('fuel','2026-11-15',50)],detailed,buckets,period,true);
 assert.deepEqual(a.expensePareto.map(r=>r.code),['5201','5202']);
 assert.equal(a.expensePareto[0].share,75);
 assert.equal(a.expensePareto[0].warning,true);
 assert.equal(a.expensePareto[1].cumulativeShare,100);
 assert.equal(a.expensePareto[1].baseline,null);
 assert.equal(a.expensePareto[1].warning,false);
});
