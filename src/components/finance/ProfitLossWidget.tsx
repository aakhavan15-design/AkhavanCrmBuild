import React, { useEffect, useState, useMemo } from 'react';
import { EChartCard } from '../charts/EChartCard';
import { ledgerTrendOption } from '../charts/echartsTheme';
import { useTheme } from '../../theme/ThemeProvider';
import { TrendingUp, ShieldAlert } from 'lucide-react';
import { Card } from '../ui/Card';
import { AppState } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { buildLedgerPnlInputs, pnlSeriesByJalali } from '../../lib/ledgerPnl';
import { DEFAULT_REPORT_BUCKETS } from '../../lib/accountingMapping';
import { EmptyState } from '../ui/EmptyState';
import { useAppStore } from '../../lib/storage';
import { RBACService } from '../../lib/rbac';
import { useDataQuery } from '../../hooks/useDataProvider';
import { getActiveDataProvider } from '../../services/dataProvider';

interface ProfitLossWidgetProps {
  state?: AppState;
  height?: number;
}

export function ProfitLossWidget({ state, height = 240 }: ProfitLossWidgetProps) {
  const { theme } = useTheme();
  const [period, setPeriod] = useState<'monthly' | 'quarterly' | 'annual'>('monthly');
  const storeState = useAppStore(s => s.state);
  const effectiveState = state ?? storeState;
  const canSeeLedger = useMemo(() => (effectiveState ? new RBACService(effectiveState).can('finance', 'VIEW') : false), [effectiveState]);

  // کلید تازه‌سازی فقط برای باطل‌شدن کش پس از تغییر مخزن؛ منبع داده همیشه DataProvider است (F0-14)
  const journalLineCount = Array.isArray((effectiveState as Record<string, unknown> | undefined)?.journalLines)
    ? ((effectiveState as Record<string, unknown>).journalLines as unknown[]).length
    : 0;
  const coaCount = Array.isArray((effectiveState as Record<string, unknown> | undefined)?.coaMirror)
    ? ((effectiveState as Record<string, unknown>).coaMirror as unknown[]).length
    : 0;

  const { data: ledgerPnlData, error: ledgerPnlError, loading: ledgerPnlLoading, refetch: refreshPnl } = useDataQuery(
    async provider => (canSeeLedger ? provider.getLedgerPnlData() : null),
    [canSeeLedger, journalLineCount, coaCount]
  );

  const resolvedPnlData = useMemo(() => {
    if (!canSeeLedger) {
      return { status: 'RESTRICTED' as const, source: getActiveDataProvider().name, journalLines: [], coaMirror: [], reason: 'دسترسی مشاهده اطلاعات دفتر کل ندارید.' };
    }
    if (ledgerPnlError) {
      return { status: 'UNAVAILABLE' as const, source: getActiveDataProvider().name, journalLines: [], coaMirror: [], reason: ledgerPnlError.message };
    }
    return ledgerPnlData;
  }, [canSeeLedger, ledgerPnlError, ledgerPnlData]);

  const isUnavailable = resolvedPnlData?.status === 'UNAVAILABLE' || resolvedPnlData?.status === 'RESTRICTED';

  // فقط از دفتر کل (سند + نگاشت سرفصل) از مسیر DataProvider؛ نبود داده = Empty State، نه عدد نمونه (F0-09 / F0-14)
  const { rawLines, accounts } = useMemo(
    () => (resolvedPnlData && !isUnavailable ? buildLedgerPnlInputs(resolvedPnlData.journalLines, resolvedPnlData.coaMirror) : { rawLines: [], accounts: [] }),
    [resolvedPnlData, isUnavailable]
  );

  const chartData = useMemo(() => {
    const granularity = period === 'monthly' ? 'month' : period === 'quarterly' ? 'quarter' : 'year';
    const limit = period === 'monthly' ? 12 : 4;
    return pnlSeriesByJalali(rawLines, accounts, DEFAULT_REPORT_BUCKETS, granularity, limit);
  }, [rawLines, accounts, period]);

  const [chartOption, setChartOption] = useState<Record<string, unknown>>({});
  useEffect(() => {
    const frame = requestAnimationFrame(() => setChartOption(ledgerTrendOption(chartData.map(row => row.label), [
      { name: 'فروش خالص', colorToken: '--c-success', values: chartData.map(row => row.revenue) },
      { name: 'هزینه‌های عملیاتی', colorToken: '--c-danger', values: chartData.map(row => row.expenses) },
      { name: 'سود عملیاتی', colorToken: '--c-primary', values: chartData.map(row => row.profit) },
    ])));
    return () => cancelAnimationFrame(frame);
  }, [chartData, theme]);
  const hasData = chartData.some(d => d.revenue !== null || d.expenses !== null || d.profit !== null);
  const sum = (key: 'revenue' | 'expenses' | 'profit'): number | null => {
    const vals = chartData.map(d => d[key]).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const totalRev = isUnavailable ? null : sum('revenue');
  const totalExp = isUnavailable ? null : sum('expenses');
  const totalNet = isUnavailable ? null : sum('profit');
  const fmt = (v: number | null) => (isUnavailable ? 'نامشخص' : v === null ? '—' : `${formatCurrency(v)} ریال`);

  return (
    <Card padding="md" className="space-y-3 rounded-xl border border-border bg-surface p-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-bold text-text-main flex items-center gap-1.5">
            <TrendingUp size={15} className="text-primary" />
            تحلیل روند سود و زیان
          </h2>
          <span className="text-mini text-text-secondary mt-0.5 block">
            روند تغییرات درآمد، هزینه‌ها و سود خالص عملیاتی
          </span>
        </div>

        <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-canvas border border-border">
          {(['monthly', 'quarterly', 'annual'] as const).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 rounded-md text-mini font-bold transition-all cursor-pointer ${
                period === p ? 'bg-primary text-on-primary shadow-xs' : 'text-text-secondary hover:text-text-main'
              }`}
            >
              {p === 'monthly' ? 'ماهانه' : p === 'quarterly' ? 'فصلی' : 'سالانه'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
        <div className="p-3 rounded-xl bg-canvas border border-border/80">
          <span className="text-micro font-bold text-text-muted block">فروش خالص دوره</span>
          <strong className="text-sm font-bold font-mono text-success block mt-1">
            {fmt(totalRev)}
          </strong>
        </div>
        <div className="p-3 rounded-xl bg-canvas border border-border/80">
          <span className="text-micro font-bold text-text-muted block">کل هزینه‌های دوره</span>
          <strong className="text-sm font-bold font-mono text-danger block mt-1">
            {fmt(totalExp)}
          </strong>
        </div>
        <div className="p-3 rounded-xl bg-canvas border border-border/80">
          <span className="text-micro font-bold text-text-muted block">سود عملیاتی (دفتری)</span>
          <strong className="text-sm font-bold font-mono text-primary block mt-1">
            {fmt(totalNet)}
          </strong>
        </div>
      </div>

      {resolvedPnlData?.status === 'RESTRICTED' ? (
        <div role="status" className="rounded-xl border border-border bg-canvas px-3 py-4 text-xs text-text-secondary flex items-center gap-2">
          <ShieldAlert size={15} className="text-warning shrink-0" />
          <span>دسترسی مشاهده اطلاعات دفتر کل و سود و زیان برای نقش فعلی مجاز نیست.</span>
        </div>
      ) : resolvedPnlData?.status === 'UNAVAILABLE' ? (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft/40 px-3 py-4 text-xs text-danger flex flex-wrap items-center justify-between gap-2">
          <span>منبع اطلاعات دفتر کل در دسترس نیست؛ عددی نمایش داده نمی‌شود.{resolvedPnlData.reason ? ` (${resolvedPnlData.reason})` : ''}</span>
          <button type="button" onClick={() => void refreshPnl()} className="underline font-bold cursor-pointer">
            تلاش مجدد
          </button>
        </div>
      ) : ledgerPnlLoading && !ledgerPnlData ? (
        <div role="status" className="rounded-xl border border-border bg-canvas px-3 py-6 text-center text-xs text-text-secondary">
          در حال دریافت اسناد دفتر کل…
        </div>
      ) : !hasData ? (
        <EmptyState surface="profit_loss_widget" title="هنوز سند حسابداری نگاشت‌شده‌ای برای محاسبهٔ سود و زیان وجود ندارد" description="پس از همگام‌سازی اسناد دفتر کل و نگاشت سرفصل‌ها به سطل‌های گزارش، روند اینجا نمایش داده می‌شود." />
      ) : (
        <EChartCard title="روند دوره‌ای دفتر کل" periodLabel="مبالغ به ریال"
          sourceLabel="اسناد و نگاشت معتبر دفتر کل" height={height} option={chartOption} />
      )}
    </Card>
  );
}
