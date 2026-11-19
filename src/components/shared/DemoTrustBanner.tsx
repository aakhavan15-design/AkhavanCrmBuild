/**
 * DemoTrustBanner — mandatory when isDemoContext (2026 report rule #5)
 * Fixed strip near financial/operational numbers; never present DEMO as authoritative.
 */
import React from 'react';
import { FlaskConical, ShieldAlert } from 'lucide-react';
import { cn } from '../../lib/utils';
import { isDemoContext } from '../../lib/dataTrust';
import type { AppState } from '../../types';
import { DataLineageBadge } from './DataLineageBadge';
import type { DataLineage } from '../../lib/decisionBriefs';
import { defaultLineageForSurface, trustNote } from '../../lib/dataTrust';

export function DemoTrustBanner({
  state,
  lineage = 'DERIVED',
  className,
  surface = 'analytics',
}: {
  state: AppState;
  lineage?: DataLineage;
  className?: string;
  surface?: 'finance' | 'operations' | 'analytics' | 'decision';
}) {
  const demo = isDemoContext(state);
  if (!demo && !lineage) return null;
  const lin = lineage || defaultLineageForSurface(surface);
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-caption font-bold',
        demo
          ? 'border-warning/40 bg-warning-soft/80 text-warning'
          : 'border-border bg-canvas text-text-secondary',
        className
      )}
    >
      {demo ? <FlaskConical size={14} className="shrink-0" aria-hidden /> : <ShieldAlert size={14} className="shrink-0" aria-hidden />}
      <span className="min-w-0 flex-1 leading-relaxed">
        {demo
          ? 'داده آزمایشی — برای تصمیم مالی یا ارسال به سامانه مالی به‌عنوان واقعیت قطعی استفاده نشود.'
          : trustNote(lin, false)}
      </span>
      <DataLineageBadge lineage={lin} note={trustNote(lin, demo)} />
    </div>
  );
}

/** Gate irreversible / ERP actions when demo context is active */
export function isAuthoritativeActionAllowed(state: AppState): boolean {
  return !isDemoContext(state);
}
