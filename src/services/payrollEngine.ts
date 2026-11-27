import type { 
  AppState, 
  UserAccount, 
  SalaryProfile, 
  AdvanceRequest, 
  Payslip, 
  PayrollRun, 
  PayslipLine, 
  SalesTarget, 
  CommissionPlan, 
  CommissionTransaction,
  EmployeePerformanceAssessment 
} from '../types.ts';
import { generateId } from '../lib/utils.ts';

/**
 * جدول پله‌های تصاعدی مالیات بر درآمد حقوق (ماده ۸۴ قانون مالیات‌های مستقیم)
 * مبالغ به ریال در ماه
 */
export interface TaxBracket {
  fromRials: number;
  toRials: number | null; // null یعنی تا بی‌نهایت
  ratePercent: number;
}

export const IRAN_MONTHLY_TAX_BRACKETS_1404_1405: TaxBracket[] = [
  { fromRials: 0, toRials: 140_000_000, ratePercent: 0 },          // تا ۱۴ میلیون تومان معاف
  { fromRials: 140_000_000, toRials: 195_000_000, ratePercent: 10 }, // از ۱۴ تا ۱۹.۵ میلیون ۱۰ درصد
  { fromRials: 195_000_000, toRials: 300_000_000, ratePercent: 15 }, // از ۱۹.۵ تا ۳۰ میلیون ۱۵ درصد
  { fromRials: 300_000_000, toRials: 450_000_000, ratePercent: 20 }, // از ۳۰ تا ۴۵ میلیون ۲۰ درصد
  { fromRials: 450_000_000, toRials: null, ratePercent: 30 }          // مازاد بر ۴۵ میلیون ۳۰ درصد
];

/**
 * محاسبه دقیق مالیات حقوق پرسنل طبق جدول تصاعدی پلکانی
 */
export function calculateSalaryTaxRials(
  taxableIncomeRials: number,
  brackets: TaxBracket[] = IRAN_MONTHLY_TAX_BRACKETS_1404_1405
): number {
  if (!Number.isFinite(taxableIncomeRials) || taxableIncomeRials <= 0) return 0;
  let tax = 0;

  for (const b of brackets) {
    if (taxableIncomeRials > b.fromRials) {
      const taxableInBracket = b.toRials === null 
        ? (taxableIncomeRials - b.fromRials) 
        : Math.min(taxableIncomeRials - b.fromRials, b.toRials - b.fromRials);
      
      tax += Math.round(taxableInBracket * (b.ratePercent / 100));
    }
  }

  return Math.max(0, tax);
}

/**
 * تولید فایل استاندارد شتاب / پایا / ساتنا برای واریز گروهی حقوق از اینترنت‌بانک
 */
export function generatePayaBankingBatchFile(
  payslips: Payslip[],
  users: UserAccount[],
  personnelFiles: Array<Record<string, unknown>> = [],
  companyName = 'گروه صنعتی اخوان'
): {
  fileName: string;
  fileContent: string;
  totalRecords: number;
  totalAmountRials: number;
} {
  const userMap = new Map(users.map(u => [u.id, u]));
  const pfMap = new Map(personnelFiles.map(pf => [pf.userId, pf]));

  let totalAmount = 0;
  let lines = 'ردیف,شماره شبا,مبلغ (ریال),نام صاحب حساب,بابت / شرح واریز,کد ملی\n';

  payslips.forEach((p, idx) => {
    const user = userMap.get(p.userId);
    const pf = pfMap.get(p.userId);
    const bank = pf?.bankAccount;
    const iban = bank && typeof bank === 'object' && 'iban' in bank && typeof bank.iban === 'string' ? bank.iban.replace(/\s/g,'').toUpperCase() : '';
    const nationalCode = String(pf?.nationalCode || user?.nationalId || '').trim();
    const amount = p.netPayableRials;
    if (!user?.name || !/^IR\d{24}$/.test(iban) || /^IR0+$/.test(iban) || !/^\d{10}$/.test(nationalCode) || /^(\d)\1{9}$/.test(nationalCode) || !Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error(`PAYROLL_BANK_EVIDENCE_INVALID:${p.userId}`);
    }

    totalAmount += amount;
    lines += `${idx + 1},"${iban}",${amount},"${user?.name || 'پرسنل'}","تسویه حقوق دوره ${p.month} ${companyName}","${nationalCode}"\n`;
  });

  const periodMonth = payslips[0]?.month;
  if (!periodMonth || payslips.some(p => p.month !== periodMonth) || new Set(payslips.map(p=>p.userId)).size !== payslips.length) throw new Error('PAYROLL_BANK_BATCH_INVALID');
  const fileName = `PAYA_BATCH_SALARY_${periodMonth}.csv`;

  return {
    fileName,
    fileContent: '\uFEFF' + lines,
    totalRecords: payslips.length,
    totalAmountRials: totalAmount
  };
}

/**
 * پردازش لاگ خام دستگاه حضور و غیاب / کارت‌خوان
 */
export function parseBiometricAttendanceLogs(rawLogsText: string): Array<{
  employeeCode: string;
  timestamp: string;
  punchType: 'IN' | 'OUT';
}> {
  if (!rawLogsText || !rawLogsText.trim()) return [];
  const lines = rawLogsText.split(/\r?\n/).filter(Boolean);
  const events: Array<{ employeeCode: string; timestamp: string; punchType: 'IN' | 'OUT' }> = [];

  for (const line of lines) {
    const parts = line.split(/[;,\t\s]+/).filter(Boolean);
    if (parts.length >= 2) {
      const employeeCode = parts[0].trim();
      const timestamp = parts[1].trim();
      const punchType = parts[2]?.toUpperCase() === 'OUT' ? 'OUT' : 'IN';
      events.push({ employeeCode, timestamp, punchType });
    }
  }

  return events;
}

/**
 * فرمول مرجع محاسبه حقوق کارکرد (بند ۵ سند اجرایی):
 * BasePay = MonthlyFixedSalary * (WorkedDays / DailyBasis)
 */
export function calculateBasePay(
  monthlyFixedSalaryRials: number,
  workedDays: number,
  dailyBasis: 29 | 30 | 31 = 30
): number {
  if (!Number.isFinite(monthlyFixedSalaryRials) || monthlyFixedSalaryRials <= 0) return 0;
  if (!Number.isFinite(workedDays) || workedDays <= 0) return 0;
  const clampedDays = Math.min(workedDays, dailyBasis);
  return Math.round((monthlyFixedSalaryRials * clampedDays) / dailyBasis);
}

export function calculateOvertimePay(
  monthlyFixedSalaryRials: number,
  approvedHours: number,
  overtimeMultiplier = 1.4
): number {
  if (!Number.isFinite(monthlyFixedSalaryRials) || monthlyFixedSalaryRials <= 0) return 0;
  if (!Number.isFinite(approvedHours) || approvedHours <= 0) return 0;
  const hourlyRate = monthlyFixedSalaryRials / 220;
  return Math.round(hourlyRate * approvedHours * overtimeMultiplier);
}

export function calculateMissionPay(
  monthlyFixedSalaryRials: number,
  approvedMissionDays: number,
  dailyBasis: 29 | 30 | 31 = 30
): number {
  if (!Number.isFinite(monthlyFixedSalaryRials) || monthlyFixedSalaryRials <= 0) return 0;
  if (!Number.isFinite(approvedMissionDays) || approvedMissionDays <= 0) return 0;
  const dailyRate = monthlyFixedSalaryRials / dailyBasis;
  return Math.round(dailyRate * approvedMissionDays * 0.4);
}

export function calculateCommissionForSeller(
  realizedSalesRials: number,
  targetRials: number,
  plan?: CommissionPlan
): {
  achievementPercent: number;
  ratePercent: number;
  commissionAmountRials: number;
} {
  if (!Number.isFinite(realizedSalesRials) || realizedSalesRials <= 0) {
    return { achievementPercent: 0, ratePercent: 0, commissionAmountRials: 0 };
  }
  if (!Number.isFinite(targetRials) || targetRials <= 0) {
    return { achievementPercent: 0, ratePercent: 0, commissionAmountRials: 0 };
  }
  const ratio = (realizedSalesRials / targetRials) * 100;
  const achievementPercent = Math.round(ratio);
  const matchedTier = plan?.isActive && Array.isArray(plan.tiers)
    ? [...plan.tiers]
      .filter(tier => Number.isFinite(tier.minAchievementPercent) && Number.isFinite(tier.commissionRatePercent)
        && tier.commissionRatePercent >= 0 && tier.commissionRatePercent <= 100)
      .sort((a,b) => b.minAchievementPercent-a.minAchievementPercent)
      .find(tier => ratio >= tier.minAchievementPercent
        && (tier.maxAchievementPercent === undefined || ratio <= tier.maxAchievementPercent))
    : undefined;
  const ratePercent = matchedTier?.commissionRatePercent ?? 0;
  const factor = plan?.routeDifficultyMultiplier;
  const multiplier = typeof factor === 'number' && Number.isFinite(factor) && factor >= 0 ? factor : 1;
  const commissionAmountRials = Math.round((realizedSalesRials * (ratePercent / 100)) * multiplier);

  return { achievementPercent, ratePercent, commissionAmountRials };
}

/** Resolve one unambiguous active commission plan by most-specific seller scope and effective month. */
export function resolveCommissionPlanForSeller(plans: CommissionPlan[], user: UserAccount, periodMonth: string): CommissionPlan | undefined {
  if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(periodMonth)) return undefined;
  const periodStart = periodMonth + '-01';
  const eligible = plans.filter(plan => {
    if (!plan.isActive || (plan.effectiveFrom && plan.effectiveFrom > periodStart) || (plan.effectiveTo && plan.effectiveTo < periodStart)) return false;
    const scope = plan.scopeType || (plan.userIds?.length ? 'USER' : plan.teamId ? 'TEAM' : plan.branchId ? 'BRANCH' : 'COMPANY');
    if (scope === 'USER') return plan.scopeId === user.id || plan.userIds?.includes(user.id) === true;
    if (scope === 'TEAM') return (plan.teamId || plan.scopeId) === user.teamId;
    if (scope === 'BRANCH') return (plan.branchId || plan.scopeId) === user.branchId;
    return scope === 'COMPANY' && !plan.userIds?.length && !plan.teamId && !plan.branchId;
  });
  const score = (plan: CommissionPlan) => {
    const scope = plan.scopeType || (plan.userIds?.length ? 'USER' : plan.teamId ? 'TEAM' : plan.branchId ? 'BRANCH' : 'COMPANY');
    return scope === 'USER' ? 4 : scope === 'TEAM' ? 3 : scope === 'BRANCH' ? 2 : 1;
  };
  if (!eligible.length) return undefined;
  const highest = Math.max(...eligible.map(score));
  const winners = eligible.filter(plan => score(plan) === highest);
  return winners.length === 1 ? winners[0] : undefined;
}
export function generateEmployeePayslip(input: {
  runId: string;
  user: UserAccount;
  salaryProfile: SalaryProfile;
  month: string;
  workedDays: number;
  approvedOvertimeHours?: number;
  approvedMissionDays?: number;
  commissionRials?: number;
  commissionCalculationStatus?: Payslip['commissionCalculationStatus'];
  activeAdvanceRequest?: AdvanceRequest;
  unexcusedAbsenceDays?: number;
  delayMinutes?: number;
  performancePenaltyRials?: number;
}): Payslip {
  const {
    runId,
    user,
    salaryProfile,
    month,
    workedDays,
    approvedOvertimeHours = 0,
    approvedMissionDays = 0,
    commissionRials = 0,
    commissionCalculationStatus,
    activeAdvanceRequest,
    unexcusedAbsenceDays = 0,
    delayMinutes = 0,
    performancePenaltyRials = 0
  } = input;

  const dailyBasis = salaryProfile.dailyBasis || 30;
  const basePayRials = calculateBasePay(salaryProfile.monthlyFixedSalaryRials, workedDays, dailyBasis);
  const overtimePayRials = calculateOvertimePay(salaryProfile.monthlyFixedSalaryRials, approvedOvertimeHours);
  const missionPayRials = calculateMissionPay(salaryProfile.monthlyFixedSalaryRials, approvedMissionDays, dailyBasis);

  const totalBenefitsRials = (salaryProfile.housingAllowanceRials || 0) +
    (salaryProfile.laborVoucherRials || 0) +
    (salaryProfile.childrenAllowanceRials || 0) +
    (salaryProfile.routeDifficultyBonusRials || 0);

  const grossPayRials = basePayRials + overtimePayRials + missionPayRials + commissionRials + totalBenefitsRials;

  // محاسبه مالیات بر حقوق
  const taxDeductionRials = calculateSalaryTaxRials(grossPayRials);

  const dailyRate = salaryProfile.monthlyFixedSalaryRials / dailyBasis;
  const absenceDeductionRials = Math.round(dailyRate * unexcusedAbsenceDays);
  const minuteRate = (salaryProfile.monthlyFixedSalaryRials / 220) / 60;
  const delayDeductionRials = Math.round(minuteRate * delayMinutes);

  let advanceDeductionRials = 0;
  if (activeAdvanceRequest && activeAdvanceRequest.status === 'APPROVED') {
    const approved = activeAdvanceRequest.approvedAmountRials;
    const rawAdvance = typeof approved === 'number' && Number.isFinite(approved) && approved > 0 ? approved : 0;
    const maxAllowable = Math.max(0, Math.floor(grossPayRials * 0.5));
    advanceDeductionRials = Math.min(rawAdvance, maxAllowable);
  }

  const totalDeductionsRials = advanceDeductionRials +
    absenceDeductionRials +
    delayDeductionRials +
    taxDeductionRials +
    performancePenaltyRials;

  const netPayableRials = Math.max(0, grossPayRials - totalDeductionsRials);

  const lines: PayslipLine[] = [
    { id: generateId(), title: `حقوق پایه (${workedDays} روز از مبنای ${dailyBasis})`, category: 'BASE', amountRials: basePayRials, isCredit: true },
    ...(overtimePayRials > 0 ? [{ id: generateId(), title: `اضافه‌کاری (${approvedOvertimeHours} ساعت)`, category: 'OVERTIME' as const, amountRials: overtimePayRials, isCredit: true }] : []),
    ...(missionPayRials > 0 ? [{ id: generateId(), title: `مأموریت (${approvedMissionDays} روز)`, category: 'MISSION' as const, amountRials: missionPayRials, isCredit: true }] : []),
    ...(commissionRials > 0 ? [{ id: generateId(), title: 'پورسانت فروش محقق‌شده', category: 'COMMISSION' as const, amountRials: commissionRials, isCredit: true }] : []),
    ...(totalBenefitsRials > 0 ? [{ id: generateId(), title: 'مزایای رفاهی و بن', category: 'BENEFIT' as const, amountRials: totalBenefitsRials, isCredit: true }] : []),
    ...(taxDeductionRials > 0 ? [{ id: generateId(), title: 'مالیات بر حقوق (ماده ۸۴)', category: 'DEDUCTION' as const, amountRials: taxDeductionRials, isCredit: false }] : []),
    ...(advanceDeductionRials > 0 ? [{ id: generateId(), title: `کسر مساعده (${activeAdvanceRequest?.requestNumber || 'مساعده'})`, category: 'ADVANCE' as const, amountRials: advanceDeductionRials, isCredit: false }] : []),
    ...(absenceDeductionRials > 0 ? [{ id: generateId(), title: `کسر غیبت (${unexcusedAbsenceDays} روز)`, category: 'DEDUCTION' as const, amountRials: absenceDeductionRials, isCredit: false }] : []),
    ...(delayDeductionRials > 0 ? [{ id: generateId(), title: `کسر تأخیر (${delayMinutes} دقیقه)`, category: 'DEDUCTION' as const, amountRials: delayDeductionRials, isCredit: false }] : []),
    ...(performancePenaltyRials > 0 ? [{ id: generateId(), title: 'کسورات انضباطی', category: 'DEDUCTION' as const, amountRials: performancePenaltyRials, isCredit: false }] : [])
  ];

  return {
    id: generateId(),
    runId,
    userId: user.id,
    month,
    workedDays,
    dailyBasis,
    basePayRials,
    approvedOvertimeHours,
    overtimePayRials,
    approvedMissionDays,
    missionPayRials,
    commissionRials,
    commissionCalculationStatus,
    totalBenefitsRials,
    grossPayRials,
    advanceDeductionRials,
    unexcusedAbsenceDays,
    absenceDeductionRials,
    delayMinutes,
    delayDeductionRials,
    performancePenaltyRials,
    totalDeductionsRials,
    netPayableRials,
    lines,
    calculationSnapshot: {
      calculatedAt: new Date().toISOString(),
      salaryProfileSnapshot: { ...salaryProfile },
      userSnapshot: { id: user.id, name: user.name, username: user.username },
      commissionCalculationStatus: commissionCalculationStatus || 'UNVERIFIED'
    },
    status: 'DRAFT',
    calculatedAt: new Date().toISOString()
  };
}

export function executePayrollRun(
  state: AppState,
  periodMonth: string,
  executedByUserId: string,
  dailyBasis: 29 | 30 | 31 = 30,
  financialEvidence?: { ledgerReconciled: true; periodMonth: string; netSalesBySeller: Record<string,number> }
): {
  run: PayrollRun;
  payslips: Payslip[];
  settledAdvanceIds: string[];
  /** کاربرانی که نه پروفایل حقوقی دارند نه حقوق ثبت‌شده؛ فیش ساختگی برایشان صادر نمی‌شود. */
  skippedUserIds: string[];
  commissionUnavailableUserIds: string[];
  commissionEvidenceMissingUserIds: string[];
  commissionTargetMissingUserIds: string[];
  commissionPlanMissingUserIds: string[];
} {
  const users = (state.users || []).filter(u => (u.isActive ?? u.active) !== false);
  const salaryProfiles = state.salaryProfiles || [];
  const advances = state.advanceRequests || [];
  const invoices = state.invoices || [];
  const targets = state.salesTargets || [];
  const plans = (state.commissionPlans || []).filter(plan => plan.isActive);
  const postedStatuses = new Set(['PAID','PARTIAL','UNPAID','OVERDUE','POSTED','FINAL']);

  const runId = generateId();
  const payslips: Payslip[] = [];
  const settledAdvanceIds: string[] = [];
  const skippedUserIds: string[] = [];
  const commissionUnavailableUserIds: string[] = [];
  const commissionEvidenceMissingUserIds: string[] = [];
  const commissionTargetMissingUserIds: string[] = [];
  const commissionPlanMissingUserIds: string[] = [];

  for (const user of users) {
    // Select only a policy effective on the first day of the payroll period.
    // A mid-period change requires explicit proration/approval; never use a future version.
    const periodStart = `${periodMonth}-01`;
    const userProfiles = salaryProfiles.filter(p => p.userId === user.id);
    const eligibleProfiles = userProfiles.filter(p => typeof p.effectiveFrom === 'string' && p.effectiveFrom <= periodStart && (!p.effectiveTo || p.effectiveTo >= periodStart));
    let profile = [...eligibleProfiles].sort((a,b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.version - a.version)[0];
    if (!profile && userProfiles.length > 0) {
      skippedUserIds.push(user.id);
      continue;
    }
    if (!profile) {
      // فقط حقوق واقعی ثبت‌شده روی کاربر؛ بدون آن فیش صادر نمی‌شود (نه عدد پیش‌فرض).
      const recordedSalary = Number(user.monthlySalaryRials);
      if (!Number.isFinite(recordedSalary) || recordedSalary <= 0) {
        skippedUserIds.push(user.id);
        continue;
      }
      profile = {
        id: generateId(),
        userId: user.id,
        monthlyFixedSalaryRials: recordedSalary,
        dailyBasis,
        effectiveFrom: `${periodMonth}-01`,
        version: 1
      };
    }

    if (!Number.isFinite(profile.monthlyFixedSalaryRials) || profile.monthlyFixedSalaryRials <= 0) {
      skippedUserIds.push(user.id);
      continue;
    }
    const activeAdvance = advances.find(a => a.userId === user.id && a.targetMonth === periodMonth && a.status === 'APPROVED');
    const userInvoices = invoices.filter(invoice => {
      const source = invoice as typeof invoice & { ownerId?: string; isDeleted?: boolean };
      return source.ownerId === user.id && !invoice.deletedAt && !source.isDeleted
        && invoice.date?.slice(0,7) === periodMonth && postedStatuses.has(invoice.status);
    });
    // Never calculate commission from gross invoice headers. Accept only an
    // explicitly reconciled seller-period net sales slice from finance.
    const evidenceReady = financialEvidence?.ledgerReconciled === true && financialEvidence.periodMonth === periodMonth;
    const verifiedSellerSales = evidenceReady ? financialEvidence.netSalesBySeller[user.id] : undefined;
    const realizedSales = typeof verifiedSellerSales === 'number' && Number.isSafeInteger(verifiedSellerSales) && verifiedSellerSales >= 0
      ? verifiedSellerSales : null;
    const matchingTargets = targets.filter(t => t.userId === user.id && t.periodMonth === periodMonth
      && (t.scopeType === undefined || t.scopeType === 'USER')
      && (t.kpiCode === undefined || t.kpiCode === 'NET_SALES_IRR')
      && t.approvalStatus === 'APPROVED' && !t.productBrand && !t.territoryId
      && Number.isSafeInteger(t.revenueTargetRials) && t.revenueTargetRials > 0);
    const userTarget = matchingTargets.length === 1 ? matchingTargets[0].revenueTargetRials : null;
    const plan = resolveCommissionPlanForSeller(plans, user, periodMonth);
    let commissionCalculationStatus: NonNullable<Payslip['commissionCalculationStatus']>;
    if (!evidenceReady) commissionCalculationStatus = 'UNVERIFIED';
    else if (realizedSales === null) commissionCalculationStatus = 'SELLER_SALES_UNAVAILABLE';
    else if (matchingTargets.length === 0) commissionCalculationStatus = 'TARGET_MISSING';
    else if (matchingTargets.length > 1) commissionCalculationStatus = 'TARGET_AMBIGUOUS';
    else if (!plan) commissionCalculationStatus = 'PLAN_MISSING';
    else commissionCalculationStatus = 'CALCULATED';
    const commissionCalc = commissionCalculationStatus === 'CALCULATED' && realizedSales !== null && userTarget !== null
      ? calculateCommissionForSeller(realizedSales, userTarget, plan)
      : { achievementPercent: 0, ratePercent: 0, commissionAmountRials: 0 };
    if (commissionCalculationStatus !== 'CALCULATED') commissionUnavailableUserIds.push(user.id);
    if (commissionCalculationStatus === 'UNVERIFIED' || commissionCalculationStatus === 'SELLER_SALES_UNAVAILABLE') commissionEvidenceMissingUserIds.push(user.id);
    if (commissionCalculationStatus === 'TARGET_MISSING' || commissionCalculationStatus === 'TARGET_AMBIGUOUS') commissionTargetMissingUserIds.push(user.id);
    if (commissionCalculationStatus === 'PLAN_MISSING') commissionPlanMissingUserIds.push(user.id);

    const payslip = generateEmployeePayslip({
      runId,
      user,
      salaryProfile: profile,
      month: periodMonth,
      workedDays: dailyBasis,
      // اضافه‌کاری و مأموریت فقط از داده تأییدشده؛ منبع حضور هنوز متصل نیست ⇒ ۰.
      approvedOvertimeHours: 0,
      approvedMissionDays: 0,
      commissionRials: commissionCalc.commissionAmountRials,
      commissionCalculationStatus,
      activeAdvanceRequest: activeAdvance
    });

    payslips.push(payslip);

    if (activeAdvance && payslip.advanceDeductionRials > 0) {
      settledAdvanceIds.push(activeAdvance.id);
    }
  }

  const totalGrossRials = payslips.reduce((sum, p) => sum + p.grossPayRials, 0);
  const totalDeductionsRials = payslips.reduce((sum, p) => sum + p.totalDeductionsRials, 0);
  const totalNetRials = payslips.reduce((sum, p) => sum + p.netPayableRials, 0);

  const run: PayrollRun = {
    id: runId,
    periodMonth,
    dailyBasis,
    totalEmployees: payslips.length,
    totalGrossRials,
    totalDeductionsRials,
    totalNetRials,
    status: 'COMPLETED',
    executedBy: executedByUserId,
    executedAt: new Date().toISOString(),
    idempotencyKey: `PAYROLL_RUN_${periodMonth}_${dailyBasis}`
  };

  return { run, payslips, settledAdvanceIds, skippedUserIds, commissionUnavailableUserIds, commissionEvidenceMissingUserIds, commissionTargetMissingUserIds, commissionPlanMissingUserIds };
}

export function simulatePerformanceAdjustment(input: {
  users: UserAccount[];
  salaryProfiles: SalaryProfile[];
  currentThresholdPercent: number;
  newThresholdPercent: number;
  penaltyMultiplier: number;
  /** نرخ پایهٔ جریمه (درصد از حقوق ثابت) — از تنظیم سازمان؛ نبود ⇒ شبیه‌سازی ناموجود. */
  basePenaltyRatePercent?: number | null;
  /** انطباق/امتیاز واقعی هر کاربر (۰–۱۰۰)؛ کاربر بدون مقدار از شبیه‌سازی کنار می‌ماند. */
  complianceByUserId?: Record<string, number | null | undefined>;
}): {
  /** null = نرخ جریمه تنظیم نشده؛ نتیجه‌ای محاسبه نشد. */
  unavailableReason: 'PENALTY_RATE_MISSING' | null;
  /** کاربران بدون حقوق یا بدون انطباق واقعی (نامشخص). */
  unknownUserIds: string[];
  currentAffectedCount: number;
  simulatedAffectedCount: number;
  totalFinancialDeltaRials: number;
  affectedEmployees: Array<{
    userId: string;
    userName: string;
    currentPenaltyRials: number;
    simulatedPenaltyRials: number;
    differenceRials: number;
  }>;
} {
  const { users, salaryProfiles, currentThresholdPercent, newThresholdPercent, penaltyMultiplier } = input;
  const rate = Number(input.basePenaltyRatePercent);
  const unknownUserIds: string[] = [];
  if (input.basePenaltyRatePercent == null || !Number.isFinite(rate) || rate < 0) {
    return { unavailableReason: 'PENALTY_RATE_MISSING', unknownUserIds, currentAffectedCount: 0, simulatedAffectedCount: 0, totalFinancialDeltaRials: 0, affectedEmployees: [] };
  }
  const affectedEmployees: Array<{ userId:string; userName:string; currentPenaltyRials:number; simulatedPenaltyRials:number; differenceRials:number }> = [];
  let currentAffected = 0;
  let simulatedAffected = 0;
  let totalDelta = 0;

  for (const user of users) {
    const base = Number(salaryProfiles.find(p => p.userId === user.id)?.monthlyFixedSalaryRials ?? user.monthlySalaryRials);
    const compliance = input.complianceByUserId?.[user.id];
    if (!Number.isFinite(base) || base <= 0 || compliance == null || !Number.isFinite(Number(compliance))) {
      unknownUserIds.push(user.id);
      continue;
    }
    const isUnderCurrent = Number(compliance) < currentThresholdPercent;
    const isUnderNew = Number(compliance) < newThresholdPercent;

    if (isUnderCurrent) currentAffected++;
    if (isUnderNew) simulatedAffected++;

    const currentPenalty = isUnderCurrent ? Math.round(base * rate / 100) : 0;
    const simulatedPenalty = isUnderNew ? Math.round(base * rate / 100 * penaltyMultiplier) : 0;
    const difference = simulatedPenalty - currentPenalty;

    if (difference !== 0 || simulatedPenalty > 0) {
      totalDelta += difference;
      affectedEmployees.push({
        userId: user.id,
        userName: user.name,
        currentPenaltyRials: currentPenalty,
        simulatedPenaltyRials: simulatedPenalty,
        differenceRials: difference
      });
    }
  }

  return {
    unavailableReason: null,
    unknownUserIds,
    currentAffectedCount: currentAffected,
    simulatedAffectedCount: simulatedAffected,
    totalFinancialDeltaRials: totalDelta,
    affectedEmployees
  };
}
