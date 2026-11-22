import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseJournalQuery } from '../server/ledgerJournalQuery.mjs';
import { ledgerBalanceWindow } from '../server/officialLedgerReads.mjs';
import { journalQueryParams } from '../src/lib/ledgerQueryParams.mjs';
test('valid filters and pagination', () => {
  assert.deepEqual(parseJournalQuery({detailKey:' D1 ', subsidiaryCode:'S1', unmapped:'false', fromDate:'2026-01-01', toDate:'2026-01-31',page:'2',pageSize:'50'}), {filter:{detailKey:'D1',subsidiaryCode:'S1',unmapped:false,fromDate:'2026-01-01',toDate:'2026-01-31'},page:2,pageSize:50});
});
test('invalid filters rejected', () => {
  for (const q of [{page:'0'},{pageSize:'201'},{page:'1; DROP TABLE'},{unmapped:'maybe'},{fromDate:'2026-02-30'},{fromDate:'2026-03-01',toDate:'2026-02-01'},{detailKey:''}]) assert.throws(()=>parseJournalQuery(q),RangeError);
});
test('defaults are bounded',()=>assert.deepEqual(parseJournalQuery(),{filter:{},page:1,pageSize:25}));

test('record scope is enforced in SQL before typed accounts and ledger results are counted or grouped', () => {
  const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
  const migration = read('../database/sqlserver/v1/029_scoped_account_ledger_reads.sql');
  const server = read('../server/index.mjs');
  const officialLedger = read('../server/officialLedgerReads.mjs');
  assert.match(migration, /actor.UserId=TRY_CONVERT\(uniqueidentifier, SESSION_CONTEXT\(N'UserId'\)\)/);
  assert.match(migration, /rp.ScopeCode='TEAM' AND actor.TeamId=@TeamId/);
  assert.match(migration, /detail.SourceSystemCode=@SourceSystemCode/);
  assert.match(migration, /detail.MapStatus='APPROVED'/);
  assert.match(server, /fn_RecordReadScope\(\s*account.TenantId,N'accounts.view'/);
  assert.match(officialLedger, /fn_LedgerDetailReadScope\(l.TenantId,l.SourceSystemCode,l.ExternalDetailCode\)\)\s*GROUP BY/);
  assert.match(server, /fn_LedgerDetailReadScope\(jl.TenantId,jl.SourceSystemCode,jl.ExternalDetailCode\)/);
  assert.match(server, /ledger\/pnl', authenticate, requirePermission\('finance.VIEW', \{ organizationWide:\s*true \}\)/);
});

test('a balance drill-down retains the approved window, role, account and office scope', () => {
  const query = Object.fromEntries(new URLSearchParams(journalQueryParams({
    source:'ERP-1',currency:'IRR',detailKey:'D1',role:'RECEIVABLE',balanceWindow:true,
  })));
  assert.equal(query.source,'ERP-1');
  assert.equal(query.currency,'IRR');
  assert.deepEqual(parseJournalQuery(query).filter,{detailKey:'D1',balanceWindow:true,role:'RECEIVABLE'});
  for (const invalid of [{balanceWindow:'true'},{detailKey:'D1',balanceWindow:'1',activityOnly:'1'},
    {detailKey:'D1',balanceWindow:'1',toDate:'2026-01-19'}]) assert.throws(()=>parseJournalQuery(invalid),RangeError);
  assert.match(ledgerBalanceWindow('je','approved'), /je.AccountingDate BETWEEN approved.OpeningDate AND approved.VerifiedThrough/);
  assert.match(ledgerBalanceWindow('je','approved'), /je.DocumentTypeCode<>approved.OpeningDocumentTypeCode OR je.AccountingDate=approved.OpeningDate/);
  const server = readFileSync(new URL('../server/index.mjs', import.meta.url),'utf8');
  assert.match(server, /!scope.source \|\| scope.currency!=='IRR'/);
  assert.match(server, /conditions.push\(ledgerBalanceWindow\('je','approved'\)\)/);
});
