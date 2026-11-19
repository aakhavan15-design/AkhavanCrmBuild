/**
 * ProgressiveDisclosure — Zero-Clutter 2026
 * Shows summary first; expands details only on demand.
 * Use in dense tables / cards (Customers, Finance, Operations).
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';

export function ProgressiveDisclosure({
  summary,
  children,
  defaultOpen = false,
  className,
  summaryClassName,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  summaryClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn('rounded-xl border border-border bg-surface overflow-hidden', className)} dir="rtl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-start cursor-pointer',
          'hover:bg-canvas/80 transition-colors',
          summaryClassName
        )}
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">{summary}</div>
        <span className="shrink-0 text-text-secondary">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>
      {open && (
        <div className="border-t border-border px-3.5 py-3 animate-in fade-in slide-in-from-top-1 duration-150">
          {children}
        </div>
      )}
    </div>
  );
}
