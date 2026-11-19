// F0-08: وضعیت گزارش API فقط از Query واقعی؛ نه READY/isAuthoritative ثابت.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { buildReportStatus, REPORT_SOURCE_TABLES } from '../server/reportStatus.mjs';

const base = { reportId: 1, tenantId: 't1', asOfDate: '2026-11-16' };
// بدون SQL → UNAVAILABLE و غیرمعتبر
let r = await buildReportStatus({ ...base, driverKind: 'file', probe: null });
assert.equal(r.status, 'UNAVAILABLE'); assert.equal(r.dataTrust.isAuthoritative, false); assert.equal(r.dataTrust.provenance, null); assert.equal(r.reportDataAvailable, false);
// خطای Query → UNAVAILABLE، بدون نشت پیام خطا
r = await buildReportStatus({ ...base, driverKind: 'mssql', probe: async () => { const e = new Error('secret host db1'); e.code = 'ETIMEOUT'; throw e; } });
assert.equal(r.status, 'UNAVAILABLE'); assert.equal(r.errorCode, 'ETIMEOUT'); assert.ok(!JSON.stringify(r).includes('secret'));
// جدول‌ها خالی → EMPTY؛ ناقص → PARTIAL؛ کامل → READY
r = await buildReportStatus({ ...base, driverKind: 'mssql', probe: async () => 0 });
assert.equal(r.status, 'EMPTY'); assert.equal(r.dataTrust.isAuthoritative, false);
let i = 0;
r = await buildReportStatus({ ...base, driverKind: 'mssql', probe: async () => (i++ === 0 ? 5 : 0) });
assert.equal(r.status, 'PARTIAL'); assert.equal(r.dataTrust.isAuthoritative, false);
r = await buildReportStatus({ ...base, driverKind: 'mssql', probe: async () => 3 });
assert.equal(r.status, 'READY'); assert.equal(r.dataTrust.isAuthoritative, true);
assert.deepEqual(Object.keys(r.coverage), REPORT_SOURCE_TABLES);

const idx = readFileSync('server/index.mjs', 'utf8');
const ep = idx.slice(idx.indexOf("app.get('/api/v1/analytics/reports/:reportId'"), idx.indexOf('Intelligent Document Capture'));
assert.ok(!/status:\s*'READY'|isAuthoritative:\s*true/.test(ep), 'نباید مقدار ثابت در endpoint باشد');
assert.ok(/buildReportStatus\(/.test(ep));
console.log('reportStatusHonesty: PASS');
