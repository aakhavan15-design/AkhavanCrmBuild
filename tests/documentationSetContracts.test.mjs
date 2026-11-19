import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
// Final documentation set: five hand-written documents + one generated KPI document (owner decision, 2026-11-15).
const required = [
  'docs/CONSTITUTION_FA.md', 'docs/MASTER_SPEC_FA.md', 'docs/DESIGN_SYSTEM_FA.md',
  'docs/CHECKLIST_FA.md', 'docs/17_METRIC_FORMULAS_DATA_SOURCES_FA.md'
];
for (const p of required) assert.ok(fs.existsSync(new URL(`../${p}`, import.meta.url)), `missing ${p}`);
const instructions = read('INSTRUCTIONS.md');
for (const p of required) assert.ok(instructions.includes(p), `INSTRUCTIONS must point to ${p}`);
assert.doesNotMatch(instructions, /F14\/F15/, 'old F15 execution reference must be retired');
const constitution = read('docs/CONSTITUTION_FA.md');
for (const term of ['DEMO', 'LIVE', 'PARTIAL', 'STALE', 'UNAVAILABLE', 'NULL', 'idempotent', 'RLS', 'Checklist']) assert.ok(constitution.includes(term), `missing ${term}`);
const design = read('docs/DESIGN_SYSTEM_FA.md');
assert.match(design, /Neo-Slate \+ Electric Indigo/);
assert.match(design, /جزیره‌های شناور/);
assert.match(design, /کپسول دوتایی/);
assert.match(design, /RTL/);
const prompt = instructions; // the execution prompt lives in INSTRUCTIONS.md
for (const term of ['کار تکراری نکن', 'موتور', 'ERP', 'Checklist', 'ZIP', 'Vertical Slice', 'ui-ux-pro-max', 'fallback محلی ممنوع', 'Route+RBAC']) assert.ok(prompt.includes(term), `missing prompt rule ${term}`);
for (const retired of ['AGENTS.md', 'BOOTSTRAP.md', 'VERSION.md', '.agents', 'docs/README.md', 'docs/PRODUCT_ARCHITECTURE_FA.md', 'docs/16_DATA_ARCHITECTURE_ETL_FA.md', 'docs/18_ENGINE_FORMULAS_DATA_SOURCES_FA.md', 'docs/SYSTEM_INVENTORY_NAVIGATION_FA.md', 'docs/AI_EXECUTION', 'src/lib/formulaSources.md', 'docs/01_PRODUCT_AND_ARCHITECTURE.md', 'docs/02_DESIGN_SYSTEM.md', 'PROJECT_KNOWLEDGE.md', 'README_APPLIED_PATCHES.md', 'ENGINE_ACTIVATION_MATRIX.md', 'NAVIGATION_HIERARCHY_FA.md']) {
  assert.equal(fs.existsSync(new URL(`../${retired}`, import.meta.url)), false, `retired document remains: ${retired}`);
}

const master = read('docs/MASTER_SPEC_FA.md');
for (const term of [
  'تعریف جامع محصول', 'مدیریت، اتوماسیون، پایش، کنترل و هوشمندی کسب‌وکار',
  'فرصت افزایش فروش', 'فاکتور فقط‌خواندنی', 'توان پرداخت شرکت', 'تجربه‌های متناسب با نقش', 'موزع/راننده',
  'دستور پرداخت', 'موتور جریمه', 'منابع انسانی و رشد کارکنان'
]) assert.ok(master.includes(term), `MASTER_SPEC missing approved product scope: ${term}`);
const checklist = read('docs/CHECKLIST_FA.md');
assert.match(checklist, /F8-11 .*چرخهٔ کامل جذب تا استخدام/);
assert.match(checklist, /F8-17 .*محرمانگی و مجوزهای HR/);
assert.match(checklist, /F14-47 .*ZIP کامل سورس/);
assert.doesNotMatch(checklist, /^- \[.\] F15-\d+/m, 'duplicate F15 checklist rows must be merged');
assert.match(checklist, /F15-01 تا F15-18 در F8-11 تا F8-17 ادغام شدند/);
assert.match(checklist, /F1-04 .*Action Registry یگانه بر اساس Route\+RBAC/);
assert.match(checklist, /F3-06 .*report-reference-entity360/);
assert.match(master, /دکمهٔ \+ هدر بر اساس Route/);
assert.match(master, /SQL Server منبع حقیقت عملیاتی است/);

console.log('documentationSetContracts: PASS');
