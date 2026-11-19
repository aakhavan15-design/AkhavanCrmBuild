import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { journalQueryParams } from '../src/lib/ledgerQueryParams.mjs';
import { parseJournalQuery } from '../server/ledgerJournalQuery.mjs';

test('explicit false survives provider serialization and server parsing', () => {
  const params = new URLSearchParams(journalQueryParams({detailKey:' D1 ', unmapped:false}, {page:2,pageSize:30}));
  assert.equal(params.get('unmapped'), 'false');
  assert.deepEqual(parseJournalQuery(Object.fromEntries(params)).filter, {detailKey:'D1',unmapped:false});
});
test('explicit true and dates survive provider serialization', () => {
  const params = new URLSearchParams(journalQueryParams({unmapped:true,fromDate:'2026-01-01',toDate:'2026-02-01'}));
  assert.equal(parseJournalQuery(Object.fromEntries(params)).filter.unmapped, true);
});
test('actual provider uses shared serializer and local query handles both unmapped modes', () => {
  const provider = fs.readFileSync(new URL('../src/services/dataProvider.ts', import.meta.url),'utf8');
  const local = fs.readFileSync(new URL('../src/lib/receivableReconciliation.ts', import.meta.url),'utf8');
  assert.match(provider, /journalQueryParams\(filter, pagination\)/);
  assert.match(local, /filter\.unmapped === false/);
  assert.match(local, /filter\.unmapped === true/);
});

// F0-14: Local DataProvider must not fabricate membership in a date-filtered journal.
test('local journal date filters exclude undated records and use bounded pagination', async () => {
  const { queryJournalLines } = await import('../src/lib/receivableReconciliation.ts');
  const rows = [
    {id:'unknown', detailAccountId:'C1', subsidiaryCode:'1101'},
    {id:'inside', detailAccountId:'C1', subsidiaryCode:'1101', documentDate:'2026-01-15'},
    {id:'outside', detailAccountId:'C1', subsidiaryCode:'1101', documentDate:'2026-02-15'},
  ];
  assert.deepEqual(queryJournalLines(rows,{detailKey:'C1',fromDate:'2026-01-01',toDate:'2026-01-31'}).items.map(x=>x.id),['inside']);
  assert.equal(queryJournalLines(rows,{detailKey:'C1'}).total,3);
  for (const pagination of [{page:0},{page:1.5},{pageSize:201},{pageSize:0},{page:1000001}]) {
    assert.throws(()=>queryJournalLines(rows,{},pagination),RangeError);
  }
});
