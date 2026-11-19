import React, { useMemo } from 'react';
import { formatCurrency, formatAppDate } from '../../lib/utils';
import { buildReceivableLifoReport } from '../../services/receivableReports';
import type { ReceivableAccountRef, ReceivableInvoiceRef } from '../../services/receivableReports';
import type { DetailBalancesResult } from '../../lib/receivableReconciliation';

/**
 * پنل واحد گزارش‌های مطالبات (تجزیهٔ سنی، میانگین سن، خارج از مهلت، به‌تفکیک فروشنده) — فقط از تخصیص LIFO مانده دفتری.
 * مرجع محاسبه: src/services/receivableReports.ts. هیچ مانده‌ای از وضعیت/پرداخت فاکتور ساخته نمی‌شود.
 */
interface Props {
  ledgerBalances: DetailBalancesResult | null | undefined;
  accounts: ReceivableAccountRef[];
  invoices: ReceivableInvoiceRef[];
  allowedDays?: unknown;
  agingBounds?: unknown;
  sellerName?: (sellerKey: string) => string;
  onOpenCustomer?: (customerId: string) => void;
  locale?: string;
}

const fa = (n: number) => n.toLocaleString('fa-IR');

export function ReceivablesLifoPanel({ ledgerBalances, accounts, invoices, allowedDays, agingBounds, sellerName, onOpenCustomer, locale }: Props) {
  const report = useMemo(
    () => buildReceivableLifoReport(ledgerBalances, accounts, invoices, { asOf: new Date(), allowedDays, agingBounds }),
    [ledgerBalances, accounts, invoices, allowedDays, agingBounds]
  );
  const hasData = report.invoiceCount > 0;
  const allowed = report.allowedDays;
  const overAmount = allowed === null ? null : report.overAllowed.reduce((s, r) => s + r.outstanding, 0);

  return (
    <div className="space-y-3" data-testid="receivables-lifo-panel">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Kpi label="مانده فاکتورهای باز (تخمینی)" value={hasData ? `${formatCurrency(report.totalOutstanding)} ریال` : 'نامشخص'} note={`${fa(report.invoiceCount)} فاکتور · از آخرین فاکتور به عقب`} />
        <Kpi label="میانگین سن مطالبات" value={report.avgAgeDays === null ? 'نامشخص' : `${fa(report.avgAgeDays)} روز`} note="وزنی با مانده هر فاکتور" />
        <Kpi label={allowed === null ? 'خارج از مهلت مجاز' : `خارج از مهلت ${fa(allowed)} روزه`} value={overAmount === null ? 'مهلت تعریف نشده' : `${formatCurrency(overAmount)} ریال`} note={overAmount === null ? 'در تنظیمات سازمان مهلت مجاز را تعریف کنید' : `${fa(report.overAllowed.length)} فاکتور`} tone={overAmount ? 'danger' : undefined} />
        <Kpi label="بدون فاکتور/سررسید" value={`${formatCurrency(report.unattributed + report.unknownDueAmount)} ریال`} note="مانده‌ای که فاکتور یا سررسید قابل‌سنجش ندارد" />
      </div>

      <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
        <h5 className="text-xs font-bold text-text-main">تجزیهٔ سنی (روز گذشته از سررسید) <span className="text-micro font-normal text-text-secondary">تخمینی</span></h5>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
          {report.aging.buckets.map(b => (
            <div key={b.key} className="p-2.5 rounded-xl border border-border bg-canvas/70">
              <span className="text-micro text-text-secondary block font-bold">{b.label}</span>
              <strong className="text-xs font-mono font-bold text-text-main mt-1 block">{hasData ? formatCurrency(b.amount) : 'نامشخص'}</strong>
              <span className="text-tiny text-text-secondary mt-0.5 block">{hasData ? `${fa(b.invoiceCount)} فاکتور` : '—'}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
        <h5 className="text-xs font-bold text-text-main">به‌تفکیک فروشنده</h5>
        {report.bySeller.length === 0 && <p className="text-micro text-text-secondary">مانده‌ای برای تفکیک وجود ندارد.</p>}
        {report.bySeller.map(s => (
          <div key={s.sellerKey} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-border bg-canvas text-xs">
            <div className="min-w-0">
              <strong className="text-text-main truncate block">{s.sellerKey === 'UNASSIGNED' ? 'فروشنده نامشخص' : (sellerName?.(s.sellerKey) || s.sellerCode || s.sellerKey)}</strong>
              <span className="text-micro text-text-secondary">{fa(s.invoiceCount)} فاکتور · میانگین سن {s.avgAgeDays === null ? 'نامشخص' : `${fa(s.avgAgeDays)} روز`}{s.overAllowedAmount ? ` · خارج از مهلت ${formatCurrency(s.overAllowedAmount)}` : ''}</span>
            </div>
            <span className="font-mono font-bold text-danger shrink-0">{formatCurrency(s.outstanding)} ریال</span>
          </div>
        ))}
      </div>

      {allowed !== null && (
        <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
          <h5 className="text-xs font-bold text-text-main">فاکتورهای خارج از مهلت مجاز</h5>
          {report.overAllowed.length === 0 && <p className="text-micro text-text-secondary">فاکتوری از مهلت مجاز نگذشته است.</p>}
          {report.overAllowed.slice(0, 20).map(r => (
            <button key={r.invoiceId} type="button" onClick={() => onOpenCustomer?.(r.customerId)} className="w-full text-right flex items-center justify-between gap-2 p-2.5 rounded-xl border border-border bg-canvas text-xs cursor-pointer">
              <div className="min-w-0">
                <strong className="font-mono text-text-main">{r.invoiceNumber || r.invoiceId}</strong>
                <span className="text-micro text-text-secondary block truncate">{r.customerName} · {formatAppDate(r.date, locale)} · {fa(r.ageDays || 0)} روز</span>
              </div>
              <span className="font-mono font-bold text-danger shrink-0">{formatCurrency(r.outstanding)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'danger' }) {
  return (
    <div className="p-3 bg-surface rounded-xl border border-border">
      <span className="text-micro text-text-secondary block font-bold">{label}</span>
      <strong className={`text-sm font-mono font-bold mt-1 block ${tone === 'danger' ? 'text-danger' : 'text-text-main'}`}>{value}</strong>
      {note && <span className="text-tiny text-text-secondary mt-0.5 block">{note}</span>}
    </div>
  );
}
