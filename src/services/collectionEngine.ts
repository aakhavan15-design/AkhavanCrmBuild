import { LEGACY_DEFAULT_CREDIT_LIMIT, getDefaultCreditLimit } from '../lib/orgPolicy.ts';
import { getMetricThresholds, type CollectionRiskThresholds } from '../lib/metricConfig.ts';
/**
 * AKHAVAN CRM - Smart Collection & Receivables Engine
 * موتور هوشمند پیگیری وصول مطالبات، رتبه‌بندی ریسک و تولید خودکار وظایف پیگیری
 */

import type { AppState, Invoice, Account, Task } from '../types.ts';
import { generateId } from '../lib/utils.ts';
import { calendarDayKey, calculateDaysOverdue } from './collectionDateUtils.ts';
import { buildAgingBuckets, isReceivableInvoice, estimateInvoiceRemaining } from './agingBuckets.ts';
import type { DynamicAgingBucket } from './agingBuckets.ts';
import { resolveCustomerBalanceView } from '../lib/receivableReconciliation.ts';
import type { DetailBalancesResult } from '../lib/receivableReconciliation.ts';

export { calculateDaysOverdue } from './collectionDateUtils.ts';

export type AgingBucket = 'CURRENT' | 'OVERDUE_1_15' | 'OVERDUE_16_30' | 'OVERDUE_31_60' | 'OVERDUE_CRITICAL';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface OverdueInvoiceInfo {
  invoice: Invoice;
  daysOverdue: number;
  bucket: AgingBucket;
  remainingAmount: number;
}

export interface CustomerCollectionProfile {
  accountId: string;
  accountName: string;
  phone?: string;
  creditLimit: number;
  totalBalance: number;
  overdueBalance: number;
  maxDaysOverdue: number;
  /** Coverage of the ledger and dated invoice evidence; partial signals are not confirmed risk. */
  agingCoverageComplete?: boolean;
  riskScore: number; // 0 (بی‌خطر) تا 100 (بحرانی‌ترین)
  riskLevel: RiskLevel;
  bouncedChequesCount: number;
  overdueInvoices: OverdueInvoiceInfo[];
  activePromises: CollectionPromiseRecord[];
  recommendedAction: string;
}

export interface CollectionPromiseRecord {
  id: string;
  accountId: string;
  accountName: string;
  invoiceId?: string;
  promisedAmount: number;
  promisedDate: string; // ISO date
  paymentMethod: string;
  sayadChequeNumber?: string;
  contactPerson: string;
  notes?: string;
  status: 'PENDING' | 'FULFILLED' | 'BROKEN';
  createdAt: string;
  createdById?: string;
  receiptEvidence?: { id: string; matchedBy?: string; matchedAt?: string };
}

export interface CollectionDashboardSummary {
  totalOverdueAmount: number;
  criticalOverdueAmount: number; // بالای ۶۰ روز
  highRiskAccountsCount: number;
  totalUnpaidInvoicesCount: number;
  todayPromisesCount: number;
  agingBuckets: {
    current: number;
    days1to15: number;
    days16to30: number;
    days31to60: number;
    days60plus: number;
  };
  /** بازه‌های سنی قابل‌تنظیم (settings.agingBucketBounds)؛ جمع بازه‌ها باید با کل مطالبات برابر باشد. */
  agingDynamic?: DynamicAgingBucket[];
  /** وضعیت اتکاپذیری منبع واحد مطالبات (reconcileReceivables) — اگر authoritative=false اعداد باید با هشدار نمایش داده شوند. */
  receivableSource?: { authoritative: boolean; issueCount: number; blockedReason?: string; /** مانده هر فاکتور تخمینی LIFO است، نه تخصیص واقعی */ estimated?: boolean };
  agingReconciliation?: { totalOutstanding: number; bucketSum: number; balanced: boolean; bounds: number[]; unattributed?: number; ledgerOutstanding?: number };
}

export { DEFAULT_AGING_BOUNDS, normalizeAgingBounds, buildAgingBuckets, NON_RECEIVABLE_INVOICE_STATUSES, isReceivableInvoice } from './agingBuckets.ts';
export type { DynamicAgingBucket } from './agingBuckets.ts';

/**
 * تعیین بازه سنی بدهی (Aging Bucket)
 */
export function getAgingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return 'CURRENT';
  if (daysOverdue <= 15) return 'OVERDUE_1_15';
  if (daysOverdue <= 30) return 'OVERDUE_16_30';
  if (daysOverdue <= 60) return 'OVERDUE_31_60';
  return 'OVERDUE_CRITICAL';
}

/**
 * محاسبه امتیاز ریسک مشتری (Risk Scoring) بین ۰ تا ۱۰۰ بر اساس آستانه‌های قابل پیکربندی
 */
export function calculateCustomerRiskScore(
  account: Account,
  overdueBalance: number,
  maxDaysOverdue: number,
  bouncedChequesCount: number,
  fallbackCreditLimit: number = LEGACY_DEFAULT_CREDIT_LIMIT,
  thresholds: CollectionRiskThresholds = getMetricThresholds(undefined).collectionRiskThresholds
): { score: number; level: RiskLevel } {
  let score = 0;

  // ۱. فاکتور روزهای تأخیر (حداکثر ۴۰ امتیاز)
  if (maxDaysOverdue > thresholds.overdueCriticalDays) {
    score += 40;
  } else if (maxDaysOverdue > thresholds.overdueHighDays) {
    score += 25;
  } else if (maxDaysOverdue > thresholds.overdueMediumDays) {
    score += 15;
  } else if (maxDaysOverdue > 0) {
    score += 5;
  }

  // ۲. نسبت بدهی به سقف اعتبار (حداکثر ۳۰ امتیاز)
  const creditLimit = account.creditLimit || fallbackCreditLimit;
  const ratio = creditLimit > 0 ? overdueBalance / creditLimit : 0;
  if (ratio >= thresholds.creditRatioCritical) {
    score += 30;
  } else if (ratio >= thresholds.creditRatioHigh) {
    score += 20;
  } else if (ratio >= thresholds.creditRatioMedium) {
    score += 10;
  }

  // ۳. چک‌های برگشتی
  score += Math.min(thresholds.maxBouncedPoints, bouncedChequesCount * thresholds.bouncedChequePoints);

  score = Math.min(100, Math.max(0, score));

  let level: RiskLevel = 'LOW';
  if (score >= thresholds.scoreCritical) level = 'CRITICAL';
  else if (score >= thresholds.scoreHigh) level = 'HIGH';
  else if (score >= thresholds.scoreMedium) level = 'MEDIUM';

  return { score, level };
}

/**
 * استخراج و تحلیل پروفایل مطالبات تمام مشتریان سازمان
 */
export function evaluateAllCustomerCollections(
  state: AppState,
  referenceDate: Date = new Date(),
  /** مانده دفتری (Σبدهکار−Σبستانکار تفصیلی×معین) از DataProvider.getDetailSubsidiaryBalances؛ بدون آن سن مطالبات «نامشخص» است. */
  ledgerBalances?: DetailBalancesResult | null
): { profiles: CustomerCollectionProfile[]; summary: CollectionDashboardSummary } {
  const accounts = state.accounts || [];
  const invoices = state.invoices || [];
  const cheques = state.cheques || [];
  const promises: CollectionPromiseRecord[] = (state as Record<string, unknown>).collectionPromises as CollectionPromiseRecord[] || [];
  const riskThresholds = getMetricThresholds(state.settings as Record<string, unknown> | undefined).collectionRiskThresholds;

  const profiles: CustomerCollectionProfile[] = [];

  const summary: CollectionDashboardSummary = {
    totalOverdueAmount: 0,
    criticalOverdueAmount: 0,
    highRiskAccountsCount: 0,
    totalUnpaidInvoicesCount: 0,
    todayPromisesCount: 0,
    agingBuckets: {
      current: 0,
      days1to15: 0,
      days16to30: 0,
      days31to60: 0,
      days60plus: 0
    }
  };

  const todayStr = referenceDate.toISOString().split('T')[0];
  // قاعدهٔ مالک (F0-16): مانده هر فاکتور از مانده دفتری مشتری و به‌صورت LIFO (از آخرین فاکتور به عقب) تخمین زده می‌شود؛
  // مانده/وضعیت/پرداخت ذخیره‌شدهٔ فاکتور و تخصیص CRM مبنا نیست. بدون مانده دفتری ⇒ نامشخص (بدون عدد ساختگی).
  const remainingByInvoice = estimateInvoiceRemaining(ledgerBalances, accounts, invoices);
  const ledgerIssueCount = accounts.filter(acc => {
    const view = resolveCustomerBalanceView(ledgerBalances, acc);
    return view.kind !== 'OK' || view.incomplete || !Number.isFinite(view.total);
  }).length;
  const ledgerReady = ledgerBalances?.status === 'LIVE' && ledgerIssueCount === 0;
  summary.receivableSource = {
    authoritative: ledgerReady, issueCount: ledgerIssueCount, estimated: true,
    blockedReason: ledgerReady ? undefined : 'مانده دفتری کامل و معتبر برای همه مشتریان در دسترس نیست؛ سن مطالبات و جمع‌ها قطعی نیستند.'
  };
  const agingItems: { days: number; amount: number }[] = [];

  let ledgerOutstanding = 0;
  let missingCoverageCount = 0;
  accounts.forEach(acc => {
    const balanceView = resolveCustomerBalanceView(ledgerBalances, acc);
    const validBalance = balanceView.kind === 'OK' && !balanceView.incomplete && Number.isFinite(balanceView.total);
    const ledgerAmount = validBalance ? Math.max(0, balanceView.total) : 0;
    ledgerOutstanding += ledgerAmount;
    let datedCoverage = 0;
    // استخراج فاکتورهای پرداخت‌نشده این مشتری
    const customerInvoices = invoices.filter(
      inv => (inv.accountId === acc.id || inv.customerId === acc.id) && isReceivableInvoice(inv)
    );

    const overdueList: OverdueInvoiceInfo[] = [];
    let overdueBalance = 0;
    let maxDaysOverdue = 0;

    customerInvoices.forEach(inv => {
      const remaining = remainingByInvoice.get(inv.id);
      if (remaining === null || remaining === undefined || remaining <= 0) return;

      summary.totalUnpaidInvoicesCount++;
      const due = inv.dueDate ? calendarDayKey(inv.dueDate) : null;
      if (!due || !Number.isFinite(Date.parse(`${due}T00:00:00.000Z`)) || new Date(`${due}T00:00:00.000Z`).toISOString().slice(0, 10) !== due) return;
      datedCoverage += remaining;
      const days = calculateDaysOverdue(due, referenceDate);
      const bucket = getAgingBucket(days);
      agingItems.push({ days, amount: remaining });

      if (days > 0) {
        overdueBalance += remaining;
        if (days > maxDaysOverdue) maxDaysOverdue = days;

        overdueList.push({
          invoice: inv,
          daysOverdue: days,
          bucket,
          remainingAmount: remaining
        });

        if (days <= 15) summary.agingBuckets.days1to15 += remaining;
        else if (days <= 30) summary.agingBuckets.days16to30 += remaining;
        else if (days <= 60) summary.agingBuckets.days31to60 += remaining;
        else {
          summary.agingBuckets.days60plus += remaining;
          summary.criticalOverdueAmount += remaining;
        }
      } else {
        summary.agingBuckets.current += remaining;
      }
    });

    const incompleteAging = validBalance && ledgerAmount - datedCoverage >= 0.5;
    if (incompleteAging) missingCoverageCount++;
    if (overdueBalance > 0) {
      summary.totalOverdueAmount += overdueBalance;
    }

    // استخراج چک‌های برگشتی مشتری (بدون چک‌های ضمانتی، باطل‌شده و حذف‌شده)
    const bouncedCheques = cheques.filter(ch => {
      const rec = ch as Record<string, unknown>;
      const sameCustomer = rec.accountId === acc.id || rec.customerId === acc.id;
      const isGuarantee = rec.isGuarantee === true || String(rec.type || '').toUpperCase() === 'GUARANTEE';
      const isVoid = ['VOID', 'VOIDED', 'CANCELLED', 'CANCELED'].includes(String(rec.lifecycleStatus || ch.status || '').toUpperCase());
      const isBounced = ch.status === 'BOUNCED' || rec.status === 'RETURNED';
      return sameCustomer && !isGuarantee && !isVoid && isBounced && !rec.deletedAt && rec.isDeleted !== true;
    });

    const { score, level } = calculateCustomerRiskScore(
      acc,
      overdueBalance,
      maxDaysOverdue,
      bouncedCheques.length,
      getDefaultCreditLimit(state),
      riskThresholds
    );

    if (level === 'HIGH' || level === 'CRITICAL') {
      summary.highRiskAccountsCount++;
    }

    const customerPromises = promises.filter(p => p.accountId === acc.id && p.status === 'PENDING');
    customerPromises.forEach(p => {
      if (p.promisedDate && p.promisedDate.startsWith(todayStr)) {
        summary.todayPromisesCount++;
      }
    });

    let recommendedAction = 'وضعیت مالی عادی و پیگیری ملایم';
    if (level === 'CRITICAL') {
      recommendedAction = 'توقف فوری فروش اعتباری + تماس تلفنی مدیر مالی + اقدام پیگیری بر روی چک';
    } else if (level === 'HIGH') {
      recommendedAction = 'محدودسازی فروش اعتباری + دریافت وعده واریز با سررسید حداکثر ۴۸ ساعته';
    } else if (level === 'MEDIUM') {
      recommendedAction = 'ارسال یادآوری محترمانه سررسید + هماهنگی با ویزیتور منطقه';
    }

    if (!validBalance || incompleteAging) {
      recommendedAction = 'ابتدا تکمیل و تطبیق مانده دفتری مشتری؛ ریسک مطالبات هنوز قطعی نیست.';
    }
    profiles.push({
      accountId: acc.id,
      accountName: acc.name,
      phone: acc.phone,
      creditLimit: acc.creditLimit || getDefaultCreditLimit(state),
      totalBalance: ledgerAmount,
      overdueBalance,
      maxDaysOverdue,
      agingCoverageComplete: validBalance && !incompleteAging,
      riskScore: score,
      riskLevel: level,
      bouncedChequesCount: bouncedCheques.length,
      overdueInvoices: overdueList,
      activePromises: customerPromises,
      recommendedAction
    });
  });

  profiles.sort((a, b) => b.riskScore - a.riskScore || b.overdueBalance - a.overdueBalance);

  const aging = buildAgingBuckets(agingItems, (state.settings as Record<string, unknown> | undefined)?.agingBucketBounds);
  summary.agingDynamic = aging.buckets;
  const unattributed = Math.max(0, ledgerOutstanding - aging.total);
  summary.agingReconciliation = { totalOutstanding: ledgerOutstanding, bucketSum: aging.bucketSum, balanced: aging.balanced && Math.abs(ledgerOutstanding - aging.bucketSum) < 0.5 && ledgerIssueCount === 0, bounds: aging.bounds, unattributed, ledgerOutstanding };
  if (missingCoverageCount > 0 && summary.receivableSource) {
    summary.receivableSource.authoritative = false;
    summary.receivableSource.issueCount += missingCoverageCount;
    summary.receivableSource.blockedReason = 'بخشی از مانده دفتری فاقد پوشش فاکتور یا تاریخ سررسید معتبر است؛ جمع سنی قطعی نیست.';
  }
  return { profiles, summary };
}

/**
 * ایجاد خودکار وظیفه (Task) پیگیری وصول در کارتابل تسک‌ها و تقویم شمسی
 */
export function generateCollectionTaskForAccount(
  account: Account,
  profile: CustomerCollectionProfile,
  assignedUserId: string,
  targetDueDate: string,
  negotiationNote?: string
): Task {
  const isCritical = profile.riskLevel === 'CRITICAL';

  return {
    id: generateId(),
    accountId: account.id,
    customerId: account.id,
    title: `پیگیری وصول مطالبات معوق: ${account.name}`,
    description: `مشتری دارای ${profile.overdueBalance.toLocaleString('fa-IR')} ریال بدهی معوق (${profile.maxDaysOverdue} روز تأخیر) و سطح ریسک ${profile.riskLevel} است. ${negotiationNote ? 'یادداشت: ' + negotiationNote : 'اقدام الزامی: تماس با مدیریت جهت وصول و اخذ تعهد واریز.'}`,
    dueDate: targetDueDate,
    priority: isCritical ? 'URGENT' : 'HIGH',
    status: 'PENDING',
    type: 'CALL',
    ownerId: assignedUserId,
    createdAt: new Date().toISOString()
  };
}
