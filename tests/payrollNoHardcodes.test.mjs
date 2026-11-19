import assert from 'node:assert/strict';
import test from 'node:test';
import { executePayrollRun, simulatePerformanceAdjustment } from '../src/services/payrollEngine.ts';

const base = { advanceRequests: [], invoices: [], salesTargets: [], commissionPlans: [], salaryProfiles: [] };

test('F0-10: user without recorded salary is skipped, no default salary payslip', () => {
  const state = { ...base, users: [
    { id: 'u1', name: 'الف', monthlySalaryRials: 120_000_000, isActive: true },
    { id: 'u2', name: 'ب', isActive: true }
  ] };
  const { payslips, skippedUserIds, run } = executePayrollRun(state, '2026-11', 'admin', 30);
  assert.equal(payslips.length, 1);
  assert.deepEqual(skippedUserIds, ['u2']);
  assert.equal(run.totalEmployees, 1);
  assert.equal(payslips[0].approvedOvertimeHours, 0);
  assert.equal(payslips[0].approvedMissionDays, 0);
});

test('F0-10: no sales target => zero commission (no 500M assumed target)', () => {
  const state = { ...base, users: [{ id: 'u1', name: 'الف', monthlySalaryRials: 120_000_000, isActive: true }],
    invoices: [{ ownerId: 'u1', status: 'ISSUED', totalAmount: 900_000_000 }] };
  const { payslips } = executePayrollRun(state, '2026-11', 'admin', 30);
  assert.equal(payslips[0].commissionRials ?? 0, 0);
});

test('F0-10: simulator without penalty rate is UNAVAILABLE; unknown compliance excluded', () => {
  const users = [{ id: 'u1', name: 'الف', monthlySalaryRials: 100_000_000 }, { id: 'u2', name: 'ب', monthlySalaryRials: 100_000_000 }];
  const common = { users, salaryProfiles: [], currentThresholdPercent: 80, newThresholdPercent: 90, penaltyMultiplier: 1.5 };
  const none = simulatePerformanceAdjustment({ ...common, complianceByUserId: { u1: 70 } });
  assert.equal(none.unavailableReason, 'PENALTY_RATE_MISSING');
  assert.equal(none.affectedEmployees.length, 0);
  const ok = simulatePerformanceAdjustment({ ...common, basePenaltyRatePercent: 2, complianceByUserId: { u1: 70 } });
  assert.equal(ok.unavailableReason, null);
  assert.deepEqual(ok.unknownUserIds, ['u2']);
  assert.equal(ok.simulatedAffectedCount, 1);
  assert.equal(ok.affectedEmployees[0].simulatedPenaltyRials, Math.round(100_000_000 * 0.02 * 1.5));
});
