/**
 * IntentSurface — Intent-Based UI 2026
 * Proactive, dismissible, zero-clutter suggestion cards (max 3).
 * Uses Neo-Slate/Indigo tokens and short micro-interactions.
 */
import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X, ArrowLeft, AlertTriangle, Clock, Building2, Wallet } from 'lucide-react';
import { AppState } from '../../types';
import { rankIntentSuggestions, IntentSuggestion, IntentPriority } from '../../lib/intentEngine';
import { cn } from '../../lib/utils';

const iconFor = (s: IntentSuggestion) => {
  if (s.tags.includes('tasks') || s.tags.includes('sla')) return <AlertTriangle size={14} />;
  if (s.tags.includes('finance') || s.tags.includes('cash')) return <Wallet size={14} />;
  if (s.tags.includes('accounts')) return <Building2 size={14} />;
  return <Clock size={14} />;
};

const toneFor = (p: IntentPriority) => {
  switch (p) {
    case 'critical':
      return 'border-danger/30 bg-danger-soft/60 text-danger';
    case 'high':
      return 'border-warning/30 bg-warning-soft/50 text-warning';
    case 'medium':
      return 'border-primary/25 bg-primary-soft/40 text-primary';
    default:
      return 'border-border bg-surface text-text-secondary';
  }
};

export function IntentSurface({
  state,
  maxItems = 3,
  className,
}: {
  state: AppState;
  maxItems?: number;
  className?: string;
}) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Persist dismissals lightly for the session
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('akhavan-intent-dismissed');
      if (raw) setDismissed(new Set(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
  }, []);

  const suggestions = useMemo(() => {
    return rankIntentSuggestions(state, maxItems + 2).filter((s) => !dismissed.has(s.id));
  }, [state, maxItems, dismissed]);

  const visible = suggestions.slice(0, maxItems);

  if (visible.length === 0) return null;

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        sessionStorage.setItem('akhavan-intent-dismissed', JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <section
      aria-label="پیشنهادهای هوشمند بر اساس قصد کاری شما"
      className={cn('space-y-2', className)}
      dir="rtl"
    >
      <div className="flex items-center gap-1.5 px-0.5">
        <Sparkles size={13} className="text-primary" />
        <span className="text-caption font-medium text-text-secondary tracking-tight">
          پیشنهادهای هوشمند امروز
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {visible.map((s) => (
          <div
            key={s.id}
            className={cn(
              'group relative flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all duration-200',
              'hover:shadow-xs active:scale-(--scale-press-subtle)',
              toneFor(s.priority)
            )}
          >
            <div className="shrink-0 opacity-90">{iconFor(s)}</div>

            <div className="min-w-0 flex-1">
              <div className="text-body font-bold leading-tight truncate">{s.title}</div>
              <div className="text-mini opacity-80 mt-0.5 truncate">{s.reason}</div>
            </div>

            <button
              type="button"
              onClick={() => navigate(s.path)}
              className={cn(
                'shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-caption font-bold',
                'bg-surface/90 border border-border/50 shadow-xs cursor-pointer',
                'hover:bg-canvas transition-colors active:scale-95'
              )}
            >
              <span>{s.actionLabel}</span>
              <ArrowLeft size={12} />
            </button>

            <button
              type="button"
              onClick={() => dismiss(s.id)}
              aria-label="بستن پیشنهاد"
              className="absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full bg-surface border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-xs"
            >
              <X size={11} className="text-text-secondary" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
