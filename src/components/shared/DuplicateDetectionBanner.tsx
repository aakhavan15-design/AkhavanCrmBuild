import React from 'react';
import { ShieldAlert, AlertTriangle, CheckSquare, Square, ExternalLink, CheckCircle2 } from 'lucide-react';
import type { DuplicateDetectionResult } from '../../lib/documentCapture';
import { toPersianDigits } from '../../lib/digits';
import { Checkbox } from '../ui/Input';
import { Button } from '../ui/Button';

export interface DuplicateDetectionBannerProps {
  duplicateCheck: DuplicateDetectionResult;
  isConfirmed: boolean;
  onToggleConfirm: (confirmed: boolean) => void;
  onViewRecord?: (recordId: string, recordType?: string) => void;
  className?: string;
}

export function DuplicateDetectionBanner({
  duplicateCheck,
  isConfirmed,
  onToggleConfirm,
  onViewRecord,
  className = '',
}: DuplicateDetectionBannerProps) {
  if (!duplicateCheck || !duplicateCheck.isDuplicate) return null;

  const isDefinite = duplicateCheck.duplicateType === 'DEFINITE';
  const typeLabel =
    duplicateCheck.existingRecordType === 'PAYMENT'
      ? 'پرداخت / فیش بانکی'
      : duplicateCheck.existingRecordType === 'CHEQUE'
        ? 'چک صیادی'
        : duplicateCheck.existingRecordType === 'INVOICE'
          ? 'فاکتور فروش'
          : 'سند مالی';

  return (
    <div
      role="alert"
      dir="rtl"
      className={`rounded-xl border transition-all p-3.5 space-y-3 ${
        isConfirmed
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : isDefinite
            ? 'border-rose-500/40 bg-rose-500/10'
            : 'border-amber-500/40 bg-amber-500/10'
      } ${className}`}
    >
      {/* هدر اعلان کشف تکرار */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
              isConfirmed
                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                : isDefinite
                  ? 'bg-rose-500/20 text-rose-700 dark:text-rose-400'
                  : 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
            }`}
          >
            {isConfirmed ? (
              <CheckCircle2 size={18} />
            ) : isDefinite ? (
              <ShieldAlert size={18} />
            ) : (
              <AlertTriangle size={18} />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-xs font-bold text-text-main">
                {isDefinite ? 'هشدار تطابق قطعی با سند مالی موجود' : 'هشدار احتمال ثبت سند تکراری'}
              </h4>
              <span
                className={`text-micro font-bold px-2 py-0.5 rounded-md border ${
                  isDefinite
                    ? 'bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-500/30'
                    : 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/30'
                }`}
              >
                {isDefinite ? 'تکرار قطعی' : 'تشابه بالا'}
              </span>
            </div>
            <p className="text-label text-text-secondary mt-1 leading-relaxed">
              {duplicateCheck.reason || 'اطلاعات این سند قبلاً در سیستم ثبت شده است.'}
            </p>
          </div>
        </div>

        {/* دکمه ارجاع یا مشاهده رکورد موجود */}
        {duplicateCheck.existingRecordId && onViewRecord && (
          <Button variant="link" size="inline" className="shrink-0" type="button" onClick={() => onViewRecord(duplicateCheck.existingRecordId!, duplicateCheck.existingRecordType)} >
            <span>مشاهده رکورد</span>
            <ExternalLink size={12} />
          </Button>
        )}
      </div>

      {/* جزئیات شناسه سند موجود */}
      {duplicateCheck.existingRecordId && (
        <div className="flex items-center gap-2 text-caption bg-surface/70 px-2.5 py-1.5 rounded-lg border border-border">
          <span className="text-text-muted">نوع و شناسه رکورد مرتبط:</span>
          <span className="font-semibold text-text-main">{typeLabel}</span>
          <span className="font-mono text-text-secondary text-mini">
            #{toPersianDigits(duplicateCheck.existingRecordId)}
          </span>
        </div>
      )}

      {/* گردش‌کار تأیید اجباری کاربر (User Confirmation Workflow) */}
      <div
        className={`pt-2.5 border-t ${
          isConfirmed ? 'border-emerald-500/20' : 'border-border/60'
        }`}
      >
        <label className="flex items-start gap-2.5 cursor-pointer select-none group">
          <Checkbox
           
            checked={isConfirmed}
            onChange={(e) => onToggleConfirm(e.target.checked)}
            
            aria-label="تأیید رفع هشدار تکراری"
          />
          <div
            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-all ${
              isConfirmed
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'bg-surface border-border group-hover:border-primary text-transparent'
            }`}
          >
            {isConfirmed ? <CheckSquare size={14} /> : <Square size={14} className="opacity-0" />}
          </div>
          <div className="flex-1 text-xs">
            <span
              className={`font-bold transition-colors ${
                isConfirmed ? 'text-emerald-800 dark:text-emerald-300' : 'text-text-main'
              }`}
            >
              تأیید بازبینی دستی: این سند تکراری نیست یا ثبت مجدد آن آگاهانه است.
            </span>
            <p className="text-mini text-text-muted mt-0.5 leading-relaxed">
              {isConfirmed ? (
                <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                  ✓ تأیید ثبت شد. ثبت نهایی و انتقال به فرم عملیاتی مجاز گردید.
                </span>
              ) : (
                <span className="text-rose-700 dark:text-rose-400 font-medium">
                  جهت جلوگیری از ثبت ناخواسته مکرر، دکمه ذخیره تا زمان علامت‌زدن این گزینه غیرفعال است.
                </span>
              )}
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
