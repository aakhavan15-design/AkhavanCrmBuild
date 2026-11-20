import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';
import { X, ChevronLeft } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Avatar } from './Avatar';
import { APP_VERSION_LABEL } from '../../lib/version';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  className?: string;
  /** Set when the hosted form has edits that have not been persisted. */
  hasUnsavedChanges?: boolean;
  confirmCloseMessage?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'lg',
  size,
  className = '',
  hasUnsavedChanges = false,
  confirmCloseMessage = 'تغییرات ذخیره‌نشده دارید. آیا بدون ذخیره خارج می‌شوید؟',
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const effectiveSize = size || maxWidth;
  const sheetDrag = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const requestClose = () => {
    if (hasUnsavedChanges && typeof window !== 'undefined' && !window.confirm(confirmCloseMessage)) return;
    onCloseRef.current();
  };
  
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const focusFirst = () => modalRef.current?.querySelector<HTMLElement>(focusable)?.focus();
    const frame = window.requestAnimationFrame(focusFirst);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key === 'Tab' && modalRef.current) {
        const nodes = Array.from(modalRef.current.querySelectorAll<HTMLElement>(focusable)).filter(el => el.offsetParent !== null);
        if (!nodes.length) { event.preventDefault(); modalRef.current.focus(); return; }
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
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
  }, [isOpen, hasUnsavedChanges, confirmCloseMessage]);

  if (!isOpen) return null;

  // موبایل: پنجره‌های بزرگ تمام‌صفحه؛ کوچک‌ها Bottom Sheet می‌مانند.
  const fullOnMobile = ['lg', 'xl', '2xl', '3xl'].includes(effectiveSize);
  const widthClasses: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
  };

  return createPortal(
    <div className="fixed inset-0 z-(--z-modal) flex items-end sm:items-center justify-center" dir="rtl" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div onClick={requestClose} className="fixed inset-0 bg-ink/40 backdrop-blur-sm animate-in fade-in transition-opacity" />
      
      <div
        ref={modalRef}
        className={cn(
          "relative w-full bg-surface shadow-[var(--shadow-modal)] flex flex-col z-10",
          "rounded-t-3xl sm:rounded-2xl max-h-[calc(var(--app-viewport-height,100dvh)-env(safe-area-inset-top,0px)-0.5rem)] sm:max-h-[min(86vh,calc(100dvh-2rem))]",
          "animate-in slide-in-from-bottom sm:zoom-in-95 duration-180 ease-out",
          widthClasses[effectiveSize] || 'max-w-lg',
          fullOnMobile && 'max-sm:h-dvh max-sm:max-h-none max-sm:rounded-none max-sm:pt-[env(safe-area-inset-top,0px)]',
          className
        )}
      >
        {/* هندل کشیدن موبایل با مقاومت لمسی و بازگشت فنری */}
        <div
          className={cn("w-full flex justify-center py-2 sm:hidden cursor-grab active:cursor-grabbing touch-none", fullOnMobile && "hidden")}
          onClick={requestClose}
          aria-label="برای بستن پنجره به پایین بکشید"
          onPointerDown={e => {
            sheetDrag.current = e.clientY;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            if (modalRef.current) modalRef.current.style.transition = 'none';
          }}
          onPointerMove={e => {
            if (sheetDrag.current !== null && modalRef.current) {
              const delta = e.clientY - sheetDrag.current;
              const dy = delta >= 0 ? delta : -Math.pow(Math.abs(delta), 0.72);
              modalRef.current.style.transform = `translateY(${dy}px)`;
            }
          }}
          onPointerUp={e => {
            const dy = sheetDrag.current !== null ? e.clientY - sheetDrag.current : 0;
            sheetDrag.current = null;
            if (modalRef.current) {
              modalRef.current.style.transition = 'transform 340ms cubic-bezier(0.22, 1.2, 0.36, 1)';
              modalRef.current.style.transform = '';
            }
            if (dy > 110) requestClose();
          }}
          onPointerCancel={() => {
            sheetDrag.current = null;
            if (modalRef.current) {
              modalRef.current.style.transition = 'transform 280ms cubic-bezier(0.22, 1.2, 0.36, 1)';
              modalRef.current.style.transform = '';
            }
          }}
        >
          <div className="w-10 h-1 bg-border-strong rounded-full" />
        </div>

        <div className="flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 shrink-0">
          <div>
            <h3 id={titleId} className="text-sm font-bold text-ink">{title}</h3>
            {subtitle && <p className="text-xs text-ink-soft mt-1">{subtitle}</p>}
          </div>
          <button onClick={requestClose} className="h-9 w-9 grid place-items-center bg-canvas rounded-lg text-ink-soft hover:text-ink cursor-pointer" aria-label="بستن"><X size={18} /></button>
        </div>

        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3 [scrollbar-gutter:stable]", !footer && "pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]")}>
          {children}
        </div>

        {footer && (
          <div className="px-3 pt-2 bg-surface shrink-0 sticky bottom-0 z-20 flex justify-end gap-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export interface SideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  state?: unknown;
  title?: string;
  subtitle?: string;
  width?: 'sm' | 'md' | 'lg' | string;
  children?: React.ReactNode;
  hasUnsavedChanges?: boolean;
  confirmCloseMessage?: string;
}

export const SideDrawer: React.FC<SideDrawerProps> = ({ isOpen, onClose, state, title, subtitle, children, hasUnsavedChanges = false, confirmCloseMessage = 'تغییرات ذخیره‌نشده دارید. آیا بدون ذخیره خارج می‌شوید؟' }) => {
  const requestClose = () => {
    if (hasUnsavedChanges && typeof window !== 'undefined' && !window.confirm(confirmCloseMessage)) return;
    onClose();
  };
  const navigate = useNavigate();
  const location = useLocation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" dir="rtl" role="dialog" aria-modal="true" aria-label={title || 'منو'}>
      <div onClick={requestClose} className="fixed inset-0 bg-ink/40 backdrop-blur-sm transition-opacity" />
      <div className="fixed inset-y-0 right-0 z-50 flex">
        <div
          className={cn(
            "h-full bg-surface shadow-2xl border-l border-border flex flex-col animate-in slide-in-from-right duration-220",
            "w-[min(88vw,380px)] sm:w-(--size-380) max-w-full pt-[env(safe-area-inset-top,0px)]"
          )}
        >
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-base font-extrabold text-ink">{title || 'منو'}</h3>
              {subtitle && <p className="text-xs text-ink-soft mt-0.5">{subtitle}</p>}
            </div>
            <button onClick={requestClose} className="p-1.5 text-ink-soft hover:text-ink rounded-xl hover:bg-canvas transition-colors cursor-pointer" aria-label="بستن">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] no-scrollbar">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
