import type { Account, AppState, CustomerTask } from '../types.ts';
import { generateSecureId } from '../lib/secureId.ts';
import { calculateDaysOverdue } from './collectionDateUtils.ts';
import { isReceivableInvoice, estimateInvoiceRemaining } from './agingBuckets.ts';
import { getMetricThresholds } from '../lib/metricConfig.ts';
import type { DetailBalancesResult } from '../lib/receivableReconciliation.ts';

type VerifiedNetSalesWindow = {recent:number;previous:number;ledgerReconciled:boolean};

export const generateId = (prefix = 'id'): string => generateSecureId(prefix);
export { generateSecureId, calculateDaysOverdue };

export type ChurnRiskTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ChurnPredictionResult {
  accountId: string;
  accountName: string;
  churnScore: number;
  riskTier: ChurnRiskTier;
  riskTierLabel: string;
  daysSinceLastOrder: number | null;
  daysSinceLastActivity: number | null;
  unpaidOverdueAmount: number | null;
  bouncedChequesCount: number;
  revenueDropPercent: number | null;
  reasons: string[];
  recommendations: string[];
  suggestedAction: {
    title: string;
    taskType: string;
    priority: 'HIGH' | 'CRITICAL' | 'NORMAL';
  };
}

export interface ChurnPortfolioSummary {
  totalAccounts: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  averageChurnScore: number;
  atRiskAccounts: ChurnPredictionResult[];
}

const DAY_MS = 86400000;

export function predictAccountChurn(
  account: Account,
  state: AppState,
  referenceDate: Date = new Date(),
  options: { ledgerBalances?: DetailBalancesResult | null; verifiedNetSalesByPeriod?: VerifiedNetSalesWindow } = {}
): ChurnPredictionResult {
  const refMs = referenceDate.getTime();
  const t = getMetricThresholds(state.settings as Record<string, unknown> | undefined).churnThresholds;
  const reasons: string[] = [];
  const recommendations: string[] = [];
  let score = 0;

  // F0-12: منبع خرید واقعی مشتری «فاکتور معتبر ERP» است؛ پیش‌فاکتور (Quote) سفارش/خرید قطعی نیست.
  const accountInvoices = (state.invoices || []).filter(
    inv => (inv.accountId === account.id || inv.customerId === account.id) && isReceivableInvoice(inv)
  );

  let daysSinceLastOrder: number | null = null;
  if (accountInvoices.length > 0) {
    const orderDates = accountInvoices
      .map(inv => new Date(inv.date || (inv as unknown as Record<string, unknown>).issueDate as string || 0).getTime())
      .filter(ts => Number.isFinite(ts) && ts > 0 && ts <= refMs);
    if (orderDates.length > 0) {
      const latestOrderMs = Math.max(...orderDates);
      daysSinceLastOrder = Math.max(0, Math.floor((refMs - latestOrderMs) / DAY_MS));
    }
  }

  if (daysSinceLastOrder !== null) {
    if (daysSinceLastOrder >= t.daysCritical) {
      score += 40;
      reasons.push(`بیش از ${daysSinceLastOrder.toLocaleString('fa-IR')} روز از آخرین فاکتور خرید می‌گذرد`);
      recommendations.push('برگزاری جلسه بررسی نارضایتی و ارائه بسته تخفیف بازگشت');
    } else if (daysSinceLastOrder >= t.daysHigh) {
      score += 25;
      reasons.push(`بیش از ${t.daysHigh.toLocaleString('fa-IR')} روز عدم ثبت خرید جدید (${daysSinceLastOrder.toLocaleString('fa-IR')} روز)`);
      recommendations.push('تماس اختصاصی کارشناس فروش جهت استعلام نیازهای جدید کالا و پروژه‌ها');
    } else if (daysSinceLastOrder >= t.daysWatch) {
      score += 15;
      reasons.push(`بیش از ${t.daysWatch.toLocaleString('fa-IR')} روز از آخرین خرید سپری شده است`);
    }
  } else {
    const createdMs = account.createdAt ? new Date(account.createdAt).getTime() : 0;
    if (createdMs > 0 && (refMs - createdMs) > t.newAccountGraceDays * DAY_MS) {
      score += 30;
      reasons.push('حساب باسابقه بدون سابقه فاکتور خرید معتبر');
      recommendations.push('معرفی سبد کالایی جدید یا ارزیابی مجدد صلاحیت تجاری حساب');
    }
  }

  // Revenue is net of posted returns and must come from the reconciled
  // metric provider; gross invoice sums are NOT a substitute.
  const netSalesWindow = options.verifiedNetSalesByPeriod;
  const reliableWindow = netSalesWindow?.ledgerReconciled === true
    && Number.isFinite(netSalesWindow.recent) && Number.isFinite(netSalesWindow.previous);
  const recentRevenue = reliableWindow ? netSalesWindow!.recent : null;
  const prevRevenue = reliableWindow ? netSalesWindow!.previous : null;
  let revenueDropPercent: number | null = null;
  if (prevRevenue !== null && recentRevenue !== null && prevRevenue > 0 && recentRevenue < prevRevenue) {
    revenueDropPercent = Math.round(((prevRevenue - recentRevenue) / prevRevenue) * 100);
    if (revenueDropPercent >= t.revenueDropHighPercent) {
      score += 25;
      reasons.push(`کاهش ${revenueDropPercent.toLocaleString('fa-IR')} درصدی فروش خالص قطعی نسبت به دوره قبل`);
      recommendations.push('بررسی قیمت رقبا یا تغییر تأمین‌کننده توسط مشتری');
    } else if (revenueDropPercent >= t.revenueDropMediumPercent) {
      score += 15;
      reasons.push(`کاهش ${revenueDropPercent.toLocaleString('fa-IR')} درصدی فروش خالص اخیر`);
    }
  }

  const accountActivities = (state.activities || []).filter(
    a => (a.accountId === account.id || a.customerId === account.id) && !a.deletedAt && !a.isDeleted
  );
  let daysSinceLastActivity: number | null = null;
  if (accountActivities.length > 0) {
    const actDates = accountActivities
      .map(a => new Date(a.dateTime || 0).getTime())
      .filter(ts => Number.isFinite(ts) && ts > 0 && ts <= refMs);
    if (actDates.length > 0) {
      const latestActMs = Math.max(...actDates);
      daysSinceLastActivity = Math.max(0, Math.floor((refMs - latestActMs) / DAY_MS));
    }
  }

  if (daysSinceLastActivity !== null) {
    if (daysSinceLastActivity >= t.inactivityDays) {
      score += 20;
      reasons.push(`عدم ثبت هرگونه تماس، جلسه یا فعالیت در ${daysSinceLastActivity.toLocaleString('fa-IR')} روز گذشته`);
      recommendations.push('برنامه‌ریزی فوری تماس احوالپرسی یا ویزیت حضوری');
    }
  } else if (accountActivities.length === 0) {
    score += 15;
    reasons.push('هیچ سابقه ارتباط یا فعالیتی در پرونده ثبت نشده است');
  }

  // An invoice balance is NOT a financial ledger receivable.
  const remainingMap = options.ledgerBalances
    ? estimateInvoiceRemaining(options.ledgerBalances, [account], accountInvoices)
    : null;
  let overdueAmount: number | null = remainingMap && accountInvoices.length > 0 && accountInvoices.every(inv => { const remaining = remainingMap.get(inv.id); return typeof remaining === 'number' && Number.isFinite(remaining) && remaining >= 0 && (remaining === 0 || (typeof inv.dueDate === 'string' && Number.isFinite(Date.parse(inv.dueDate)))); }) ? 0 : null;
  let maxOverdueDays = 0;
  if (remainingMap) accountInvoices.forEach(inv => {
    const days = calculateDaysOverdue(inv.dueDate, referenceDate);
    if (days <= 0) return;
    const rem = remainingMap.get(inv.id);
    if (rem !== null && rem !== undefined && rem > 0) {
      if (overdueAmount !== null) overdueAmount += rem;
      if (days > maxOverdueDays) maxOverdueDays = days;
    }
  });

  if (maxOverdueDays > t.overdueCriticalDays) {
    score += 25;
    reasons.push(`وجود مطالبات معوق بحرانی با کهنگی ${maxOverdueDays.toLocaleString('fa-IR')} روز`);
    recommendations.push('مذاکره برنامه تقسیط یا تهاتر جهت تسهیل خریدهای نقدی جدید');
  } else if (maxOverdueDays > t.overdueWarningDays) {
    score += 15;
    reasons.push(`وجود مطالبات معوق سررسیدشده (${maxOverdueDays.toLocaleString('fa-IR')} روز)`);
  }

  const bouncedCheques = (state.cheques || []).filter(c => {
    const rec = c as Record<string, unknown>;
    const sameCustomer = rec.accountId === account.id || rec.customerId === account.id;
    const isGuarantee = rec.isGuarantee === true || String(rec.type || '').toUpperCase() === 'GUARANTEE';
    const isVoid = ['VOID', 'VOIDED', 'CANCELLED', 'CANCELED'].includes(String(rec.lifecycleStatus || c.status || '').toUpperCase());
    const isBounced = c.status === 'BOUNCED' || rec.status === 'RETURNED';
    return sameCustomer && !isGuarantee && !isVoid && isBounced && !rec.deletedAt && rec.isDeleted !== true;
  });
  if (bouncedCheques.length > 0) {
    score += 20;
    reasons.push(`${bouncedCheques.length.toLocaleString('fa-IR')} فقره چک برگشتی صیادی در پرونده مالی`);
    recommendations.push('تعلیق فروش اعتباری و هدایت مشتری به تسویه نقدی همراه با پیشنهاد تسویه فوری');
  }

  const openCases = (state.cases || []).filter((c: Record<string, unknown>) =>
    c.accountId === account.id && !c.deletedAt && c.isDeleted !== true && c.status !== 'CLOSED' && c.status !== 'RESOLVED'
  );
  if (openCases.length > 0) {
    score += 15;
    reasons.push(`${openCases.length.toLocaleString('fa-IR')} پرونده یا شکایت پشتیبانی باز`);
    recommendations.push('پیگیری با واحد پشتیبانی فنی و حل مسالمت‌آمیز شکایت باز');
  }

  const churnScore = Math.min(100, Math.max(0, score));

  let riskTier: ChurnRiskTier = 'LOW';
  let riskTierLabel = 'کم (سالم)';
  if (churnScore >= t.scoreCritical) {
    riskTier = 'CRITICAL';
    riskTierLabel = 'بحرانی (ریزش قریب‌الوقوع)';
  } else if (churnScore >= t.scoreHigh) {
    riskTier = 'HIGH';
    riskTierLabel = 'زیاد (نیازمند مداخله)';
  } else if (churnScore >= t.scoreMedium) {
    riskTier = 'MEDIUM';
    riskTierLabel = 'متوسط (هشدار اولیه)';
  }

  let suggestedAction: {
    title: string;
    taskType: string;
    priority: 'HIGH' | 'CRITICAL' | 'NORMAL';
  } = {
    title: 'ارزیابی فصلی و ثبت تعامل دوره‌ای',
    taskType: 'FOLLOW_UP',
    priority: 'NORMAL',
  };

  if (riskTier === 'CRITICAL') {
    suggestedAction = {
      title: `مداخله فوری جلوگیری از ریزش مشتری: ${account.name}`,
      taskType: 'RETENTION_URGENT',
      priority: 'CRITICAL',
    };
  } else if (riskTier === 'HIGH') {
    suggestedAction = {
      title: `پیگیری پیشگیرانه و جلسه بازگشت مشتری: ${account.name}`,
      taskType: 'RETENTION_INTERVENTION',
      priority: 'HIGH',
    };
  } else if (riskTier === 'MEDIUM') {
    suggestedAction = {
      title: `تماس احوالپرسی و نیازسنجی تجاری: ${account.name}`,
      taskType: 'CHECK_IN',
      priority: 'NORMAL',
    };
  }

  return {
    accountId: account.id,
    accountName: account.name,
    churnScore,
    riskTier,
    riskTierLabel,
    daysSinceLastOrder,
    daysSinceLastActivity,
    unpaidOverdueAmount: overdueAmount,
    bouncedChequesCount: bouncedCheques.length,
    revenueDropPercent,
    reasons: reasons.length > 0 ? reasons : [daysSinceLastOrder === null ? 'سابقه خرید معتبر برای ارزیابی کامل در دسترس نیست' : 'در شواهد موجود نشانه هشدار ثبت نشده است'],
    recommendations: recommendations.length > 0 ? recommendations : ['ادامه پایش و ارسال کاتالوگ محصولات جدید'],
    suggestedAction,
  };
}

export function evaluatePortfolioChurn(
  state: AppState,
  referenceDate: Date = new Date(),
  options: { ledgerBalances?: DetailBalancesResult | null; verifiedNetSalesByPeriod?: VerifiedNetSalesWindow; verifiedNetSalesByAccount?: Readonly<Record<string, VerifiedNetSalesWindow>> } = {}
): ChurnPortfolioSummary {
  const accounts = (state.accounts || []).filter(a => !a.deletedAt && !a.isDeleted);
  const results = accounts.map(acc => predictAccountChurn(acc, state, referenceDate, {
    ledgerBalances: options.ledgerBalances,
    verifiedNetSalesByPeriod: options.verifiedNetSalesByAccount?.[acc.id] ?? (accounts.length === 1 ? options.verifiedNetSalesByPeriod : undefined),
  }));

  const critical = results.filter(r => r.riskTier === 'CRITICAL');
  const high = results.filter(r => r.riskTier === 'HIGH');
  const medium = results.filter(r => r.riskTier === 'MEDIUM');
  const low = results.filter(r => r.riskTier === 'LOW');

  const sumScore = results.reduce((acc, r) => acc + r.churnScore, 0);
  const averageChurnScore = results.length > 0 ? Math.round(sumScore / results.length) : 0;

  const atRiskAccounts = [...critical, ...high].sort((a, b) => b.churnScore - a.churnScore);

  return {
    totalAccounts: accounts.length,
    criticalCount: critical.length,
    highCount: high.length,
    mediumCount: medium.length,
    lowCount: low.length,
    averageChurnScore,
    atRiskAccounts,
  };
}

export function generateChurnMitigationTask(
  account: Account,
  churnResult: ChurnPredictionResult,
  assigneeId: string,
  targetDueDate?: string
): CustomerTask {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dueDate = targetDueDate || tomorrow;

  const reasonsText = churnResult.reasons.slice(0, 3).map(r => `• ${r}`).join('\n');
  const recsText = churnResult.recommendations.slice(0, 2).map(r => `• ${r}`).join('\n');

  return {
    id: generateSecureId('id'),
    accountId: account.id,
    customerId: account.id,
    title: churnResult.suggestedAction.title,
    description: `ریسک ریزش این مشتری به سطح «${churnResult.riskTierLabel}» با امتیاز ${churnResult.churnScore.toLocaleString('fa-IR')} از ۱۰۰ رسیده است.\n\nدلایل کلیدی:\n${reasonsText}\n\nراهکارهای پیشنهادی:\n${recsText}`,
    status: 'OPEN',
    priority: churnResult.suggestedAction.priority,
    assigneeId: assigneeId || account.ownerId || 'user-admin',
    assignedTo: assigneeId || account.ownerId || 'user-admin',
    dueDate,
    createdAt: new Date().toISOString(),
    slaStatus: churnResult.riskTier === 'CRITICAL' ? 'WARNING' : 'HEALTHY',
    type: 'CALL',
  } as unknown as CustomerTask;
}
