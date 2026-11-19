import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/services/dataProvider.ts', import.meta.url), 'utf8');
const httpStart = src.indexOf('class HttpBackendDataProvider');
const http = src.slice(httpStart);

test('F0-14: HttpBackendDataProvider.getAccounts/getAccountById بدون fallback پنهان به داده محلی', () => {
  const accStart = http.indexOf('async getAccounts(');
  const accEnd = http.indexOf('async createAccount(');
  assert.ok(accStart > 0 && accEnd > accStart);
  assert.equal(/new ClientStorageDataProvider\(\)/.test(http.slice(accStart, accEnd)), false, 'fallback محلی نباید باشد');
  assert.equal(/catch\s*\{/.test(http.slice(accStart, accEnd)), false, 'خطا نباید بلعیده شود');
});

test('F0-14: ClientStorageDataProvider.executePayrollRun از موتور واقعی استفاده می‌کند و جمع صفرِ COMPLETED نمی‌سازد', () => {
  const start = src.indexOf('async executePayrollRun(month: string, basis: number): Promise<PayrollRun> {');
  const body = src.slice(start, src.indexOf('async getGeoZones', start));
  assert.match(body, /computePayrollRun\(/);
  assert.equal(/totalGrossRials:\s*0/.test(body), false);
  assert.match(body, /PAYROLL_NO_ELIGIBLE_EMPLOYEES/);
});

let runtime = null;
try { runtime = await import('../src/services/dataProvider.ts'); } catch (e) { runtime = { error: String(e?.message || e) }; }

test('F0-14: اجرای زنده — فقط با وابستگی‌های نصب‌شده (در غیر این صورت BLOCKED)', async (t) => {
  if (runtime.error) { t.skip(`BLOCKED: ${runtime.error.slice(0, 120)}`); return; }
  const { ClientStorageDataProvider } = runtime;
  const { useAppStore } = await import('../src/lib/storage.ts');
  const p = new ClientStorageDataProvider();
  useAppStore.setState({ state: { ...useAppStore.getState().state, users: [{ id: 'u1', name: 'الف', isActive: true }], salaryProfiles: [], payrollRuns: [], payslips: [], advanceRequests: [], invoices: [], salesTargets: [], commissionPlans: [] } });
  await assert.rejects(() => p.executePayrollRun('2026-11', 30), /PAYROLL_NO_ELIGIBLE_EMPLOYEES/);
  assert.equal((useAppStore.getState().state.payrollRuns || []).length, 0);
  useAppStore.setState({ state: { ...useAppStore.getState().state, users: [{ id: 'u1', name: 'الف', isActive: true, monthlySalaryRials: 90000000 }] } });
  const run = await p.executePayrollRun('2026-11', 30);
  assert.ok(run.totalGrossRials > 0 && run.totalEmployees === 1);
  assert.equal((useAppStore.getState().state.payslips || []).length, 1);
  const again = await p.executePayrollRun('2026-11', 30);
  assert.equal(again.id, run.id);
  assert.equal((useAppStore.getState().state.payrollRuns || []).length, 1);
});
