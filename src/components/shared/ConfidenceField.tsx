import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, Eye, Edit3, Check } from 'lucide-react';
import { toPersianDigits } from '../../lib/digits';
import { formatCurrency } from '../../lib/utils';

export interface ConfidenceFieldProps {
  label: string;
  value: string | number | null | undefined;
  confidence: number; // 0 to 1
  onChange: (value: any) => void;
  status?: 'EXTRACTED' | 'NEEDS_REVIEW' | 'MISSING';
  threshold?: number; // threshold below which a field needs review (default 0.8)
  reviewReason?: string;
  evidence?: string;
  fieldKey?: string;
  readOnly?: boolean;
  type?: 'text' | 'number' | 'date';
  placeholder?: string;
  className?: string;
}

/**
 * کامپوننت نمایش فیلد استخراج‌شده به همراه ضریب اطمینان (ConfidenceField)
 * در صورت پایین بودن ضریب اطمینان یا نیاز به بازبینی، کادر فیلد با خط زرد ملایم (Yellow Outline) برجسته می‌شود
 * و ورودی ویرایش دستی جهت اعتبارسنجی و اصلاح کاربر فراهم می‌گردد.
 */
export function ConfidenceField({
  label,
  value,
  confidence = 0,
  onChange,
  status,
  threshold = 0.8,
  reviewReason,
  evidence,
  fieldKey,
  readOnly = false,
  type = 'text',
  placeholder,
  className = '',
}: ConfidenceFieldProps) {
  const [isManuallyEdited, setIsManuallyEdited] = useState(false);

  const normalizedConfidence = Math.max(0, Math.min(1, typeof confidence === 'number' ? confidence : 0));
  const confidencePercent = Math.round(normalizedConfidence * 100);

  // تعیین وضعیت بازبینی: یا بر اساس status صریح، یا در صورتی که ضریب اطمینان زیر آستانه باشد
  const isNeedsReview =
    status === 'NEEDS_REVIEW' ||
    (normalizedConfidence < threshold && normalizedConfidence > 0 && status !== 'EXTRACTED');

  const isMissing = status === 'MISSING' || (value === null || value === undefined || value === '');
  const isHighConfidence = normalizedConfidence >= threshold && !isNeedsReview && !isMissing;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsManuallyEdited(true);
    const raw = e.target.value;
    if (type === 'number' || fieldKey === 'amount') {
      onChange(raw === '' ? null : Number(raw));
    } else {
      onChange(raw);
    }
  };

  return (
    <div
      dir="rtl"
      className={`rounded-xl p-3 border transition-all ${
        isNeedsReview
          ? 'border-yellow-500/80 bg-yellow-500/5 ring-1 ring-yellow-500/40 shadow-xs'
          : isMissing
            ? 'border-dashed border-border bg-canvas/40'
            : isHighConfidence
              ? 'border-border bg-surface'
              : 'border-border bg-surface'
      } ${className}`}
      data-needs-review={isNeedsReview ? 'true' : 'false'}
      data-confidence={confidencePercent}
    >
      {/* ردیف بالا: عنوان، آیکون وضعیت و امتیاز اطمینان */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <label className="text-xs font-bold text-text-main cursor-pointer">
            {label}
          </label>

          {/* نشانگر وضعیت */}
          {isNeedsReview && (
            <span className="inline-flex items-center gap-1 text-mini font-bold px-2 py-0.5 rounded-md bg-yellow-500/15 text-yellow-800 dark:text-yellow-300 border border-yellow-500/40">
              <AlertTriangle size={11} className="text-yellow-600 dark:text-yellow-400" />
              <span>نیازمند بازبینی دستی</span>
            </span>
          )}

          {isHighConfidence && (
            <span className="inline-flex items-center gap-1 text-mini font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20">
              <CheckCircle2 size={11} className="text-emerald-600 dark:text-emerald-400" />
              <span>استخراج معتبر</span>
            </span>
          )}

          {isMissing && (
            <span className="inline-flex items-center gap-1 text-mini font-medium px-2 py-0.5 rounded-md bg-canvas text-text-muted border border-border">
              <HelpCircle size={11} />
              <span>ناموجود</span>
            </span>
          )}

          {isManuallyEdited && (
            <span className="inline-flex items-center gap-0.5 text-micro font-bold text-primary bg-primary/10 px-1.5 py-0.2 rounded border border-primary/20">
              <Edit3 size={10} />
              <span>ویرایش‌شده توسط کاربر</span>
            </span>
          )}
        </div>

        {/* نشانگر درصد اطمینان (Confidence Score 0-1) */}
        <div className="shrink-0 flex items-center gap-1">
          <span
            className={`text-mini font-mono font-bold px-1.5 py-0.5 rounded-md border ${
              isHighConfidence
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25'
                : isNeedsReview
                  ? 'bg-yellow-500/15 text-yellow-800 dark:text-yellow-300 border-yellow-500/40'
                  : 'bg-canvas text-text-muted border-border'
            }`}
            title={`ضریب اطمینان استخراج تشخیص متن: ${confidencePercent}٪`}
          >
            ٪{toPersianDigits(confidencePercent)} اطمینان
          </span>
        </div>
      </div>

      {/* توضیح علت نیاز به بازبینی در صورت وجود */}
      {isNeedsReview && reviewReason && (
        <div className="mb-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-start gap-1.5 text-caption text-yellow-900 dark:text-yellow-200">
          <AlertTriangle size={13} className="shrink-0 text-yellow-600 dark:text-yellow-400 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">توجه بازبینی: </span>
            <span>{reviewReason}</span>
          </div>
        </div>
      )}

      {/* ورودی ویرایش دستی کاربر (Manual Edit Input) */}
      <div className="relative">
        <input
          type={type === 'number' || fieldKey === 'amount' ? 'number' : 'text'}
          disabled={readOnly}
          value={value !== null && value !== undefined ? String(value) : ''}
          placeholder={
            placeholder ||
            (isMissing
              ? 'اطلاعات در سند یافت نشد؛ مقدار را دستی وارد کنید...'
              : 'مقدار فیلد جهت تایید...')
          }
          onChange={handleChange}
          className={`w-full text-xs font-medium px-3 py-2 rounded-lg transition-colors outline-none ${
            isNeedsReview
              ? 'bg-surface border-2 border-yellow-500/70 focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/20'
              : isMissing
                ? 'bg-canvas border border-dashed border-border focus:border-primary focus:bg-surface'
                : 'bg-canvas border border-border focus:border-primary focus:bg-surface'
          }`}
          aria-label={label}
        />
      </div>

      {/* نمایش مبلغ کمکی در صورت فیلد ریالی */}
      {fieldKey === 'amount' && typeof value === 'number' && value > 0 && (
        <p className="text-mini text-text-secondary mt-1 ps-1">
          معادل: <span className="font-bold text-text-main">{formatCurrency(value)}</span>
          <span className="text-text-muted ms-1.5">
            (معادل {toPersianDigits(Math.round(value / 10).toLocaleString('fa-IR'))} تومان)
          </span>
        </p>
      )}

      {/* نمایش شاهد متنی استخراج‌شده در صورت وجود */}
      {evidence && (
        <div className="flex items-center gap-1.5 text-micro text-text-muted mt-1 ps-1 truncate">
          <Eye size={11} className="shrink-0 opacity-70" />
          <span>متن شناسایی‌شده در سند: </span>
          <span className="font-medium text-text-secondary truncate max-w-sm" title={evidence}>
            «{evidence}»
          </span>
        </div>
      )}
    </div>
  );
}
