import React from 'react';
import { Modal } from '../ui/Modal';
import { formatCurrency, formatAppDate } from '../../lib/utils';
import { getPersianStatusLabel } from '../../lib/labels';
import { FileText, Building2, Calendar, AlertCircle, ShieldCheck, ArrowUpRight, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';

export interface DocumentDetailData {
  id: string;
  type: 'INVOICE' | 'QUOTE' | 'PAYMENT' | 'CREDIT_NOTE' | 'ORDER';
  title?: string;
  number?: string;
  date?: string;
  dueDate?: string;
  customerId?: string;
  customerName?: string;
  totalAmount?: number;
  outstandingAmount?: number;
  status?: string;
  isErpMirror?: boolean;
  sourceSystemCode?: string;
  externalId?: string;
  isSynthetic?: boolean;
  items?: Array<{
    id?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  allocations?: Array<{
    id: string;
    targetNumber?: string;
    amount: number;
    date?: string;
  }>;
  notes?: string;
}

interface DocumentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentDetailData | null;
}

export function DocumentDetailModal({ isOpen, onClose, document: doc }: DocumentDetailModalProps) {
  const navigate = useNavigate();

  if (!isOpen || !doc) return null;

  const typeLabelMap: Record<DocumentDetailData['type'], string> = {
    INVOICE: 'فاکتور فروش',
    QUOTE: 'پیش‌فاکتور',
    PAYMENT: 'رسید دریافت وجه',
    CREDIT_NOTE: 'اعلامیه بستانکاری',
    ORDER: 'سفارش فروش',
  };

  const typeLabel = typeLabelMap[doc.type] || 'سند مالی';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${typeLabel} ${doc.number || doc.id}`}
      subtitle={`شناسه سیستمی: ${doc.id}`}
      maxWidth="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {doc.customerId ? (
            <Button variant="link" size="inline" type="button" onClick={() => { onClose(); navigate(`/accounts/${doc.customerId}`); }} >
              <span>مشاهده پرونده کامل مشتری ۳۶۰</span>
              <ArrowUpRight size={14} />
            </Button>
          ) : <span />}
          <Button variant="outline"
            type="button"
            onClick={onClose}
          >
            بستن
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5 text-xs">
        {/* Source and Provenance Banner */}
        {doc.isSynthetic ? (
          <div className="flex items-center gap-2 p-2.5 rounded-xl border border-warning/30 bg-warning-soft text-text-main text-caption">
            <AlertCircle size={15} className="text-warning shrink-0" />
            <span>این سند نمونه شبیه‌سازی‌شده (آزمایشی محلی) است و مبنای قطعی مالیاتی یا حقوقی محسوب نمی‌شود.</span>
          </div>
        ) : doc.isErpMirror ? (
          <div className="flex items-center gap-2 p-2.5 rounded-xl border border-primary/20 bg-primary-soft text-text-main text-caption">
            <ShieldCheck size={15} className="text-primary shrink-0" />
            <span>
              سند رسمی ثبت‌شده در سامانه مالی · منبع: <strong>{doc.sourceSystemCode || 'ERP_CORE'}</strong>
              {doc.externalId && ` (شناسه مرجع: ${doc.externalId})`}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-2.5 rounded-xl border border-border bg-canvas text-text-secondary text-caption">
            <Building2 size={15} className="shrink-0" />
            <span>ثبت‌شده در سامانه داخلی؛ در انتظار ارسال و همگام‌سازی نهایی با سامانه مالی.</span>
          </div>
        )}

        {/* Primary Data Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <div className="p-2.5 rounded-xl border border-border bg-canvas/60">
            <span className="text-mini text-text-secondary block">طرف حساب / مشتری</span>
            <strong className="text-xs font-bold text-text-main block mt-1 truncate" title={doc.customerName}>
              {doc.customerName || 'نامشخص'}
            </strong>
          </div>

          <div className="p-2.5 rounded-xl border border-border bg-canvas/60">
            <span className="text-mini text-text-secondary block">تاریخ ثبت سند</span>
            <strong className="text-xs font-bold text-text-main block mt-1 tabular-nums">
              {doc.date ? formatAppDate(doc.date) : 'ثبت نشده'}
            </strong>
          </div>

          <div className="p-2.5 rounded-xl border border-border bg-canvas/60">
            <span className="text-mini text-text-secondary block">وضعیت سند</span>
            <strong className="text-xs font-bold text-primary block mt-1">
              {getPersianStatusLabel(doc.status)}
            </strong>
          </div>

          <div className="p-2.5 rounded-xl border border-border bg-canvas/60">
            <span className="text-mini text-text-secondary block">مبلغ کل سند</span>
            <strong className="text-sm font-bold text-text-main block mt-1 tabular-nums">
              {doc.totalAmount != null ? `${formatCurrency(doc.totalAmount)} ریال` : 'نامشخص'}
            </strong>
          </div>

          {doc.outstandingAmount !== undefined && (
            <div className="p-2.5 rounded-xl border border-border bg-canvas/60">
              <span className="text-mini text-text-secondary block">مانده تسویه‌نشده</span>
              <strong className={`text-sm font-bold block mt-1 tabular-nums ${doc.outstandingAmount > 0 ? 'text-danger' : 'text-success'}`}>
                {formatCurrency(doc.outstandingAmount)} ریال
              </strong>
            </div>
          )}

          {doc.dueDate && (
            <div className="p-2.5 rounded-xl border border-border bg-canvas/60">
              <span className="text-mini text-text-secondary block">تاریخ سررسید</span>
              <strong className="text-xs font-bold text-text-main block mt-1 tabular-nums">
                {formatAppDate(doc.dueDate)}
              </strong>
            </div>
          )}
        </div>

        {/* Line Items Table if present */}
        {doc.items && doc.items.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <h4 className="text-xs font-bold text-text-main flex items-center gap-1.5">
              <FileText size={14} className="text-primary" />
              <span>اقلام و ردیف‌های سند ({doc.items.length.toLocaleString('fa-IR')})</span>
            </h4>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-(--size-380) text-caption">
                <thead>
                  <tr className="border-b border-border bg-canvas text-text-secondary">
                    <th className="p-2 text-right font-semibold">شرح کالا / خدمات</th>
                    <th className="p-2 text-center font-semibold">تعداد</th>
                    <th className="p-2 text-left font-semibold">فی (ریال)</th>
                    <th className="p-2 text-left font-semibold">مبلغ کل (ریال)</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.items.map((item, idx) => (
                    <tr key={item.id || idx} className="border-b border-border/50 last:border-0 hover:bg-canvas/50">
                      <td className="p-2 text-text-main font-medium">{item.description}</td>
                      <td className="p-2 text-center tabular-nums">{item.quantity.toLocaleString('fa-IR')}</td>
                      <td className="p-2 text-left font-mono tabular-nums">{formatCurrency(item.unitPrice)}</td>
                      <td className="p-2 text-left font-mono font-bold text-text-main tabular-nums">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Allocations Breakdown if present */}
        {doc.allocations && doc.allocations.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <h4 className="text-xs font-bold text-text-main">
              گردش تخصیص‌ها و تسویه‌ها ({doc.allocations.length.toLocaleString('fa-IR')})
            </h4>
            <div className="space-y-1">
              {doc.allocations.map((alloc) => (
                <div key={alloc.id} className="flex items-center justify-between p-2 rounded-lg bg-canvas text-caption">
                  <span className="text-text-secondary">
                    {alloc.targetNumber ? `تخصیص به سند ${alloc.targetNumber}` : `تخصیص شناسه ${alloc.id}`}
                    {alloc.date && ` · ${formatAppDate(alloc.date)}`}
                  </span>
                  <span className="font-mono font-bold text-success tabular-nums">
                    {formatCurrency(alloc.amount)} ریال
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes / Description */}
        {doc.notes && (
          <div className="p-2.5 rounded-xl border border-border/70 bg-canvas/40 text-caption text-text-secondary leading-relaxed">
            <strong className="block text-text-main mb-0.5">توضیحات و یادداشت سند:</strong>
            {doc.notes}
          </div>
        )}
      </div>
    </Modal>
  );
}
