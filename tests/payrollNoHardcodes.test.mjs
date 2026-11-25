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

test('commissions require verified ledger net-sales facts even with positive invoice gross',()=>{
 const state={...base, users:[{id:'u1',name:'الف',monthlySalaryRials:120_000_000,isActive:true}],
  invoices:[{id:'i1',ownerId:'u1',date:'2026-11-03',status:'POSTED',totalAmount:1_000_000_000}],
  salesTargets:[{userId:'u1',periodMonth:'2026-11',revenueTargetRials:800_000_000}],
  commissionPlans:[{isActive:true,routeDifficultyMultiplier:1,tiers:[{minAchievementPercent:100,commissionRatePercent:2}]}]};
 const noLedger=executePayrollRun(state,'2026-11','admin',30);
 assert.equal(noLedger.payslips[0].commissionRials??0,0);
 const verified=executePayrollRun(state,'2026-11','admin',30,{
  ledgerReconciled:true,periodMonth:'2026-11',netSalesBySeller:{u1:1_000_000_000}
 });
 assert.ok((verified.payslips[0].commissionRials??0)>0);
 const wrongMonth=executePayrollRun(state,'2026-11','admin',30,{
  ledgerReconciled:true,periodMonth:'2026-10',netSalesBySeller:{u1:1_000_000_000}
 });
 assert.equal(wrongMonth.payslips[0].commissionRials??0,0);
});


test('salary versions are selected by effective date, not array order or future changes',()=>{
 const u={id:'u1',name:'الف',isActive:true,monthlySalaryRials:999_000_000};
 const profile=(id,effectiveFrom,version,monthlyFixedSalaryRials)=>({id,userId:u.id,effectiveFrom,version,monthlyFixedSalaryRials,dailyBasis:30});
 const state={...base,users:[u],salaryProfiles:[profile('future','2026-12-01',3,300_000_000),profile('old','2026-01-01',1,100_000_000),profile('current','2026-11-01',2,120_000_000)]};
 assert.equal(executePayrollRun(state,'2026-11','admin',30).payslips[0].basePayRials,120_000_000);
 assert.equal(executePayrollRun({...state,salaryProfiles:[state.salaryProfiles[0]]},'2026-11','admin',30).payslips.length,0);
});

test('approved advance without approved amount is never deducted using requested amount',()=>{
 const state={...base,users:[{id:'u1',name:'الف',isActive:true,monthlySalaryRials:100_000_000}],advanceRequests:[{id:'a1',userId:'u1',targetMonth:'2026-11',status:'APPROVED',requestedAmountRials:20_000_000,approvedAmountRials:0}]};
 const result=executePayrollRun(state,'2026-11','admin',30);
 assert.equal(result.payslips[0].advanceDeductionRials,0);
 assert.deepEqual(result.settledAdvanceIds,[]);
});
