import assert from 'node:assert/strict';
import test from 'node:test';
import { auditErpDataQuality, checkIranNationalId, normalizeIranMobile } from '../src/lib/erpDataQuality.ts';

// ساخت کد ملی معتبر برای تست
const mkNid = (nine) => { const s = nine.split('').reduce((a, d, i) => a + Number(d) * (10 - i), 0) % 11; return nine + (s < 2 ? s : 11 - s); };
const VALID = mkNid('123456789');
const rules = (r) => r.issues.map(i => i.ruleCode);
const has = (r, code, id) => r.issues.some(i => i.ruleCode === code && (!id || i.entityId === id || i.evidence?.customerIds?.includes(id)));

test('کد ملی و موبایل', () => {
  assert.equal(checkIranNationalId(VALID).valid, true);
  assert.equal(checkIranNationalId('۱۲۳۴۵۶۷۸۹۰').valid, false);
  assert.equal(checkIranNationalId('1111111111').valid, false);
  assert.equal(checkIranNationalId('12345').kind, null);
  assert.equal(normalizeIranMobile('+98 912 123 4567'), '09121234567');
  assert.equal(normalizeIranMobile('۰۹۱۲۱۲۳۴۵۶'), null);
});

test('مشتری: کد ملی/موبایل اشتباه و تکراری‌ها', () => {
  const r = auditErpDataQuality({ customers: [
    { id: 'a', name: 'الف', nationalCode: VALID, mobile: '09121234567' },
    { id: 'b', name: 'ب', nationalCode: VALID, mobile: '0912123456' },
    { id: 'c', name: 'ج', nationalCode: '1234567890', mobile: '09350000001' },
    { id: 'd', name: 'فروشگاه نمونه', phone: '09350000001' },
    { id: 'e', name: 'فروشگاه نمونه', economicCode: '12345678901' },
    { id: 'f', name: 'حذف‌شده', nationalCode: VALID, deletedAt: '2026-01-01' },
  ] });
  assert.ok(has(r, 'CUST_NATIONAL_ID_INVALID', 'c'));
  assert.ok(has(r, 'CUST_MOBILE_INVALID', 'b'));
  assert.ok(has(r, 'CUST_DUPLICATE_NATIONAL_ID', 'a') && has(r, 'CUST_DUPLICATE_NATIONAL_ID', 'b'));
  assert.equal(r.issues.find(i => i.ruleCode === 'CUST_DUPLICATE_NATIONAL_ID').evidence.customerIds.includes('f'), false, 'حذف‌شده لحاظ نشود');
  assert.ok(has(r, 'CUST_DUPLICATE_MOBILE', 'c') && has(r, 'CUST_DUPLICATE_MOBILE', 'd'));
  assert.ok(has(r, 'CUST_DUPLICATE_NAME', 'd'));
  assert.ok(r.notEvaluated.some(n => n.domain === 'COA'), 'منبع ناموجود = notEvaluated نه صفر');
});

const square = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
test('مسیر: بدون مسیر، خارج از محدوده، دورافتاده، مختصات مشکوک', () => {
  const st = {
    geoZones: [{ id: 'z1', code: 'Z1', name: 'مسیر یک', status: 'ACTIVE', currentGeometryVersionId: 'v1' }, { id: 'z2', code: 'Z2', name: 'مسیر دو', status: 'ACTIVE' }],
    zoneGeometryVersions: [{ id: 'v1', zoneId: 'z1', version: 1, geometry: square(51.0, 35.0, 51.2, 35.2) }],
    zoneAssignments: [
      { entityType: 'CUSTOMER', entityId: 'in', zoneId: 'z1' }, { entityType: 'CUSTOMER', entityId: 'out', zoneId: 'z1' },
      ...['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'far'].map(id => ({ entityType: 'CUSTOMER', entityId: id, zoneId: 'z2' })),
      { entityType: 'CUSTOMER', entityId: 'swap', zoneId: 'z2' },
    ],
    customers: [
      { id: 'in', name: 'داخل', lat: 35.1, lng: 51.1 }, { id: 'out', name: 'بیرون', lat: 36.5, lng: 52.5 },
      { id: 'none', name: 'بی‌مسیر', lat: 35.1, lng: 51.1 }, { id: 'nocoord', name: 'بی‌مختصات' },
      ...['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id, i) => ({ id, name: id, lat: 32.0 + i * 0.001, lng: 52.0 + i * 0.001 })),
      { id: 'far', name: 'دور', lat: 33.5, lng: 52.0 }, { id: 'swap', name: 'جابه‌جا', lat: 51.1, lng: 35.1 },
    ],
  };
  const r = auditErpDataQuality(st);
  assert.ok(has(r, 'CUST_NO_ROUTE', 'none'));
  assert.equal(has(r, 'CUST_NO_ROUTE', 'in'), false);
  assert.ok(has(r, 'CUST_OUTSIDE_ROUTE_ZONE', 'out'));
  assert.equal(has(r, 'CUST_OUTSIDE_ROUTE_ZONE', 'in'), false);
  assert.ok(has(r, 'CUST_NO_COORDS', 'nocoord'));
  assert.ok(has(r, 'CUST_FAR_FROM_ROUTE_PEERS', 'far'));
  assert.equal(has(r, 'CUST_FAR_FROM_ROUTE_PEERS', 'p3'), false);
  assert.ok(has(r, 'CUST_COORDS_SUSPECT', 'swap') || has(r, 'CUST_NO_COORDS', 'swap'));
  // بدون هیچ مسیر تعریف‌شده → نه «صفر مشکل»، بلکه ارزیابی‌نشده
  const none = auditErpDataQuality({ customers: st.customers });
  assert.ok(none.notEvaluated.some(n => n.domain === 'ROUTE'));
  assert.equal(none.issues.some(i => i.domain === 'ROUTE'), false);
});

test('کالا: گروه‌بندی مشکوک، تکراری، قیمت', () => {
  const mk = (i, name, category, extra = {}) => ({ id: `p${i}`, name, category, code: `C${i}`, basePrice: 100, costPrice: 50, ...extra });
  const r = auditErpDataQuality({ externalProducts: [
    mk(1, 'شیر کم چرب', 'لبنیات'), mk(2, 'شیر پرچرب', 'لبنیات'), mk(3, 'شیر کاکائو', 'لبنیات'), mk(4, 'شیر عسل', 'لبنیات'),
    mk(5, 'شیر ظرفشویی', 'شوینده'), mk(6, 'روغن', '', {}), mk(7, 'کالای تکراری', 'الف', { code: 'C1' }), mk(8, 'کالای بد', 'الف', { basePrice: 0 }),
  ] });
  assert.ok(has(r, 'PROD_GROUP_SUSPECT', 'p5'));
  assert.equal(has(r, 'PROD_GROUP_SUSPECT', 'p1'), false);
  assert.ok(has(r, 'PROD_NO_GROUP', 'p6'));
  assert.ok(has(r, 'PROD_DUPLICATE_CODE'));
  assert.ok(has(r, 'PROD_PRICE_NONPOSITIVE', 'p8'));
});

test('کدینگ: ماهیت جاری شرکا، والد/سطح، تکراری، مانده خلاف ماهیت', () => {
  const coa = [
    { id: 'c1', code: '3', name: 'حقوق صاحبان سهام', nature: 'CREDIT', level: 1, parentCode: null, isActive: true },
    { id: 'c2', code: '3101', name: 'جاری شرکا - آقای الف', nature: 'DEBIT', level: 2, parentCode: '3', isActive: true },
    { id: 'c3', code: '3102', name: 'جاری شرکا - آقای ب', nature: 'CREDIT', level: 2, parentCode: '3', isActive: true },
    { id: 'c4', code: '1101', name: 'صندوق', nature: 'DEBIT', level: 3, parentCode: '11', isActive: true },
    { id: 'c5', code: '1101', name: 'بانک', nature: 'DEBIT', level: 2, parentCode: '1', isActive: true },
    { id: 'c6', code: '1', name: 'دارایی‌ها', nature: 'DEBIT', level: 1, parentCode: null, isActive: true },
    { id: 'c7', code: '1201', name: 'استهلاک انباشته ساختمان', nature: 'CREDIT', level: 2, parentCode: '1', isActive: true },
    { id: 'c8', code: '5101', name: 'هزینه اجاره', nature: 'DEBIT', level: 2, parentCode: '1', isActive: true },
    { id: 'c9', code: '5102', name: 'هزینه حقوق', nature: 'DEBIT', level: 2, parentCode: '1', isActive: true },
  ];
  const lines = [
    { id: 'l1', documentId: 'D1', ledgerAccountId: 'c4', debitAmount: 100, creditAmount: 0 },
    { id: 'l2', documentId: 'D1', ledgerAccountId: 'c3', debitAmount: 0, creditAmount: 100 },
    { id: 'l3', documentId: 'D2', ledgerAccountId: 'c8', debitAmount: 500, creditAmount: 0, description: 'پرداخت حقوق مهر' },
    { id: 'l4', documentId: 'D2', ledgerAccountId: 'c4', debitAmount: 0, creditAmount: 400 },
    { id: 'l5', documentId: 'D3', ledgerAccountId: 'zzz', debitAmount: 10, creditAmount: 10 },
    { id: 'l6', documentId: 'D4', ledgerAccountId: 'c9', debitAmount: 0, creditAmount: 700, description: 'حقوق' },
  ];
  const r = auditErpDataQuality({ coaMirror: coa, journalLines: lines });
  assert.ok(has(r, 'COA_NATURE_MISMATCH', 'c2'), 'جاری شرکا با ماهیت بدهکار باید پرچم بخورد');
  assert.equal(has(r, 'COA_NATURE_MISMATCH', 'c3'), false);
  assert.equal(has(r, 'COA_NATURE_MISMATCH', 'c7'), false, 'حساب مقابل مستثناست');
  assert.ok(has(r, 'COA_DUPLICATE_CODE'));
  assert.ok(has(r, 'COA_ORPHAN_PARENT', 'c4'));
  assert.ok(has(r, 'JRN_DOC_UNBALANCED', 'D2'));
  assert.equal(has(r, 'JRN_DOC_UNBALANCED', 'D1'), false);
  assert.ok(has(r, 'JRN_DESC_ACCOUNT_MISMATCH', 'l3'), 'شرح حقوق روی هزینه اجاره');
  assert.equal(has(r, 'JRN_DESC_ACCOUNT_MISMATCH', 'l6'), false, 'شرح حقوق روی هزینه حقوق درست است');
  assert.ok(has(r, 'JRN_LINE_ACCOUNT_UNKNOWN', 'l5') && has(r, 'JRN_LINE_BOTH_SIDES', 'l5'));
  assert.ok(has(r, 'COA_ABNORMAL_BALANCE', 'c9'), 'هزینه با مانده بستانکار');
  assert.ok(r.issues.every(i => i.confidence === 'DETERMINISTIC' || i.confidence === 'HEURISTIC'));
});

test('مجموعهٔ اصلی مشتری accounts است و customers فقط جایگزین', () => {
  const a = auditErpDataQuality({ accounts: [{ id: 'x', name: 'الف', nationalCode: '1234567890' }], customers: [] });
  assert.ok(has(a, 'CUST_NATIONAL_ID_INVALID', 'x'));
  const b = auditErpDataQuality({ customers: [{ id: 'y', name: 'ب', nationalCode: '1234567890' }] });
  assert.ok(has(b, 'CUST_NATIONAL_ID_INVALID', 'y'));
});

import { readFileSync } from 'node:fs';
test('پنل کیفیت داده به مرکز همگام‌سازی وصل است و حوزهٔ دید مالی/مشتری را رعایت می‌کند', () => {
  const sync = readFileSync(new URL('../src/components/SyncCenterWorkspace.tsx', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../src/components/DataQualityPanel.tsx', import.meta.url), 'utf8');
  assert.match(sync, /<DataQualityPanel state=\{state\} \/>/);
  assert.match(panel, /auditErpDataQuality\(/);
  assert.match(panel, /can\('finance', 'VIEW'\)/);
  assert.match(panel, /ارزیابی‌نشده/);
});
