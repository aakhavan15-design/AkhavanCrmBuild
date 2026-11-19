/**
 * DataLineageBadge — trust marker for ERP-backed CRM (2026)
 * Every decision surface should show where numbers come from.
 */
import React from 'react';
import { Database, Cloud, GitMerge, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { DataLineage } from '../../lib/decisionBriefs';

const meta: Record<
  DataLineage,
  { label: string; hint: string; className: string; icon: React.ReactNode }
> = {
  ERP: {
    label: 'سامانه مالی',
    hint: 'داده آینه‌شده از سامانه مالی/انبار',
    className: 'bg-success-soft text-success border-success-border',
    icon: <Database size={11} />,
  },
  CRM_LOCAL: {
    label: 'سامانه',
    hint: 'داده عملیاتی محلی — سند رسمی سامانه مالی نیست',
    className: 'bg-warning-soft text-warning border-warning-border',
    icon: <Cloud size={11} />,
  },
  HYBRID: {
    label: 'ترکیبی',
    hint: 'دستور/پیش‌نویس در سامانه · قطعیت در سامانه مالی',
    className: 'bg-info-soft text-info border-info/30',
    icon: <GitMerge size={11} />,
  },
  DERIVED: {
    label: 'تحلیلی',
    hint: 'محاسبه‌شده از چند منبع',
    className: 'bg-canvas text-text-secondary border-border',
    icon: <Sparkles size={11} />,
  },
};

export function DataLineageBadge({
  lineage,
  note,
  className,
}: {
  lineage: DataLineage;
  note?: string;
  className?: string;
}) {
  const m = meta[lineage];
  return (
    <span
      title={note || m.hint}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-micro font-bold',
        m.className,
        className
      )}
    >
      {m.icon}
      {m.label}
    </span>
  );
}
