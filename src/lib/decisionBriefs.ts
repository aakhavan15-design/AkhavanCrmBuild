/**
 * DecisionBriefEngine — 2026 Decision Support for ERP-backed CRM
 * Turns operational signals into ranked "what should leadership do next".
 * Pure / Edge-ready. Always tags data lineage (ERP mirror vs CRM local).
 */
import { AppState } from '../types';
import { RBACService } from './rbac';

export type DataLineage = 'ERP' | 'CRM_LOCAL' | 'HYBRID' | 'DERIVED';

export interface DecisionBrief {
  id: string;
  title: string;
  rationale: string;
  recommendedAction: string;
  path: string;
  severity: 'critical' | 'high' | 'medium' | 'info';
  lineage: DataLineage;
  lineageNote: string;
  score: number;
  tags: string[];
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Build decision briefs from current state.
 * Prefer signals that affect cash, SLA, capacity, and approval bottlenecks.
 */
export function buildDecisionBriefs(state: AppState, limit = 6): DecisionBrief[] {
  const rbac = new RBACService(state);
  const briefs: DecisionBrief[] = [];
  const today = todayISO();

  // 1) Overdue tasks capacity risk
  const openTasks = (state.tasks || []).filter(
    (t) => !['COMPLETED', 'CANCELLED', 'CANCELED'].includes(String(t.status || '').toUpperCase()) && !t.deletedAt
  );
  const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < today);
  if (overdue.length >= 3) {
    briefs.push({
      id: 'dec-overdue-capacity',
      title: `${overdue.length.toLocaleString('fa-IR')} وظیفه معوق در صف`,
      rationale: 'تجمع کار معوق نشان‌دهنده فشار ظرفیت یا مسدود بودن فرآیند است.',
      recommendedAction: 'بازبینی تخصیص و اولویت‌بندی مهلت تعهد؛ ارجاع اضافه به مدیر شعبه',
      path: '/tasks?filter=overdue',
      severity: overdue.length >= 8 ? 'critical' : 'high',
      lineage: 'CRM_LOCAL',
      lineageNote: 'منبع: وظایف عملیاتی سامانه (نه سند مالی سامانه مالی)',
      score: 90 + Math.min(overdue.length, 20),
      tags: ['ops', 'sla', 'capacity'],
    });
  }

  // 2) Internal requests stuck in review
  const pendingReqs = (state.internalRequests || []).filter(
    (r) => r.status === 'IN_REVIEW' || r.status === 'SUBMITTED' || (r as Record<string, unknown>).status === 'PENDING'
  );
  if (pendingReqs.length >= 2 && (rbac.hasPermission('internal.manage') || rbac.hasPermission('internal.view'))) {
    briefs.push({
      id: 'dec-req-bottleneck',
      title: `${pendingReqs.length.toLocaleString('fa-IR')} درخواست سازمانی در انتظار تصمیم`,
      rationale: 'گلوگاه تأیید باعث تأخیر پرسنلی و هزینه فرصت می‌شود.',
      recommendedAction: 'بررسی صندوق اتوماسیون داخلی و تصمیم‌گیری دسته‌ای',
      path: '/internal_automation?tab=inbox',
      severity: pendingReqs.length >= 5 ? 'high' : 'medium',
      lineage: 'CRM_LOCAL',
      lineageNote: 'منبع: درخواست‌های داخلی سامانه',
      score: 70 + pendingReqs.length * 2,
      tags: ['hr', 'approval', 'automation'],
    });
  }

  // 3) Finance requests awaiting ERP
  const finPending = ((state as Record<string, unknown>).financeRequests || []).filter(
    (r: Record<string, unknown>) => !r.deletedAt && ['SUBMITTED', 'APPROVED', 'ERP_PENDING', 'NEEDS_INFO'].includes(r.status)
  );
  if (finPending.length > 0 && (rbac.can?.('finance', 'VIEW') || rbac.hasPermission('finance.view'))) {
    briefs.push({
      id: 'dec-finance-erp',
      title: `${finPending.length.toLocaleString('fa-IR')} درخواست مالی در مسیر سامانه مالی`,
      rationale: 'سامانه دستور را نگه می‌دارد؛ ثبت قطعی باید در سامانه مالی انجام شود.',
      recommendedAction: 'هماهنگی با حسابداری برای بستن موارد «در انتظار ثبت در سامانه مالی»',
      path: '/finance?tab=requests',
      severity: 'medium',
      lineage: 'HYBRID',
      lineageNote: 'دستور در سامانه · سند رسمی در سامانه مالی',
      score: 65 + finPending.length,
      tags: ['finance', 'erp', 'handoff'],
    });
  }

  // 4) High-value draft quotes (local CRM, not ERP invoice)
  const threshold = 50_000_000;
  const hotQuotes = (state.quotes || []).filter(
    (q) => q.status === 'DRAFT' && Number(q.totalAmount || 0) >= threshold
  );
  if (hotQuotes.length > 0) {
    briefs.push({
      id: 'dec-hot-quotes',
      title: `${hotQuotes.length.toLocaleString('fa-IR')} پیش‌فاکتور با ارزش بالا در پیش‌نویس`,
      rationale: 'فرصت تبدیل به سفارش رسمی؛ تا قبل از تحویل هنوز سند سامانه مالی نیست.',
      recommendedAction: 'بازبینی حاشیه و ارجاع به تأیید / عملیات',
      path: '/quotes',
      severity: 'medium',
      lineage: 'CRM_LOCAL',
      lineageNote: 'قیمت‌گذاری محلی · فاکتور رسمی فقط پس از سامانه مالی',
      score: 60 + hotQuotes.length * 3,
      tags: ['sales', 'cpq'],
    });
  }

  // 6) Guidance: healthy state
  if (briefs.length === 0) {
    briefs.push({
      id: 'dec-stable',
      title: 'وضعیت عملیاتی پایدار',
      rationale: 'معوق بحرانی، گلوگاه تأیید یا صف سامانه مالی قابل توجهی دیده نشد.',
      recommendedAction: 'تمرکز روی رشد فروش و بهبود کیفیت داده‌های پایه',
      path: '/command',
      severity: 'info',
      lineage: 'DERIVED',
      lineageNote: 'جمع‌بندی از سیگنال‌های محلی و وضعیت صف‌ها',
      score: 10,
      tags: ['guidance'],
    });
  }

  return briefs.sort((a, b) => b.score - a.score).slice(0, limit);
}
