/**
 * NotificationCenter — 2026 Zero-Clutter inbox
 * Groups unread/read, mark-all, deep-link by linkTab, type chips.
 */
import React, { useMemo, useState } from 'react';
import { Bell, CheckCheck, AlertTriangle, Info, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';

export type AppNotification = {
  id: string;
  title: string;
  message?: string;
  type?: string;
  read?: boolean;
  recipientId?: string;
  linkTab?: string;
  conversationId?: string;
  entityId?: string;
  createdAt?: string;
};

type Filter = 'ALL' | 'UNREAD' | 'TASK' | 'FINANCE' | 'SYSTEM';

const typeIcon = (t?: string) => {
  const u = (t || '').toUpperCase();
  if (u === 'ERROR' || u === 'DANGER') return <AlertCircle size={14} className="text-danger" />;
  if (u === 'WARNING') return <AlertTriangle size={14} className="text-warning" />;
  if (u === 'SUCCESS') return <CheckCircle2 size={14} className="text-success" />;
  return <Info size={14} className="text-info" />;
};

const guessBucket = (n: AppNotification): Filter => {
  const blob = `${n.title || ''} ${n.message || ''} ${n.linkTab || ''}`.toLowerCase();
  if (n.linkTab === 'tasks' || /وظیفه|تسک|معوق|پیگیری|sla/.test(blob)) return 'TASK';
  if (n.linkTab === 'finance' || /مالی|وصول|پرداخت|چک|مطالبات/.test(blob)) return 'FINANCE';
  if (n.linkTab === 'settings' || /سیستم|همگام|sync|erp/.test(blob)) return 'SYSTEM';
  return 'ALL';
};

export function NotificationCenter({
  notifications,
  onOpen,
  onMarkRead,
  onMarkAllRead,
}: {
  notifications: AppNotification[];
  onOpen: (n: AppNotification) => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('UNREAD');

  const sorted = useMemo(
    () =>
      [...notifications].sort(
        (a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '')
      ),
    [notifications]
  );

  const unreadCount = sorted.filter((n) => !n.read).length;

  const filtered = useMemo(() => {
    return sorted.filter((n) => {
      if (filter === 'UNREAD') return !n.read;
      if (filter === 'ALL') return true;
      return guessBucket(n) === filter;
    });
  }, [sorted, filter]);

  const chips: { id: Filter; label: string }[] = [
    { id: 'UNREAD', label: `خوانده‌نشده (${unreadCount.toLocaleString('fa-IR')})` },
    { id: 'ALL', label: 'همه' },
    { id: 'TASK', label: 'وظایف' },
    { id: 'FINANCE', label: 'مالی' },
    { id: 'SYSTEM', label: 'سیستم' },
  ];

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(c.id)}
              className={cn(
                'px-2.5 py-1 rounded-full text-caption font-bold border cursor-pointer transition-colors',
                filter === c.id
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-canvas text-text-secondary border-border hover:border-primary/40'
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        {unreadCount > 0 && (
          <Button variant="link" size="inline" className="shrink-0" type="button" onClick={onMarkAllRead} >
            <CheckCheck size={14} />
            همه خوانده شد
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-strong px-4 py-10 text-center text-xs font-medium text-text-secondary flex flex-col items-center gap-2">
          <Bell size={28} className="opacity-25" />
          {filter === 'UNREAD' ? 'اعلان خوانده‌نشده‌ای نیست.' : 'اعلانی در این دسته نیست.'}
        </div>
      ) : (
        <div className="space-y-2" role="list" aria-live="polite">
          {filtered.slice(0, 40).map((n) => (
            <button
              key={n.id}
              type="button"
              role="listitem"
              onClick={() => {
                if (!n.read) onMarkRead(n.id);
                onOpen(n);
              }}
              className={cn(
                'block min-h-touch w-full cursor-pointer rounded-2xl border p-3.5 text-start transition-all',
                n.read
                  ? 'border-border bg-canvas/80 opacity-75'
                  : 'border-primary/25 bg-surface shadow-xs'
              )}
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {typeIcon(n.type)}
                  <strong className="text-compact font-bold text-text-main truncate">{n.title}</strong>
                </div>
                {!n.read && (
                  <span className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" aria-label="خوانده‌نشده" />
                )}
              </div>
              {n.message && (
                <p className="text-label leading-relaxed text-text-secondary line-clamp-2">{n.message}</p>
              )}
              {n.linkTab && (
                <span className="mt-1.5 inline-block text-micro font-medium text-primary/80">
                  باز کردن: {n.linkTab === 'tasks' ? 'وظایف' : n.linkTab === 'finance' ? 'مالی' : n.linkTab}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
