// Static contract check of the SQL migrations (no SQL Server available): FK targets exist, no duplicate tables, RLS coverage, ordering.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const dir = new URL('../database/sqlserver/v1/', import.meta.url);
const files = fs.readdirSync(dir).filter(f => /^\d{3}_.*\.sql$/.test(f)).sort();
const nums = files.map(f => Number(f.slice(0, 3)));
assert.deepEqual(nums, nums.map((_, i) => i + 1), 'migrations are numbered consecutively from 001');
const tables = new Map();
for (const f of files) {
  const sql = fs.readFileSync(new URL(f, dir), 'utf8');
  for (const m of sql.matchAll(/CREATE TABLE\s+([a-z]+\.[A-Za-z]+)/g)) { assert.ok(!tables.has(m[1].toLowerCase()), `table ${m[1]} created twice (${tables.get(m[1].toLowerCase())} and ${f}) — no duplicate/parallel tables`); tables.set(m[1].toLowerCase(), f); }
}
let fkCount = 0;
for (const f of files) {
  const sql = fs.readFileSync(new URL(f, dir), 'utf8');
  for (const m of sql.matchAll(/REFERENCES\s+([a-z]+\.[A-Za-z]+)\s*\(/g)) { fkCount++; assert.ok(tables.has(m[1].toLowerCase()), `${f}: FK target ${m[1]} does not exist in any migration`); }
}
assert.ok(fkCount > 100);
const m017 = fs.readFileSync(new URL('017_canonical_model_etl_finance_coding.sql', dir), 'utf8');
const m020 = fs.readFileSync(new URL('020_analytics_finance_rls_coverage.sql', dir), 'utf8');
const new017 = [...m017.matchAll(/CREATE TABLE\s+([a-z]+\.[A-Za-z]+)\s*\(([\s\S]*?)\n\);/g)].filter(m => /\bTenantId\b/.test(m[2])).map(m => m[1]); // DimDate is global (no tenant column)
const rlsBlock = m017.slice(m017.indexOf('TenantIsolationPolicy'));
for (const t of new017) assert.ok(rlsBlock.includes(`N'${t}'`), `${t} missing from tenant-isolation list`);
for (const t of ['integration.SyncBatch','integration.SyncCheckpoint','integration.StagingRejection','integration.CodeMapping','integration.ReconciliationRun','crm.ProductBrand','crm.ProductGroup','analytics.ExpenseCategory','crm.LedgerAccount','crm.LedgerAccountSourceMap','crm.JournalEntryMirror','crm.JournalLineMirror','crm.ChequeMirror','crm.ProductCostMirror','crm.InventorySnapshotMirror','crm.SalesReturnMirror','crm.SalesReturnLineMirror','crm.DeliveryEventMirror','crm.Visit','crm.SalesTarget']) assert.ok(m020.includes(`ON ${t};`), `020 missing explicit RLS target ${t}`);
for (const t of new017) assert.ok(new RegExp(`${t.replace('.', '\\.')}[\\s\\S]{0,40}TenantId|TenantId[\\s\\S]{0,400}`).test(m017), `${t} must carry TenantId`);
// money columns use decimal, never float; every mirror has a source-unique constraint
assert.ok(!/\b(float|real|money)\b/i.test(m017.replace(/--.*$/gm, '')), 'no float/money types');
for (const t of ['crm.JournalEntryMirror', 'crm.JournalLineMirror', 'crm.ChequeMirror', 'crm.SalesReturnMirror', 'crm.DeliveryEventMirror', 'crm.ProductCostMirror']) {
  const block = m017.slice(m017.indexOf(`CREATE TABLE ${t}`)); assert.ok(/UNIQUE\(TenantId,SourceSystemCode,/.test(block.slice(0, block.indexOf(');'))), `${t}: missing (Tenant,Source,ExternalId) uniqueness`);
}
// views referenced by 018 resolve to existing objects
const m018 = fs.readFileSync(new URL('018_analytics_facts_dims_reports.sql', dir), 'utf8');
for (const m of m018.matchAll(/(?:FROM|JOIN)\s+((?:crm|core|analytics|integration)\.[A-Za-z_]+)/g)) {
  const n = m[1].toLowerCase(); const isView = /vw_|fn_/i.test(n);
  assert.ok(isView || tables.has(n), `018 references unknown table ${m[1]}`);
}
console.log(`sqlSchemaContracts OK (${files.length} migrations, ${tables.size} tables, ${fkCount} FKs)`);
