import React, { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOverlayDialog } from '../../hooks/useOverlayDialog';
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
  const titleId = useId();

  const requestClose = () => {
    if (hasUnsavedChanges && typeof window !== 'undefined' && !window.confirm(confirmCloseMessage)) {
      return;
    }
    setDragOffsetY(0);
    onClose();
  };

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

  useOverlayDialog(isOpen, sheetRef, requestClose);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="crm-dialog-viewport fixed inset-0 z-(--z-modal) flex items-end sm:items-center justify-center pointer-events-auto"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : 'پنجرهٔ عملیات'}
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
        tabIndex={-1}
        style={{
          transform: dragOffsetY > 0 ? `translateY(${dragOffsetY}px)` : undefined,
          transition: dragOffsetY === 0 ? 'transform var(--motion-dialog-duration) var(--motion-dialog-easing)' : 'none',
        }}
        className={cn(
          'relative w-full sm:max-w-lg bg-surface text-ink-main shadow-floating flex flex-col outline-none z-10',
          'rounded-t-3xl sm:rounded-2xl overflow-hidden',
          'pb-[max(1rem,env(safe-area-inset-bottom,0px))]',
          'max-sm:max-h-[calc(100%-var(--safe-top))]',
          maxHeight,
          'animate-in slide-in-from-bottom duration-250',
          className
        )}
      >
        {/* Pull Handle for mobile drag */}
        <div className="w-full flex justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing touch-none sm:hidden"
          aria-hidden="true"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={() => { touchStartY.current = null; setDragOffsetY(0); }}>
          <span className="w-10 h-1.5 rounded-full bg-border-strong opacity-70" />
        </div>

        {/* Header */}
        {(
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <div className="min-w-0 pr-1">
              {title && (
                <h3 id={titleId} className="text-sm font-bold text-ink-main tracking-tight">
                  {title}
                </h3>
              )}
              {subtitle && <p className="text-xs text-ink-muted mt-0.5">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="بستن"
              className="crm-dialog-close shrink-0 grid place-items-center p-1.5 rounded-full text-ink-muted hover:text-ink-main hover:bg-canvas transition-colors cursor-pointer"
            >
              <X size={17} />
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="crm-dialog-content min-h-0 flex-1 overflow-y-auto px-4 py-3 text-xs leading-relaxed overscroll-contain">
          {children}
        </div>

        {/* Optional Footer */}
        {footer && (
          <div className="px-4 py-2.5 bg-surface flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
