import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJournalQuery } from '../server/ledgerJournalQuery.mjs';
test('valid filters and pagination', () => {
  assert.deepEqual(parseJournalQuery({detailKey:' D1 ', subsidiaryCode:'S1', unmapped:'false', fromDate:'2026-01-01', toDate:'2026-01-31',page:'2',pageSize:'50'}), {filter:{detailKey:'D1',subsidiaryCode:'S1',unmapped:false,fromDate:'2026-01-01',toDate:'2026-01-31'},page:2,pageSize:50});
});
test('invalid filters rejected', () => {
  for (const q of [{page:'0'},{pageSize:'201'},{page:'1; DROP TABLE'},{unmapped:'maybe'},{fromDate:'2026-02-30'},{fromDate:'2026-03-01',toDate:'2026-02-01'},{detailKey:''}]) assert.throws(()=>parseJournalQuery(q),RangeError);
});
test('defaults are bounded',()=>assert.deepEqual(parseJournalQuery(),{filter:{},page:1,pageSize:25}));
