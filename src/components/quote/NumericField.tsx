import React, { useEffect, useRef, useState } from 'react';
import { toLatinDigits } from '../../lib/digits';
import { cn } from '../../lib/utils';

interface Props {
  value: number | null;
  /** null = خالی یا نامعتبر؛ والد باید آن را «نامعتبر» نشان دهد (جایگزین پیش‌فرض نمی‌شود) */
  onCommit: (next: number | null) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  /** نمایش جداکنندهٔ هزارگان */
  grouped?: boolean;
}

const parse = (raw: string): number | null => {
  const clean = toLatinDigits(raw).replace(/[,٬\s]/g, '');
  if (clean === '' || !/^\d+$/.test(clean)) return null;
  const n = Number(clean);
  return Number.isSafeInteger(n) ? n : null;
};

/** ورودی عدد صحیح: هنگام تایپ فوراً به والد می‌رسد (محاسبهٔ آنی)؛ هنگام فوکوس متن کاربر دست‌نخورده می‌ماند. */
export function NumericField({ value, onCommit, ariaLabel, className, disabled, grouped = true }: Props) {
  const format = (n: number | null) => (n === null ? '' : grouped ? n.toLocaleString('fa-IR') : String(n));
  const [text, setText] = useState(format(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(format(value)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [value]);
  return (
    <input
      aria-label={ariaLabel}
      inputMode="numeric"
      disabled={disabled}
      value={text}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; setText(format(parse(text) ?? value)); }}
      onChange={(e) => { setText(e.target.value); onCommit(parse(e.target.value)); }}
      className={cn('crm-text-field w-full min-w-0 bg-surface border border-border/80 rounded-lg px-2 min-h-(--size-input) text-compact text-ink text-center font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60', className)}
    />
  );
}
