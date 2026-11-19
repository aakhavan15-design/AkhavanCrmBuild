import React, { useState, useRef, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { cn } from '../../lib/utils';
import { track, AnalyticsEvents } from '../../lib/analytics';

interface ExportMenuButtonProps {
  onExportExcel?: () => void;
  onExportCsv?: () => void;
  onPrint?: () => void;
  className?: string;
  size?: number;
  ariaLabel?: string;
}

export function ExportMenuButton({
  onExportExcel,
  onExportCsv,
  onPrint,
  className,
  size = 36,
  ariaLabel = 'خروجی',
}: ExportMenuButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const items = [
    { key: 'excel', label: 'اکسل', icon: FileSpreadsheet, onClick: onExportExcel },
    { key: 'csv', label: 'CSV', icon: FileText, onClick: onExportCsv },
    { key: 'print', label: 'چاپ', icon: Printer, onClick: onPrint },
  ].filter((i) => i.onClick);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center justify-center rounded-full border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-ink-secondary)]',
          'hover:bg-[var(--c-hover)] hover:text-[var(--c-ink-main)] transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-primary)]'
        )}
        style={{ width: size, height: size }}
      >
        <Download size={18} strokeWidth={1.75} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full mt-1 end-0 z-50 min-w-36 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] py-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--c-ink-main)] hover:bg-[var(--c-hover)]"
              onClick={() => {
                track(AnalyticsEvents.EXPORT, { format: item.key });
                item.onClick?.();
                setOpen(false);
              }}
            >
              <item.icon size={16} className="text-[var(--c-ink-muted)]" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ExportMenuButton;
