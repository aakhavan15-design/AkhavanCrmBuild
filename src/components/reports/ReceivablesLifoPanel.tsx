import React, { useMemo, useState } from 'react';
import { RankList } from '../charts/ReportPrimitives';
import { formatCount, formatMoneyCompact, formatNumber } from '../../lib/format';
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
  sellerAvatar?: (sellerKey: string) => string | undefined;
  onOpenCustomer?: (customerId: string) => void;
  locale?: string;
}

const fa = (n: number) => formatNumber(n);

export function ReceivablesLifoPanel({ ledgerBalances, accounts, invoices, allowedDays, agingBounds, sellerName, sellerAvatar, onOpenCustomer, locale }: Props) {
  const report = useMemo(
    () => buildReceivableLifoReport(ledgerBalances, accounts, invoices, { asOf: new Date(), allowedDays, agingBounds }),
    [ledgerBalances, accounts, invoices, allowedDays, agingBounds]
  );
  const [selectedSeller,setSelectedSeller]=useState<string|null>(null);
  const activeSeller=report.bySeller.some(s=>s.sellerKey===selectedSeller)?selectedSeller:null;
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

      <div className="p-3 bg-surface rounded-xl border border-border space-y-2">
        <h5 className="text-xs font-bold text-text-main">مانده منتسب به فروشندگان (تخمینی)</h5>
        <p className="text-caption text-text-secondary">مبلغ و تعداد فاکتورهای باز؛ مانده بالا به‌تنهایی نشانه عملکرد ضعیف نیست. فقط خارج از مهلت مصوب با رنگ خطر مشخص می‌شود.</p>
        <RankList showAvatars limit={3} label="سه مانده بالاتر" items={report.bySeller.filter(s=>s.sellerKey!=='UNASSIGNED').map(s=>({
          id:s.sellerKey,label:sellerName?.(s.sellerKey)||s.sellerCode||s.sellerKey,avatar:sellerAvatar?.(s.sellerKey),
          value:s.outstanding,formattedValue:formatMoneyCompact(s.outstanding),
          description:formatCount(s.invoiceCount)+' فاکتور باز',
          tone:s.overAllowedAmount!=null&&s.overAllowedAmount>0?'danger':'neutral'
        }))}/>
        <details className="border-t border-border pt-2">
          <summary className="min-h-11 py-2 cursor-pointer text-xs font-semibold text-primary">تمام فروشندگان و ریز مطالبات</summary>
          <RankList showAvatars label="مانده همه فروشندگان" selectedId={activeSeller} onSelect={setSelectedSeller}
            items={report.bySeller.map(s=>({
              id:s.sellerKey,label:s.sellerKey==='UNASSIGNED'?'فروشنده نامشخص':sellerName?.(s.sellerKey)||s.sellerCode||s.sellerKey,
              avatar:sellerAvatar?.(s.sellerKey),value:s.outstanding,formattedValue:formatMoneyCompact(s.outstanding),
              description:formatCount(s.invoiceCount)+' فاکتور · میانگین سن '+(s.avgAgeDays===null?'نامشخص':fa(s.avgAgeDays)+' روز')+(s.overAllowedAmount!=null?' · خارج از مهلت '+formatMoneyCompact(s.overAllowedAmount):''),
              tone:s.overAllowedAmount!=null&&s.overAllowedAmount>0?'danger':'neutral'
            }))}/>
        </details>
        {activeSeller&&<div className="border-t border-border pt-2 space-y-2">
          <div className="flex items-center justify-between gap-2"><strong className="text-xs">فاکتورهای باز فروشنده منتخب</strong><button type="button" onClick={()=>setSelectedSeller(null)} className="min-h-11 text-xs text-primary">حذف فیلتر</button></div>
          {report.rows.filter(r=>r.sellerKey===activeSeller).map(r=><div key={r.invoiceId} className="flex items-center justify-between gap-2 text-xs border-b border-border py-1">
            {onOpenCustomer?<button type="button" className="min-h-11 text-start text-primary" onClick={()=>onOpenCustomer(r.customerId)}>{r.customerName} · {r.invoiceNumber||r.invoiceId}</button>:<span>{r.customerName} · {r.invoiceNumber||r.invoiceId}</span>}
            <bdi>{formatMoneyCompact(r.outstanding)}</bdi>
          </div>)}
        </div>}
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
