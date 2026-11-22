import test from 'node:test';
import assert from 'node:assert/strict';
import { projectLedgerBalances } from '../server/ledgerBalances.mjs';
test('independent subsidiary balances, totals and periods', () => {
 const rows = [
  {ExternalDetailCode:'C1',ExternalAccountCode:'A',ExternalPeriodCode:'1405',TotalDebit:100,TotalCredit:30,CountedLineCount:2,UnmappedStatusLineCount:0},
  {ExternalDetailCode:'C1',ExternalAccountCode:'B',ExternalPeriodCode:'1405',TotalDebit:0,TotalCredit:20,CountedLineCount:1,UnmappedStatusLineCount:0},
  {ExternalDetailCode:'C2',ExternalAccountCode:null,ExternalPeriodCode:null,TotalDebit:10,TotalCredit:0,CountedLineCount:1,UnmappedStatusLineCount:1}
 ];
 const result = projectLedgerBalances(rows,{detailKey:'C1',byPeriod:true,scope:{source:'ERP1',currency:'IRR',role:'RECEIVABLE'}});
 assert.equal(result.status,'LIVE');assert.equal(result.balances.length,1);
 assert.equal(result.balances[0].total.balance,50);
 assert.deepEqual(result.balances[0].subsidiaries.map(x=>x.balance),[70,-20]);
 assert.equal(result.balances[0].subsidiaries[0].periodCode,'1405');
 assert.equal(result.balances[0].subsidiaries[0].role,'RECEIVABLE');
 assert.equal(projectLedgerBalances(rows,{detailKey:'C2'}).balances[0].status,'HAS_UNMAPPED');
 assert.equal(projectLedgerBalances([]).status,'EMPTY');
});
test('invalid financial values cannot silently become zero',()=>{
 assert.throws(()=>projectLedgerBalances([{ExternalDetailCode:'C1',TotalDebit:'bad',TotalCredit:0,CountedLineCount:1,UnmappedStatusLineCount:0}]));
});
