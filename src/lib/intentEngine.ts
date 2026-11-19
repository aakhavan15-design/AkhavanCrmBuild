/**
 * IntentEngine — Intent-Based UI 2026 (lightweight, on-device)
 * Scores Next-Best-Actions from existing state without heavy models.
 * Pure functions — Edge-ready.
 */
import { AppState } from '../types';
import { RBACService } from './rbac';

export type IntentPriority = 'critical' | 'high' | 'medium' | 'low';

export interface IntentSuggestion {
  id: string;
  title: string;
  reason: string;
  priority: IntentPriority;
  actionLabel: string;
  path: string;
  tags: string[];
  score: number;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Rank up to `limit` next-best actions for the current user.
 * Deterministic, fast, no network.
 */
export function rankIntentSuggestions(
  state: AppState,
  limit = 3
): IntentSuggestion[] {
  const rbac = new RBACService(state);
  const user = rbac.getCurrentUser();
  const userId = user?.id;
  const today = todayISO();
  const suggestions: IntentSuggestion[] = [];

  // 1. Overdue tasks assigned to me
  const myOverdue = (state.tasks || []).filter((t) => {
    if (['COMPLETED', 'CANCELLED'].includes(t.status)) return false;
    if (!t.dueDate || t.dueDate >= today) return false;
    const assignee = t.assigneeId || t.assignedTo || t.ownerId;
    return !userId || assignee === userId;
  });
  if (myOverdue.length > 0) {
    suggestions.push({
      id: 'intent-overdue-tasks',
      title: `${myOverdue.length.toLocaleString('fa-IR')} وظیفه معوق`,
      reason: 'مهلت گذشته و هنوز بسته نشده',
      priority: 'critical',
      actionLabel: 'مشاهده وظایف',
      path: '/tasks?filter=overdue',
      tags: ['tasks', 'sla', 'today'],
      score: 100 + myOverdue.length * 5,
    });
  }

  // 2. High-priority open tasks
  const highPri = (state.tasks || []).filter(
    (t) =>
      t.priority === 'HIGH' &&
      !['COMPLETED', 'CANCELLED'].includes(t.status) &&
      (!userId || (t.assigneeId || t.assignedTo) === userId)
  );
  if (highPri.length > 0 && myOverdue.length === 0) {
    suggestions.push({
      id: 'intent-high-priority',
      title: `${highPri.length.toLocaleString('fa-IR')} وظیفه با اولویت بالا`,
      reason: 'نیازمند توجه فوری در صف شما',
      priority: 'high',
      actionLabel: 'برو به وظایف',
      path: '/tasks?priority=HIGH',
      tags: ['tasks', 'priority'],
      score: 80 + highPri.length * 3,
    });
  }

  // 3. Accounts with recent activity / risk (simple heuristic)
  const recentRiskAccounts = (state.accounts || [])
    .filter((a) => !a.deletedAt && !a.isDeleted)
    .slice(0, 40);
  // Prefer accounts that have open tasks or high value
  const accountsWithOpenWork = recentRiskAccounts.filter((a) =>
    (state.tasks || []).some(
      (t) =>
        t.accountId === a.id &&
        !['COMPLETED', 'CANCELLED'].includes(t.status)
    )
  );
  if (accountsWithOpenWork.length > 0 && rbac.can('accounts', 'VIEW')) {
    suggestions.push({
      id: 'intent-accounts-work',
      title: `${accountsWithOpenWork.length.toLocaleString('fa-IR')} مشتری با کار باز`,
      reason: 'حساب‌هایی که تسک یا پیگیری فعال دارند',
      priority: 'medium',
      actionLabel: 'مشتریان',
      path: '/customers',
      tags: ['accounts', 'followup'],
      score: 55 + accountsWithOpenWork.length,
    });
  }

  // 4. Today activities
  const todayActs = (state.activities || []).filter(
    (a) => a.dateTime?.startsWith(today) && (!userId || a.ownerId === userId)
  );
  if (todayActs.length === 0 && userId) {
    suggestions.push({
      id: 'intent-log-activity',
      title: 'ثبت فعالیت امروز',
      reason: 'هنوز فعالیتی برای امروز ثبت نشده',
      priority: 'low',
      actionLabel: 'ثبت فعالیت',
      path: '/activities?new=1',
      tags: ['activity', 'today'],
      score: 30,
    });
  }

  // 5. Finance / collection hint if permission exists
  if (rbac.can('finance', 'VIEW') || rbac.can('collections', 'VIEW')) {
    suggestions.push({
      id: 'intent-finance-pulse',
      title: 'وضعیت وصول و نقدینگی',
      reason: 'بررسی سریع مطالبات و جریان نقدی',
      priority: 'medium',
      actionLabel: 'مرکز مالی',
      path: '/finance',
      tags: ['finance', 'cash'],
      score: 45,
    });
  }

  // Sort by score desc and take top N
  return suggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
