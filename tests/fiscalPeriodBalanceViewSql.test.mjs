// F0-15: static contract for migration 027 (no SQL Server available => static only; execution NOT VERIFIED).
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
const dir = new URL('../database/sqlserver/v1/', import.meta.url);
const sql = fs.readFileSync(new URL('027_fiscal_period_doc_status_balance_view.sql', dir), 'utf8');
const code = sql.replace(/\/\*[\s\S]*?\*\//g, '');
const earlier = fs.readdirSync(dir).filter(f => /^\d{3}_.*\.sql$/.test(f) && !f.startsWith('027_')).map(f => fs.readFileSync(new URL(f, dir), 'utf8')).join('\n');

test('027 creates exactly 3 new tables, each IF OBJECT_ID-guarded and not present earlier', () => {
  const created = [...code.matchAll(/CREATE TABLE\s+([a-z]+\.[A-Za-z]+)/g)].map(m => m[1]).sort();
  assert.deepEqual(created, ['crm.FiscalPeriod', 'crm.JournalLineDimension', 'crm.JournalStatusMap']);
  for (const t of created) {
    assert.ok(new RegExp(`IF OBJECT_ID\\(N'${t.replace('.', '\\.')}'`).test(code), `${t} guarded`);
    assert.ok(!earlier.includes(`CREATE TABLE ${t}`), `${t} not in earlier migrations`);
  }
});

test('additive only: no DROP/DELETE/UPDATE/INSERT; new columns guarded by COL_LENGTH', () => {
  assert.ok(!/\b(DROP\s+(TABLE|COLUMN)|DELETE\s+FROM|UPDATE\s+\w|INSERT\s+(INTO|\w))/i.test(code.replace(/INSERT @t VALUES[^;]*;/, '')));
  for (const c of ['FiscalPeriodId', 'ExternalPeriodCode']) assert.ok(new RegExp(`COL_LENGTH\\(N'crm\\.JournalEntryMirror',N'${c}'\\) IS NULL`).test(code), c);
});

test('reuses existing journal mirrors (no parallel journal/balance table)', () => {
  assert.ok(!/CREATE TABLE crm\.(Balance|Journal(Entry|Line)Mirror|DetailBalance|LedgerBalance)/i.test(code));
  assert.ok(/FROM crm\.JournalLineMirror/.test(code) && /JOIN crm\.JournalEntryMirror/.test(code));
});

test('balance is independent per (detail, subsidiary, period) = sum(debit)-sum(credit); total only aggregates it', () => {
  const v1 = code.slice(code.indexOf('analytics.vw_DetailSubsidiaryBalance AS'), code.indexOf('analytics.vw_DetailBalanceTotal'));
  assert.ok(/GROUP BY jl\.TenantId, jl\.SourceSystemCode, jl\.ExternalDetailCode, jl\.ExternalAccountCode, je\.FiscalPeriodId/.test(v1));
  assert.ok(/jl\.DebitAmount-jl\.CreditAmount/.test(v1));
  const v2 = code.slice(code.indexOf('analytics.vw_DetailBalanceTotal'));
  assert.ok(/FROM analytics\.vw_DetailSubsidiaryBalance/.test(v2) && /SubsidiaryCount/.test(v2));
  assert.ok(!/crm\.JournalLineMirror/.test(v2.split('/* ----------')[0]), 'total derives from the per-subsidiary view only');
});

test('document status is never guessed: only explicit IncludeInBalance=1 counts; unmapped is surfaced; voided excluded', () => {
  assert.ok(/sm\.IncludeInBalance=1 AND je\.IsVoided=0/.test(code));
  assert.ok(/LEFT JOIN crm\.JournalStatusMap/.test(code));
  assert.ok(/UnmappedStatusLineCount/.test(code));
});

test('RLS + tenant on every new table; no Seed', () => {
  for (const t of ['crm.FiscalPeriod', 'crm.JournalStatusMap', 'crm.JournalLineDimension']) assert.ok(sql.includes(`N'${t}'`), `${t} in RLS list`);
  assert.equal([...code.matchAll(/TenantId uniqueidentifier NOT NULL/g)].length, 3);
});

test('FK targets exist in earlier migrations or in 027 itself', () => {
  for (const m of code.matchAll(/REFERENCES\s+([a-z]+\.[A-Za-z]+)\s*\(/g)) {
    assert.ok(earlier.includes(`CREATE TABLE ${m[1]}`) || code.includes(`CREATE TABLE ${m[1]}`), `${m[1]} exists`);
  }
});
