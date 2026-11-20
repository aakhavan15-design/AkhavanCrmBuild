import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Package, MapPin, Wallet, ShoppingCart, Activity,
  FileText, Target, Truck, RotateCcw, ClipboardList, Banknote, ArrowRight, Flame
} from 'lucide-react';
import type { Account, AppState, Invoice, NavigationTab, Payment } from '../types';
import { cn } from '../lib/utils';
import { formatMoneyCompact, formatCount, formatPercent } from '../lib/format';
import { ExportMenuButton } from './ui/ExportMenuButton';
import { KpiCard } from './charts/KpiCard';
import { ChartCard } from './charts/ChartCard';
import { SectionHeader } from './charts/ReportPrimitives';
import { ProgressRows } from './charts/ProgressRows';
import { BarChart } from './charts/BarChart';
import { NeoLineChart } from './charts/NeoLineChart';
import { NeoDonutChart } from './charts/NeoDonutChart';
import { NeoGaugeChart } from './charts/NeoGaugeChart';
import { NeoHeatmapChart } from './charts/NeoHeatmapChart';
import { useTabParam } from '../hooks/useTabParam';
import { Button, Select } from './ui';
import { isReceivableInvoice } from '../services/agingBuckets';
import { useDataQuery } from '../hooks/useDataProvider';
import { useDataSyncStatus } from '../services/dataSyncController';
import { isDemoContext } from '../lib/dataTrust';
import { reconcileReceivables, resolveCustomerBalanceView } from '../lib/receivableReconciliation';
import { ReceivablesLifoPanel } from './reports/ReceivablesLifoPanel';
import { ProfitLossWidget } from './finance/ProfitLossWidget';
import { CashFlowPanel } from './finance/CashFlowPanel';

interface ReportsHubProps {
  state: AppState;
  updateState: (updater: (draft: AppState) => AppState | void) => void;
  setActiveTab: (tab: NavigationTab) => void;
  canViewFinance: boolean;
  canViewPayments: boolean;
  receivableAccounts: Account[];
}

type DomainId = 'sales' | 'distribution' | 'team' | 'inventory' | 'finance' | 'receivables';
type ReportInvoice = Invoice & { createdAt?: string; ownerId?: string; createdBy?: string };
type ReportPayment = Payment & { createdAt?: string; isDeleted?: boolean };

const REPORT_DEFS: {
  id: string;
  num: number;
  label: string;
  domain: DomainId;
  chart: 'line' | 'bar' | 'donut' | 'gauge' | 'progress' | 'leaderboard' | 'list' | 'heatmap' | 'ledger';
  heatmap?: boolean;
  icon: React.ReactNode;
}[] = [
  { id: 'sales-perf', num: 1, label: 'عملکرد فروش و اهداف', domain: 'sales', chart: 'gauge', heatmap: true, icon: <Target size={22} /> },
  { id: 'finance-pl', num: 2, label: 'گزارش‌های مالی', domain: 'finance', chart: 'ledger', icon: <Wallet size={22} /> },
  { id: 'catalog', num: 3, label: 'تحلیل کاتالوگ و پیشنهادها', domain: 'inventory', chart: 'bar', icon: <Package size={22} /> },
  { id: 'rep-perf', num: 4, label: 'عملکرد فروشندگان', domain: 'team', chart: 'leaderboard', heatmap: true, icon: <Users size={22} /> },
  { id: 'proposals', num: 5, label: 'پیشنهادهای تجاری', domain: 'inventory', chart: 'list', icon: <FileText size={22} /> },
  { id: 'visit', num: 6, label: 'ویزیت و پخش', domain: 'team', chart: 'bar', heatmap: true, icon: <MapPin size={22} /> },
  { id: 'routes', num: 7, label: 'عملکرد مسیرها و توزیع', domain: 'distribution', chart: 'bar', heatmap: true, icon: <Truck size={22} /> },
  { id: 'returns', num: 8, label: 'مرجوعی و نشت فروش', domain: 'distribution', chart: 'progress', heatmap: true, icon: <RotateCcw size={22} /> },
  { id: 'team-activity', num: 9, label: 'فعالیت تیم فروش', domain: 'team', chart: 'list', heatmap: true, icon: <Activity size={22} /> },
  { id: 'delivery', num: 10, label: 'کیفیت تحویل', domain: 'distribution', chart: 'gauge', heatmap: true, icon: <ClipboardList size={22} /> },
  { id: 'discrepancy', num: 11, label: 'مغایرت‌ها و استثناها', domain: 'distribution', chart: 'list', icon: <Activity size={22} /> },
];

const DOMAINS: { id: DomainId; label: string; icon: React.ReactNode }[] = [
  { id: 'sales', label: 'فروش و درآمد', icon: <ShoppingCart size={18} /> },
  { id: 'distribution', label: 'مسیر و توزیع', icon: <Truck size={18} /> },
  { id: 'team', label: 'تیم فروش', icon: <Users size={18} /> },
  { id: 'inventory', label: 'کاتالوگ و موجودی', icon: <Package size={18} /> },
  { id: 'finance', label: 'مالی', icon: <Wallet size={18} /> },
  { id: 'receivables', label: 'مطالبات', icon: <Banknote size={18} /> },
];

const PERIOD_OPTIONS = [
  { value: '7d', label: '۷ روز اخیر', days: 7 },
  { value: '30d', label: '۳۰ روز اخیر', days: 30 },
  { value: '90d', label: '۹۰ روز اخیر', days: 90 },
  { value: '12m', label: '۱۲ ماهه', days: 365 },
  { value: 'all', label: 'کل سوابق', days: null },
];

export function ReportsHub({ state, canViewFinance, canViewPayments, receivableAccounts }: ReportsHubProps) {
  const [domain, setDomain] = useTabParam(
    ['sales', 'distribution', 'team', 'inventory', 'finance', 'receivables'] as const,
    'sales',
    'tab',
    true
  );
  const [period, setPeriod] = useState('30d');
  const [activeReport, setActiveReport] = useState<string | null>(null);

  const domainMeta = DOMAINS.find((d) => d.id === domain) || DOMAINS[0];
  const domainReports = REPORT_DEFS.filter((r) => r.domain === domain);
  const isLedgerDomain = domain === 'finance' || domain === 'receivables';

  const now = useMemo(() => new Date(), []);
  const periodMeta = useMemo(() => PERIOD_OPTIONS.find((p) => p.value === period) || PERIOD_OPTIONS[1], [period]);

  const cutoffIso = useMemo(() => {
    if (periodMeta.days === null) return null;
    return new Date(now.getTime() - periodMeta.days * 86400000).toISOString().slice(0, 10);
  }, [periodMeta, now]);

  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'short' }),
    []
  );

  const metrics = useMemo(() => {
    const rawInvoices: ReportInvoice[] = (state.invoices || []).filter(inv => isReceivableInvoice(inv));
    const rawPayments = ((state.payments || []) as ReportPayment[]).filter(p => !p.deletedAt && !p.isDeleted);
    const rawQuotes = (state.quotes || []).filter(q => !q.deletedAt && !(q as Record<string, unknown>).isDeleted);
    const users = (state.users || []).filter(u => !u.deletedAt && !(u as Record<string, unknown>).isDeleted && (u.isActive ?? u.active) !== false);
    const rawTasks = (state.tasks || []).filter(t => !t.deletedAt && !(t as Record<string, unknown>).isDeleted);
    const rawActivities = (state.activities || []).filter(a => !a.deletedAt && !(a as Record<string, unknown>).isDeleted);

    const matchDate = (isoStr?: string) => {
      if (!isoStr) return false;
      const day = String(isoStr).slice(0, 10);
      return !cutoffIso || day >= cutoffIso;
    };

    const invoices = rawInvoices.filter(i => matchDate(i.date || i.createdAt));
    const payments = rawPayments.filter(p => matchDate(p.date || p.createdAt));
    const quotes = rawQuotes.filter(q => matchDate(q.createdAt));
    const tasks = rawTasks.filter(t => matchDate(String(t.createdAt || t.dueDate || '')));
    const activities = rawActivities.filter(a => matchDate(a.dateTime));

    const totalSales = invoices.reduce((s, i) => s + (Number(i.totalAmount) || 0), 0);
    const totalPaid = payments.filter(p => p.status === 'CLEARED').reduce((s, p) => s + (Number(p.amount) || 0), 0);

    const fromMonth = cutoffIso ? cutoffIso.slice(0, 7) : '0000-00';
    const toMonth = now.toISOString().slice(0, 7);
    const target = (state.salesTargets || [])
      .filter(t => t.periodMonth >= fromMonth && t.periodMonth <= toMonth)
      .reduce((sum, t) => sum + Math.max(0, Number(t.revenueTargetRials) || 0), 0);
    const achievement = target > 0 ? Math.min(100, Math.round((totalSales / target) * 100)) : 0;

    const countBuckets = period === '12m' ? 12 : 6;
    const buckets = Array.from({ length: countBuckets }, (_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (countBuckets - 1 - idx), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return { key, label: monthFormatter.format(d), total: 0 };
    });
    const byKey = new Map(buckets.map(b => [b.key, b]));
    invoices.forEach(inv => {
      const key = String(inv.date || '').slice(0, 7);
      const bucket = byKey.get(key);
      const amount = Number(inv.totalAmount) || 0;
      if (bucket && Number.isFinite(amount) && amount > 0) bucket.total += amount;
    });

    const payByMethod = new Map<string, number>();
    payments.forEach(p => {
      const m = p.method === 'TRANSFER' ? 'حواله بانکی' : p.method === 'CHEQUE' ? 'چک صیادی' : p.method === 'CASH' ? 'نقدی' : (p.method || 'سایر');
      payByMethod.set(m, (payByMethod.get(m) || 0) + (Number(p.amount) || 0));
    });
    const paySegments = Array.from(payByMethod.entries()).map(([name, value]) => ({ name, value }));

    const byOwner = new Map<string, number>();
    invoices.forEach(inv => {
      const oid = String(inv.ownerId || inv.createdBy || 'UNASSIGNED');
      byOwner.set(oid, (byOwner.get(oid) || 0) + (Number(inv.totalAmount) || 0));
    });
    const leaderboard = Array.from(byOwner.entries())
      .map(([id, amount]) => {
        const u = users.find(x => x.id === id);
        return { id, name: u?.name || u?.username || (id === 'UNASSIGNED' ? 'بدون فروشنده' : id), amount };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

    const heatX = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
    const topSellers = leaderboard.slice(0, 5);
    const heatY = topSellers.map(r => r.name);
    const heatCells: [number, number, number][] = [];
    if (topSellers.length > 0) {
      invoices.forEach(inv => {
        const d = inv.date || inv.createdAt;
        if (!d) return;
        const dt = new Date(d);
        if (Number.isNaN(dt.getTime())) return;
        const dayIdx = (dt.getDay() + 1) % 7;
        const oid = String(inv.ownerId || inv.createdBy || 'UNASSIGNED');
        const yi = topSellers.findIndex(t => t.id === oid);
        if (yi < 0) return;
        const amt = Number(inv.totalAmount) || 0;
        const existing = heatCells.find(c => c[0] === dayIdx && c[1] === yi);
        if (existing) existing[2] += amt;
        else heatCells.push([dayIdx, yi, amt]);
      });
    }

    return {
      totalSales,
      totalPaid,
      invoiceCount: invoices.length,
      quoteCount: quotes.length,
      userCount: users.length,
      taskCount: tasks.length,
      activityCount: activities.length,
      target,
      achievement,
      monthlyLabels: buckets.map(b => b.label),
      monthlyValues: buckets.map(b => b.total),
      paySegments,
      leaderboard,
      hasInvoiceData: invoices.length > 0,
      hasPaymentData: payments.length > 0,
      heatX,
      heatY,
      heatCells,
    };
  }, [state, cutoffIso, now, monthFormatter, period]);

  const periodLabel = periodMeta.label;
  const activeDef = REPORT_DEFS.find((r) => r.id === activeReport);

  const exportCurrentReport = (fileFormat: 'csv' | 'excel') => {
    let content = 'عنوان,مقدار\n';
    content += `حوزه گزارش,"${domainMeta.label}"\n`;
    content += `بازه زمانی,"${periodLabel}"\n`;
    content += `مجموع فروش واقعی,"${metrics.totalSales}"\n`;
    content += `مجموع دریافت‌های تسویه‌شده,"${metrics.totalPaid}"\n`;
    content += `تعداد فاکتورها,"${metrics.invoiceCount}"\n`;
    content += `تعداد پیش‌فاکتورها,"${metrics.quoteCount}"\n`;

    if (activeDef) {
      content += `گزارش فعال,"${activeDef.label}"\n`;
    }

    if (metrics.leaderboard.length > 0) {
      content += '\nرتبه‌بندی فروشندگان:\nنام,فروش (ریال)\n';
      metrics.leaderboard.forEach(r => {
        content += `"${r.name}",${r.amount}\n`;
      });
    }

    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `report_${domain}_${period}_${new Date().toISOString().slice(0, 10)}.${fileFormat === 'excel' ? 'csv' : 'csv'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3.5 pb-24 px-2 pt-2 max-w-5xl mx-auto w-full" dir="rtl">
      {!isLedgerDomain && <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            density="compact"
            className="w-auto rounded-full"
            aria-label="بازه زمانی"
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
        <ExportMenuButton
          onExportExcel={() => exportCurrentReport('excel')}
          onExportCsv={() => exportCurrentReport('csv')}
        />
      </div>}

      <div id="reports-domain-selector" data-tour-actions className="flex flex-wrap gap-1.5">
        {DOMAINS.filter(item => canViewFinance || (item.id !== 'finance' && item.id !== 'receivables')).map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => { setDomain(d.id); setActiveReport(null); }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors cursor-pointer',
              domain === d.id
                ? 'bg-primary text-on-primary border-primary shadow-xs'
                : 'bg-surface text-text-secondary border-border hover:bg-sunken hover:text-text-main'
            )}
          >
            {d.icon}
            {d.label}
          </button>
        ))}
      </div>

      {domain === 'receivables' && (
        canViewFinance
          ? <LedgerReceivablesReport state={state} accounts={receivableAccounts} canViewPayments={canViewPayments} />
          : <p role="status" className="text-xs text-text-secondary">مجوز مشاهدهٔ گزارش مطالبات وجود ندارد.</p>
      )}
      {domain === 'finance' && (
        canViewFinance ? (
          <section className="space-y-3" aria-label="گزارش‌های مالی">
            <SectionHeader title={domainReports[0]?.label || 'گزارش‌های مالی'} />
            <ProfitLossWidget state={state} />
            <CashFlowPanel />
          </section>
        ) : <p role="status" className="text-xs text-text-secondary">مجوز مشاهدهٔ گزارش‌های مالی وجود ندارد.</p>
      )}

      {!isLedgerDomain && !activeReport && (
        <>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-3"><SectionHeader title={`گزارشات ${domainMeta.label}`} action={domainMeta.icon} /></div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {domainReports.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setActiveReport(r.id)}
                  className="relative flex flex-col items-center gap-2 p-3 rounded-2xl border border-border/80 bg-canvas/70 hover:bg-surface hover:border-primary/40 transition-colors cursor-pointer"
                >
                  {r.heatmap && (
                    <span
                      className="absolute top-1.5 left-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary"
                      title="قابل نمایش روی نقشه حرارتی"
                      aria-label="نقشه حرارتی"
                    >
                      <Flame size={12} strokeWidth={2.2} />
                    </span>
                  )}
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    {r.icon}
                  </span>
                  <span className="text-caption font-semibold text-text-main text-center leading-tight">{r.label}</span>
                </button>
              ))}
              {domainReports.length === 0 && (
                <p className="col-span-full text-xs text-text-muted text-center py-6">
                  گزارشی در این حوزه تعریف نشده است.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <KpiCard
              label="مجموع فروش در بازه"
              value={metrics.hasInvoiceData ? formatMoneyCompact(metrics.totalSales) : '—'}
              density="compact"
              sparkline={metrics.monthlyValues}
              unit="ریال"
              empty={!metrics.hasInvoiceData}
              onClick={() => setActiveReport(domainReports[0]?.id || null)}
            />
            <KpiCard
              label="تعداد فاکتورهای معتبر"
              value={formatCount(metrics.invoiceCount)}
              density="compact"
              unit="فقره"
              empty={!metrics.hasInvoiceData}
              onClick={() => setActiveReport(domainReports[0]?.id || null)}
            />
          </div>
        </>
      )}

      {!isLedgerDomain && activeReport && activeDef && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setActiveReport(null)}
            className="self-start text-xs text-primary font-bold inline-flex items-center gap-1 cursor-pointer hover:underline"
          >
            <ArrowRight size={15} />
            بازگشت به فهرست گزارشات
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            <KpiCard
              label="مبلغ کلیدی"
              value={metrics.hasInvoiceData ? formatMoneyCompact(metrics.totalSales) : '—'}
              density="compact"
              sparkline={metrics.monthlyValues}
              unit="ریال"
              empty={!metrics.hasInvoiceData}
            />
            <KpiCard
              label="تحقق هدف"
              value={metrics.target > 0 ? formatPercent(metrics.achievement, 0) : '—'}
              density="compact"
              empty={metrics.target <= 0}
              emptyMessage="هدف فروش در تنظیمات تعریف نشده"
            />
          </div>

          {activeDef.chart === 'line' && (
            <NeoLineChart
              title={activeDef.label}
              periodLabel={periodLabel}
              labels={metrics.monthlyLabels}
              values={metrics.monthlyValues}
              seriesName="فروش"
              empty={!metrics.hasInvoiceData}
            />
          )}

          {(activeDef.chart === 'gauge' || activeDef.id === 'sales-perf' || activeDef.id === 'delivery') && (
            <NeoGaugeChart
              title={activeDef.label}
              periodLabel={periodLabel}
              value={Math.round(metrics.achievement)}
              max={100}
              gaugeTitle="تحقق"
              empty={metrics.target <= 0 && !metrics.hasInvoiceData}
            />
          )}

          {activeDef.chart === 'donut' && (
            <NeoDonutChart
              title="ترکیب دریافت‌ها"
              periodLabel={periodLabel}
              segments={
                metrics.paySegments.length
                  ? metrics.paySegments
                  : [{ name: 'بدون داده', value: 0 }]
              }
              centerLabel={metrics.hasPaymentData ? formatMoneyCompact(metrics.totalPaid) : undefined}
              empty={!metrics.hasPaymentData}
            />
          )}

          {(activeDef.chart === 'bar' || activeDef.id === 'routes' || activeDef.id === 'catalog' || activeDef.id === 'visit') && (
            <ChartCard title={activeDef.label} periodLabel={periodLabel} empty={!metrics.hasInvoiceData}>
              <BarChart
                data={metrics.monthlyLabels.map((label, i) => ({
                  label,
                  value: metrics.monthlyValues[i] || 0,
                }))}
                highlight={metrics.monthlyValues.reduce((bi, v, i, arr) => (v > arr[bi] ? i : bi), 0)}
                height={180}
              />
            </ChartCard>
          )}

          {(activeDef.chart === 'progress' || activeDef.id === 'returns') && (
            <ChartCard title={activeDef.label} periodLabel={periodLabel}>
              <ProgressRows
                items={[
                  { label: 'تحقق فروش', value: metrics.achievement },
                  {
                    label: 'نسبت وصول',
                    value:
                      metrics.totalSales > 0
                        ? Math.min(100, (metrics.totalPaid / metrics.totalSales) * 100)
                        : 0,
                  },
                  {
                    label: 'پیشنهاد به فاکتور',
                    value:
                      metrics.quoteCount > 0
                        ? Math.min(100, (metrics.invoiceCount / metrics.quoteCount) * 100)
                        : 0,
                  },
                ]}
              />
            </ChartCard>
          )}

          {(activeDef.chart === 'leaderboard' || activeDef.id === 'rep-perf') && (
            <ChartCard
              title="رتبه‌بندی فروشندگان"
              periodLabel={periodLabel}
              empty={metrics.leaderboard.length === 0}
              emptyMessage="برای این بازه دادهٔ فروشنده‌ای ثبت نشده"
            >
              <ul className="space-y-2">
                {metrics.leaderboard.map((row, idx) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border/80 bg-canvas px-3 py-2"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                        {formatCount(idx + 1)}
                      </span>
                      <span className="text-xs font-semibold text-text-main truncate">{row.name}</span>
                    </span>
                    <span className="text-xs font-bold tabular-nums text-text-main shrink-0">
                      {formatMoneyCompact(row.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </ChartCard>
          )}

          {activeDef.heatmap && (
            <NeoHeatmapChart
              title={`نقشه حرارتی · ${activeDef.label}`}
              periodLabel={periodLabel}
              xLabels={metrics.heatX}
              yLabels={metrics.heatY.length ? metrics.heatY : ['—']}
              cells={metrics.heatCells}
              seriesName="فروش"
              empty={!metrics.hasInvoiceData || metrics.heatCells.length === 0}
            />
          )}

          {(activeDef.chart === 'list' || activeDef.id === 'discrepancy' || activeDef.id === 'proposals' || activeDef.id === 'team-activity') && (
            <ChartCard title={activeDef.label} periodLabel={periodLabel}>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-canvas p-3">
                  <div className="text-caption text-text-muted">فاکتورها</div>
                  <div className="text-base font-bold tabular-nums">{formatCount(metrics.invoiceCount)}</div>
                </div>
                <div className="rounded-xl bg-canvas p-3">
                  <div className="text-caption text-text-muted">پیشنهادها</div>
                  <div className="text-base font-bold tabular-nums">{formatCount(metrics.quoteCount)}</div>
                </div>
                <div className="rounded-xl bg-canvas p-3">
                  <div className="text-caption text-text-muted">فعالیت‌ها</div>
                  <div className="text-base font-bold tabular-nums">{formatCount(metrics.activityCount)}</div>
                </div>
                <div className="rounded-xl bg-canvas p-3">
                  <div className="text-caption text-text-muted">وظایف</div>
                  <div className="text-base font-bold tabular-nums">{formatCount(metrics.taskCount)}</div>
                </div>
              </div>
            </ChartCard>
          )}
        </div>
      )}
    </div>
  );
}

function LedgerReceivablesReport({ state, accounts, canViewPayments }: {
  state: AppState;
  accounts: Account[];
  canViewPayments: boolean;
}) {
  const navigate = useNavigate();
  const { serverVersion } = useDataSyncStatus();
  const ledger = useDataQuery(provider => provider.getDetailSubsidiaryBalances(), [state.currentUserId, serverVersion]);
  const allocations = useDataQuery(
    provider => canViewPayments ? provider.getPaymentAllocations() : Promise.resolve(null),
    [canViewPayments, state.currentUserId, serverVersion]
  );
  const result = ledger.data;
  const authorizedIds = new Set(accounts.map(account => account.id));
  const invoices = (state.invoices || [])
    .map(row => ({ ...row, customerId: row.accountId || row.customerId }))
    .filter(row => authorizedIds.has(row.customerId));
  const payments = canViewPayments ? (state.payments || [])
    .map(row => ({ ...row, customerId: row.accountId || row.customerId }))
    .filter(row => authorizedIds.has(row.customerId)) : [];
  const invoiceIds = new Set(invoices.map(row => row.id));
  const paymentIds = new Set(payments.map(row => row.id));
  const allocationReview = canViewPayments && !allocations.loading && !allocations.error && allocations.data
    ? reconcileReceivables(invoices, payments, allocations.data.filter(row =>
        invoiceIds.has(row.invoiceId) && paymentIds.has(row.paymentId)))
    : null;
  const completeAccounts = accounts.filter(account => {
    const view = resolveCustomerBalanceView(result, account);
    return view.kind === 'OK' && !view.incomplete;
  });

  return (
    <section className="space-y-3" aria-label="گزارش مطالبات دفتری">
      <SectionHeader title="مطالبات دفتری" />
      {ledger.loading && <p role="status" className="text-xs text-text-secondary">در حال دریافت ماندهٔ دفتری…</p>}
      {!ledger.loading && (ledger.error || result?.status === 'UNAVAILABLE') && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-danger">
          <span>ماندهٔ دفتری در دسترس نیست. {ledger.error?.message || result?.reason}</span>
          <Button type="button" variant="ghost" onClick={() => void ledger.refetch()}>تلاش مجدد</Button>
        </div>
      )}
      {!ledger.loading && !ledger.error && result?.status !== 'UNAVAILABLE' && (
        completeAccounts.length ? (
          <>
            <p className="text-xs text-text-secondary">
              {isDemoContext(state) ? 'منبع آزمایشی' : result?.source === 'SQLSERVER_BACKEND' ? 'منبع دفتر کل سرور' : 'منبع دفتر کل محلی'}
              {' · '}برآورد بر اساس کل سوابق قابل مشاهده
            </p>
            {completeAccounts.length < accounts.length && (
              <p role="status" className="text-xs text-text-secondary">برخی مشتریان ماندهٔ قابل‌محاسبه ندارند و در برآورد لحاظ نشده‌اند.</p>
            )}
            <ReceivablesLifoPanel
              ledgerBalances={result}
              accounts={completeAccounts}
              invoices={invoices}
              allowedDays={state.settings?.orgConfig?.allowedCreditDays}
              agingBounds={state.settings?.agingBucketBounds}
              sellerName={key => state.users.find(user => user.id === key)?.name || ''}
              onOpenCustomer={id => navigate(`/accounts/${encodeURIComponent(id)}`)}
            />
          </>
        ) : <p role="status" className="text-xs text-text-secondary">ماندهٔ دفتری قابل‌محاسبه‌ای برای مشتریان قابل مشاهده وجود ندارد.</p>
      )}
      {canViewPayments && (
        <div className="rounded-xl border border-border bg-surface p-3 text-xs text-text-secondary">
          <h3 className="mb-1 font-bold text-text-main">بررسی تخصیص دریافت‌ها</h3>
          {allocations.error ? (
            <div role="alert" className="flex flex-wrap items-center gap-2">
              <span>دریافت تخصیص‌ها ناموفق بود. {allocations.error.message}</span>
              <Button type="button" variant="ghost" onClick={() => void allocations.refetch()}>تلاش مجدد</Button>
            </div>
          ) : allocations.loading ? <p role="status">در حال دریافت تخصیص‌ها…</p> : (
            <p>{allocationReview && allocationReview.issues.length
              ? `${formatCount(allocationReview.issues.length)} مورد نیازمند بررسی`
              : 'نتیجهٔ تطبیق قطعی در دسترس نیست.'}</p>
          )}
          <p className="mt-1">تخصیص‌های CRM فقط برای بررسی به کار می‌روند. برآورد مطالبات از دفتر کل محاسبه می‌شود.</p>
        </div>
      )}
    </section>
  );
}

export default ReportsHub;
