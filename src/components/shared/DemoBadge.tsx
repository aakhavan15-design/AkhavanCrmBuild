/**
 * DemoBadge — mandatory visual marker when data is DEMO / LOCAL_TEST (2026 rule #5)
 * Never show incomplete or seed data as authoritative financial truth.
 */
import React from 'react';
import { FlaskConical } from 'lucide-react';
import { cn } from '../../lib/utils';

export function DemoBadge({
  className,
  label = 'DEMO',
  title = 'داده آزمایشی / آزمایشی — سند مالی قطعی نیست',
}: {
  className?: string;
  label?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning-soft px-2 py-0.5 text-micro font-bold text-warning',
        className
      )}
      role="status"
      aria-label={title}
    >
      <FlaskConical size={11} aria-hidden />
      {label}
    </span>
  );
}

/** Combined trust strip for report headers and KPI cards */
export function TrustStrip({
  isDemo,
  lineage,
  lineageNote,
  className,
}: {
  isDemo?: boolean;
  lineage?: import('../../lib/decisionBriefs').DataLineage;
  lineageNote?: string;
  className?: string;
}) {
  if (!isDemo && !lineage) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {isDemo && <DemoBadge />}
      {lineage && (
        <span className="contents">
          {/* lazy import avoidance — consumer can pass DataLineageBadge */}
        </span>
      )}
    </div>
  );
}
