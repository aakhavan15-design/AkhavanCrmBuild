/**
 * FollowUpInbox — unified پیگیری surface (tasks + reminders + collection)
 * Intent-Based: ranks what needs attention now.
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, PhoneCall, CheckSquare, ArrowLeft, Wallet } from 'lucide-react';
import { AppState } from '../../types';
import { RBACService } from '../../lib/rbac';
import { computeTaskReminders } from '../../lib/reminders';
import { assessTaskSla } from '../../services/taskIntelligence';
import { getPersianStatusLabel } from '../../lib/labels';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';

export type FollowUpItem = {
  id: string;
  title: string;
  reason: string;
  priority: 'critical' | 'high' | 'medium';
  path: string;
  icon: 'task' | 'overdue' | 'reminder' | 'collection' | 'call';
};

const iconMap = {
  task: <CheckSquare size={14} />,
  overdue: <AlertTriangle size={14} />,
  reminder: <Clock size={14} />,
  collection: <Wallet size={14} />,
  call: <PhoneCall size={14} />,
};

const tone = {
  critical: 'border-danger/30 bg-danger-soft/50 text-danger',
  high: 'border-warning/30 bg-warning-soft/40 text-warning',
  medium: 'border-primary/20 bg-primary-soft/30 text-primary',
};

export function buildFollowUps(state: AppState, limit = 8): FollowUpItem[] {
  const rbac = new RBACService(state);
  const userId = rbac.getCurrentUser()?.id;
  const today = new Date().toISOString().slice(0, 10);
  const items: FollowUpItem[] = [];

  const myTasks = (state.tasks || []).filter((t) => {
    if (['COMPLETED', 'CANCELLED', 'CANCELED'].includes(String(t.status || '').toUpperCase())) return false;
    if (t.deletedAt) return false;
    const assignee = t.assigneeId || t.assignedTo || t.ownerId;
    return !userId || assignee === userId;
  });

  for (const t of myTasks) {
    const sla = assessTaskSla(t);
    if (t.dueDate && t.dueDate < today) {
      items.push({
        id: `fu-overdue-${t.id}`,
        title: t.title,
        reason: `معوق از ${t.dueDate} · مهلت تعهد: ${getPersianStatusLabel(sla.state)}`,
        priority: 'critical',
        path: '/tasks?filter=overdue',
        icon: 'overdue',
      });
    } else if (sla.state === 'BREACHED' || sla.state === 'AT_RISK') {
      items.push({
        id: `fu-sla-${t.id}`,
        title: t.title,
        reason: `وضعیت مهلت تعهد: ${getPersianStatusLabel(sla.state)}`,
        priority: sla.state === 'BREACHED' ? 'critical' : 'high',
        path: '/tasks',
        icon: 'task',
      });
    } else if (t.dueDate === today) {
      items.push({
        id: `fu-today-${t.id}`,
        title: t.title,
        reason: 'سررسید امروز',
        priority: 'high',
        path: '/tasks',
        icon: 'reminder',
      });
    }
  }

  // Reminder engine events (preview without writing log)
  try {
    const reminders = computeTaskReminders(state, new Date());
    for (const r of reminders.slice(0, 5)) {
      if (userId && r.recipientId && r.recipientId !== userId) continue;
      items.push({
        id: `fu-rem-${r.key}`,
        title: r.title,
        reason: r.message,
        priority: r.type === 'ERROR' ? 'critical' : r.type === 'WARNING' ? 'high' : 'medium',
        path: '/tasks',
        icon: 'reminder',
      });
    }
  } catch {
    /* reminders optional */
  }

  // Collection-ish open tasks
  const collectionish = myTasks.filter((t) =>
    /وصول|مطالبات|چک|پرداخت|بدهی|جمع.?آوری/.test(`${t.title || ''} ${t.description || ''}`)
  );
  for (const t of collectionish.slice(0, 3)) {
    if (items.some((i) => i.id.includes(t.id))) continue;
    items.push({
      id: `fu-col-${t.id}`,
      title: t.title,
      reason: 'پیگیری وصول / مالی',
      priority: 'medium',
      path: '/finance?tab=collection',
      icon: 'collection',
    });
  }

  const rank = { critical: 3, high: 2, medium: 1 };
  return items
    .sort((a, b) => rank[b.priority] - rank[a.priority])
    .slice(0, limit);
}

export function FollowUpInbox({
  state,
  maxItems = 6,
  className,
}: {
  state: AppState;
  maxItems?: number;
  className?: string;
}) {
  const navigate = useNavigate();
  const items = useMemo(() => buildFollowUps(state, maxItems), [state, maxItems]);

  if (items.length === 0) {
    return (
      <div
        className={cn(
          'rounded-xl border border-border bg-surface px-3.5 py-3 text-small text-text-secondary',
          className
        )}
        dir="rtl"
      >
        پیگیری بازی برای امروز ندارید — وضعیت پایدار است.
      </div>
    );
  }

  return (
    <section className={cn('space-y-2', className)} dir="rtl" aria-label="صندوق پیگیری">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-caption font-bold text-text-secondary tracking-tight">
          صندوق پیگیری ({items.length.toLocaleString('fa-IR')})
        </span>
        <Button variant="link" size="inline" type="button" onClick={() => navigate('/tasks?filter=overdue')} >
          همه وظایف
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => navigate(item.path)}
            className={cn(
              'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-start transition-all cursor-pointer',
              'hover:shadow-xs active:scale-(--scale-press-subtle)',
              tone[item.priority]
            )}
          >
            <span className="shrink-0 opacity-90">{iconMap[item.icon]}</span>
            <div className="min-w-0 flex-1">
              <div className="text-body font-bold leading-tight truncate">{item.title}</div>
              <div className="text-mini opacity-80 mt-0.5 truncate">{item.reason}</div>
            </div>
            <ArrowLeft size={13} className="shrink-0 opacity-70" />
          </button>
        ))}
      </div>
    </section>
  );
}
