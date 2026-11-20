import React, { useId } from 'react';
import { cn } from '../../lib/utils';

const describeField = (id: string, error?: string, description?: string) =>
  [description, error && `${id}-err`].filter(Boolean).join(' ') || undefined;

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', id: propId, 'aria-describedby': description, 'aria-invalid': invalid, ...props }) => {
  const generatedId = useId();
  const id = propId || generatedId;

  return (
    <div className="space-y-1 text-right" dir="rtl">
      {label && <label htmlFor={id} className="block text-caption font-semibold text-ink">{label}</label>}
      <input
        id={id}
        aria-invalid={error ? true : invalid}
        aria-describedby={describeField(id, error, description)}
        className={cn(
          "crm-text-field w-full min-w-0 bg-surface border border-border/80 rounded-lg px-3 py-2 min-h-(--size-input) text-compact text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-soft/60 focus:border-primary focus:ring-2 focus:ring-primary/15 shadow-none",
          error ? "border-danger focus:border-danger focus:ring-danger/20" : "",
          className
        )}
        {...props}
      />
      {error && <span id={`${id}-err`} role="alert" className="text-xs text-danger block mt-0.5">{error}</span>}
    </div>
  );
};

/* ── کنترل‌های پایهٔ مشترک: لیست کشویی و متن چندخطی (هم‌توکن با Input) ── */
const FIELD_BASE =
  "crm-text-field w-full min-w-0 bg-surface border border-border/80 rounded-lg px-3 text-compact text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-soft/60 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60 disabled:cursor-not-allowed";
const FIELD_ERROR = "border-danger focus:border-danger focus:ring-danger/20";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  /** compact = نوار فیلتر/جدول (ارتفاع کمتر)؛ default = فرم */
  density?: 'default' | 'compact';
}

export const Select: React.FC<SelectProps> = ({ label, error, density = 'default', className = '', id: propId, children, 'aria-describedby': description, 'aria-invalid': invalid, ...props }) => {
  const generatedId = useId();
  const id = propId || generatedId;
  const control = (
    <select
      id={id}
      aria-invalid={error ? true : invalid}
      aria-describedby={describeField(id, error, description)}
      className={cn(FIELD_BASE, "cursor-pointer", density === 'compact' ? "min-h-(--size-control-sm) py-1 text-caption" : "min-h-(--size-input) py-2", error && FIELD_ERROR, className)}
      {...props}
    >
      {children}
    </select>
  );
  if (!label && !error) return control;
  return (
    <div className="space-y-1 text-right" dir="rtl">
      {label && <label htmlFor={id} className="block text-caption font-semibold text-ink">{label}</label>}
      {control}
      {error && <span id={`${id}-err`} role="alert" className="text-xs text-danger block mt-0.5">{error}</span>}
    </div>
  );
};

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ label, error, className = '', id: propId, 'aria-describedby': description, 'aria-invalid': invalid, ...props }, ref) => {
  const generatedId = useId();
  const id = propId || generatedId;
  const control = (
    <textarea
      ref={ref}
      id={id}
      aria-invalid={error ? true : invalid}
      aria-describedby={describeField(id, error, description)}
      className={cn(FIELD_BASE, "py-2 min-h-(--size-input) resize-y", error && FIELD_ERROR, className)}
      {...props}
    />
  );
  if (!label && !error) return control;
  return (
    <div className="space-y-1 text-right" dir="rtl">
      {label && <label htmlFor={id} className="block text-caption font-semibold text-ink">{label}</label>}
      {control}
      {error && <span id={`${id}-err`} role="alert" className="text-xs text-danger block mt-0.5">{error}</span>}
    </div>
  );
});
Textarea.displayName = 'Textarea';

/** ورودی بدون قاب‌بندی (بدون label/wrapper) برای جاهایی که ساختار چیدمان از قبل وجود دارد؛ ظاهر و رفتار هم‌توکن با Input. */
export const InputControl = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  ({ className = '', invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid ? true : props['aria-invalid']}
      className={cn(FIELD_BASE, "py-2 min-h-(--size-input)", invalid && FIELD_ERROR, className)}
      {...props}
    />
  )
);
InputControl.displayName = 'InputControl';

/** چک‌باکس مرجع: اندازه و رنگ و فوکوس یکسان در تمام سامانه (RTL-safe). */
export const Checkbox = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>>(
  ({ className = '', ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn("h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50", className)}
      {...props}
    />
  )
);
Checkbox.displayName = 'Checkbox';

/** کلید روشن/خاموش مرجع برای تنظیمات (RTL-safe؛ معنایی role="switch"). */
export const Switch = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'>>(
  ({ className = '', ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      role="switch"
      className={cn(
        "relative h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-border transition-colors duration-150 checked:bg-primary",
        "before:absolute before:start-0.5 before:top-0.5 before:h-4 before:w-4 before:rounded-full before:bg-white before:shadow-xs before:transition-transform before:duration-150 before:content-['']",
        "checked:before:translate-x-4 rtl:checked:before:-translate-x-4",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Switch.displayName = 'Switch';
