import { PrintQuoteButton } from '../PrintLayouts';
import { getActiveDataProvider } from '../../services/dataProvider';
import React, { useState, useMemo } from 'react';
import { X, ArrowRight, BarChart2, Building2, User, Calendar, CreditCard, ShieldCheck, CheckCircle2, AlertTriangle, Package, Clock, FileText, Send, Sparkles } from 'lucide-react';
import { AppState, Quote, ID } from '../../types';
import { formatCurrency, formatAppDate } from '../../lib/utils';
import { getPersianStatusLabel } from '../../lib/labels';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { useCan } from '../../hooks/useCan';
import { useDataQuery } from '../../hooks/useDataProvider';
import { estimateInvoiceRemaining } from '../../services/agingBuckets';
import { computeQuoteTax } from '../../lib/taxRate';

interface OrderDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  quoteId: ID | null;
  state: AppState;
  updateState: (updater: (draft: AppState) => AppState | void) => void;
  onAction?: (action: 'REQUEST_APPROVAL' | 'APPROVE' | 'ACCEPT' | 'REJECT' | 'HANDOFF') => void;
  onOpenProfitModal?: () => void;
  onOpenWizard?: () => void;
  canEdit?: boolean;
  canApprove?: boolean;
}

export function OrderDetailsDrawer({
  isOpen,
  onClose,
  quoteId,
  state,
  updateState,
  onAction,
  onOpenProfitModal,
  canEdit = true,
  canApprove = true,
}: OrderDetailsDrawerProps) {
  const [activeTab, setActiveTab] = useState<'ITEMS' | 'CUSTOMER' | 'PAYMENT' | 'HISTORY'>('ITEMS');

  const quote = useMemo(() => {
    if (!quoteId) return null;
    return state.quotes.find((q) => q.id === quoteId) || null;
  }, [quoteId, state.quotes]);

  const customer = useMemo(() => {
    if (!quote) return null;
    return state.accounts.find((a) => a.id === quote.accountId) || null;
  }, [quote, state.accounts]);

  const seller = useMemo(() => {
    if (!quote) return null;
    return state.users.find((u) => u.id === quote.ownerId) || null;
  }, [quote, state.users]);

  const relatedInvoices = useMemo(() => {
    if (!quote) return [];
    return (state.invoices || []).filter(
      (inv) => inv.quoteId === quote.id || (inv.accountId === quote.accountId && inv.quoteNumber === quote.quoteNumber)
    );
  }, [quote, state.invoices]);

  const quoteAuditLogs = useMemo(() => {
    if (!quote) return [];
    return (state.auditLogs || []).filter(
      (log: Record<string, unknown>) =>
        log.entityId === quote.id || (log.entityType === 'QUOTE' && String(log.details || '').includes(quote.quoteNumber))
    );
  }, [quote, state.auditLogs]);

  // مانده هر فاکتور «تخمینی» است: مانده دفتری مشتری از آخرین فاکتور به عقب (LIFO) پخش می‌شود؛ نه از وضعیت/پرداخت فاکتور.
  const { can: canDrawer } = useCan(state);
  const canSeeLedger = canDrawer('finance', 'VIEW');
  const ledgerLineCount = Array.isArray(state.journalLines) ? state.journalLines.length : 0;
  const { data: ledgerBalances, error: ledgerError } = useDataQuery(
    async provider => (canSeeLedger && isOpen && quote ? provider.getDetailSubsidiaryBalances({ role:'RECEIVABLE' }) : null),
    [canSeeLedger, isOpen, quote?.id, ledgerLineCount]
  );
  // Never reuse a stale balance after a failed provider refresh.
  const availableLedgerBalances = ledgerError ? { status: 'UNAVAILABLE' as const, source: getActiveDataProvider().name, balances: [], reason: ledgerError.message } : ledgerBalances;
  // همهٔ فاکتورهای مشتری باید در تخصیص بیایند (نه فقط فاکتورهای این سفارش) تا ترتیب LIFO درست باشد.
  const invoiceRemaining = useMemo(
    () => (canSeeLedger && customer ? estimateInvoiceRemaining(availableLedgerBalances, [customer], state.invoices || []) : new Map<string, number | null>()),
    [canSeeLedger, customer, availableLedgerBalances, state.invoices]
  );

  if (!isOpen || !quote) return null;

  const totalLinesAmount = (quote.lines || []).reduce((sum, line) => {
    const lTotal = Number.isFinite(line.lineTotal) ? line.lineTotal : line.unitPrice * line.quantity;
    return sum + (Number.isFinite(lTotal) && lTotal >= 0 ? lTotal : 0);
  }, 0);

  const appliedDiscount = Number(quote.discountAmount || 0);
  // نرخ مالیات هاردکد نیست: نرخ هر کالا از ERP، سپس نرخ جایگزین تنظیمات؛ نبود نرخ ⇒ نامشخص.
  const productsById = new Map((state.externalProducts || []).map(p => [p.id, p]));
  const orgTaxPercent = ((state.settings as Record<string, any> | undefined)?.orgConfig || {}).taxRatePercent;
  const vatTax = computeQuoteTax(quote.lines || [], appliedDiscount, productsById, orgTaxPercent).amount;
  const storedTotal = Number(quote.totalAmount);
  const finalPayable: number | null = Number.isFinite(storedTotal) && storedTotal > 0 ? storedTotal : vatTax === null ? null : totalLinesAmount - appliedDiscount + vatTax;

  // مانده/پرداخت‌شدهٔ این سفارش = مجموع سهم LIFO فاکتورهای همین سفارش؛ اگر مانده دفتری موجود نباشد «نامشخص».
  const relatedTotal = relatedInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount ?? inv.amount ?? 0), 0);
  const relatedRemainingParts = relatedInvoices.map(inv => invoiceRemaining.get(inv.id) ?? null);
  const relatedRemaining: number | null = relatedInvoices.length > 0 && relatedRemainingParts.every(v => v !== null)
    ? relatedRemainingParts.reduce<number>((sum, v) => sum + (v as number), 0) : null;
  const paidAmount: number | null = relatedRemaining === null ? null : Math.max(0, relatedTotal - relatedRemaining);


  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-details-title"
    >
      {/* Backdrop */}
      <div
        className="se-backdrop-enter fixed inset-0 bg-black/40 backdrop-blur-(--blur-scrim) transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Surface */}
      <aside className="se-drawer-enter relative w-full sm:w-(--size-580) lg:w-(--size-640) max-w-full h-full bg-surface border-s border-border shadow-2xl flex flex-col overflow-hidden z-10">
        {/* Top Sticky Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3.5 border-b border-border bg-surface/95 backdrop-blur-md">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-text-secondary hover:text-text-main hover:bg-canvas transition-colors cursor-pointer"
              aria-label="بازگشت به فهرست"
            >
              <ArrowRight size={18} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="order-details-title" className="text-base font-bold font-mono text-text-main tracking-tight truncate">
                  {quote.quoteNumber}
                </h2>
                <Badge
                  variant={
                    quote.status === 'APPROVED' || quote.status === 'ACCEPTED'
                      ? 'success'
                      : quote.status === 'PENDING_APPROVAL'
                      ? 'warning'
                      : quote.status === 'REJECTED'
                      ? 'danger'
                      : 'secondary'
                  }
                  size="sm"
                >
                  {getPersianStatusLabel(quote.status)}
                </Badge>
              </div>
              <span className="text-caption text-text-secondary truncate block mt-0.5">
                {customer?.name || 'مشتری نامشخص'} · ثبت: {formatAppDate(quote.createdAt, state.settings?.locale)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenProfitModal && (
              <button
                type="button"
                onClick={onOpenProfitModal}
                className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors cursor-pointer"
                title="تحلیل حاشیه سود"
              >
                <BarChart2 size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-text-secondary hover:text-text-main hover:bg-canvas transition-colors cursor-pointer"
              aria-label="بستن"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Action Bar (Top Quick Transitions) */}
        {onAction && (
          <div className="shrink-0 px-4 py-2 bg-canvas/80 border-b border-border/70 flex flex-wrap items-center gap-2">
            {quote.status === 'DRAFT' && (
              <>
                {canEdit && (
                  <Button size="sm" variant="outline" onClick={() => onAction('REQUEST_APPROVAL')}>
                    درخواست تأیید مدیریت
                  </Button>
                )}
                {canApprove && (
                  <Button size="sm" variant="primary" onClick={() => onAction('APPROVE')}>
                    تأیید قیمت
                  </Button>
                )}
              </>
            )}

            {quote.status === 'PENDING_APPROVAL' && canApprove && (
              <>
                <Button size="sm" variant="success" onClick={() => onAction('APPROVE')} icon={<CheckCircle2 size={14} />}>
                  تأیید نهایی مدیریت
                </Button>
                <Button size="sm" variant="danger" onClick={() => onAction('REJECT')}>
                  رد سفارش
                </Button>
              </>
            )}

            {quote.status === 'APPROVED' && (
              <Button size="sm" variant="primary" onClick={() => onAction('ACCEPT')} icon={<CheckCircle2 size={14} />}>
                ثبت پذیرش مشتری
              </Button>
            )}

            {quote.status === 'ACCEPTED' && canApprove && (
              <Button size="sm" variant="outline" onClick={() => onAction('HANDOFF')} icon={<Send size={14} />}>
                ارسال به سامانه مالی
              </Button>
            )}
          </div>
        )}

        {/* Tab Navigation Controls */}
        <div className="shrink-0 flex items-center border-b border-border px-3 bg-surface">
          {[
            { id: 'ITEMS', label: 'اقلام و مبالغ مالی' },
            { id: 'CUSTOMER', label: 'مشخصات مشتری و تحویل' },
            { id: 'PAYMENT', label: 'وضعیت تسویه و پرداخت' },
            { id: 'HISTORY', label: 'سابقه و گردش کار' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-text-secondary hover:text-text-main'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable Tab Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4">
          {/* TAB 1: ITEMS & FINANCIALS */}
          {activeTab === 'ITEMS' && (
            <div className="space-y-4">
              {/* Items Table */}
              <div className="rounded-2xl border border-border bg-white overflow-hidden shadow-xs">
                <div className="px-3.5 py-2.5 border-b border-border/80 bg-canvas/60 flex items-center justify-between">
                  <span className="text-xs font-bold text-text-main">
                    ردیف اقلام سفارش ({(quote.lines || []).length} قلم)
                  </span>
                  <span className="text-caption text-text-secondary">واحد قیمت: ریال</span>
                </div>

                {(quote.lines || []).length === 0 ? (
                  <div className="p-6 text-center text-xs text-text-muted">هیچ ردیف کالایی برای این سفارش ثبت نشده است.</div>
                ) : (
                  <div className="divide-y divide-border/70">
                    {quote.lines.map((line, idx) => {
                      const product = state.externalProducts.find((p) => p.id === line.productId);
                      const lineTot = Number.isFinite(line.lineTotal) ? line.lineTotal : line.unitPrice * line.quantity;

                      return (
                        <div key={line.id || idx} className="p-3.5 flex flex-col sm:flex-row justify-between sm:items-center gap-2 hover:bg-canvas/40 transition-colors">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-text-muted">{idx + 1}.</span>
                              <strong className="text-compact font-bold text-text-main truncate">
                                {line.productName || product?.name || 'کالای سفارشی'}
                              </strong>
                              {product?.sku && (
                                <span className="text-mini font-mono text-text-muted bg-canvas px-1.5 py-0.5 rounded border border-border/60">
                                  {product.sku}
                                </span>
                              )}
                            </div>
                            <div className="text-caption text-text-secondary mt-1 flex items-center gap-3">
                              <span>
                                تعداد: <strong className="font-mono text-text-main">{Number(line.quantity || 1).toLocaleString('fa-IR')}</strong>
                              </span>
                              <span>·</span>
                              <span>
                                نرخ واحد: <strong className="font-mono text-text-main">{formatCurrency(line.unitPrice)}</strong> ریال
                              </span>
                              {line.discountPercent ? (
                                <>
                                  <span>·</span>
                                  <span className="text-danger font-medium">تخفیف: {line.discountPercent}٪</span>
                                </>
                              ) : null}
                            </div>
                          </div>

                          <div className="text-end shrink-0">
                            <div className="text-compact font-bold font-mono text-text-main">
                              {formatCurrency(lineTot)} ریال
                            </div>
                            {line.marginPercent !== undefined && (
                              <span className="text-micro text-text-secondary">
                                مارجین: <strong className="font-mono">{line.marginPercent}٪</strong>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Financial Breakdown (Waterfall) */}
              <div className="rounded-2xl border border-border bg-white p-4 space-y-2.5 shadow-xs">
                <h4 className="text-xs font-bold text-text-main pb-2 border-b border-border/80">
                  تفکیک مالی و مبالغ نهایی
                </h4>

                <div className="flex justify-between text-xs text-text-secondary">
                  <span>جمع ناخالص اقلام:</span>
                  <span className="font-mono text-text-main font-semibold">{formatCurrency(totalLinesAmount)} ریال</span>
                </div>

                <div className="flex justify-between text-xs text-text-secondary">
                  <span>تخفیف‌های اعمال‌شده:</span>
                  <span className="font-mono text-danger font-semibold">
                    {appliedDiscount > 0 ? `- ${formatCurrency(appliedDiscount)}` : '۰'} ریال
                  </span>
                </div>

                <div className="flex justify-between text-xs text-text-secondary">
                  <span>مالیات بر ارزش افزوده (به‌تفکیک نرخ کالا):</span>
                  <span className="font-mono text-text-main font-semibold">{vatTax === null ? 'نامشخص' : `${formatCurrency(vatTax)} ریال`}</span>
                </div>

                <div className="pt-2 border-t border-border flex justify-between items-baseline">
                  <span className="text-sm font-bold text-text-main">مبلغ نهایی قابل پرداخت:</span>
                  <div className="text-end">
                    <span className="text-lg font-bold font-mono text-primary">{finalPayable === null ? 'نامشخص' : formatCurrency(finalPayable)}</span>
                    <span className="text-xs text-text-secondary ms-1">ریال</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/60 flex justify-between items-center text-caption text-text-secondary">
                  <span>وضعیت سودآوری و بهای تمام‌شده:</span>
                  <span className="font-bold text-text-main">
                    مارجین: {quote.marginPercent ?? 0}٪ ({quote.marginCompleteness === 'KNOWN' ? 'محاسبه کامل' : 'تقریبی'})
                  </span>
                </div>
              </div>

              {quote.notes && (
                <div className="rounded-2xl border border-border bg-canvas/60 p-3.5 space-y-1">
                  <span className="text-xs font-bold text-text-main block">توضیحات و یادداشت سفارش:</span>
                  <p className="text-xs leading-relaxed text-text-secondary">{quote.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CUSTOMER & DELIVERY */}
          {activeTab === 'CUSTOMER' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-white p-4 space-y-3 shadow-xs">
                <div className="flex items-center gap-2 pb-2 border-b border-border/80">
                  <Building2 size={16} className="text-primary" />
                  <h4 className="text-xs font-bold text-text-main">اطلاعات پرونده مشتری</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-text-secondary block">نام شرکت / شخص:</span>
                    <strong className="text-text-main mt-0.5 block">{customer?.name || 'نامشخص'}</strong>
                  </div>
                  <div>
                    <span className="text-text-secondary block">کد مشتری:</span>
                    <strong className="text-text-main font-mono mt-0.5 block">{customer?.code || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-text-secondary block">شماره تماس:</span>
                    <strong className="text-text-main font-mono mt-0.5 block" dir="ltr">{customer?.phone || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-text-secondary block">شهر و منطقه:</span>
                    <strong className="text-text-main mt-0.5 block">{customer?.city || '—'}</strong>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-text-secondary block">نشانی تحویل و بارگیری:</span>
                    <p className="text-text-main mt-0.5 leading-relaxed">{customer?.address || 'نشانی ثبت نشده است.'}</p>
                  </div>
                  <div>
                    <span className="text-text-secondary block">سقف اعتبار تجاری:</span>
                    <strong className="text-primary font-mono mt-0.5 block">
                      {customer?.creditLimit ? `${formatCurrency(customer.creditLimit)} ریال` : 'تعریف نشده'}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-white p-4 space-y-3 shadow-xs">
                <div className="flex items-center gap-2 pb-2 border-b border-border/80">
                  <User size={16} className="text-primary" />
                  <h4 className="text-xs font-bold text-text-main">مسئول پیگیری و فروش</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-text-secondary block">کارشناس بازرگانی:</span>
                    <strong className="text-text-main mt-0.5 block">{seller?.name || 'سیستم'}</strong>
                  </div>
                  <div>
                    <span className="text-text-secondary block">شعبه و نمایندگی:</span>
                    <strong className="text-text-main mt-0.5 block">{quote.branchId || 'شعبه مرکزی تهران'}</strong>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-white p-4 space-y-3 shadow-xs">
                <div className="flex items-center gap-2 pb-2 border-b border-border/80">
                  <Calendar size={16} className="text-primary" />
                  <h4 className="text-xs font-bold text-text-main">زمان‌بندی و تحویل</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-text-secondary block">تاریخ ثبت سفارش:</span>
                    <strong className="text-text-main font-mono mt-0.5 block">
                      {formatAppDate(quote.createdAt, state.settings?.locale)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-text-secondary block">مهلت اعتبار پیش‌فاکتور:</span>
                    <strong className="text-text-main font-mono mt-0.5 block">
                      {quote.validUntil ? formatAppDate(quote.validUntil, state.settings?.locale) : 'بدون انقضا'}
                    </strong>
                  </div>
                  {quote.externalOrderId && (
                    <div className="sm:col-span-2">
                      <span className="text-text-secondary block">شناسه ارجاع در سامانه توزیع و سامانه مالی:</span>
                      <strong className="text-primary font-mono mt-0.5 block">{quote.externalOrderId}</strong>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PAYMENT & SETTLEMENT */}
          {activeTab === 'PAYMENT' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-border bg-white p-3.5">
                  <span className="text-caption text-text-secondary block">مبلغ کل فاکتور</span>
                  <div className="text-base font-bold font-mono text-text-main mt-1">
                    {finalPayable === null ? 'نامشخص' : `${formatCurrency(finalPayable)} ریال`}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-white p-3.5">
                  <span className="text-caption text-text-secondary block">پرداخت‌شده (تخمینی)</span>
                  <div className="text-base font-bold font-mono text-success mt-1">
                    {paidAmount === null ? 'نامشخص' : `${formatCurrency(paidAmount)} ریال`}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-white p-3.5">
                  <span className="text-caption text-text-secondary block">مانده قابل پرداخت (تخمینی)</span>
                  <div className={`text-base font-bold font-mono mt-1 ${relatedRemaining === null ? 'text-text-secondary' : 'text-danger'}`} data-testid={relatedRemaining === null ? 'order-remaining-unknown' : 'order-remaining'}>
                    {relatedRemaining === null ? 'نامشخص' : `${formatCurrency(relatedRemaining)} ریال`}
                  </div>
                  <span className="text-micro text-text-secondary block mt-0.5">مانده دفتری مشتری از آخرین فاکتور به عقب (LIFO) بین فاکتورها پخش می‌شود</span>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-white p-4 space-y-3 shadow-xs">
                <h4 className="text-xs font-bold text-text-main pb-2 border-b border-border/80">
                  فاکتورها و اسناد مالی متصل
                </h4>

                {relatedInvoices.length === 0 ? (
                  <div className="p-4 text-center text-xs text-text-muted">
                    هنوز فاکتور مالی برای این سفارش صادر نشده است. پس از تأیید نهایی، سند مالی در خزانه‌داری ایجاد می‌شود.
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {relatedInvoices.map((inv) => (
                      <div key={inv.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <strong className="font-mono text-text-main">{inv.invoiceNumber || inv.id}</strong>
                          <span className="text-caption text-text-secondary block mt-0.5">
                            تاریخ: {formatAppDate(inv.createdAt, state.settings?.locale)}
                          </span>
                        </div>
                        <div className="text-end">
                          <span className="font-bold font-mono text-text-main block">
                            {formatCurrency(inv.totalAmount ?? inv.amount)} ریال
                          </span>
                          <span className="text-micro text-text-muted">{getPersianStatusLabel(inv.status)}</span>
                          <span className="text-micro text-danger block">مانده (تخمینی): {invoiceRemaining.get(inv.id) == null ? 'نامشخص' : `${formatCurrency(invoiceRemaining.get(inv.id) as number)} ریال`}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: WORKFLOW & AUDIT HISTORY */}
          {activeTab === 'HISTORY' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-white p-4 space-y-3 shadow-xs">
                <h4 className="text-xs font-bold text-text-main pb-2 border-b border-border/80">
                  گردش کار و لاگ تغییرات سفارش
                </h4>

                {quoteAuditLogs.length === 0 ? (
                  <div className="p-4 text-center text-xs text-text-muted">
                    تاریخچه سیستمی مجزایی برای این سند ثبت نشده است.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {quoteAuditLogs.map((log: Record<string, unknown>, idx: number) => (
                      <div key={log.id as string || idx} className="flex items-start gap-2.5 text-xs">
                        <Clock size={14} className="text-primary shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <strong className="text-text-main font-semibold">
                              {log.action === 'QUOTE_CREATED'
                                ? 'ایجاد اولیه سفارش'
                                : log.action === 'QUOTE_STATUS_CHANGED'
                                ? 'تغییر وضعیت سند'
                                : String(log.action || 'عملیات')}
                            </strong>
                            <span className="text-micro text-text-muted font-mono">
                              {formatAppDate(log.createdAt as string, state.settings?.locale)}
                            </span>
                          </div>
                          <p className="text-caption text-text-secondary mt-0.5 leading-relaxed">
                            {String(log.details || 'تغییرات با موفقیت اعمال گردید.')}
                          </p>
                          <span className="text-micro text-text-muted">
                            توسط: {String(log.actor || 'کاربر سیستم')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Drawer Actions */}
        <div className="shrink-0 p-3.5 border-t border-border bg-surface flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            بازگشت به فهرست
          </Button>
          <div className="flex items-center gap-2">
            <PrintQuoteButton quote={quote} state={state} />
          </div>
        </div>
      </aside>
    </div>
  );
}
