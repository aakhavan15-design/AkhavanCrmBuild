// قرارداد یکپارچه‌سازی تراز کف: ERP→نرمال‌سازی، ETL، ویزارد، نوار چسبان، تنظیمات، Migration، قفل پالت.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planErpImport } from '../src/lib/erpImportService.ts';
import { validateEtlRecord } from '../src/lib/etlPipeline.ts';

const base = { tenantId: 't1', sourceSystemCode: 'erp', externalId: 'P-1', name: 'کالا' };
// ── ERP: ۵ کلاس + کف + تعداد در کارتن نرمال می‌شوند؛ نامعتبر ⇒ null/حذف (نه صفر)
const plan = planErpImport({}, 'PRODUCT', [{ ...base, floorPrice: '۱۰۰۰۰', unitsPerCarton: 12, priceClass1: 12000, priceClass2: 0, priceClass5: 99000, priceClass5Label: 'برچسب ERP', currencyCode: 'IRR' }]);
const rec = plan.nextState.externalProducts[0];
assert.equal(rec.floorPrice, 10000); assert.equal(rec.unitsPerCarton, 12);
assert.equal(rec.priceClasses.PRICE_CLASS_1.unitPrice, 12000); assert.equal(rec.priceClasses.PRICE_CLASS_2, undefined);
assert.equal(rec.priceClasses.PRICE_CLASS_5.label, 'برچسب ERP');
const none = planErpImport({}, 'PRODUCT', [{ ...base }]).nextState.externalProducts[0];
assert.equal(none.floorPrice, null); assert.equal(none.unitsPerCarton, null); assert.deepEqual(none.priceClasses, {});
// ── ETL: مقدار نامعتبر رد می‌شود و در staging می‌ماند
const codes = (r) => validateEtlRecord('PRODUCT', { ...base, ...r }).map(x => x.ruleCode);
assert.deepEqual(codes({}), []);
assert.ok(codes({ floorPrice: -5 }).includes('PRODUCT_FLOOR_PRICE_INVALID'));
assert.ok(codes({ unitsPerCarton: 0 }).includes('PRODUCT_UNITS_PER_CARTON_INVALID'));
assert.ok(codes({ priceClass3: 1.5 }).includes('PRODUCT_PRICE_CLASS_INVALID'));
assert.deepEqual(codes({ currencyCode: 'USD' }), []);

// ── منبع: ویزارد از موتور مرکزی استفاده می‌کند؛ هشدار ذخیره؛ نوار چسبان؛ بدون hex
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const wiz = src('src/components/QuoteWizardModal.tsx');
assert.match(wiz, /computeOrderBalance\(/); assert.match(wiz, /QuotePricingStep/);
assert.match(wiz, /negativeBalance \|\| orderBalance\.excludedLineCount > 0/); // هشدار هنگام ذخیره
assert.match(wiz, /negativeBalance \|\| marginPercent|negativeBalance \|\| marginPercent/);  // تراز منفی ⇒ هرگز تأیید خودکار
assert.match(wiz, /<OrderBalanceBar balance=\{orderBalance\}/); // تراز کل در محاسبات کلی (مرحلهٔ ۳)
const bar = src('src/components/quote/OrderBalanceBar.tsx');
assert.match(bar, /sticky top-0/); assert.match(bar, /aria-live="polite"/);
for (const f of ['OrderBalanceBar', 'QuotePricingStep', 'NumericField']) assert.doesNotMatch(src(`src/components/quote/${f}.tsx`), /#[0-9a-fA-F]{3,8}\b|rgba?\(/, `${f}: فقط توکن معنایی`);
assert.doesNotMatch(src('src/components/settings/PriceClassDefinitionsPanel.tsx'), /#[0-9a-fA-F]{3,8}\b/);
// تعاریف فقط در زیرمنوی «تعاریف» (نه تنظیمات)
assert.doesNotMatch(src('src/components/SettingsWorkspace.tsx'), /PriceClassDefinitionsPanel/);
assert.match(src('src/components/BaseDefinitionsWorkspace.tsx'), /<PriceClassDefinitionsPanel /);
assert.match(src('src/App.tsx'), /path="\/definitions"/);
const landing = src('src/lib/moduleLanding.ts');
for (const t of ['master-price-classes', 'master-product-prices', 'master-customers']) assert.match(landing, new RegExp(t));
assert.doesNotMatch(src('src/components/BaseDefinitionsWorkspace.tsx'), /#[0-9a-fA-F]{3,8}\b/);
const step = src('src/components/quote/QuotePricingStep.tsx');
assert.match(step, /data-balance-state/); assert.match(step, /suggestLineRecovery\(/);
assert.doesNotMatch(step, /basePrice|unitPrice \|\| 0\)/); // قیمت از ERP کلاس؛ جایگزین حدسی ندارد
// ── Migration: عدد دقیق، یکتایی نسخه (idempotent)، RLS، بدون float
const sql = src('database/sqlserver/v1/057_floor_balance_price_classes.sql');
assert.match(sql, /UQ_ProductPriceClass_Version UNIQUE\(TenantId,ExternalProductKey,PriceClassCode,SourceVersion\)/);
const code = sql.replace(/\/\*[\s\S]*?\*\//g, '');
assert.match(code, /decimal\(19,0\)/); assert.doesNotMatch(code, /\bfloat\b|\breal\b/i);
assert.match(sql, /ON crm\.ProductPriceClass/); assert.doesNotMatch(sql, /CurrencyCode='IRR'/);
// سازمان/کاربران/گروه‌ها/پرسنل زیر «تعاریف»؛ تنظیمات فقط rules/agents/integrations/locale
const st = src('src/components/SettingsWorkspace.tsx');
assert.match(st, /SETTINGS_ONLY_TABS = \['rules', 'agents', 'integrations', 'locale'\]/);
assert.match(st, /DEFINITION_TABS = \['org', 'users', 'groups'\]/);
assert.match(st, /legacyNavigate\(`\/definitions/); // پیوند قدیمی /settings?tab=users هدایت می‌شود
const defs = src('src/components/BaseDefinitionsWorkspace.tsx');
assert.match(defs, /<SettingsWorkspace mode="definitions"/); assert.match(defs, /id: 'personnel'/);
assert.doesNotMatch(landing, /\/settings\?tab=(org|users|groups)/);
console.log('floorBalanceIntegrationContracts OK');
