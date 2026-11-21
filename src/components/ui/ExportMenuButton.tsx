import React, { useState, useRef, useEffect, useId } from 'react';
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
  const trigger = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const focusLast = useRef(false);
  const dismiss = () => { setOpen(false); trigger.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('button');
    (focusLast.current ? items?.[items.length - 1] : items?.[0])?.focus();
    focusLast.current = false;
    const onDoc = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open]);

  const items = [
    { key: 'excel', label: 'اکسل', icon: FileSpreadsheet, onClick: onExportExcel },
    { key: 'csv', label: 'CSV سازگار با اکسل', icon: FileText, onClick: onExportCsv },
    { key: 'print', label: 'چاپ', icon: Printer, onClick: onPrint },
  ].filter((i) => i.onClick);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className={cn('relative inline-flex', className)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button
        ref={trigger}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(value => !value)}
        onKeyDown={event => {
          if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
          event.preventDefault();
          focusLast.current = event.key === 'ArrowUp';
          setOpen(true);
        }}
        className={cn(
          'inline-flex items-center justify-center rounded-full border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-ink-secondary)]',
          'hover:bg-[var(--c-hover)] hover:text-[var(--c-ink-main)] transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-primary)]'
        )}
        style={{ width: Math.max(44, size), height: Math.max(44, size) }}
      >
        <Download size={18} strokeWidth={1.75} />
      </button>
      {open && (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={ariaLabel}
          onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); return; }
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            const entries = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
            const current = entries.indexOf(document.activeElement as HTMLButtonElement);
            const offset = event.key === 'ArrowUp' ? -1 : 1;
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1
              : (current + offset + entries.length) % entries.length;
            event.preventDefault();
            entries[next]?.focus();
          }}
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
                dismiss();
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
