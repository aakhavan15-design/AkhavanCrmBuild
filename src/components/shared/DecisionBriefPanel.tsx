/**
 * DecisionBriefPanel — guidance surface for managers (2026)
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, ArrowLeft } from 'lucide-react';
import { AppState } from '../../types';
import { buildDecisionBriefs } from '../../lib/decisionBriefs';
import { DataLineageBadge } from './DataLineageBadge';
import { cn } from '../../lib/utils';

const severityClass = {
  critical: 'border-danger/30 bg-danger-soft/40',
  high: 'border-warning/30 bg-warning-soft/40',
  medium: 'border-primary/20 bg-primary-soft/30',
  info: 'border-border bg-surface',
};

export function DecisionBriefPanel({
  state,
  maxItems = 4,
  className,
}: {
  state: AppState;
  maxItems?: number;
  className?: string;
}) {
  const navigate = useNavigate();
  const briefs = useMemo(() => buildDecisionBriefs(state, maxItems), [state, maxItems]);

  return (
    <section className={cn('space-y-2', className)} dir="rtl" aria-label="بریف تصمیم‌گیری">
      <div className="flex items-center gap-1.5 px-0.5">
        <Compass size={13} className="text-primary" />
        <span className="text-caption font-bold text-text-secondary">راهنمای تصمیم و مسیر بعدی</span>
      </div>
      <div className="space-y-1.5">
        {briefs.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => navigate(b.path)}
            className={cn(
              'w-full text-start rounded-xl border px-3 py-2.5 transition-all cursor-pointer hover:shadow-xs active:scale-(--scale-press-subtle)',
              severityClass[b.severity]
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <strong className="text-body font-bold text-text-main leading-snug">{b.title}</strong>
              <DataLineageBadge lineage={b.lineage} note={b.lineageNote} />
            </div>
            <p className="mt-1 text-caption text-text-secondary leading-relaxed">{b.rationale}</p>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-caption font-bold text-primary">{b.recommendedAction}</span>
              <ArrowLeft size={13} className="text-text-muted shrink-0" />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
