/**
 * MyWorkQueue — 2026 unified "کارهای محول‌شده"
 * Tasks assigned to me + internal requests awaiting my decision + finance requests I own.
 */
import { AppState } from '../types';
import { RBACService } from './rbac';

export type WorkKind = 'TASK' | 'INTERNAL_REQUEST' | 'FINANCE_REQUEST' | 'APPROVAL';

export interface WorkItem {
  id: string;
  kind: WorkKind;
  title: string;
  subtitle: string;
  path: string;
  dueDate?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  source: 'CRM' | 'ERP_MIRROR' | 'HYBRID';
}

export function buildMyWorkQueue(state: AppState, limit = 12): WorkItem[] {
  const rbac = new RBACService(state);
  const userId = state.currentUserId;
  if (!userId) return [];
  const today = new Date().toISOString().slice(0, 10);
  const items: WorkItem[] = [];

  // Assigned open tasks
  for (const t of state.tasks || []) {
    if (['COMPLETED', 'CANCELLED', 'CANCELED'].includes(String(t.status || '').toUpperCase())) continue;
    if (t.deletedAt) continue;
    const assignee = t.assigneeId || (t as Record<string, unknown>).assignedTo;
    if (assignee !== userId) continue;
    const overdue = t.dueDate && t.dueDate < today;
    items.push({
      id: `task-${t.id}`,
      kind: 'TASK',
      title: t.title,
      subtitle: overdue ? `معوق · ${t.dueDate}` : t.dueDate ? `مهلت ${t.dueDate}` : 'بدون مهلت',
      path: '/tasks',
      dueDate: t.dueDate,
      priority: overdue ? 'critical' : t.priority === 'HIGH' || t.priority === 'URGENT' ? 'high' : 'medium',
      source: 'CRM',
    });
  }

  // Internal requests waiting for me (approver) or I created and needs info
  const canManage = rbac.hasPermission('internal.manage');
  for (const r of state.internalRequests || []) {
    const status = String(r.status || '');
    const awaiting = ['IN_REVIEW', 'SUBMITTED', 'PENDING'].includes(status);
    if (!awaiting) continue;
    const assignedToMe = (r as Record<string, unknown>).assigneeId === userId || (r as Record<string, unknown>).approverId === userId;
    const isMine = r.creatorId === userId;
    if (!assignedToMe && !(canManage && awaiting) && !isMine) continue;
    items.push({
      id: `ireq-${r.id}`,
      kind: assignedToMe || canManage ? 'APPROVAL' : 'INTERNAL_REQUEST',
      title: r.title || `درخواست ${r.type}`,
      subtitle: isMine ? 'درخواست من · در انتظار' : `تصمیم‌گیری · ${r.type}`,
      path: '/internal_automation?tab=inbox',
      priority: status === 'IN_REVIEW' ? 'high' : 'medium',
      source: 'CRM',
    });
  }

  // Finance requests I requested still open
  for (const r of ((state as Record<string, unknown>).financeRequests || []) as Record<string, unknown>[]) {
    if (r.deletedAt) continue;
    if (!['SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'ERP_PENDING'].includes(r.status)) continue;
    if (r.requestedBy !== userId && !rbac.hasPermission('finance.view')) continue;
    items.push({
      id: `freq-${r.id}`,
      kind: 'FINANCE_REQUEST',
      title: `${r.kind === 'PAYMENT_ORDER' ? 'دستور پرداخت' : 'مجوز واریز'} · ${r.payeeName || ''}`,
      subtitle: `وضعیت ${r.status} · سامانه مالی: ${r.erpStatus || '—'}`,
      path: '/finance?tab=requests',
      dueDate: r.dueDate,
      priority: r.status === 'ERP_PENDING' ? 'high' : 'medium',
      source: 'HYBRID',
    });
  }

  const rank = { critical: 4, high: 3, medium: 2, low: 1 };
  return items.sort((a, b) => rank[b.priority] - rank[a.priority]).slice(0, limit);
}
