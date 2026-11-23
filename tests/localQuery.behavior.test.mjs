import assert from 'node:assert/strict';
import { test } from 'node:test';
import { queryLocalRecords } from '../src/services/localQuery.ts';

// Run with: node --experimental-strip-types --test tests/localQuery.behavior.test.mjs
// A production ERP row may legally hold two different identifier columns.
test('local filters respect explicitly requested customer and account IDs', () => {
  const rows = [
    { id:'invoice-1', accountId:'ledger-A', customerId:'customer-B', date:'2026-11-23' },
    { id:'invoice-2', accountId:'ledger-C', customerId:'customer-D', date:'2026-11-22' },
  ];
  const byCustomer = queryLocalRecords(rows, { customerId:'customer-B' }, undefined, 25);
  const byAccount = queryLocalRecords(rows, { accountId:'ledger-A' }, undefined, 25);
  assert.deepEqual(byCustomer.items.map(x=>x.id), ['invoice-1']);
  assert.deepEqual(byAccount.items.map(x=>x.id), ['invoice-1']);
  assert.equal(queryLocalRecords(rows, { customerId:'ledger-A' }, undefined, 25).total, 0);
  assert.equal(queryLocalRecords(rows, { accountId:'customer-B' }, undefined, 25).total, 0);
});

test('single-key legacy records retain safe fallback and unknown keys fail closed', () => {
  const rows = [{id:'legacy', accountId:'ledger-A', date:'2026-11-23'}];
  assert.equal(queryLocalRecords(rows, {customerId:'ledger-A'}, undefined, 25).total, 1);
  assert.equal(queryLocalRecords(rows, {customerId:'another'}, undefined, 25).total, 0);
  assert.equal(queryLocalRecords(rows, {unknownFilter:'any'}, undefined, 25).total, 0);
});

test('local filtering occurs before pagination and date bounds remain inclusive', () => {
  const rows = [
    {id:'one', customerId:'B', date:'2026-11-22'},
    {id:'two', customerId:'B', date:'2026-11-23'},
    {id:'three', customerId:'C', date:'2026-11-23'},
  ];
  const got = queryLocalRecords(rows, {customerId:'B',fromDate:'2026-11-23',toDate:'2026-11-23'}, {page:1,pageSize:1}, 25);
  assert.equal(got.total, 1);
  assert.deepEqual(got.items.map(x=>x.id), ['two']);
});
