/**
 * Lightweight Toast / System Feedback (Audit remediation)
 * -------------------------------------------------------
 * الگوی واحد برای بازخورد موفقیت / هشدار / خطا / اطلاعات.
 * استفاده:
 *   import { toast } from './Toast';
 *   toast.success('ثبت شد');
 *   toast.error('عملیات ناموفق بود', { description: '...' });
 */
import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';

type ToastKind = 'success' | 'error' | 'warning' | 'info';

interface ToastOptions {
  description?: string;
  duration?: number; // ms
}

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
  duration: number;
}

const KIND_STYLES: Record<ToastKind, string> = {
  success: 'border-success/40 bg-success-soft text-success',
  error: 'border-danger/40 bg-danger-soft text-danger',
  warning: 'border-warning/40 bg-warning-soft text-warning',
  info: 'border-info/40 bg-info-soft text-info',
};

let toastId = 0;
const listeners = new Set<(items: ToastItem[]) => void>();
let queue: ToastItem[] = [];

function emit() {
  listeners.forEach((l) => l([...queue]));
}

function push(kind: ToastKind, title: string, opts: ToastOptions = {}) {
  const item: ToastItem = {
    id: ++toastId,
    kind,
    title,
    description: opts.description,
    duration: opts.duration ?? 3800,
  };
  queue = [...queue, item].slice(-5);
  emit();
  setTimeout(() => {
    queue = queue.filter((t) => t.id !== item.id);
    emit();
  }, item.duration);
}

export const toast = {
  success: (title: string, opts?: ToastOptions) => push('success', title, opts),
  error: (title: string, opts?: ToastOptions) => push('error', title, opts),
  warning: (title: string, opts?: ToastOptions) => push('warning', title, opts),
  info: (title: string, opts?: ToastOptions) => push('info', title, opts),
};

function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--nav-h,64px)+12px)] z-[300] flex flex-col items-center gap-2 px-3 sm:bottom-6"
      aria-live="polite"
      aria-relevant="additions"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'pointer-events-auto w-full max-w-sm rounded-xl border px-4 py-3 shadow-floating backdrop-blur-sm animate-in',
            KIND_STYLES[t.kind]
          )}
        >
          <div className="text-sm font-bold" dir="auto">
            {t.title}
          </div>
          {t.description && (
            <div className="mt-0.5 text-xs opacity-90" dir="auto">
              {t.description}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** یک‌بار در ریشه اپ (مثلاً داخل Layout یا App) رندر کنید */
export function ToastProvider() {
  return <ToastViewport />;
}
