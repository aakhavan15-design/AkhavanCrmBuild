import assert from 'node:assert/strict';
import test from 'node:test';
import { 
  calculateBasePay, 
  calculateOvertimePay, 
  calculateCommissionForSeller, 
  generateEmployeePayslip, 
  executePayrollRun,
  simulatePerformanceAdjustment 
} from '../src/services/payrollEngine.ts';

test('Payroll Engine - Base Pay Reference Calculation (30M Tomans on 30 Days basis)', () => {
  const monthlySalaryRials = 300_000_000; // 30 میلیون تومان
  const basis = 30;

  // 1 روز کارکرد = 10 میلیون ریال (1 میلیون تومان)
  assert.equal(calculateBasePay(monthlySalaryRials, 1, basis), 10_000_000);

  // 10 روز کارکرد = 100 میلیون ریال (10 میلیون تومان)
  assert.equal(calculateBasePay(monthlySalaryRials, 10, basis), 100_000_000);

  // 20 روز کارکرد = 200 میلیون ریال (20 میلیون تومان)
  assert.equal(calculateBasePay(monthlySalaryRials, 20, basis), 200_000_000);

  // 30 روز کارکرد = 300 میلیون ریال (30 میلیون تومان)
  assert.equal(calculateBasePay(monthlySalaryRials, 30, basis), 300_000_000);

  // کارکرد صفر
  assert.equal(calculateBasePay(monthlySalaryRials, 0, basis), 0);
});

test('Payroll Engine - Overtime calculation with standard multiplier 1.4', () => {
  const monthlySalary = 220_000_000;
  // نرخ هر ساعت پایه = 1,000,000 ریال؛ با ضریب 1.4 برابر 1,400,000 ریال
  const overtime10Hours = calculateOvertimePay(monthlySalary, 10, 1.4);
  assert.equal(overtime10Hours, 14_000_000);
});

test('Payroll Engine - Commission Tiers Evaluation', () => {
  const target = 1_000_000_000;
  const plan = {
    isActive: true, routeDifficultyMultiplier: 1,
    tiers: [
      { minAchievementPercent: 80, maxAchievementPercent: 99.99, commissionRatePercent: 1.5 },
      { minAchievementPercent: 100, maxAchievementPercent: 119.99, commissionRatePercent: 2.5 },
      { minAchievementPercent: 120, commissionRatePercent: 3.5 },
    ],
  };
  assert.equal(calculateCommissionForSeller(target * 2, target).commissionAmountRials, 0);
  assert.equal(calculateCommissionForSeller(target * 1.19995, target, plan).ratePercent, 0);
  assert.equal(calculateCommissionForSeller(target, 0, plan).commissionAmountRials, 0);


  // زیر 80% تحقق -> پورسانت صفر
  const comm70 = calculateCommissionForSeller(700_000_000, target, plan);
  assert.equal(comm70.ratePercent, 0);
  assert.equal(comm70.commissionAmountRials, 0);

  // 90% تحقق -> نرخ 1.5%
  const comm90 = calculateCommissionForSeller(900_000_000, target, plan);
  assert.equal(comm90.ratePercent, 1.5);
  assert.equal(comm90.commissionAmountRials, 13_500_000);

  // 110% تحقق -> نرخ 2.5%
  const comm110 = calculateCommissionForSeller(1_100_000_000, target, plan);
  assert.equal(comm110.ratePercent, 2.5);
  assert.equal(comm110.commissionAmountRials, 27_500_000);

  // 130% تحقق -> نرخ 3.5%
  const comm130 = calculateCommissionForSeller(1_300_000_000, target, plan);
  assert.equal(comm130.ratePercent, 3.5);
  assert.equal(comm130.commissionAmountRials, 45_500_000);
});

test('Payroll Engine - Advance Deduction Guardrails (Cannot exceed 50% of gross pay)', () => {
  const dummyUser = { id: 'u1', name: 'کارمند تستی', username: 'test_emp' };
  const salaryProfile = {
    id: 'sp1',
    userId: 'u1',
    monthlyFixedSalaryRials: 100_000_000,
    dailyBasis: 30,
    effectiveFrom: '2026-01-01',
    version: 1
  };
  const largeAdvance = {
    id: 'adv1',
    requestNumber: 'ADV-01',
    userId: 'u1',
    requestedAmountRials: 80_000_000,
    approvedAmountRials: 80_000_000,
    reason: 'درمان',
    targetMonth: '2026-11',
    status: 'APPROVED',
    createdAt: new Date().toISOString()
  };

  const payslip = generateEmployeePayslip({
    runId: 'run-1',
    user: dummyUser,
    salaryProfile,
    month: '2026-11',
    workedDays: 30,
    activeAdvanceRequest: largeAdvance
  });

  // ناخالص ۱۰۰ میلیون ریال -> سقف کسر ۵۰ درصد (۵۰ میلیون ریال) است
  assert.equal(payslip.grossPayRials, 100_000_000);
  assert.equal(payslip.advanceDeductionRials, 50_000_000);
  assert.equal(payslip.netPayableRials, 50_000_000);
});

test('Payroll Engine - Performance & Penalty Simulator (No mutation)', () => {
  const users = [
    { id: 'u1', name: 'کارشناس ۱', monthlySalaryRials: 200_000_000 },
    { id: 'u2', name: 'کارشناس ۲', monthlySalaryRials: 250_000_000 }
  ];
  const profiles = [
    { id: 'p1', userId: 'u1', monthlyFixedSalaryRials: 200_000_000, dailyBasis: 30, effectiveFrom: '2026-01-01', version: 1 },
    { id: 'p2', userId: 'u2', monthlyFixedSalaryRials: 250_000_000, dailyBasis: 30, effectiveFrom: '2026-01-01', version: 1 }
  ];

  const sim = simulatePerformanceAdjustment({
    users,
    salaryProfiles: profiles,
    currentThresholdPercent: 80,
    newThresholdPercent: 90,
    penaltyMultiplier: 1.5,
    basePenaltyRatePercent: 3,
    complianceByUserId: { u1: 82, u2: 82 }
  });

  assert.equal(sim.currentAffectedCount, 0); // انطباق ۸۲٪ بالاتر از ۸۰٪ است
  assert.equal(sim.simulatedAffectedCount, 2); // انطباق ۸۲٪ کمتر از ۹۰٪ است
  assert.ok(sim.totalFinancialDeltaRials > 0);
  assert.equal(sim.affectedEmployees.length, 2);
});
