import React, { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '../../lib/utils';
import { X } from 'lucide-react';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  maxHeight?: string;
  hasUnsavedChanges?: boolean;
  confirmCloseMessage?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  className = '',
  maxHeight = 'max-h-(--vp-sheet)',
  hasUnsavedChanges = false,
  confirmCloseMessage = 'تغییرات ذخیره‌نشده دارید. آیا بدون ذخیره خارج می‌شوید؟',
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const requestClose = useCallback(() => {
    if (hasUnsavedChanges && typeof window !== 'undefined' && !window.confirm(confirmCloseMessage)) {
      return;
    }
    setDragOffsetY(0);
    onCloseRef.current();
  }, [hasUnsavedChanges, confirmCloseMessage]);

  // Touch gesture handling for drag-to-dismiss
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY.current;
    if (diff > 0) {
      // Pulling down
      setDragOffsetY(diff);
    }
  };

  const handleTouchEnd = () => {
    if (dragOffsetY > 110) {
      requestClose();
    } else {
      setDragOffsetY(0);
    }
    touchStartY.current = null;
  };

  useEffect(() => {
    if (!isOpen) {
      setDragOffsetY(0);
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable =
      'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

    const frame = window.requestAnimationFrame(() => {
      sheetRef.current?.querySelector<HTMLElement>(focusable)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        requestClose();
        return;
      }

      if (event.key === 'Tab' && sheetRef.current) {
        const nodes = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(focusable)).filter(
          el => el.offsetParent !== null
        );
        if (!nodes.length) {
          event.preventDefault();
          sheetRef.current.focus();
          return;
        }
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActive?.focus();
    };
  }, [isOpen, requestClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-(--z-modal) flex items-end sm:items-center justify-center pointer-events-auto"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'bottom-sheet-title' : undefined}
    >
      {/* Backdrop */}
      <div
        onClick={requestClose}
        className="fixed inset-0 bg-ink/40 backdrop-blur-sm animate-in fade-in transition-opacity"
        aria-hidden="true"
      />

      {/* Sheet Container */}
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        tabIndex={-1}
        style={{
          transform: dragOffsetY > 0 ? `translateY(${dragOffsetY}px)` : undefined,
          transition: dragOffsetY === 0 ? 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
        }}
        className={cn(
          'relative w-full sm:max-w-lg bg-surface text-ink-main shadow-floating flex flex-col outline-none z-10',
          'rounded-t-3xl sm:rounded-2xl overflow-hidden',
          'pb-[max(1rem,env(safe-area-inset-bottom,0px))]',
          maxHeight,
          'animate-in slide-in-from-bottom duration-250',
          className
        )}
      >
        {/* Pull Handle for mobile drag */}
        <div className="w-full flex justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing sm:hidden">
          <span className="w-10 h-1.5 rounded-full bg-border-strong opacity-70" />
        </div>

        {/* Header */}
        {(title || subtitle) && (
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <div className="min-w-0 pr-1">
              {title && (
                <h3 id="bottom-sheet-title" className="text-sm font-bold text-ink-main tracking-tight">
                  {title}
                </h3>
              )}
              {subtitle && <p className="text-xs text-ink-muted mt-0.5">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="بستن"
              className="p-1.5 rounded-full text-ink-muted hover:text-ink-main hover:bg-canvas transition-colors cursor-pointer"
            >
              <X size={17} />
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 text-xs leading-relaxed overscroll-contain">
          {children}
        </div>

        {/* Optional Footer */}
        {footer && (
          <div className="px-4 py-2.5 bg-surface flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
