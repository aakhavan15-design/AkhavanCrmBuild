// F0-15: static contract for migration 026 (no SQL Server available => static only; execution NOT VERIFIED).
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
const dir = new URL('../database/sqlserver/v1/', import.meta.url);
const sql = fs.readFileSync(new URL('026_chart_of_accounts_detail_groups.sql', dir), 'utf8');
const all = fs.readdirSync(dir).filter(f => /^\d{3}_.*\.sql$/.test(f) && !f.startsWith('026_')).map(f => fs.readFileSync(new URL(f, dir), 'utf8')).join('\n');

test('026 creates only the 3 new tables, each idempotent, none duplicated elsewhere', () => {
  const created = [...sql.matchAll(/CREATE TABLE\s+([a-z]+\.[A-Za-z]+)/g)].map(m => m[1]);
  assert.deepEqual(created.sort(), ['crm.DetailAccount', 'crm.DetailGroup', 'crm.DetailSubsidiaryLink']);
  for (const t of created) {
    assert.ok(new RegExp(`IF OBJECT_ID\\(N'${t.replace('.', '\\.')}'`).test(sql), `${t} guarded by IF OBJECT_ID`);
    assert.ok(!all.includes(`CREATE TABLE ${t}`), `${t} must not exist in earlier migrations`);
  }
});

test('026 reuses the existing ERP chart mirror (no parallel ledger table)', () => {
  assert.ok(/ALTER TABLE crm\.LedgerAccountSourceMap ADD ExternalLevelCode/.test(sql));
  assert.ok(/'GROUP','GENERAL','SUBSIDIARY'/.test(sql));
  assert.ok(!/CREATE TABLE crm\.(Subsidiary|GeneralLedger|ChartOfAccounts|Moein)/i.test(sql));
});

test('detail group is classification only: nothing in journal/ledger tables references it', () => {
  assert.ok(!/JournalLineMirror[^;]*DetailGroup/i.test(sql.replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.ok(!/(DebitAmount|CreditAmount|Balance)/.test(sql.slice(sql.indexOf('CREATE TABLE crm.DetailGroup'), sql.indexOf('CREATE TABLE crm.DetailAccount'))));
  for (const k of ['CUSTOMER', 'PERSONNEL', 'COST_CENTER', 'PARTNER_CURRENT', 'BANK']) assert.ok(sql.includes(`'${k}'`), k);
});

test('detail<->subsidiary is many-to-many with composite PK; detail is not a child of one subsidiary', () => {
  assert.ok(/PRIMARY KEY\(TenantId,DetailAccountId,LedgerAccountSourceMapId\)/.test(sql));
  const det = sql.slice(sql.indexOf('CREATE TABLE crm.DetailAccount'), sql.indexOf('CREATE TABLE crm.DetailSubsidiaryLink'));
  assert.ok(!/LedgerAccountSourceMapId|ExternalAccountCode/.test(det));
});

test('RLS + tenant + no seed data', () => {
  for (const t of ['crm.DetailGroup', 'crm.DetailAccount', 'crm.DetailSubsidiaryLink']) assert.ok(sql.includes(`N'${t}'`), `${t} in tenant isolation list`);
  assert.ok(!/INSERT\s+(INTO\s+)?(crm\.)?Detail/i.test(sql.replace(/\/\*[\s\S]*?\*\//g, '')) && !/\bINSERT\s+INTO\b/i.test(sql));
});

test('FK targets exist in earlier migrations', () => {
  for (const m of sql.matchAll(/REFERENCES\s+([a-z]+\.[A-Za-z]+)\s*\(/g)) {
    if (m[1].startsWith('crm.Detail')) continue;
    assert.ok(all.includes(`CREATE TABLE ${m[1]}`), `${m[1]} exists`);
  }
});
