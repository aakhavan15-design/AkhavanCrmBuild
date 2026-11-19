import React from 'react';
import { BottomSheet } from '../ui/BottomSheet';
import { formatCurrency, formatAppDate } from '../../lib/utils';
import { FileText, ArrowUpRight, ChevronLeft } from 'lucide-react';
import { DocumentDetailData } from './DocumentDetailModal';
import { getPersianStatusLabel } from '../../lib/labels';
import { Button } from '../ui/Button';

export interface DrilldownRow {
  id: string;
  number?: string;
  date?: string;
  title?: string;
  status?: string;
  amount: number;
  outstanding?: number;
  daysOverdue?: number;
  rawDoc?: DocumentDetailData;
}

interface DrilldownSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  metricLabel?: string;
  metricValue?: string;
  rows: DrilldownRow[];
  onSelectRow?: (row: DrilldownRow) => void;
  onOpenCustomer?: () => void;
  customerName?: string;
}

export function DrilldownSheet({
  isOpen,
  onClose,
  title,
  subtitle,
  metricLabel,
  metricValue,
  rows,
  onSelectRow,
  onOpenCustomer,
  customerName,
}: DrilldownSheetProps) {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      maxHeight="max-h-(--vp-dialog)"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {onOpenCustomer ? (
            <Button variant="link" size="inline" type="button" onClick={() => { onClose(); onOpenCustomer(); }} >
              <span>مشاهده پرونده کامل مشتری ۳۶۰</span>
              <ArrowUpRight size={14} />
            </Button>
          ) : <span />}
          <Button variant="outline" size="sm"
            type="button"
            onClick={onClose}
          >
            بستن
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Metric Summary Pill */}
        {(metricLabel || metricValue) && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-sunken border border-border">
            <span className="text-xs text-text-secondary font-medium">{metricLabel || 'مجموع اسناد قابل استناد'}</span>
            <span className="text-sm font-bold text-text-main tabular-nums font-mono">{metricValue}</span>
          </div>
        )}

        {/* Rows List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-caption text-text-secondary px-1">
            <span>اسناد و ردیف‌های پایه ({rows.length.toLocaleString('fa-IR')} فقره)</span>
            <span>برای جزئیات کامل روی هر سند کلیک کنید</span>
          </div>

          {rows.length === 0 ? (
            <p className="p-4 text-center text-xs text-text-secondary rounded-xl border border-dashed border-border">
              هیچ سندی در این محدوده زمانی یافت نشد.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-(--vp-split-sm) overflow-y-auto pr-0.5">
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => onSelectRow?.(row)}
                  className="w-full text-start flex items-center justify-between p-3 rounded-xl border border-border bg-surface hover:border-primary/50 hover:bg-canvas transition-colors cursor-pointer group"
                >
                  <div className="min-w-0 pr-1">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-primary shrink-0" />
                      <span className="text-xs font-bold text-text-main truncate">
                        {row.number || (row.title ? getPersianStatusLabel(row.title) : '') || `سند ${row.id}`}
                      </span>
                      {row.status && (
                        <span className="px-1.5 py-0.5 text-tiny font-semibold rounded bg-canvas border border-border text-text-secondary">
                          {getPersianStatusLabel(row.status)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-caption text-text-secondary tabular-nums">
                      {row.date && <span>تاریخ: {formatAppDate(row.date)}</span>}
                      {row.daysOverdue !== undefined && row.daysOverdue > 0 && (
                        <span className="text-danger font-medium">({row.daysOverdue} روز معوق)</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-left font-mono">
                      <div className="text-xs font-bold text-text-main tabular-nums">
                        {formatCurrency(row.amount)} <span className="text-micro font-normal text-text-secondary">ریال</span>
                      </div>
                      {row.outstanding !== undefined && row.outstanding > 0 && (
                        <div className="text-micro text-danger font-medium">
                          مانده (تخمینی): {formatCurrency(row.outstanding)}
                        </div>
                      )}
                    </div>
                    <ChevronLeft size={15} className="text-text-muted group-hover:text-primary transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
