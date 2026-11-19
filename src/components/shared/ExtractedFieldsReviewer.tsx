import React from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  HelpCircle, 
  Hash, 
  DollarSign, 
  Calendar, 
  CreditCard, 
  User, 
  Building, 
  FileText
} from 'lucide-react';
import type { ExtractedField, FieldStatus } from '../../lib/documentCapture';
import { toPersianDigits } from '../../lib/digits';
import { ConfidenceField } from './ConfidenceField';

export { ConfidenceField } from './ConfidenceField';

export interface ExtractedFieldsReviewerProps {
  fields: Record<string, ExtractedField<any>>;
  editableValues: Record<string, unknown>;
  onChangeField: (key: string, value: unknown) => void;
  stats?: {
    totalFieldsCount: number;
    extractedCount: number;
    needsReviewCount: number;
    missingCount: number;
  };
  overallConfidence?: number;
  readOnly?: boolean;
  className?: string;
}

export function ExtractedFieldsReviewer({
  fields,
  editableValues,
  onChangeField,
  stats,
  overallConfidence,
  readOnly = false,
  className = '',
}: ExtractedFieldsReviewerProps) {
  const fieldList = Object.entries(fields);

  if (fieldList.length === 0) {
    return (
      <div className="p-6 text-center text-text-secondary text-xs">
        <FileText size={32} className="mx-auto mb-2 text-border-strong opacity-60" />
        <p>هیچ فیلدی برای نمایش وجود ندارد.</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col space-y-3.5 ${className}`} dir="rtl">
      
      {/* نوار خلاصه آمار و وضعیت استخراج جزئی */}
      {stats && (
        <div className="p-3 rounded-xl bg-canvas border border-border flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="font-bold text-text-main">خلاصه پردازش فیلدها:</span>
            
            <div className="flex items-center gap-1.5 font-medium">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20 text-caption">
                <CheckCircle2 size={12} />
                <span>{toPersianDigits(stats.extractedCount)} استخراج‌شده</span>
              </span>

              {stats.needsReviewCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-yellow-500/15 text-yellow-800 dark:text-yellow-300 border border-yellow-500/40 text-caption font-bold animate-pulse">
                  <AlertTriangle size={12} />
                  <span>{toPersianDigits(stats.needsReviewCount)} نیازمند بازبینی</span>
                </span>
              )}

              {stats.missingCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface text-text-secondary border border-border text-caption">
                  <HelpCircle size={12} />
                  <span>{toPersianDigits(stats.missingCount)} ناموجود</span>
                </span>
              )}
            </div>
          </div>

          {typeof overallConfidence === 'number' && (
            <div className="flex items-center gap-1 text-caption text-text-secondary font-mono">
              <span>اطمینان میانگین:</span>
              <span className="font-bold text-text-main">
                ٪{toPersianDigits(Math.round(overallConfidence * 100))}
              </span>
            </div>
          )}
        </div>
      )}

      {/* لیست فیلدها با استفاده از کامپوننت ConfidenceField و کادر زرد ملایم برای فیلدهای نیازمند بازبینی */}
      <div className="space-y-3">
        {fieldList.map(([key, field]) => {
          const currentVal =
            editableValues[key] !== undefined ? editableValues[key] : field.value;

          return (
            <ConfidenceField
              key={key}
              fieldKey={key}
              label={field.label}
              value={currentVal}
              confidence={field.confidence}
              status={field.status}
              threshold={0.8}
              reviewReason={field.reviewReason}
              evidence={field.evidence}
              readOnly={readOnly}
              type={key === 'amount' ? 'number' : 'text'}
              onChange={(newVal) => onChangeField(key, newVal)}
            />
          );
        })}
      </div>
    </div>
  );
}
