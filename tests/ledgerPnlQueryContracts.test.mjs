/**
 * T5 contracts: SQL builder is parameterized (no string concat of dates/codes),
 * normalizeSqlPnlRows maps unmapped codes to null ledgerAccountId,
 * buildLedgerPnlInputs accepts both local and SQL shapes.
 */
import { strict as assert } from 'node:assert';
import { buildLedgerPnlSql } from '../server/ledgerPnlQuery.mjs';
import { normalizeSqlPnlRows, buildLedgerPnlInputs, PNL_ACCOUNT_PREFIXES, COA_PREFIX_BUCKETS } from '../src/lib/ledgerPnl.ts';

console.log('ledgerPnlQueryContracts: start');

// 1. Prefixes derived, not duplicated arbitrarily
assert.ok(Array.isArray(PNL_ACCOUNT_PREFIXES));
assert.deepEqual(PNL_ACCOUNT_PREFIXES, COA_PREFIX_BUCKETS.map(([p]) => p));
assert.ok(PNL_ACCOUNT_PREFIXES.includes('41'));

// 2. SQL is parameterized — no raw date/code interpolation in text
{
  const { sqlText, prefixCount } = buildLedgerPnlSql(['41', '42', '51', '52'], { maxRows: 1000 });
  assert.equal(prefixCount, 4);
  assert.ok(sqlText.includes('@tenantId'));
  assert.ok(sqlText.includes('@fromDate'));
  assert.ok(sqlText.includes('@toDate'));
  assert.ok(sqlText.includes('@pfx0'));
  assert.ok(!sqlText.includes('2024-01-01')); // no literal date
  assert.ok(sqlText.includes('GROUP BY'));
  assert.ok(sqlText.includes('IncludeInBalance'));
  assert.ok(sqlText.includes('DocumentNumber'));
}

// 3. normalizeSqlPnlRows: unmapped code → ledgerAccountId null
{
  const rows = [
    { accountCode: '4101', documentDate: '2024-06-01', debitAmount: 100, creditAmount: 0 },
    { accountCode: '9999', documentDate: '2024-06-02', debitAmount: 50, creditAmount: 0 },
  ];
  const coa = [{ id: 'acc-41', code: '4101' }];
  const lines = normalizeSqlPnlRows(rows, coa);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].ledgerAccountId, 'acc-41');
  assert.equal(lines[1].ledgerAccountId, null); // unmapped
}

// 4. buildLedgerPnlInputs accepts SQL-shaped rows
{
  const { rawLines, accounts } = buildLedgerPnlInputs(
    [{ accountCode: '4101', documentDate: '2024-06-01', debitAmount: 10, creditAmount: 0 }],
    [{ id: 'a1', code: '4101', name: 'فروش', nature: 'CREDIT' }]
  );
  assert.equal(rawLines.length, 1);
  assert.equal(rawLines[0].ledgerAccountId, 'a1');
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].reportBucketCode, 'GROSS_SALES');
}

// 5. buildLedgerPnlInputs still accepts local shape
{
  const { rawLines } = buildLedgerPnlInputs(
    [{ ledgerAccountId: 'x', documentDate: '2024-01-01', debitAmount: 1, creditAmount: 0, status: 'POSTED' }],
    [{ id: 'x', code: '5100' }]
  );
  assert.equal(rawLines.length, 1);
  assert.equal(rawLines[0].ledgerAccountId, 'x');
}

console.log('ledgerPnlQueryContracts: all PASS (5)');
