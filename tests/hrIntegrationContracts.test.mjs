import assert from 'node:assert/strict';
import test from 'node:test';
import { 
  calculateBasePay, 
  calculateOvertimePay, 
  calculateMissionPay,
  calculateCommissionForSeller, 
  generateEmployeePayslip, 
  executePayrollRun,
  simulatePerformanceAdjustment 
} from '../src/services/payrollEngine.ts';

test('HR Contracts - Base salary scales linearly with worked days (29, 30, and 31 days basis)', () => {
  const monthlySalary = 310_000_000; // 31 میلیون تومان

  // مبنای ۳۱ روزه
  assert.equal(calculateBasePay(monthlySalary, 1, 31), 10_000_000);
  assert.equal(calculateBasePay(monthlySalary, 31, 31), 310_000_000);

  // مبنای ۲۹ روزه (اسفند)
  const febSalary = 290_000_000;
  assert.equal(calculateBasePay(febSalary, 1, 29), 10_000_000);
  assert.equal(calculateBasePay(febSalary, 29, 29), 290_000_000);
});

test('HR Contracts - Complete payslip aggregation with overtime, missions, benefits and advance deduction', () => {
  const user = { id: 'u-sales-demo', name: 'رضا کریمی', username: 'r.karimi' };
  const salaryProfile = {
    id: 'sp-1',
    userId: 'u-sales-demo',
    monthlyFixedSalaryRials: 300_000_000,
    dailyBasis: 30,
    housingAllowanceRials: 20_000_000,
    laborVoucherRials: 15_000_000,
    effectiveFrom: '2026-01-01',
    version: 1
  };

  const advance = {
    id: 'adv-100',
    requestNumber: 'ADV-100',
    userId: 'u-sales-demo',
    requestedAmountRials: 50_000_000,
    approvedAmountRials: 50_000_000,
    reason: 'درمان',
    targetMonth: '2026-11',
    status: 'APPROVED',
    createdAt: new Date().toISOString()
  };

  const payslip = generateEmployeePayslip({
    runId: 'run-nov-2026',
    user,
    salaryProfile,
    month: '2026-11',
    workedDays: 30,
    approvedOvertimeHours: 10,
    approvedMissionDays: 2,
    commissionRials: 45_000_000,
    activeAdvanceRequest: advance,
    delayMinutes: 60,
    unexcusedAbsenceDays: 0
  });

  // ۱. پایه ۳۰ روز = ۳۰۰ میلیون
  assert.equal(payslip.basePayRials, 300_000_000);
  // ۲. اضافه کاری ۱۰ ساعت: (300,000,000 / 220) * 10 * 1.4 = 19,090,909
  assert.ok(payslip.overtimePayRials > 19_000_000);
  // ۳. ماموریت ۲ روز
  assert.ok(payslip.missionPayRials > 0);
  // ۴. پورسانت
  assert.equal(payslip.commissionRials, 45_000_000);
  // ۵. کسر مساعده ۵۰ میلیون
  assert.equal(payslip.advanceDeductionRials, 50_000_000);
  // ۶. خالص دریافتی = ناخالص منهای مجموع کسورات
  assert.equal(payslip.netPayableRials, payslip.grossPayRials - payslip.totalDeductionsRials);
  assert.ok(payslip.netPayableRials > 0);
});

test('HR Contracts - Idempotent Payroll Run Execution over multiple staff', () => {
  const dummyState = {
    users: [
      { id: 'u1', name: 'کارمند ۱', monthlySalaryRials: 200_000_000, isActive: true },
      { id: 'u2', name: 'کارمند ۲', monthlySalaryRials: 250_000_000, isActive: true }
    ],
    salaryProfiles: [],
    advanceRequests: [],
    invoices: [],
    salesTargets: [],
    commissionPlans: []
  };

  const { run, payslips } = executePayrollRun(dummyState, '2026-11', 'admin-user', 30);
  assert.equal(run.totalEmployees, 2);
  assert.equal(payslips.length, 2);
  assert.equal(run.periodMonth, '2026-11');
  assert.equal(run.idempotencyKey, 'PAYROLL_RUN_2026-11_30');
});
