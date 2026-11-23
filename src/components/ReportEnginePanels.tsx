import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from './ui/Card';
import { formatCurrency } from '../lib/utils';
import { formatCount } from '../lib/format';
import { buildProductZoneHeatmap } from '../lib/productZoneHeatmap';
import { 
  cohortRetention, 
  deliveryPerformance, 
  lifecycleSegments, 
  pareto, 
  rfm, 
  topPercentShare, 
  visitFunnel,
  targetAchievement,
  projectPeriodEnd,
  shares
} from '../lib/reportAnalytics';
import { reconcileReceivables, summarizeCustomerLedgerReceivables } from '../lib/receivableReconciliation';
import { buildAgingBuckets, estimateLedgerAging, buildLedgerAgingInputs, estimateInvoiceRemaining } from '../services/agingBuckets';
import { useCan } from '../hooks/useCan';
import { useLedgerBookScope } from '../hooks/useLedgerBookScope';
import { LedgerBookSourceSelect } from './finance/LedgerBookSourceSelect';
import { useDataQuery } from '../hooks/useDataProvider';
import { useDataSyncStatus } from '../services/dataSyncController';
import { getActiveDataProvider } from '../services/dataProvider';
import { computeLedgerPnl, buildLedgerPnlInputs } from '../lib/ledgerPnl';
import { DEFAULT_REPORT_BUCKETS } from '../lib/accountingMapping';
import { negotiationEffectiveness } from '../lib/negotiationErpLifecycle';
import { DonutChart, FunnelChart } from './charts';
import { ReceivablesLifoPanel } from './reports/ReceivablesLifoPanel';
import { PurchaseCycleFollowUp } from './reports/PurchaseCycleFollowUp';
import { JournalCoveragePanel } from './finance/JournalCoveragePanel';
import { LineChart } from './charts/LineChart';
import { ProfitWaterfallChart } from './charts/ProfitWaterfallChart';
import { DrilldownSheet, DrilldownRow } from './shared/DrilldownSheet';
import { DocumentDetailModal, DocumentDetailData } from './shared/DocumentDetailModal';
import { ArrowUpRight, Download, Filter, Layers, ShieldCheck, ShieldAlert } from 'lucide-react';
import { resolveDataSourceStatus, sourceStatusNote, DATA_SOURCE_STATUS_LABELS } from '../lib/dataTrust';
import type { AppState, Invoice, Payment, Cheque, Account, Quote, ExternalProduct } from '../types';
import { KpiCard } from './charts/KpiCard';
import { CashFlowPanel } from './finance/CashFlowPanel';
import { FinancialDriversPanel } from './finance/FinancialDriversPanel';
import { InputControl } from './ui/Input';
import { Button } from './ui/Button';
import { FilterChip } from './ui/Tabs';
import { resolveSellerKey } from '../services/receivableReports';
import { buildNetSalesEvidence, reconcileNetSales, attributeReconciledSalesBySeller } from '../lib/financialMetricKernel';

type ExpenseLike = {
  id?: string;
  deletedAt?: string | null;
  isDeleted?: boolean;
  status?: string;
  amount?: number | string;
  categoryName?: string;
  category?: string;
  expenseCategory?: string;
  accountName?: string;
  accountCode?: string;
  date?: string;
  paidAt?: string;
  expenseNumber?: string;
  title?: string;
  description?: string;
  [key: string]: unknown;
};

type VisitLike = {
  id?: string;
  visitorId?: string;
  userId?: string;
  assigneeId?: string;
  plannedAt?: string;
  planned?: boolean;
  checkInAt?: string;
  gps?: boolean;
  status?: string;
  hasOrder?: boolean;
  orderId?: string;
  [key: string]: unknown;
};

type DeliveryEventLike = {
  id?: string;
  promisedAt?: string;
  expectedDeliveryAt?: string;
  deliveredAt?: string;
  status?: string;
  [key: string]: unknown;
};

type OrderLike = {
  id?: string;
  customerId?: string;
  status?: string;
  zone?: string;
  lines?: Array<{ productId?: string; quantity?: number; unitPrice?: number; lineTotal?: number; costPrice?: number; [key: string]: unknown }>;
  [key: string]: unknown;
};

type UserLike = {
  id: string;
  name?: string;
  [key: string]: unknown;
};

type Props = { 
  state: AppState; 
  visibleInvoices: Invoice[]; 
  visiblePayments: Payment[]; 
  visibleCheques: Cheque[]; 
  visibleExpenses: ExpenseLike[]; 
  visibleAccounts: Account[]; 
};

const REPORTS = [
  'هوش مالی و سودآوری', 'عملکرد فروش و تحقق اهداف', 'ترکیب فروش و عملکرد محصولات',
  'سلامت مشتری و چرخه خرید', 'تمرکز درآمد و فرصت توسعه', 'بهره‌وری تیم فروش میدانی',
  'مطالبات و ریسک اعتباری', 'جریان نقدینگی و خزانه', 'اثربخشی مذاکره و قیمت‌گذاری',
  'عملکرد توزیع و کیفیت تحویل', 'مرجوعی و نشت فروش'
];

const nf = (n: number | null | undefined, digits = 0) => n == null || !Number.isFinite(n) ? 'نامشخص' : new Intl.NumberFormat('fa-IR', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
const pf = (n: number | null | undefined) => n == null ? 'نامشخص' : `${nf(n * 100, 1)}٪`;

function Metric({label,value,note,sparkline}:{label:string;value:React.ReactNode;note?:string;sparkline?:number[]}) {
  return <KpiCard density="compact" label={label} value={value} description={note}
    sparkline={sparkline} sparklineLabel={sparkline ? 'روند فروش در روزهای دارای فاکتور' : undefined} />;
}

function Bars({ rows, money = false, onRowClick }: { rows: { key: string; value: number }[]; money?: boolean; onRowClick?: (row: { key: string; value: number }) => void }) {
  const max = Math.max(0, ...rows.map(r => r.value));
  return !rows.length || max <= 0 ? (
    <p className="rounded-xl border border-dashed border-border p-3 text-xs text-text-secondary">داده قابل نمایش وجود ندارد.</p>
  ) : (
    <div className="space-y-2.5">
      {rows.slice(0, 8).map(r => (
        <div
          key={r.key}
          onClick={onRowClick ? () => onRowClick(r) : undefined}
          className={onRowClick ? 'cursor-pointer group' : undefined}
        >
          <div className="mb-1 flex justify-between gap-2 text-xs">
            <span className={`truncate font-semibold flex items-center gap-1.5 ${onRowClick ? 'group-hover:text-primary transition-colors' : ''}`}>
              {r.key}
              {onRowClick && <ArrowUpRight size={11} className="opacity-0 group-hover:opacity-100 text-primary transition-opacity" />}
            </span>
            <span className="shrink-0 font-mono text-text-secondary">{money ? formatCurrency(r.value) : nf(r.value)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-border/60">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function FinanceTrendChart({ rows }: { rows: Array<{ label: string; revenue: number | null; expenses: number | null; profit: number | null }> }) {
  const series = [
    { key: 'revenue' as const, label: 'فروش خالص دفتری', color: 'var(--c-chart-1)' },
    { key: 'expenses' as const, label: 'هزینه عملیاتی دفتری', color: 'var(--c-chart-3)' },
    { key: 'profit' as const, label: 'سود عملیاتی دفتری', color: 'var(--c-chart-2)' },
  ];
  const valid = rows.flatMap(row => series.map(item => row[item.key])).filter((value): value is number => value !== null && Number.isFinite(value));
  if (!valid.length) return <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-text-secondary">برای ترسیم روند ۱۲ماهه، خطوط دفترکل معتبر و نگاشت‌شده در دسترس نیست.</p>;
  const min = Math.min(0, ...valid), max = Math.max(1, ...valid), span = max - min || 1;
  const x = (index: number) => 18 + (index / Math.max(1, rows.length - 1)) * 604;
  const y = (value: number) => 166 - ((value - min) / span) * 142;
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-micro text-text-secondary">{series.map(item => <span key={item.key} className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-full" style={{ background: item.color }} />{item.label}</span>)}</div>
    <svg viewBox="0 0 640 198" className="w-full" role="img" aria-label="روند دفتری دوازده ماهه فروش خالص، هزینه عملیاتی و سود عملیاتی">
      {[0,1,2,3].map(i => <line key={i} x1="12" x2="628" y1={24 + i * 47} y2={24 + i * 47} stroke="var(--color-chart-grid)" strokeDasharray="3 5" />)}
      {series.map(item => {
        const segments: string[][] = [];
        let active: string[] = [];
        rows.forEach((row, index) => {
          const value = row[item.key];
          if (value == null || !Number.isFinite(value)) {
            if (active.length) segments.push(active);
            active = [];
          } else active.push(`${x(index)},${y(value)}`);
        });
        if (active.length) segments.push(active);
        return <g key={item.key}>
          {segments.map((points, index) => points.length > 1 ? <polyline key={`${item.key}-segment-${index}`} points={points.join(' ')} fill="none" stroke={item.color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /> : null)}
          {rows.map((row, index) => row[item.key] == null ? null : <circle key={`${item.key}-${index}`} cx={x(index)} cy={y(row[item.key] as number)} r="3" fill={item.color} stroke="var(--color-card)" strokeWidth="1.5" />)}
        </g>;
      })}
      {rows.map((row, index) => <text key={row.label} x={x(index)} y="190" textAnchor="middle" fontSize="9" fill="var(--color-ink-soft)">{row.label}</text>)}
    </svg>
  </div>;
}

function pctChange(current: number | null, previous: number | null): string | null {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  const pct = (current - previous) / Math.abs(previous) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪`;
}

export function ReportEnginePanels({ state, visibleInvoices, visiblePayments, visibleExpenses, visibleAccounts }: Props) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState(() => {
    const report = Number(searchParams.get('report'));
    return Number.isInteger(report) && report >= 1 && report <= REPORTS.length ? report : 1;
  });
  const [period, setPeriod] = useState<'90d' | '12m' | 'all'>('12m');
  const [customerQuery, setCustomerQuery] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState<string | null>(null);

  const [selectedExpenseCategory, setSelectedExpenseCategory] = useState<string | null>(() => searchParams.get('expenseCategory'));
  const [selectedProduct, setSelectedProduct] = useState<string | null>(() => searchParams.get('product'));
  const [selectedZone, setSelectedZone] = useState<string | null>(() => searchParams.get('zone'));

  const [drilldown, setDrilldown] = useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    metricLabel?: string;
    metricValue?: string;
    customerId?: string;
    customerName?: string;
    rows: DrilldownRow[];
  } | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocumentDetailData | null>(null);

  const { can: canReport } = useCan(state);
  const canSeeLedger = canReport('finance', 'VIEW');

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (selectedExpenseCategory) next.set('expenseCategory', selectedExpenseCategory);
    else next.delete('expenseCategory');
    if (selectedProduct) next.set('product', selectedProduct);
    else next.delete('product');
    if (selectedZone) next.set('zone', selectedZone);
    else next.delete('zone');
    setSearchParams(next, { replace: true });
  }, [selectedExpenseCategory, selectedProduct, selectedZone]);

  const clearAllFilters = () => {
    setSelectedExpenseCategory(null);
    setSelectedProduct(null);
    setSelectedZone(null);
    setLifecycleFilter(null);
    setCustomerQuery('');
  };

  const hasGeneratedDemo = (state.invoices || []).some((row: Invoice) => String(row.id || '').startsWith('demo-')) && (state.accounts || []).some((row: Account) => String(row.id || '').startsWith('demo-'));
  const localTest = hasGeneratedDemo && (state.seedMetadata?.mode === 'LOCAL_TEST' || state.seedMetadata?.mode === 'DEMO');
  const sampleOnly = <T extends { id?: string }>(rows: T[]) => localTest ? rows.filter(row => String(row.id || '').startsWith('demo-')) : rows;
  
  const reportInvoices = useMemo(() => sampleOnly(visibleInvoices), [visibleInvoices, localTest]);
  const reportPayments = useMemo(() => sampleOnly(visiblePayments), [visiblePayments, localTest]);
  const reportExpenses = useMemo(() => sampleOnly(visibleExpenses), [visibleExpenses, localTest]);
  const accountMap = useMemo(() => new Map(visibleAccounts.map(a => [a.id, a])), [visibleAccounts]);
  const asOf = new Date().toISOString().slice(0,10);
  const cutoff = period === 'all' ? null : new Date(Date.now() - (period === '90d' ? 90 : 365) * 86400000).toISOString().slice(0,10);

  const {scope:ledgerScope} = useLedgerBookScope();
  const pnlFetchFrom = useMemo(() => {
    if (period === 'all' || !cutoff) return undefined;
    const periodDays = period === '90d' ? 90 : 365;
    const twelveMonthsStart = new Date(`${asOf}T00:00:00Z`);
    twelveMonthsStart.setUTCMonth(twelveMonthsStart.getUTCMonth() - 11, 1);
    const twelveMonthsFrom = twelveMonthsStart.toISOString().slice(0, 10);
    const previousTo = new Date(new Date(`${cutoff}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
    const previousFrom = new Date(new Date(`${previousTo}T00:00:00Z`).getTime() - (periodDays - 1) * 86400000).toISOString().slice(0, 10);
    return previousFrom < twelveMonthsFrom ? previousFrom : twelveMonthsFrom;
  }, [period, cutoff, asOf]);

  // کلید تازه‌سازی فقط برای ابطال کش؛ منبع داده همیشه DataProvider است (F0-14). کوئری P&L فقط به بازه و مجوز وابسته است.
  const ledgerLineCount = Array.isArray(state.journalLines) ? state.journalLines.length : 0;

  const { data: ledgerPnlData, error: ledgerPnlError, loading: ledgerPnlLoading, refetch: refreshLedgerPnl } = useDataQuery(
    async provider => (canSeeLedger ? provider.getLedgerPnlData({ ...ledgerScope,fromDate: pnlFetchFrom, toDate: asOf }) : null),
    [canSeeLedger,state.currentUserId,pnlFetchFrom,asOf,ledgerScope?.source,ledgerScope?.currency]
  );

  const effectivePnlData = useMemo(() => {
    if (!canSeeLedger) {
      return { status: 'RESTRICTED' as const, source: getActiveDataProvider().name, journalLines: [], coaMirror: [], reason: 'دسترسی مشاهده اطلاعات مالی و دفتر کل ندارید.' };
    }
    if (ledgerPnlError) {
      return { status: 'UNAVAILABLE' as const, source: getActiveDataProvider().name, journalLines: [], coaMirror: [], reason: ledgerPnlError.message };
    }
    if (ledgerPnlData?.source==='CLIENT_INDEXEDDB') {
      return { status:'UNAVAILABLE' as const,source:ledgerPnlData.source,journalLines:[],coaMirror:[],
        reason:'گزارش رسمی به آرتیکل‌های معتبر SQL Server نیاز دارد.' };
    }
    return ledgerPnlData;
  }, [canSeeLedger, ledgerPnlError, ledgerPnlData]);

  const pnlUnavailable = effectivePnlData?.status === 'UNAVAILABLE' || effectivePnlData?.status === 'RESTRICTED';

  const sourceStatus = resolveDataSourceStatus(state, {
    hasLiveSql: effectivePnlData?.source === 'SQLSERVER_BACKEND' && effectivePnlData?.status === 'LIVE',
    hasLiveErp: false,
    requiredSourcesPresent: (state.invoices?.length ?? 0) > 0 || Boolean(effectivePnlData && !pnlUnavailable && effectivePnlData.journalLines.length > 0),
  });

  const invoices = useMemo(() => reportInvoices.filter(i => !i.deletedAt && !(i as Invoice & { isDeleted?: boolean }).isDeleted && !['DRAFT','PENDING','CANCELLED','CANCELED','VOID','VOIDED','REJECTED'].includes(String(i.status || '').toUpperCase()) && Number(i.totalAmount) > 0 && Number.isFinite(Number(i.totalAmount)) && Boolean(i.date) && Boolean(i.customerId || i.accountId) && (!cutoff || String(i.date).slice(0,10) >= cutoff) && String(i.date).slice(0,10) <= asOf), [reportInvoices, cutoff, asOf]);
  // Single calculation across customer sales, RFM monetary, Pareto and target
  // achievement. Only financial ERP-mirror credit notes may reduce a sale.
  // Never pretend unverified return coverage is equal to zero returns.
  const netSalesEvidence = useMemo(() => {
    const ids = new Set(reportInvoices.map(i=>String(i.id)));
    const customers = new Set(visibleAccounts.map(account=>String(account.id)));
    const creditNotes = (state.creditNotes || []).filter(note =>
      ids.has(String(note.invoiceId || '')) || customers.has(String(note.customerId || note.accountId || '')))
      .map(note=>({
        ...note,
        sellerId:String(note.sellerId || note.salesRepId || note.salesRepExternalId || note.sellerCode || '').trim() || undefined
      }));
    return buildNetSalesEvidence(reportInvoices.filter(i =>
      !i.deletedAt && !(i as Invoice & { isDeleted?: boolean }).isDeleted && !['DRAFT','PENDING','CANCELLED','CANCELED','VOID','VOIDED','REJECTED'].includes(String(i.status||'').toUpperCase())
    ).map(i=>({
      id:String(i.id),customerId:String(i.customerId||i.accountId||''),
      date:String(i.date||''),totalAmount:Number(i.totalAmount)
    })),creditNotes, {
      from:cutoff,to:asOf,
      returnsVerified:state.creditNoteSourceStatus === 'CONNECTED'
    });
  }, [reportInvoices, visibleAccounts, state.creditNotes, state.creditNoteSourceStatus, cutoff, asOf]);
  // Financial totals are reconciled with the posted ERP ledger below.
  
  const ledgerInputs = useMemo(() => {
    if (!effectivePnlData || pnlUnavailable) return { rawLines: [], accounts: [] };
    return buildLedgerPnlInputs(effectivePnlData.journalLines, effectivePnlData.coaMirror);
  }, [effectivePnlData, pnlUnavailable]);

  const pnlReport = useMemo(() => computeLedgerPnl(ledgerInputs.rawLines, ledgerInputs.accounts, DEFAULT_REPORT_BUCKETS, { from: cutoff || undefined, to: asOf }), [ledgerInputs, cutoff, asOf]);
  const salesReconciliation = useMemo(() => reconcileNetSales(
    netSalesEvidence,
    pnlReport.values.GROSS_SALES,
    pnlReport.values.SALES_RETURNS,
    effectivePnlData?.source === 'SQLSERVER_BACKEND' && effectivePnlData?.status === 'LIVE'
  ), [netSalesEvidence,pnlReport,effectivePnlData?.source,effectivePnlData?.status]);
  const salesReconciled = salesReconciliation.status === 'RECONCILED';
  const facts = salesReconciled ? netSalesEvidence.facts : [];
  const customerSales = salesReconciled ? netSalesEvidence.byCustomer : [];
  const sellerNetSales = useMemo(() => attributeReconciledSalesBySeller(
    netSalesEvidence, salesReconciliation, reportInvoices,
    (invoice: Invoice) => resolveSellerKey(invoice as {ownerId?:string;sellerId?:string;salesRepId?:string;sellerCode?:string})
  ), [netSalesEvidence, salesReconciliation, reportInvoices]);

  
  const previousPnlReport = useMemo(() => {
    if (!cutoff || period === 'all') return null;
    const periodDays = period === '90d' ? 90 : 365;
    const previousTo = new Date(new Date(`${cutoff}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
    const previousFrom = new Date(new Date(`${previousTo}T00:00:00Z`).getTime() - (periodDays - 1) * 86400000).toISOString().slice(0, 10);
    return computeLedgerPnl(ledgerInputs.rawLines, ledgerInputs.accounts, DEFAULT_REPORT_BUCKETS, { from: previousFrom, to: previousTo });
  }, [ledgerInputs, cutoff, period]);

  const monthlyPnlRows = useMemo(() => {
    const end = new Date(`${asOf}T00:00:00Z`);
    return Array.from({ length: 12 }, (_, index) => {
      const monthStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (11 - index), 1));
      const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
      const from = monthStart.toISOString().slice(0, 10);
      const to = (monthEnd > end ? end : monthEnd).toISOString().slice(0, 10);
      const values = computeLedgerPnl(ledgerInputs.rawLines, ledgerInputs.accounts, DEFAULT_REPORT_BUCKETS, { from, to }).values;
      return { label: new Intl.DateTimeFormat('fa-IR', { month: 'short' }).format(monthStart), revenue: values.NET_SALES, expenses: values.OPERATING_EXPENSES, profit: values.OPERATING_PROFIT };
    });
  }, [ledgerInputs, asOf]);

  const expenseParetoRows = useMemo(() => {
    const totals = new Map<string, number>();
    reportExpenses.filter((expense: ExpenseLike) => !expense.deletedAt && !expense.isDeleted && !['VOID','VOIDED','CANCELLED','CANCELED'].includes(String(expense.status || '').toUpperCase()))
      .forEach((expense: ExpenseLike) => {
        const amount = Number(expense.amount);
        if (!Number.isFinite(amount) || amount <= 0) return;
        const rawCategory = expense.categoryName || expense.category || expense.expenseCategory || expense.accountName || expense.accountCode;
        const category = typeof rawCategory === 'string' && rawCategory.trim() ? rawCategory.trim() : 'بدون دسته‌بندی';
        totals.set(category, (totals.get(category) || 0) + amount);
      });
    return [...totals.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
  }, [reportExpenses]);

  const filteredExpenseRows = useMemo(() => reportExpenses.filter((expense: ExpenseLike) => {
    if (selectedExpenseCategory) {
      const rawCategory = expense.categoryName || expense.category || expense.expenseCategory || expense.accountName || expense.accountCode;
      const category = typeof rawCategory === 'string' && rawCategory.trim() ? rawCategory.trim() : 'بدون دسته‌بندی';
      if (category !== selectedExpenseCategory) return false;
    }
    return !expense.deletedAt && !expense.isDeleted && !['VOID','VOIDED','CANCELLED','CANCELED'].includes(String(expense.status || '').toUpperCase());
  }), [reportExpenses, selectedExpenseCategory]);

  const pnlValues = pnlReport.values;
  const profitWaterfallSteps = useMemo(() => {
    const required = ['GROSS_SALES', 'SALES_RETURNS', 'COGS', 'OPERATING_EXPENSES', 'OPERATING_PROFIT'];
    if (required.some(key => pnlValues[key] == null)) return [];
    return [
      { label: 'فروش ناخالص', amount: pnlValues.GROSS_SALES as number, type: 'POSITIVE' as const },
      { label: 'برگشت و تخفیف', amount: pnlValues.SALES_RETURNS as number, type: 'NEGATIVE' as const },
      { label: 'بهای تمام‌شده', amount: pnlValues.COGS as number, type: 'NEGATIVE' as const },
      { label: 'هزینه عملیاتی', amount: pnlValues.OPERATING_EXPENSES as number, type: 'NEGATIVE' as const },
      { label: 'سود عملیاتی', amount: pnlValues.OPERATING_PROFIT as number, type: 'SUBTOTAL' as const }
    ];
  }, [pnlValues]);

  const { zones: ZONES, rows: productZoneHeatmap } = useMemo(() => buildProductZoneHeatmap({
    products: (state.externalProducts || []) as Array<Record<string, unknown>>,
    orders: (state.salesOrders || []) as Array<Record<string, unknown>>,
    zones: (state.geoZones || []) as Array<Record<string, unknown>>,
    assignments: (state.zoneAssignments || []) as unknown as Array<Record<string, unknown>>
  }), [state.externalProducts, state.salesOrders, state.geoZones, state.zoneAssignments]);

  const salesKpi = useMemo(() => {
    const totalSales = salesReconciled ? netSalesEvidence.net : null;
    const fromMonth = cutoff ? cutoff.slice(0, 7) : '0000-00';
    const toMonth = asOf.slice(0, 7);
    const target = (state.salesTargets || [])
      .filter(item => item.periodMonth >= fromMonth && item.periodMonth <= toMonth)
      .reduce((sum, item) => sum + Math.max(0, Number(item.revenueTargetRials) || 0), 0);
    return targetAchievement(totalSales, target > 0 ? target : null);
  }, [netSalesEvidence.net, salesReconciled, state.salesTargets, cutoff, asOf]);

  const observedSalesTrend=useMemo(()=>{
    // Return dates need a dated accounting series; never label an invoice-only
    // gross daily series as net sales if any returns are present.
    if (localTest || getActiveDataProvider().name!=='SQLSERVER_BACKEND'
      || !salesReconciled || netSalesEvidence.returns !== 0) return undefined;
    const byDay=new Map<string,number>();
    for (const invoice of invoices) {
      const date=invoice.date.slice(0,10);
      byDay.set(date,(byDay.get(date) ?? 0)+Number(invoice.totalAmount));
    }
    return [...byDay].sort(([a],[b])=>a.localeCompare(b)).slice(-12).map(([,amount])=>amount);
  },[invoices,localTest,salesReconciled,netSalesEvidence.returns]);

  const productShareRows = useMemo(() => {
    const map = new Map<string, number>();
    (state.quotes || []).forEach((q: Quote) => {
      (q.lines || []).forEach((l: { productId?: string; lineTotal?: number; [key: string]: unknown }) => {
        const p = state.externalProducts?.find((x: ExternalProduct) => x.id === l.productId);
        const name = p?.name || 'کالای سفارشی';
        map.set(name, (map.get(name) || 0) + (Number(l.lineTotal) || 0));
      });
    });
    return shares([...map.entries()].map(([key, value]) => ({ key, value })));
  }, [state.quotes, state.externalProducts]);

  const negotiationStats = useMemo(() => {
    const records = (state.quotes || []).map((q: Quote) => ({
      id: q.id,
      orderRef: q.quoteNumber,
      status: q.status === 'ACCEPTED' ? 'ACCEPTED' as const : q.status === 'REJECTED' ? 'REJECTED' as const : 'DRAFT' as const,
      baseAmount: Number(q.totalAmount) || 0,
      proposedAmount: Number(q.totalAmount) || 0,
      erpAppliedAmount: q.status === 'ACCEPTED' ? Number(q.totalAmount) || 0 : null,
      history: [{ from: null, to: 'DRAFT' as const, at: q.createdAt }]
    }));
    return negotiationEffectiveness(records);
  }, [state.quotes]);

  const negotiationLossReasons = useMemo(() => {
    const counts = new Map<string, number>();
    (state.quotes || []).filter((quote: Quote) => ['REJECTED', 'LOST', 'CANCELLED'].includes(String(quote.status || '').toUpperCase())).forEach((quote: Quote) => {
      const reason = String(quote.rejectionReason || quote.lossReason || '').trim();
      if (reason) counts.set(reason, (counts.get(reason) || 0) + 1);
    });
    return [...counts.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
  }, [state.quotes]);

  const lifecycle = useMemo(() => lifecycleSegments(facts, asOf), [facts, asOf]);
  const rfmRows = useMemo(() => rfm(facts, asOf,
    new Map(customerSales.map(row=>[row.key,row.value]))), [facts, asOf, customerSales]);
  // When official returns are unavailable, the dependent figures stay empty
  // instead of showing inflated gross numbers under a net-sales label.
  const paretoRows = useMemo(() => pareto(customerSales), [customerSales]);
  const topShare = useMemo(() => topPercentShare(customerSales, 20), [customerSales]);
  const customerHhi = useMemo(() => paretoRows.total > 0 ? paretoRows.rows.reduce((sum, row) => sum + Math.pow(row.value / paretoRows.total, 2), 0) * 10000 : null, [paretoRows]);
  const visitPerformanceRows = useMemo(() => (state.users || []).map((user: UserLike) => {
    const userVisits = (state.visits || []).filter((visit: VisitLike) => (visit.visitorId || visit.userId || visit.assigneeId) === user.id);
    const metrics = visitFunnel(userVisits.map((visit: VisitLike) => ({ planned: Boolean(visit.plannedAt || visit.planned), checkInAt: visit.checkInAt, locationSource: visit.gps ? 'GPS' : 'MANUAL', success: visit.status === 'COMPLETED', hasOrder: Boolean(visit.hasOrder || visit.orderId) })));
    return { user, metrics };
  }).filter((row: { user: UserLike; metrics: ReturnType<typeof visitFunnel> }) => row.metrics.planned || row.metrics.actual), [state.users, state.visits]);
  const filteredRfmRows = useMemo(() => rfmRows.filter(row => { const account = accountMap.get(row.customerId); return `${account?.name || ''} ${row.customerId}`.toLocaleLowerCase().includes(customerQuery.trim().toLocaleLowerCase()); }), [rfmRows, accountMap, customerQuery]);
  const filteredParetoRows = useMemo(() => paretoRows.rows.filter(row => { const account = accountMap.get(row.key); return `${account?.name || ''} ${row.key}`.toLocaleLowerCase().includes(customerQuery.trim().toLocaleLowerCase()); }), [paretoRows.rows, accountMap, customerQuery]);
  const lifecycleCustomerIds = useMemo(() => lifecycleFilter ? new Set(Object.entries(lifecycle.segments).filter(([, segment]) => segment === lifecycleFilter).map(([id]) => id)) : null, [lifecycle.segments, lifecycleFilter]);
  const lifecycleFacts = useMemo(() => lifecycleCustomerIds ? facts.filter(row => lifecycleCustomerIds.has(row.customerId)) : facts, [facts, lifecycleCustomerIds]);
  const lifecycleFilteredCohorts = useMemo(() => cohortRetention(lifecycleFacts), [lifecycleFacts]);
  const lifecycleCustomerRows = useMemo(() => {
    const totals = new Map<string, { amount: number; count: number }>();
    lifecycleFacts.forEach(row => { const item = totals.get(row.customerId) || { amount: 0, count: 0 }; item.amount += row.amount; item.count += 1; totals.set(row.customerId, item); });
    return [...totals.entries()].map(([customerId, value]) => ({ customerId, name: accountMap.get(customerId)?.name || customerId, ...value }))
      .filter(row => `${row.name} ${row.customerId}`.toLocaleLowerCase().includes(customerQuery.trim().toLocaleLowerCase()))
      .sort((a,b) => b.amount-a.amount);
  }, [lifecycleFacts, accountMap, customerQuery]);
  const lifecycleLabel = (key: string) => ({ NEW: 'جدید', ACTIVE: 'فعال', LOW_ACTIVITY: 'کم‌فعالیت', AT_RISK: 'در معرض ریزش', LOST: 'ازدست‌رفته', UNKNOWN: 'نامشخص' } as Record<string,string>)[key] || key;
  
  const visits = useMemo(() => visitFunnel((state.visits || []).map((v: VisitLike) => ({
    planned: Boolean(v.plannedAt || v.planned),
    checkInAt: v.checkInAt,
    locationSource: v.gps ? 'GPS' : 'MANUAL',
    success: v.status === 'COMPLETED',
    hasOrder: Boolean(v.hasOrder)
  }))), [state.visits]);

  const deliveries = useMemo(() => deliveryPerformance((state.deliveryEvents || []).filter((event: DeliveryEventLike) => {
    const eventDate = String((event as Record<string, unknown>).deliveredAt || (event as Record<string, unknown>).shippedAt || (event as Record<string, unknown>).createdAt || (event as Record<string, unknown>).date || '').slice(0, 10);
    return Boolean(eventDate) && (!cutoff || eventDate >= cutoff) && eventDate <= asOf;
  }).map((r: DeliveryEventLike) => {
    const rec = r as Record<string, unknown>;
    const status = String(rec.status || rec.deliveryStatus || rec.delivered || '').toUpperCase();
    return {
      loaded: Boolean(rec.loadedAt || rec.loaded === true || ['LOADED', 'SHIPPED', 'DELIVERED', 'COMPLETED'].includes(status)),
      shipped: Boolean(rec.shippedAt || rec.shipped === true || ['SHIPPED', 'DELIVERED', 'COMPLETED'].includes(status)),
      delivered: ['FULL', 'DELIVERED', 'COMPLETED'].includes(status) ? 'FULL' : status === 'PARTIAL' ? 'PARTIAL' : ['FAILED', 'UNSUCCESSFUL'].includes(status) ? 'FAILED' : null,
      promisedAt:r.promisedAt||r.expectedDeliveryAt,
      deliveredAt: rec.deliveredAt as string | undefined,
      exceptionReason: (rec.exceptionReason || rec.failureReason || rec.delayReason || undefined) as string | undefined
    };
  })), [state.deliveryEvents, cutoff, asOf]);

  const canReviewAllocations = selected === 7 && canSeeLedger && canReport('payments', 'VIEW');
  const { serverVersion } = useDataSyncStatus();
  const { data: paymentAllocations, error: allocationError, loading: allocationsLoading, refetch: refreshAllocations } = useDataQuery(
    provider => canReviewAllocations ? provider.getPaymentAllocations() : Promise.resolve(null),
    [canReviewAllocations, state.currentUserId, serverVersion]
  );
  const receivables = useMemo(() => {
    if (!canReviewAllocations || allocationsLoading || allocationError || !paymentAllocations) return null;
    const invoiceIds = new Set(reportInvoices.map(invoice => invoice.id));
    const paymentIds = new Set(reportPayments.map(payment => payment.id));
    const allocations = paymentAllocations.filter(row => invoiceIds.has(row.invoiceId) && paymentIds.has(row.paymentId));
    return reconcileReceivables(reportInvoices, reportPayments, allocations, undefined, new Date());
  }, [canReviewAllocations, allocationsLoading, allocationError, paymentAllocations, reportInvoices, reportPayments]);

  const { data: ledgerBalances, error: ledgerBalancesError, refetch: refreshLedgerBalances } = useDataQuery(
    async provider => (canSeeLedger ? provider.getDetailSubsidiaryBalances({ ...ledgerScope,role:'RECEIVABLE' }) : null),
    [canSeeLedger,state.currentUserId,ledgerLineCount,ledgerScope?.source,ledgerScope?.currency]
  );

  const availableLedgerBalances = useMemo(() => {
    if (!canSeeLedger) return null;
    if (ledgerBalancesError) {
      return { status: 'UNAVAILABLE' as const, source: getActiveDataProvider().name, balances: [], reason: ledgerBalancesError.message };
    }
    return ledgerBalances;
  }, [canSeeLedger, ledgerBalancesError, ledgerBalances]);

  const ledgerReceivables = useMemo(
    () => summarizeCustomerLedgerReceivables(canSeeLedger ? availableLedgerBalances : { status: 'EMPTY', source: 'CLIENT_INDEXEDDB', balances: [] }, visibleAccounts),
    [canSeeLedger, availableLedgerBalances, visibleAccounts]
  );
  const agingEstimate = useMemo(
    () => estimateLedgerAging(canSeeLedger ? buildLedgerAgingInputs(availableLedgerBalances, visibleAccounts, reportInvoices) : [], new Date()),
    [canSeeLedger, availableLedgerBalances, visibleAccounts, reportInvoices]
  );
  const hasAgingEstimate = agingEstimate.customers.length > 0;
  const invoiceRemaining = useMemo(
    () => (canSeeLedger ? estimateInvoiceRemaining(availableLedgerBalances, visibleAccounts, reportInvoices) : new Map<string, number | null>()),
    [canSeeLedger, availableLedgerBalances, visibleAccounts, reportInvoices]
  );
  const aging = useMemo(() => buildAgingBuckets(agingEstimate.items), [agingEstimate]);

  const openCustomerDrilldown = (customerId: string, contextTitle?: string) => {
    const account = accountMap.get(customerId);
    const custInvoices = invoices.filter(i => (i.customerId === customerId || i.accountId === customerId));
    const total = custInvoices.reduce((sum, i) => sum + Number(i.totalAmount || 0), 0);
    
    const rows: DrilldownRow[] = custInvoices.map(inv => ({
      id: inv.id,
      number: inv.invoiceNumber || inv.id,
      date: inv.date,
      amount: Number(inv.totalAmount || 0),
      outstanding: invoiceRemaining.get(inv.id) ?? undefined,
      status: inv.status || 'تأییدشده',
      rawDoc: {
        id: inv.id,
        type: 'INVOICE',
        number: inv.invoiceNumber || inv.id,
        date: inv.date,
        dueDate: inv.dueDate,
        customerId,
        customerName: account?.name || 'مشتری',
        totalAmount: Number(inv.totalAmount || 0),
        status: inv.status || 'تأییدشده',
        isSynthetic: localTest
      }
    }));

    setDrilldown({
      isOpen: true,
      title: `ریز اسناد مالی: ${account?.name || 'مشتری'}`,
      subtitle: contextTitle || 'فاکتورهای دوره انتخابی',
      metricLabel: 'ارزش کل فاکتورها',
      metricValue: `${formatCurrency(total)} ریال`,
      customerId,
      customerName: account?.name || 'مشتری',
      rows,
    });
  };

  const handleExportCurrentReportCsv = () => {
    let csv = '';
    const reportTitle = REPORTS[selected - 1];
    
    if (selected === 1) {
      csv = 'سرفصل گزارش,مبلغ (ریال)\n';
      csv += `فروش ناخالص,${pnlReport.values.GROSS_SALES ?? ''}\n`;
      csv += `برگشت از فروش و تخفیف,${pnlReport.values.SALES_RETURNS ?? ''}\n`;
      csv += `فروش خالص,${pnlReport.values.NET_SALES ?? ''}\n`;
      csv += `بهای تمام شده کالا,${pnlReport.values.COGS ?? ''}\n`;
      csv += `سود ناخالص,${pnlReport.values.GROSS_PROFIT ?? ''}\n`;
      csv += `هزینه‌های توزیع و اداری,${pnlReport.values.OPERATING_EXPENSES ?? ''}\n`;
      csv += `سود عملیاتی,${pnlReport.values.OPERATING_PROFIT ?? ''}\n`;
    } else if (selected === 5) {
      csv = 'مشتری,مبلغ فروش (ریال),سهم از کل,سهم تجمعی\n';
      filteredParetoRows.forEach(r => {
        const name = accountMap.get(r.key)?.name || r.key;
        csv += `"${name}",${r.value},"${pf(r.share)}","${pf(r.cumulativeShare)}"\n`;
      });
    } else if (selected === 7) {
      csv = 'بازه سنی,مبلغ مطالبات (ریال),تعداد فاکتور\n';
      aging.buckets.forEach(b => {
        csv += `"${b.label}",${b.amount},${b.invoiceCount}\n`;
      });
    } else {
      csv = 'عنوان,مقدار\n';
      csv += `عنوان گزارش,"${reportTitle}"\n`;
      csv += `تاریخ گزارش,"${asOf}"\n`;
      csv += `تعداد فاکتورهای بررسی‌شده,${invoices.length}\n`;
    }

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `report_${selected}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasAnyFilter = Boolean(selectedExpenseCategory || selectedProduct || selectedZone || lifecycleFilter || customerQuery);

  return (
    <section className="space-y-3" aria-label="کتابخانه گزارش‌های تحلیلی مصوب" data-tour-heading>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!searchParams.has('report') && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar flex-1" role="tablist" id="reports-tabs" data-tour-actions>
          {REPORTS.map((name, i) => (
            <button 
              key={i} 
              type="button" 
              role="tab" 
              aria-selected={selected === i + 1} 
              onClick={() => {
                setSelected(i + 1);
                const next = new URLSearchParams(searchParams);
                next.set('view', 'analytical');
                next.set('report', String(i + 1));
                setSearchParams(next, { replace: true });
              }} 
              className={`shrink-0 rounded-xl border px-3 py-1.5 text-right cursor-pointer transition-all ${
                selected === i + 1 
                  ? 'border-primary bg-primary text-on-primary shadow-xs font-bold' 
                  : 'border-border bg-surface text-text-secondary hover:text-text-main hover:bg-canvas'
              }`}
            >
              <span className="block text-tiny opacity-75">گزارش {nf(i + 1)}</span>
              <span className="block text-xs">{name}</span>
            </button>
          ))}
        </div>
        )}

        {[2,4,5].includes(selected) && !salesReconciled && (
        <p role="status" className="rounded-lg border border-(--c-warning-soft)/50 p-3 text-sm text-(--c-text-main)">
          فروش خالص قابل تأیید نیست: {salesReconciliation.reason}
        </p>
      )}
      {selected!==8 && <Button variant="outline" size="sm" className="shrink-0" type="button" onClick={handleExportCurrentReportCsv} >
          <Download size={13} className="text-primary" />
          <span>خروجی اکسل</span>
        </Button>}
      </div>

      {hasAnyFilter && selected!==8 && (
        <div className="flex items-center flex-wrap gap-2 p-2 rounded-xl bg-canvas border border-border/80 text-xs animate-in fade-in">
          <span className="text-caption font-bold text-text-secondary flex items-center gap-1">
            <Filter size={12} className="text-primary" />
            فیلترهای فعال:
          </span>

          {selectedExpenseCategory && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-bold border border-primary/20">
              دسته هزینه: {selectedExpenseCategory}
              <button type="button" onClick={() => setSelectedExpenseCategory(null)} className="hover:text-danger cursor-pointer mr-1" aria-label="حذف فیلتر">×</button>
            </span>
          )}

          {selectedProduct && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-bold border border-primary/20">
              کالا: {selectedProduct}
              <button type="button" onClick={() => setSelectedProduct(null)} className="hover:text-danger cursor-pointer mr-1" aria-label="حذف فیلتر">×</button>
            </span>
          )}

          {selectedZone && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-bold border border-primary/20">
              زون: {selectedZone}
              <button type="button" onClick={() => setSelectedZone(null)} className="hover:text-danger cursor-pointer mr-1" aria-label="حذف فیلتر">×</button>
            </span>
          )}

          {lifecycleFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-bold border border-primary/20">
              چرخه مشتری: {lifecycleLabel(lifecycleFilter)}
              <button type="button" onClick={() => setLifecycleFilter(null)} className="hover:text-danger cursor-pointer mr-1" aria-label="حذف فیلتر">×</button>
            </span>
          )}

          <Button variant="link-danger" size="inline" className="mr-auto" type="button" onClick={clearAllFilters} >
            پاک‌کردن همه فیلترها
          </Button>
        </div>
      )}

      <Card padding="md" className="space-y-3 bg-surface border-border">
        <div className="flex justify-between items-center border-b border-border/60 pb-2" data-tour-heading>
          <div>
            <span className="text-micro text-text-secondary">گزارش {nf(selected)} از ۱۱</span>
            <h4 className="text-sm font-bold text-text-main mt-0.5 flex flex-wrap items-center gap-2">
              {REPORTS[selected - 1]}
            </h4>
          </div>
          <span className="px-2 py-0.5 rounded-full text-micro font-bold bg-canvas border border-border text-text-secondary">
            {DATA_SOURCE_STATUS_LABELS[sourceStatus]} · {sourceStatusNote(sourceStatus)}
          </span>
        </div>

        {selected!==8 && <div className="flex flex-wrap items-center justify-between gap-2 bg-canvas p-2 rounded-xl border border-border">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-text-secondary">بازه محاسبه:</span>
            <div className="inline-flex p-0.5 rounded-lg bg-surface border border-border/80">
              <FilterChip active={period === '90d'} onClick={() => setPeriod('90d')} >
                ۹۰ روز اخیر
              </FilterChip>
              <FilterChip active={period === '12m'} onClick={() => setPeriod('12m')} >
                ۱۲ ماهه
              </FilterChip>
              <FilterChip active={period === 'all'} onClick={() => setPeriod('all')} >
                کل سوابق
              </FilterChip>
            </div>
          </div>

          {[4,5].includes(selected) && (
            <InputControl 
              value={customerQuery} 
              onChange={e => setCustomerQuery(e.target.value)} 
              placeholder="جستجوی مشتری..." 
              className="w-48"
            />
          )}
        </div>}

        {selected === 1 && (
          <div className="space-y-4">
            {canSeeLedger && <LedgerBookSourceSelect viewer={state.currentUserId} />}
            {effectivePnlData?.status==='PARTIAL' && <p role="status" className="text-caption text-warning">بخشی از پوشش دوره یا نگاشت کدینگ گواهی نشده است.</p>}
            {pnlReport.unmappedLines > 0 && (
              <div role="alert" className="rounded-xl border border-warning/50 bg-warning-soft/20 p-3 text-xs text-text-main">
                <strong>مغایرت نگاشت مالی:</strong> {formatCount(pnlReport.unmappedLines)} آرتیکل قطعی دفترکل
                به حساب یا سرفصل گزارش متصل نشده است. سود و زیان تا اصلاح کدینگ و دریافت مجدد اسناد، قطعی نیست.
                لطفاً نگاشت حساب‌ها و دوره مالی را در بخش مالی بررسی کنید.
              </div>
            )}
            {effectivePnlData?.status === 'RESTRICTED' && (
              <div role="status" className="rounded-xl border border-border bg-canvas px-3 py-3 text-xs text-text-secondary flex items-center gap-2">
                <ShieldAlert size={15} className="text-warning shrink-0" />
                <span>دسترسی مشاهده اطلاعات دفتر کل و سود و زیان برای نقش فعلی مجاز نیست.</span>
              </div>
            )}
            {effectivePnlData?.status === 'UNAVAILABLE' && (
              <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft/40 px-3 py-3 text-xs text-danger flex flex-wrap items-center justify-between gap-2">
                <span>منبع اطلاعات دفتر کل در دسترس نیست؛ عددی محاسبه نمی‌شود.{effectivePnlData.reason ? ` (${effectivePnlData.reason})` : ''}</span>
                <button type="button" onClick={() => void refreshLedgerPnl()} className="underline font-bold cursor-pointer">
                  تلاش مجدد
                </button>
              </div>
            )}
            {canSeeLedger && ledgerPnlLoading && !ledgerPnlData && (
              <div role="status" className="rounded-xl border border-border bg-canvas px-3 py-3 text-xs text-text-secondary">
                در حال دریافت اسناد دفتر کل از منبع داده…
              </div>
            )}

            <div id="report-kpis" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" data-tour-primary>
              <Metric 
                label="فروش ناخالص دفتری" 
                value={pnlValues.GROSS_SALES == null ? 'نامشخص' : `${formatCurrency(pnlValues.GROSS_SALES)}`} 
                note={previousPnlReport ? `تغییر با دوره قبل: ${pctChange(pnlValues.GROSS_SALES, previousPnlReport.values.GROSS_SALES) || '—'}` : 'خطوط ثبت‌شدهٔ دفترکل'}
              />
              <Metric 
                label="برگشت و تخفیف" 
                value={pnlValues.SALES_RETURNS == null ? 'نامشخص' : `${formatCurrency(pnlValues.SALES_RETURNS)}`} 
                note="کاهنده درآمد فروش"
              />
              <Metric 
                label="فروش خالص دفتری" 
                value={pnlValues.NET_SALES == null ? 'نامشخص' : `${formatCurrency(pnlValues.NET_SALES)}`} 
                note={previousPnlReport ? `تغییر با دوره قبل: ${pctChange(pnlValues.NET_SALES, previousPnlReport.values.NET_SALES) || '—'}` : 'درآمد خالص شناسایی‌شده'}
              />
              <Metric 
                label="بهای تمام‌شده" 
                value={pnlValues.COGS == null ? 'نامشخص' : `${formatCurrency(pnlValues.COGS)}`} 
                note="بهای کالای فروش‌رفته"
              />
              <Metric 
                label="سود ناخالص عملیاتی" 
                value={pnlValues.GROSS_PROFIT == null ? 'نامشخص' : `${formatCurrency(pnlValues.GROSS_PROFIT)}`} 
                note={previousPnlReport ? `تغییر با دوره قبل: ${pctChange(pnlValues.GROSS_PROFIT, previousPnlReport.values.GROSS_PROFIT) || '—'}` : 'فروش خالص − بهای کالا'}
              />
              <Metric 
                label="سود عملیاتی دفتری" 
                value={pnlValues.OPERATING_PROFIT == null ? 'نامشخص' : `${formatCurrency(pnlValues.OPERATING_PROFIT)}`} 
                note={previousPnlReport ? `تغییر با دوره قبل: ${pctChange(pnlValues.OPERATING_PROFIT, previousPnlReport.values.OPERATING_PROFIT) || '—'}` : 'پس از هزینه‌های توزیع و اداری'}
              />
            </div>

            <div className="rounded-xl border border-border bg-canvas/60 p-3.5 space-y-2" data-tour-primary>
              <div className="flex items-center justify-between gap-2">
                <h5 className="text-xs font-bold text-text-main">آبشار سودآوری دفتری</h5>
                <span className="text-micro text-text-secondary">
                  منبع: {effectivePnlData?.source === 'SQLSERVER_BACKEND' ? 'دفتر کل سرور' : 'دفتر کل از مسیر DataProvider'}
                </span>
              </div>
              {profitWaterfallSteps.length ? <ProfitWaterfallChart steps={profitWaterfallSteps} /> : (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs leading-6 text-text-secondary">
                  آبشار قابل محاسبه نیست؛ برای همه اجزای فروش، برگشت، بها و هزینه عملیاتی باید خطوط دفترکل معتبر و نگاشت‌شده وجود داشته باشد.
                </p>
              )}
            </div>

            {canSeeLedger && <FinancialDriversPanel lines={ledgerInputs.rawLines} accounts={ledgerInputs.accounts}
              buckets={DEFAULT_REPORT_BUCKETS} from={cutoff || null} to={asOf}
              trusted={effectivePnlData?.source==='SQLSERVER_BACKEND' && effectivePnlData?.status==='LIVE' && !pnlReport.unmappedLines && !previousPnlReport?.unmappedLines}/>}
            <div id="report-finance-trend" className="rounded-xl border border-border bg-surface p-3.5 space-y-2" data-tour-primary>
              <div className="flex items-center justify-between gap-2">
                <h5 className="text-xs font-bold text-text-main">روند دفتری ۱۲ماهه فروش خالص، هزینه و سود عملیاتی</h5>
                <span className="text-micro text-text-secondary">فقط خطوط ثبت‌شده / تأییدشده / نهایی</span>
              </div>
              {(() => {
                const hasRevenue = monthlyPnlRows.some(row => row.revenue !== null);
                const hasExpenses = monthlyPnlRows.some(row => row.expenses !== null);
                return hasRevenue || hasExpenses ? <FinanceTrendChart rows={monthlyPnlRows} /> : <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-text-secondary">برای نمایش روند، دادهٔ معتبر فروش یا هزینه در این دوره موجود نیست.</p>;
              })()}
            </div>

            <div id="report-profit-heatmap" className="rounded-xl border border-border bg-surface p-3.5 space-y-3" data-tour-primary>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h5 className="text-xs font-bold text-text-main flex items-center gap-1.5">
                    <Layers size={14} className="text-primary" />
                    ماتریس هیت‌مپ سودآوری محصول × زون (Product × Zone Margin Heatmap)
                  </h5>
                  <span className="text-mini text-text-secondary mt-0.5 block">
                    محاسبه حاشیه سود ترکیب سفارشات اقلام در زون‌های توزیع. کلیک روی هر سلول گزارش را فیلتر می‌کند.
                  </span>
                </div>
                <div className="flex items-center gap-2 text-micro">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" /> ۲۵٪+ (پرسود)</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> ۱۰-۲۵٪ (متوسط)</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-600 inline-block" /> زیر ۱۰٪ یا منفی</span>
                </div>
              </div>

              {ZONES.length === 0 ? (
                <p className="text-xs text-text-secondary border border-border rounded-xl p-3">داده‌ای برای نقشهٔ حرارتی نیست: سفارش فروش دارای خط کالا یا زون فعال با انتساب مشتری ثبت نشده است.</p>
              ) : (
              <div className="overflow-x-auto border border-border rounded-xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-canvas border-b border-border text-caption font-bold text-text-secondary">
                    <tr>
                      <th className="p-2.5">نام کالا / گروه</th>
                      {ZONES.map(z => (
                        <th key={z} className="p-2.5 text-center">{z}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {productZoneHeatmap.map(row => (
                      <tr key={row.productId} className="hover:bg-canvas/50">
                        <td className="p-2.5 font-bold text-text-main">{row.productName}</td>
                        {ZONES.map(z => {
                          const cell = row.zoneStats[z];
                          const hasData = cell.revenue > 0;
                          const isHigh = cell.margin >= 25;
                          const isMed = cell.margin >= 10 && cell.margin < 25;
                          const isLow = cell.margin < 10 && cell.margin > 0;

                          return (
                            <td 
                              key={z}
                              onClick={hasData ? () => {
                                setSelectedProduct(row.productName);
                                setSelectedZone(z);
                              } : undefined}
                              className={`p-2 text-center cursor-pointer transition-colors ${
                                !hasData ? 'text-text-muted bg-canvas/30' :
                                isHigh ? 'bg-emerald-500/15 text-emerald-800 font-bold hover:bg-emerald-500/25' :
                                isMed ? 'bg-amber-500/15 text-amber-800 font-bold hover:bg-amber-500/25' :
                                isLow ? 'bg-orange-500/15 text-orange-800 font-bold hover:bg-orange-500/25' :
                                'bg-rose-500/15 text-rose-800 font-bold hover:bg-rose-500/25'
                              }`}
                              title={hasData ? `درآمد: ${formatCurrency(cell.revenue)} | سود: ${formatCurrency(cell.profit)} | مارجین: ${cell.margin.toFixed(1)}٪` : 'بدون سفارش'}
                            >
                              {hasData ? (
                                <div className="space-y-0.5 font-mono">
                                  <div className="text-xs">{cell.margin.toFixed(1)}٪</div>
                                  <div className="text-tiny opacity-75">{formatCurrency(cell.profit)}</div>
                                </div>
                              ) : (
                                <span className="text-micro opacity-40">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-surface p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h5 className="text-xs font-bold text-text-main">پارتو و ترکیب هزینه‌های ثبت‌شده</h5>
                  <span className="text-micro text-text-secondary">کلیک برای فیلتر دسته</span>
                </div>
                {expenseParetoRows.length ? (
                  <>
                    <DonutChart
                      segments={expenseParetoRows.slice(0, 7).map((row, index) => ({ 
                        label: row.key, 
                        value: row.value, 
                        color: `var(--c-chart-${(index % 6) + 1})` 
                      }))}
                      centerLabel="کل هزینه‌ها"
                      centerValue={formatCurrency(expenseParetoRows.reduce((sum, row) => sum + row.value, 0))}
                      size={150}
                      thickness={16}
                      activeSegment={selectedExpenseCategory}
                      onSegmentClick={segment => setSelectedExpenseCategory(current => current === segment.label ? null : segment.label)}
                    />
                    <Bars rows={expenseParetoRows} money onRowClick={row => setSelectedExpenseCategory(current => current === row.key ? null : row.key)} />
                  </>
                ) : <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-text-secondary">هزینه‌ای برای این بازه ثبت نشده است.</p>}
              </div>

              <div id="report-expense-details" className="rounded-xl border border-border bg-surface p-3.5 space-y-2" data-tour-actions>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <h5 className="text-xs font-bold text-text-main">ریز اسناد هزینه {selectedExpenseCategory ? `· ${selectedExpenseCategory}` : ''}</h5>
                    {selectedExpenseCategory && <Button variant="link" size="inline" type="button" onClick={() => setSelectedExpenseCategory(null)} >حذف فیلتر</Button>}
                  </div>
                  <span className="text-micro font-mono text-text-secondary">
                    {filteredExpenseRows.length.toLocaleString('fa-IR')} سند
                  </span>
                </div>

                {filteredExpenseRows.length ? (
                  <div className="max-h-64 overflow-auto divide-y divide-border/70 border border-border rounded-xl">
                    {filteredExpenseRows.slice(0, 30).map((expense: ExpenseLike) => (
                      <div 
                        key={String(expense.id)} 
                        onClick={() => {
                          setSelectedDoc({
                            id: String(expense.id || ''),
                            type: 'INVOICE',
                            number: String(expense.expenseNumber || expense.id || ''),
                            title: String(expense.title || expense.description || ''),
                            date: expense.date,
                            totalAmount: Number(expense.amount) || 0,
                            status: expense.status || 'تأییدشده',
                            notes: `دسته: ${expense.category || expense.categoryName || 'عمومی'}`
                          });
                        }}
                        className="flex items-center justify-between gap-3 p-2.5 text-xs hover:bg-canvas/60 cursor-pointer transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-text-main">
                            {String(expense.title || expense.description || expense.expenseNumber || 'سند هزینه')}
                          </div>
                          <div className="text-micro text-text-secondary mt-0.5">
                            {expense.date || 'بدون تاریخ'} · {String(expense.category || 'عمومی')}
                          </div>
                        </div>
                        <span className="shrink-0 font-mono font-bold text-danger tabular-nums">
                          {formatCurrency(Number(expense.amount) || 0)} ریال
                        </span>
                      </div>
                    ))}
                  </div>
                ) : <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-text-secondary">سندی برای این فیلتر ثبت نشده است.</p>}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-canvas/80 p-3.5 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                <ShieldCheck size={16} />
                <span>بینش‌های راهبردی و اقدامات پیشنهادی مالی</span>
              </div>
              <div className="rounded-xl border border-dashed border-border bg-surface/60 p-4 text-xs text-text-secondary leading-relaxed">
                <p className="font-semibold text-text-main mb-1">بینش‌ها فقط از قواعد و موتورهای واقعی</p>
                <p>
                  در این نسخه هیچ بینش ساختگی یا نمونهٔ ثابت (مانند زون یا کالای خاص) نمایش داده نمی‌شود.
                  پس از اتصال کامل قواعد پایش مالی (F6-08) و کارت‌های بینش (F9-18) از روی دادهٔ دفترکل و فاکتور ERP،
                  ردیف‌های قابل‌اقدام با برچسب وضعیت و دکمهٔ ایجاد تسک در همین بخش ظاهر می‌شوند.
                </p>
                <p className="mt-2 text-micro text-text-secondary">
                  منبع: DataProvider / موتور کیفیت داده و پایش — نه متن ثابت.
                </p>
              </div>
            </div>
          </div>
        )}

        {selected === 2 && (
          <div className="space-y-4">
            <div id="report-kpis" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" data-tour-primary>
              <Metric label="فروش مشاهده‌شده" value={salesKpi.actual===null ? "نامشخص" : formatCurrency(salesKpi.actual)} note="فاکتورهای در دسترس دوره" sparkline={observedSalesTrend} />
              <Metric label="هدف مصوب فروش" value={salesKpi.target===null ? "نامشخص" : formatCurrency(salesKpi.target)} note="بودجه مصوب سازمان" />
              <Metric label="درصد تحقق هدف" value={salesKpi.achievementPct == null ? 'هدف ثبت نشده' : pf(salesKpi.achievementPct / 100)} note="شاخص عملکرد شاخص کلیدی" />
              <Metric label="فاصله تا هدف" value={salesKpi.gap == null ? '—' : `${formatCurrency(salesKpi.gap)}`} note="کسری فروش دوره" />
              <Metric label="پیش‌بینی پایان دوره" value={(() => {
                const totalDays = period === '90d' ? 90 : period === 'all' ? null : 365;
                if (totalDays == null || salesKpi.actual===null) return 'نامشخص';
                const dates = invoices.map(i => String(i.date || '').slice(0, 10)).filter(d => d.length === 10).sort();
                let elapsed: number | null = null;
                if (dates.length >= 2) {
                  const first = Date.parse(dates[0] + 'T00:00:00Z');
                  const last = Date.parse(dates[dates.length - 1] + 'T00:00:00Z');
                  if (Number.isFinite(first) && Number.isFinite(last) && last >= first) elapsed = Math.max(1, Math.round((last - first) / 86400000) + 1);
                }
                if (elapsed == null && cutoff) {
                  const c = Date.parse(cutoff + 'T00:00:00Z');
                  const a = Date.parse(asOf + 'T00:00:00Z');
                  if (Number.isFinite(c) && Number.isFinite(a) && a >= c) elapsed = Math.max(1, Math.round((a - c) / 86400000) + 1);
                }
                if (elapsed == null || elapsed <= 0) return 'نامشخص';
                const proj = projectPeriodEnd(salesKpi.actual, elapsed, totalDays);
                return proj == null ? 'نامشخص' : formatCurrency(proj);
              })()} note="برآورد خطی از داده واقعی دوره" />
              <Metric label="میانگین ارزش فاکتور" value={salesKpi.actual===null || !invoices.length ? "نامشخص" : formatCurrency(Math.round(salesKpi.actual / invoices.length))} note={`${nf(invoices.length)} فاکتور مشاهده‌شده`} />
            </div>

            <div className="p-3.5 bg-canvas rounded-xl border border-border space-y-2">
              <div className="flex justify-between text-xs font-bold">
                <span>درصد پیشرفت در تحقق هدف فروش سازمانی:</span>
                <span className="font-mono">{salesKpi.achievementPct == null ? '—' : `${Math.min(100, Math.round(salesKpi.achievementPct))}٪`}</span>
              </div>
              <div className="w-full h-3 rounded-full bg-border overflow-hidden flex">
                <div 
                  className="h-full bg-primary rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, salesKpi.achievementPct ?? 0)}%` }} 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
                <h5 className="text-xs font-bold text-text-main">فروش خالص فروشندگان — تطبیق‌شده با دفتر</h5>
                {sellerNetSales.status === 'AVAILABLE'
                  ? sellerNetSales.rows.some(row => row.value < 0)
                    ? <div className="space-y-2">
                        <p className="text-xs text-text-secondary">برگشتیِ منتسب می‌تواند فروش خالص یک فروشنده را منفی کند؛ تمام سطرها، از جمله ارقام منفی، نمایش داده می‌شوند.</p>
                        {sellerNetSales.rows.map(row => (
                          <div key={row.key} className="flex justify-between gap-3 rounded-lg border border-border p-2 text-xs">
                            <span>{row.key === 'UNASSIGNED' ? 'فروشنده نامشخص' :
                              ((state.users || []).find(user => user.id === row.key)?.name || row.key)}</span>
                            <strong className={row.value < 0 ? 'text-danger' : 'text-text-main'}>{formatCurrency(row.value)} ریال</strong>
                          </div>
                        ))}
                      </div>
                    : <Bars money rows={sellerNetSales.rows.map(row => ({
                        key: row.key === 'UNASSIGNED' ? 'فروشنده نامشخص' :
                          ((state.users || []).find(user => user.id === row.key)?.name || row.key),
                        value: row.value
                      }))}/>
                  : <p role="status" className="text-xs leading-6 text-text-secondary">
                      سهم فروشنده نامشخص است: {sellerNetSales.reason}
                    </p>}
              </div>

              <div className="rounded-xl border border-warning/25 bg-warning-soft/50 p-3.5 space-y-1">
                <h5 className="text-xs font-bold text-text-main">آبشار رشد فروش</h5>
                <p className="text-caption leading-6 text-text-secondary">برای تفکیک اثر رشد و افت گروه کالا، فروش دوره قبل و طبقه‌بندی تغییرات معتبر لازم است. تا زمان تأمین این داده‌ها، آبشار عددی ساخته نمی‌شود.</p>
              </div>
            </div>
          </div>
        )}

        {selected === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="تعداد اقلام کاتالوگ" value={state.externalProducts?.length || 0} note="کالاهای تعریف‌شده در سامانه مالی" />
              <Metric label="بیشترین سهم پیش‌فاکتور" value={productShareRows[0]?.key || '—'} note="بر اساس اقلام پیش‌فاکتور؛ نه فروش قطعی ERP" />
              <Metric label="پوشش بهای اقلام پیش‌فاکتور" value={(() => { const lines = (state.quotes || []).flatMap(q => q.lines || []).filter(l => Number(l.quantity) > 0); const complete = lines.filter(l => Number.isFinite(Number(l.costPrice)) && Number(l.costPrice) > 0).length; return lines.length ? pf(complete / lines.length) : 'نامشخص'; })()} note="اقلام پیش‌فاکتور؛ نه پوشش بهای فروش قطعی" />
              <Metric label="میانگین حاشیه سود سبد" value="نامشخص" note="برای محاسبه، بهای معتبر اقلام لازم است" />
            </div>

            <div className="rounded-xl border border-warning/25 bg-warning-soft/50 p-3.5 text-xs leading-6 text-text-secondary">
              <strong className="block text-text-main">ماتریس حاشیه سود محصول</strong>
              این ماتریس تا زمانی که بهای تمام‌شده معتبر و فروش خالص هر محصول در یک بازه یکسان موجود نباشد، طبقه‌بندی سودآوری تولید نمی‌کند. تعداد اقلام دارای بهای معتبر در شاخص کلیدی پوشش بهای تمام‌شده نمایش داده شده است.
            </div>

            <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
              <h5 className="text-xs font-bold text-text-main">رتبه‌بندی و سهم فروش اقلام در پیش‌فاکتورها</h5>
              <Bars money rows={productShareRows.map(p => ({ key: p.key, value: p.value }))} />
            </div>
          </div>
        )}

        {selected === 4 && (
          <div className="space-y-4">
            {canReport('quotes','VIEW') && <PurchaseCycleFollowUp viewer={state.currentUserId || ''} accounts={visibleAccounts} canCreate={canReport('tasks','CREATE')} />}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label={lifecycleFilter ? `مشتریان ${lifecycleLabel(lifecycleFilter)}` : 'کل مشتریان خریدار'} value={nf(lifecycleCustomerRows.length)} />
              <Metric label="ارزش فروش فیلتر" value={`${formatCurrency(lifecycleCustomerRows.reduce((sum, r) => sum + r.amount, 0))} ریال`} />
              <Metric label="تعداد کل سفارشات" value={nf(lifecycleCustomerRows.reduce((sum, r) => sum + r.count, 0))} />
              <Metric label="میانگین خرید هر مشتری" value={lifecycleCustomerRows.length ? `${formatCurrency(Math.round(lifecycleCustomerRows.reduce((sum, r) => sum + r.amount, 0) / lifecycleCustomerRows.length))} ریال` : '—'} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
                <h5 className="text-xs font-bold text-text-main">دونات چرخه عمر مشتری (کلیک برای فیلتر)</h5>
                <DonutChart 
                  size={140} 
                  thickness={14} 
                  centerValue={Object.values(lifecycle.counts).reduce((s, v) => s + v, 0)} 
                  centerLabel="مشتری" 
                  activeSegment={lifecycleFilter ? lifecycleLabel(lifecycleFilter) : null}
                  onSegmentClick={segment => { 
                    const key = Object.keys(lifecycle.counts).find(item => lifecycleLabel(item) === segment.label); 
                    setLifecycleFilter(current => current === key ? null : (key || null)); 
                  }}
                  segments={Object.entries(lifecycle.counts).map(([key, value], idx) => ({
                    label: lifecycleLabel(key), value, color: ['var(--c-primary)','var(--c-copper)','var(--c-danger)','var(--c-info)','var(--c-warning)','var(--color-chart-2)'][idx % 6]
                  }))} 
                />
              </div>

              <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
                <h5 className="text-xs font-bold text-text-main">کوهورت ماندگاری مشتریان</h5>
                <div className="max-h-40 overflow-auto text-micro">
                  <table className="w-full text-center border-collapse">
                    <thead>
                      <tr className="border-b border-border text-text-secondary">
                        <th className="p-1">دوره جذب</th>
                        <th className="p-1">ماه ۰</th>
                        <th className="p-1">ماه ۱</th>
                        <th className="p-1">ماه ۲</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lifecycleFilteredCohorts.slice(0, 5).map(c => (
                        <tr key={c.cohort} className="border-b border-border/40">
                          <td className="p-1 font-bold">{c.cohort}</td>
                          <td className="p-1 text-emerald-700 bg-emerald-50 font-bold">۱۰۰٪</td>
                          <td className="p-1">{pf(c.retention[1] || 0)}</td>
                          <td className="p-1">{pf(c.retention[2] || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {lifecycleFilter && (
              <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h5 className="text-xs font-bold text-text-main">مشتریان منطبق با فیلتر: {lifecycleLabel(lifecycleFilter)}</h5>
                  <Button variant="link" size="inline" type="button" onClick={() => setLifecycleFilter(null)} >حذف فیلتر</Button>
                </div>
                <div className="max-h-48 overflow-auto divide-y divide-border/60">
                  {lifecycleCustomerRows.slice(0, 20).map(row => <div key={row.customerId} className="flex items-center justify-between gap-3 py-2 text-xs"><span className="truncate font-semibold text-text-main">{row.name}</span><span className="shrink-0 font-mono text-text-secondary">{row.count.toLocaleString('fa-IR')} خرید · {formatCurrency(row.amount)} ریال</span></div>)}
                  {lifecycleCustomerRows.length === 0 && <p className="py-4 text-center text-xs text-text-secondary">مشتری منطبق با این فیلتر پیدا نشد.</p>}
                </div>
              </div>
            )}

            <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
              <h5 className="text-xs font-bold text-text-main">تحلیل تازگی، تکرار و ارزش ریالی مشتریان</h5>
              <div className="max-h-48 overflow-auto border border-border rounded-xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-canvas border-b border-border text-caption font-bold text-text-secondary">
                    <tr>
                      <th className="p-2">نام مشتری</th>
                      <th className="p-2 text-center">امتیاز R</th>
                      <th className="p-2 text-center">امتیاز F</th>
                      <th className="p-2 text-center">امتیاز M</th>
                      <th className="p-2 text-center">اقدام</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredRfmRows.slice(0, 8).map(row => (
                      <tr key={row.customerId} className="hover:bg-canvas/50">
                        <td className="p-2 font-bold text-text-main">{accountMap.get(row.customerId)?.name || row.customerId}</td>
                        <td className="p-2 text-center font-mono">{row.rScore} / ۵</td>
                        <td className="p-2 text-center font-mono">{row.fScore} / ۵</td>
                        <td className="p-2 text-center font-mono">{row.mScore} / ۵</td>
                        <td className="p-2 text-center">
                          <Button variant="soft" size="xs" type="button" onClick={() => openCustomerDrilldown(row.customerId, 'تحلیل تازگی، تکرار و ارزش')} >
                            ریز اسناد
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {selected === 5 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="سهم ۲۰٪ مشتریان برتر" value={pf(topShare)} note="تمرکز پارتو ۸۰/۲۰" />
              <Metric label="تعداد کل خریداران" value={nf(paretoRows.rows.length)} note="مشتریان دارای فاکتور" />
              <Metric label="کل فروش مبنا" value={formatCurrency(paretoRows.total)} note="ریال" />
              <Metric label="شاخص تمرکز" value={customerHhi == null ? 'نامشخص' : nf(customerHhi)} note="محاسبه بر اساس سهم واقعی فروش مشتریان" />
            </div>

            <div className="rounded-xl border border-warning/25 bg-warning-soft/50 p-3.5 text-xs leading-6 text-text-secondary">
              <strong className="block text-text-main">چهارگانه فرصت رشد مشتریان</strong>
              تا زمانی که فروش دو دوره قابل مقایسه برای هر مشتری موجود نباشد، شاخص رشد نامشخص و مشتریان در چهارگانه رشد «طبقه‌بندی‌نشده» باقی می‌مانند.
              {/* growth:null — بدون دوره مقایسه رشد طبقه‌بندی نمی‌شود */}
            </div>

            <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
              <h5 className="text-xs font-bold text-text-main">منحنی تجمعی پارتو و سهم مشتریان</h5>
              <Bars 
                money 
                rows={filteredParetoRows.map(r => ({ key: accountMap.get(r.key)?.name || r.key, value: r.value }))} 
                onRowClick={r => {
                  const found = filteredParetoRows.find(x => (accountMap.get(x.key)?.name || x.key) === r.key);
                  if (found) openCustomerDrilldown(found.key, 'تحلیل تمرکز پارتو');
                }}
              />
            </div>
          </div>
        )}

        {selected === 6 && (
          <div className="space-y-4">
            <div id="report-kpis" className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-tour-primary>
              <Metric label="ویزیت‌های برنامه‌ریزی‌شده" value={nf(visits.planned)} note="کل برنامه‌ها" />
              <Metric label="مراجعات انجام‌شده" value={nf(visits.actual)} note="ثبت ورود در محل" />
              <Metric label="ویزیت‌های با سفارش" value={nf(visits.withOrder)} note="موفقیت‌آمیز" />
              <Metric label="سهم موقعیت مکانی معتبر" value={pf(visits.gpsVerifiedShare)} note="تأییدشده با موقعیت‌یاب" />
            </div>

            <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
              <h5 className="text-xs font-bold text-text-main">قیف فرآیند ویزیت تا سفارش فروش</h5>
              <FunnelChart 
                stages={[
                  { label: 'برنامه‌ریزی ویزیت', value: visits.planned },
                  { label: 'مراجعه میدانی در محل', value: visits.actual },
                  { label: 'مذاکره و ویزیت موفق', value: visits.successful },
                  { label: 'صدور سفارش فروش', value: visits.withOrder },
                  { label: 'فاکتور قطعی رسمی', value: invoices.length }
                ]} 
              />
            </div>

            <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
              <h5 className="text-xs font-bold text-text-main">رتبه‌بندی عملکرد کارشناسان فروش میدانی</h5>
              <div className="overflow-x-auto border border-border rounded-xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-canvas border-b border-border text-caption font-bold text-text-secondary">
                    <tr>
                      <th className="p-2">نام کارشناس</th>
                      <th className="p-2 text-center">مراجعات انجام‌شده</th>
                      <th className="p-2 text-center">تعداد سفارشات</th>
                      <th className="p-2 text-center">نرخ تبدیل</th>
                      <th className="p-2 text-center">تأیید موقعیت‌یاب</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {visitPerformanceRows.slice(0, 10).map(({ user, metrics }: { user: UserLike; metrics: ReturnType<typeof visitFunnel> }) => (
                      <tr key={user.id} className="hover:bg-canvas/50">
                        <td className="p-2 font-bold text-text-main">{user.name}</td>
                        <td className="p-2 text-center font-mono">{nf(metrics.actual)}</td>
                        <td className="p-2 text-center font-mono">{nf(metrics.withOrder)}</td>
                        <td className="p-2 text-center font-mono text-text-main">{pf(metrics.visitToOrderRate)}</td>
                        <td className="p-2 text-center font-mono text-primary">{pf(metrics.gpsVerifiedShare)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {selected === 7 && (
          <div className="space-y-4">
            {canSeeLedger && availableLedgerBalances?.status === 'UNAVAILABLE' && (
              <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft/40 px-3 py-2.5 text-xs text-danger flex flex-wrap items-center justify-between gap-2">
                <span>منبع مانده دفتری در دسترس نیست؛ ارقام مطالبات نامشخص است.{availableLedgerBalances.reason ? ` (${availableLedgerBalances.reason})` : ''}</span>
                <button type="button" onClick={() => void refreshLedgerBalances()} className="underline font-bold cursor-pointer">
                  تلاش مجدد
                </button>
              </div>
            )}

            <div id="report-kpis" className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-tour-primary>
              <Metric label="کل مطالبات (مانده دفتری)" value={ledgerReceivables.kind === 'OK' ? `${formatCurrency(ledgerReceivables.debtorTotal)} ریال` : ledgerReceivables.kind === 'LOADING' ? '…' : 'نامشخص'} note="Σبدهکار − Σبستانکار تفصیلی×معین؛ بستانکارها جدا" />
              <Metric label="مطالبات سررسیدگذشته (تخمینی)" value={hasAgingEstimate ? `${formatCurrency(agingEstimate.items.filter(r => r.days > 0).reduce((sum, r) => sum + r.amount, 0))} ریال` : 'نامشخص'} note="از آخرین فاکتور به عقب؛ بدون تخصیص CRM" />
              <Metric label="مشتریان بدهکار" value={ledgerReceivables.kind === 'OK' ? nf(ledgerReceivables.debtorCount) : 'نامشخص'} note="بر پایهٔ مانده دفتری" />
              <Metric
                label="بررسی تخصیص دریافت‌ها"
                value={receivables
                  ? (receivables.issues.length ? `${nf(receivables.issues.length)} مورد قابل‌بررسی` : 'نیازمند بررسی')
                  : canReviewAllocations && allocationsLoading ? '…' : 'نامشخص'}
                note={receivables?.blockedReason || 'تخصیص CRM مبنای ماندهٔ دفتری نیست.'}
              />
            </div>
            {canReviewAllocations && allocationError && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-xs text-danger">
                <span>دریافت دادهٔ تخصیص ناموفق بود. {allocationError.message}</span>
                <button type="button" onClick={() => void refreshAllocations()} className="underline font-bold cursor-pointer">
                  تلاش مجدد
                </button>
              </div>
            )}

            <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
              <h5 className="text-xs font-bold text-text-main">توزیع سنی مطالبات تجاری <span className="text-micro text-text-secondary font-normal">{hasAgingEstimate ? '(تخمینی)' : '(نامشخص: مانده یا فاکتور موجود نیست)'}</span></h5>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                {aging.buckets.map(b => (
                  <div key={b.key} className="p-2.5 rounded-xl border border-border bg-canvas/70">
                    <span className="text-micro text-text-secondary block font-bold">{b.label}</span>
                    <strong className="text-xs font-mono font-bold text-text-main mt-1 block">{formatCurrency(b.amount)}</strong>
                    <span className="text-tiny text-text-secondary mt-0.5 block">{b.invoiceCount} فاکتور</span>
                  </div>
                ))}
              </div>
            </div>

            {canSeeLedger && (
              <ReceivablesLifoPanel
                ledgerBalances={availableLedgerBalances}
                accounts={visibleAccounts}
                invoices={reportInvoices}
                allowedDays={((state.settings as Record<string, any> | undefined)?.orgConfig || {}).allowedCreditDays}
                sellerName={key => (state.users || []).find((u: UserLike) => u.id === key)?.name || ''}
                onOpenCustomer={id => openCustomerDrilldown(id, 'فاکتورهای خارج از مهلت')}
              />
            )}

            <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
              <h5 className="text-xs font-bold text-text-main">فهرست مشتریان بر اساس مانده و سن بدهی و اولویت پیگیری اعتباری</h5>
              <div className="space-y-1.5">
                {[...agingEstimate.customers].sort((x, y) => y.balance - x.balance).slice(0, 5).map(p => (
                  <div key={p.id} className="p-2.5 rounded-xl border border-border bg-canvas flex justify-between items-center text-xs">
                    <div>
                      <strong className="text-text-main">{accountMap.get(p.id)?.name || p.name || p.id}</strong>
                      <span className="text-micro text-text-secondary block mt-0.5">
                        حداکثر تأخیر (تخمینی): {p.covered.reduce((m, c) => Math.max(m, c.days ?? 0), 0)} روز · {p.covered.length} فاکتور پوشش‌یافته{p.unattributed > 0 ? ' · بخشی بدون انتساب' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-danger">{formatCurrency(p.balance)} ریال</span>
                      <Button variant="primary" size="xs" type="button" onClick={() => openCustomerDrilldown(p.id, 'پیگیری مطالبات')} >
                        اقدام وصول
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {selected === 8 && <CashFlowPanel />}

        {selected === 9 && (
          <div className="space-y-4">
            <div id="report-kpis" className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-tour-primary>
              <Metric label="کل اسناد مذاکره" value={nf(negotiationStats.funnel.negotiable)} note="پیش‌نویس‌های فروش" />
              <Metric label="پیشنهادهای مصوب" value={nf(negotiationStats.funnel.proposed)} note="ارائه‌شده به مشتری" />
              <Metric label="نرخ برد مذاکره" value={pf(negotiationStats.successRate)} note="تبدیل به قرارداد" />
              <Metric label="مبلغ اعمال‌شده در سامانه مالی" value={`${formatCurrency(negotiationStats.erpAppliedAmount || 0)} ریال`} note="فاکتورهای قطعی" />
            </div>

            <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
              <h5 className="text-xs font-bold text-text-main">قیف فرآیند مذاکره و تایید قیمت</h5>
              <FunnelChart 
                stages={[
                  { label: 'سفارشات ورودی', value: negotiationStats.funnel.negotiable },
                  { label: 'پیشنهاد قیمت با مارجین مصوب', value: negotiationStats.funnel.proposed },
                  { label: 'تأییدیه مدیریت بازرگانی', value: negotiationStats.funnel.approved },
                  { label: 'پذیرش نهایی و اعمال در سامانه مالی', value: negotiationStats.funnel.appliedInErp }
                ]} 
              />
            </div>

            <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
              <h5 className="text-xs font-bold text-text-main">علل اصلی عدم موفقیت یا انصراف در مذاکرات</h5>
              {negotiationLossReasons.length ? <Bars rows={negotiationLossReasons} /> : <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-text-secondary">علت مستندی برای مذاکرات ناموفق ثبت نشده است.</p>}
            </div>
          </div>
        )}

        {selected === 10 && (
          <div className="space-y-4">
            <div id="report-kpis" className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-tour-primary>
              <Metric label="سفارشات آماده ارسال" value={nf(deliveries.funnel.ready)} note="حواله‌های انبار" />
              <Metric label="بارگیری ناوگان" value={nf(deliveries.funnel.loaded)} note="در حال توزیع" />
              <Metric label="تحویل کامل و موفق" value={nf(deliveries.funnel.deliveredFull)} note="وصول رسید موزع" />
              <Metric label="نرخ تحویل به‌موقع" value={deliveries.onTimeRate == null ? 'نامشخص' : pf(deliveries.onTimeRate)} note={`${nf(deliveries.onTimeBasis)} تحویل دارای موعد و زمان تحویل معتبر`} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
                <h5 className="text-xs font-bold text-text-main">قیف مراحل توزیع و تحویل کالا</h5>
                <FunnelChart 
                  stages={[
                    { label: 'صدور حواله انبار', value: deliveries.funnel.ready },
                    { label: 'بارگیری در خودروهای پخش', value: deliveries.funnel.loaded },
                    { label: 'ارسال و حمل در مسیر', value: deliveries.funnel.shipped },
                    { label: 'تحویل نهایی در فروشگاه', value: deliveries.funnel.deliveredFull }
                  ]}
                />
              </div>

              <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
                <h5 className="text-xs font-bold text-text-main">پارتو استثناها و علل تأخیر ناوگان</h5>
                {deliveries.exceptions.rows.length ? <Bars rows={deliveries.exceptions.rows} /> : <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-text-secondary">علت استثنای تحویل در رویدادهای ثبت‌شده موجود نیست.</p>}
              </div>
            </div>
          </div>
        )}

        {selected === 11 && (
          <div className="space-y-3">
            <p className="text-caption text-text-secondary">دلایل ثبت‌شده و شواهد مالی را به تفکیک پرونده بررسی کنید. نرخ مرجوعی و اثر آن بر سود به پوشش قابل مقایسهٔ فروش و برگشت نیاز دارد.</p>
            {canSeeLedger ? <JournalCoveragePanel key={`${state.currentUserId}:${cutoff}:${asOf}`} focusReturns
              period={{from:cutoff ?? new Date(Date.parse(asOf)-365*86400000).toISOString().slice(0,10),to:asOf,dimension:'category'}}
              canFollowUp={canReport('finance','EDIT') && canReport('tasks','CREATE')} />
              : <p className="text-caption">مشاهدهٔ ریز ارتباط با دفتر کل به دسترسی مالی نیاز دارد.</p>}
            {cutoff===null && <p className="text-caption text-text-secondary">ریز اسناد این نما به ۳۶۶ روز اخیر محدود است.</p>}
          </div>
        )}

      </Card>

      {drilldown && (
        <DrilldownSheet
          isOpen={drilldown.isOpen}
          onClose={() => setDrilldown(null)}
          title={drilldown.title}
          subtitle={drilldown.subtitle}
          metricLabel={drilldown.metricLabel}
          metricValue={drilldown.metricValue}
          rows={drilldown.rows}
          customerName={drilldown.customerName}
          onOpenCustomer={drilldown.customerId ? () => navigate(`/accounts/${drilldown.customerId}`) : undefined}
          onSelectRow={(row) => {
            if (row.rawDoc) setSelectedDoc(row.rawDoc);
          }}
        />
      )}

      {selectedDoc && (
        <DocumentDetailModal
          isOpen={Boolean(selectedDoc)}
          onClose={() => setSelectedDoc(null)}
          document={selectedDoc}
        />
      )}
    </section>
  );
}
