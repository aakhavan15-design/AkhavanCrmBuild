/**
 * MyWorkPanel — کارهای محول‌شده به من (2026 Work Queue)
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListTodo, ArrowLeft, ClipboardList, Wallet, CheckSquare } from 'lucide-react';
import { AppState } from '../../types';
import { buildMyWorkQueue, WorkItem } from '../../lib/myWorkQueue';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';

const kindIcon = (k: WorkItem['kind']) => {
  if (k === 'TASK') return <CheckSquare size={14} />;
  if (k === 'FINANCE_REQUEST') return <Wallet size={14} />;
  return <ClipboardList size={14} />;
};

const priorityTone = {
  critical: 'border-danger/25 bg-danger-soft/40 text-danger',
  high: 'border-warning/25 bg-warning-soft/40 text-warning',
  medium: 'border-border bg-surface text-text-main',
  low: 'border-border bg-canvas text-text-secondary',
};

export function MyWorkPanel({
  state,
  maxItems = 6,
  className,
}: {
  state: AppState;
  maxItems?: number;
  className?: string;
}) {
  const navigate = useNavigate();
  const items = useMemo(() => buildMyWorkQueue(state, maxItems), [state, maxItems]);

  return (
    <section className={cn('space-y-2', className)} dir="rtl" aria-label="کارهای محول‌شده">
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5">
          <ListTodo size={13} className="text-primary" />
          <span className="text-caption font-bold text-text-secondary">
            کارهای محول‌شده ({items.length.toLocaleString('fa-IR')})
          </span>
        </div>
        <Button variant="link" size="inline" type="button" onClick={() => navigate('/internal_automation?tab=inbox')} >
          اینباکس سازمانی
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-caption text-text-secondary">
          کار محول‌شده بازی ندارید.
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.path)}
              className={cn(
                'w-full flex items-center gap-2.5 rounded-xl border px-3 py-2 text-start cursor-pointer transition-all hover:shadow-xs',
                priorityTone[item.priority]
              )}
            >
              <span className="shrink-0 opacity-90">{kindIcon(item.kind)}</span>
              <div className="min-w-0 flex-1">
                <div className="text-body font-bold truncate">{item.title}</div>
                <div className="text-mini opacity-80 truncate mt-0.5">
                  {item.subtitle}
                  {item.source === 'HYBRID' ? ' · دارای منبع بیرونی' : ''}
                </div>
              </div>
              <ArrowLeft size={13} className="shrink-0 opacity-60" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
