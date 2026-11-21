import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatCount, formatDecimalString, formatMoneyCompact } from '../../lib/format';
import { formatAppDate, getJalaliDate, toLocalDateISO } from '../../lib/utils';
import { useDataQuery } from '../../hooks/useDataProvider';
import { useAppStore } from '../../lib/storage';
import { useDataSyncStatus } from '../../services/dataSyncController';
import type { MoneyCashRow, MoneyDimension, MoneyGroup, MoneyPeriod } from '../../services/moneyIntelligence';
import { EChartCard } from '../charts/EChartCard';
import { financialWaterfallOption, ledgerTrendOption } from '../charts/echartsTheme';
import { KpiCard } from '../charts/KpiCard';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { EmptyState } from '../ui/EmptyState';
import { SearchableSelect } from '../ui/SearchableSelect';
import { MoneyEvidenceSheet, type MoneyEvidenceSelection } from './MoneyEvidenceSheet';

const DAY = 86_400_000;
const shift = (date: string, days: number) => new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);

const roles: Record<string, string> = {
  RECEIVABLE: 'مطالبات مشتریان', CHEQUES_RECEIVABLE: 'چک‌های دریافتنی در راه', INVENTORY: 'موجودی دفتری کالا',
  PREPAYMENT: 'پیش‌پرداخت‌ها', PAYABLE: 'بدهی تأمین‌کنندگان', FIXED_ASSET: 'دارایی‌های ثابت',
  ASSET_ADJUSTMENT: 'تعدیلات غیرنقدی دارایی', FINANCING: 'تسهیلات و تأمین مالی', EQUITY: 'حقوق مالکانه و برداشت',
  OTHER_ASSET: 'سایر دارایی‌ها', OTHER_LIABILITY: 'سایر بدهی‌ها', PNL_EXPENSE: 'هزینهٔ شناسایی‌شده',
  PNL_NONCASH: 'هزینهٔ غیرنقدی',
};
const dimensions = [
  { value: 'category', label: 'نوع هزینه یا مصرف' }, { value: 'center', label: 'مرکز هزینه' },
  { value: 'party', label: 'طرف‌حساب' }, { value: 'month', label: 'ماه' },
];
const expenseKinds = [
  { kind: 'outflow', label: 'پرداخت نقدی' }, { kind: 'expense', label: 'هزینهٔ شناسایی‌شده' },
] as const;
const granularities = [{ key: 'day', label: 'روزانه' }, { key: 'week', label: 'هفتگی' }, { key: 'month', label: 'ماهانه' }] as const;
type Granularity = typeof granularities[number]['key'];

const money = (value?: string | null) => value == null ? 'نامشخص' : `${formatDecimalString(value)} ریال`;
const compact = (value: string | null) => value === null ? 'نامشخص' : formatMoneyCompact(Number(value));

function validPeriod(from: string, to: string) {
  return [from, to].every(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= '1900-01-01'
    && date <= '9998-12-31' && Number.isFinite(Date.parse(date)) && shift(date, 0) === date)
    && from <= to && Date.parse(to) - Date.parse(from) <= 365 * DAY;
}

function trendOption(rows: MoneyCashRow[], period: MoneyPeriod, granularity: Granularity, complete: boolean) {
  const byDate = new Map(rows.map(row => [row.date,row]));
  const buckets = new Map<string, { label: string; inflow: number; outflow: number }>();
  for (let date = period.from; date <= period.to; date = shift(date, 1)) {
    const row = byDate.get(date);
    if (!row && !complete) continue;
    const local = getJalaliDate(`${date}T12:00:00`);
    const week = shift(date, -((new Date(date).getUTCDay() + 1) % 7));
    const key = granularity === 'month' ? `${local.jy}-${local.jm}` : granularity === 'week' ? week : date;
    const bucket = buckets.get(key) ?? { label: formatAppDate(granularity === 'week' && week >= period.from ? week : date,
      undefined, granularity === 'month' ? 'month-year' : 'short'), inflow: 0, outflow: 0 };
    bucket.inflow += Number(row?.inflow ?? 0);
    bucket.outflow += Number(row?.outflow ?? 0);
    buckets.set(key, bucket);
  }
  const columns = [...buckets.values()];
  const options = ledgerTrendOption(columns.map(row => row.label), [
    { name: 'ورود وجه', values: columns.map(row => row.inflow), colorToken: '--c-forest' },
    { name: 'خروج وجه', values: columns.map(row => row.outflow), colorToken: '--c-burgundy' },
  ]);
  return { ...options, xAxis: { ...(options.xAxis as object), inverse: true },
    dataZoom: columns.length > 18 ? [{ type: 'inside', zoomOnMouseWheel: 'ctrl', moveOnMouseWheel: false }] : [] };
}

function MoneyGroups({ rows, dimension, open }: {
  rows: MoneyGroup[];
  dimension: MoneyDimension;
  open: (selection: MoneyEvidenceSelection) => void;
}) {
  const [kind, setKind] = useState<MoneyGroup['kind']>('outflow');
  const [expanded, setExpanded] = useState(false);
  const modeLabel = expenseKinds.find(option => option.kind === kind)?.label ?? '';
  const groups = rows.filter(row => row.kind === kind);
  const groupLabel = (row: MoneyGroup) => row.title || (dimension === 'category' ? roles[row.groupCode ?? ''] : '') || row.groupCode || 'طبقه‌بندی‌نشده';

  return <>
    <div role="group" aria-label="مبنای تحلیل هزینه" className="flex flex-wrap gap-1">
      {expenseKinds.map(option => <Button key={option.kind} size="sm" type="button"
        aria-pressed={option.kind === kind} variant={option.kind === kind ? 'soft' : 'ghost'}
        onClick={() => { setKind(option.kind); setExpanded(false); }}>{option.label}</Button>)}
    </div>
    {groups.length === 0 ? <EmptyState surface="finance_money" title="ردیف قابل‌طبقه‌بندی در این نما یافت نشد" compact /> :
      <ul className="divide-y divide-border">
        {groups.slice(0, expanded ? 20 : 5).map(row => <li key={row.groupCode ?? ''}>
          <button type="button" className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2 text-start hover:bg-hover"
            onClick={() => open({ title: groupLabel(row), mode: kind, key: row.groupCode ?? '' })}>
            <span className="min-w-0 wrap-break-word text-sm font-semibold">{groupLabel(row)}</span>
            <span className="text-sm font-bold tabular-nums">{money(row.amount)}</span>
            <span className="w-full text-caption text-text-secondary">
              {formatCount(row.documents)} سند
              {row.difference !== null && <> · تغییر نسبت به دورهٔ قبل {money(row.difference)}</>}
              {row.priorAmount !== null && <> · دورهٔ قبل {money(row.priorAmount)} در {formatCount(row.priorDocuments)} سند</>}
            </span>
            {((row.unusualDocuments ?? 0) > 0 || row.repeatCount > 1) && <span className="w-full text-caption text-warning">
              {(row.unusualDocuments ?? 0) > 0 && <span className="me-3">{formatCount(row.unusualDocuments)} سند بالاتر از دامنهٔ معمول دورهٔ قبل</span>}
              {row.repeatCount > 1 && <span>{formatCount(row.repeatCount)} پرداخت هم‌مبلغ به یک طرف‌حساب</span>}
            </span>}
          </button>
        </li>)}
      </ul>}
    <div className="flex flex-wrap items-center gap-2">
      {groups.length > 5 && <Button type="button" variant="ghost" size="sm" aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}>{expanded ? 'گروه‌های کمتر' : 'گروه‌های بیشتر'}</Button>}
      {groups.length > 0 && <Button type="button" variant="outline" size="sm"
        onClick={() => open({ title: `همهٔ اسناد ${modeLabel}`, mode: kind })}>ریز همهٔ اسناد</Button>}
    </div>
  </>;
}

export function MoneyIntelligencePanel() {
  const viewer = useAppStore(store => store.state.currentUserId);
  const { serverVersion } = useDataSyncStatus();
  const [params, setParams] = useSearchParams();
  const defaultTo = toLocalDateISO();
  const urlFrom = params.get('moneyFrom') ?? '';
  const urlTo = params.get('moneyTo') ?? '';
  const fromUrl = validPeriod(urlFrom, urlTo);
  const from = fromUrl ? urlFrom : shift(defaultTo, -29);
  const to = fromUrl ? urlTo : defaultTo;
  const dimension = (dimensions.find(option => option.value === params.get('moneyBy'))?.value ?? 'category') as MoneyDimension;
  const period = { from, to, dimension };
  const [draft, setDraft] = useState<{ from: string; to: string } | null>(null);
  const [granularity, setGranularity] = useState<Granularity>('week');
  const [evidence, setEvidence] = useState<{ selection: MoneyEvidenceSelection; requestKey: string } | null>(null);
  const requestKey = JSON.stringify([viewer, from, to, dimension]);
  const open = (selection: MoneyEvidenceSelection) => setEvidence({ selection, requestKey });
  const query = useDataQuery(async provider => ({ requestKey, report: await provider.getMoneyReport(period) }), [requestKey, serverVersion]);
  const report = query.data?.requestKey === requestKey ? query.data.report : null;
  const dates = draft ?? { from, to };

  function changeFilter(next: MoneyPeriod) {
    setEvidence(null);
    setDraft(null);
    const queryParams = new URLSearchParams(params);
    queryParams.set('moneyFrom', next.from);
    queryParams.set('moneyTo', next.to);
    if (next.dimension === 'category') queryParams.delete('moneyBy');
    else queryParams.set('moneyBy', next.dimension);
    setParams(queryParams, { replace: true });
  }

  const ready = report && (report.status === 'AVAILABLE' || report.status === 'PARTIAL') ? report : null;
  const reason = report && 'reason' in report ? report.reason : undefined;
  const review = () => open({ mode: 'review', title: 'اسناد و گردش نیازمند بررسی' });
  const metrics = ready ? [
    { label: 'ماندهٔ دفتری پایان دوره', amount: ready.cash.closing, mode: 'balance', key: 'CASH' },
    { label: 'دریافت‌های تفکیک‌شده', amount: ready.cash.inflow, mode: 'cash', key: 'IN' },
    { label: 'پرداخت‌های تفکیک‌شده', amount: ready.cash.outflow, mode: 'cash', key: 'OUT' },
    { label: 'سود خالص دفتری', amount: ready.netProfit, mode: 'profit' },
  ] as const : [];
  const bridgeSteps = ready && ready.netProfit !== null && ready.cash.net !== null ? [
    { label: 'سود خالص', amount: ready.netProfit, total: true, mode: 'profit' as const, key: undefined },
    ...ready.bridge.map(row => ({ label: roles[row.role] ?? 'سایر تغییرات', amount: row.amount,
      total: false, mode: 'role' as const, key: row.role })),
    { label: 'تغییر خالص وجه نقد', amount: ready.cash.net, total: true, mode: 'cash' as const, key: undefined },
  ] : [];
  const biggestUse = ready?.periodCovered ? ready.bridge.reduce<{ role: string; amount: string } | null>(
    (lowest, row) => Number(row.amount) < (lowest ? Number(lowest.amount) : 0) ? row : lowest, null) : null;

  return (
    <section dir="rtl" aria-labelledby="money-intelligence" className="space-y-3">
      <Card padding="md" className="space-y-3">
        <div>
          <h2 id="money-intelligence" className="text-lg font-extrabold text-text-main">پول کجاست؟</h2>
          <p className="text-sm text-text-secondary">دریافت‌ها، محل مصرف پول و فاصلهٔ سود تا نقدینگی در اسناد مالی</p>
        </div>
        <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={event => {
          event.preventDefault();
          if (validPeriod(dates.from, dates.to)) changeFilter({ ...dates, dimension });
        }}>
          <fieldset className="min-w-0">
            <legend className="text-caption text-text-secondary">از تاریخ</legend>
            <CustomDatePicker value={dates.from} placeholder="تاریخ شروع گزارش" onChange={date => setDraft({ ...dates, from: date })} />
          </fieldset>
          <fieldset className="min-w-0">
            <legend className="text-caption text-text-secondary">تا تاریخ</legend>
            <CustomDatePicker value={dates.to} placeholder="تاریخ پایان گزارش" onChange={date => setDraft({ ...dates, to: date })} />
          </fieldset>
          <Button type="submit" variant="outline" disabled={!validPeriod(dates.from, dates.to)}>اعمال بازه</Button>
          {!validPeriod(dates.from, dates.to) && <p role="alert" className="text-caption text-danger sm:col-span-3">یک بازهٔ معتبر حداکثر ۳۶۶روزه انتخاب کنید.</p>}
        </form>
      </Card>

      {query.loading ? <div className="grid grid-cols-2 gap-2" aria-busy="true">
        {['مانده', 'دریافت‌ها', 'پرداخت‌ها', 'سود'].map(label => <KpiCard key={label} label={label} value="" loading />)}
      </div> : query.error || !ready ? <Card padding="md">
        <EmptyState surface="finance_money" title={reason ?? 'دریافت گزارش نقدینگی از سرور ممکن نیست'}
          actionLabel={query.error ? 'تلاش دوباره' : undefined} onAction={query.error ? () => void query.refetch() : undefined} compact />
      </Card> : <>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {metrics.map(metric => <div key={metric.label} title={money(metric.amount)}>
            <KpiCard label={metric.label} value={compact(metric.amount)} density="compact"
              onClick={metric.amount === null ? undefined : () => open({ title: metric.label, mode: metric.mode,
                key: 'key' in metric ? metric.key : undefined })} />
          </div>)}
        </div>
        <Card padding="md" className="space-y-2 text-caption text-text-secondary">
          <p>ماندهٔ اعلام‌شدهٔ بانک {money(ready.bank.closing)} · مبلغ ناخالص اسناد بانکی تطبیق‌نشده {money(ready.bank.unmatched)}.</p>
          {ready.bank.status === 'NOT_VERIFIED' ? <p>برای این تاریخ شاهد معتبر بانک در دسترس نیست.</p> : <>
            <p>{ready.bank.status === 'VERIFIED' ? 'کنترل مانده و اسناد بانک کامل است.' : ready.bank.status === 'MISMATCH' ? 'تطبیق بانک اختلاف یا سند باز دارد.' : 'پوشش کنترل‌های بانکی ناقص است.'}
              {ready.bank.updatedAt && <> · آخرین ورود صورت‌حساب {formatAppDate(ready.bank.updatedAt)}</>}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => open({ title: 'مدرک تطبیق بانک', mode: 'bank' })}>مدرک تطبیق بانک</Button>
          </>}
          <p>پوشش تأییدشدهٔ دفتر از {formatAppDate(ready.openingDate)} تا {formatAppDate(ready.verifiedThrough)}
            {ready.updatedAt && <> · آخرین همگام‌سازی سند {formatAppDate(ready.updatedAt)}</>}</p>
          {ready.status === 'PARTIAL' && <p role="status" className="text-warning">پوشش گزارش یا تفکیک گردش کامل نیست. دریافت و پرداختِ نمایش‌داده‌شده از اسناد قابل‌تفکیک است.</p>}
          {(ready.excludedDocuments > 0 || ready.mixedDocuments > 0 || ready.unallocatedDocuments > 0) &&
            <Button type="button" size="sm" variant="outline" onClick={review}>اسناد نیازمند بررسی</Button>}
        </Card>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-1" role="group" aria-label="تفکیک زمانی جریان نقد">
            {granularities.map(option => <Button key={option.key} type="button" size="sm"
              variant={option.key === granularity ? 'soft' : 'ghost'} aria-pressed={option.key === granularity}
              onClick={() => setGranularity(option.key)}>{option.label}</Button>)}
          </div>
          <EChartCard title="روند ورود و خروج وجه دفتری" option={trendOption(ready.trend, period, granularity, ready.periodCovered)}
            empty={!ready.trend.length} sourceLabel="دفتر کل ERP" periodLabel="مبالغ به ریال" />
          <Card padding="md" className="space-y-1">
            {[
              { label: 'ماندهٔ دفتری ابتدای دوره', value: ready.cash.opening, mode: 'opening', key: 'CASH' },
              { label: 'انتقال داخلی (بی‌اثر در خالص)', value: ready.cash.transfers, mode: 'cash', key: 'TRANSFER' },
              { label: 'خالص گردش اسناد ترکیبی', value: ready.cash.unresolved, mode: 'cash', key: 'MIXED' },
              { label: 'خالص تغییر وجه نقد دفتری', value: ready.cash.net, mode: 'cash', key: undefined },
            ].map(row => <div key={row.label} className="flex flex-wrap items-center justify-between gap-1 text-sm">
              <Button type="button" size="sm" variant="ghost" disabled={row.value === null}
                onClick={() => open({ title: row.label, mode: row.mode === 'opening' ? 'opening' : 'cash', key: row.key })}>{row.label}</Button>
              <span className="tabular-nums">{money(row.value)}</span>
            </div>)}
          </Card>
        </div>

        <Card padding="md" className="space-y-3">
          <h3 className="font-bold">چرا سود با نقدینگی فرق دارد؟</h3>
          <p className="text-caption text-text-secondary">سود هنگام شناسایی درآمد و هزینه ثبت می‌شود. در این آبشار، تغییر ماندهٔ حساب‌های غیرنقدی، سود خالص را به تغییر وجه نقد دفتری وصل می‌کند. اثر هر حساب می‌تواند شامل گردش نقدی و غیرنقدی باشد.</p>
          {biggestUse && <p className="text-sm">بزرگ‌ترین اثر کاهنده در این بازه مربوط به «{roles[biggestUse.role]}» با اثر {money(biggestUse.amount)} است.</p>}
          {bridgeSteps.length === 0 ? <p className="text-sm text-text-secondary">آبشار پس از پوشش کامل و کنترل کدینگ این دوره قابل محاسبه است.</p> : <>
            <EChartCard title="از سود خالص تا تغییر وجه نقد" option={financialWaterfallOption(bridgeSteps.map(step => ({
              ...step, amount: Number(step.amount),
            })))} periodLabel="مبالغ به ریال" />
            <ul className="divide-y divide-border">
              {bridgeSteps.map(step => <li key={step.label} className="flex flex-wrap items-center justify-between gap-1 text-sm">
                <Button type="button" size="sm" variant="ghost" onClick={() => open({ title: step.label, mode: step.mode, key: step.key })}>{step.label}</Button>
                <span className="tabular-nums">{money(step.amount)}</span>
              </li>)}
            </ul>
          </>}
        </Card>

        <Card padding="md" className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] sm:items-end">
            <div><h3 className="font-bold">پول کجا خرج شد؟</h3>
              <p className="text-caption text-text-secondary">پرداخت و هزینهٔ حسابداری دو مبنای مستقل‌اند. رشد مبلغ، موارد خارج از دامنهٔ دورهٔ قبل و پرداخت‌های هم‌مبلغ را از ریز اسناد بررسی کنید.</p></div>
            <SearchableSelect label="گروه‌بندی" value={dimension} options={dimensions}
              onChange={value => { if (dimensions.some(option => option.value === value)) changeFilter({ ...period, dimension: value as MoneyDimension }); }} />
          </div>
          {ready.unallocatedDocuments > 0 && <p className="text-caption text-warning">
            {money(ready.unallocated)} پرداخت در {formatCount(ready.unallocatedDocuments)} سند هنوز تفکیک نشده است.
          </p>}
          <MoneyGroups key={dimension} rows={ready.grouped} dimension={dimension} open={open} />
        </Card>

        <Card padding="md" className="space-y-3">
          <h3 className="font-bold">پول خارج از بانک و سرمایهٔ در گردش</h3>
          <p className="text-caption text-text-secondary">مطالبات و چک‌های در راه قابلیت وصول دارند. پیش‌پرداخت، موجودی و دارایی ثابت منابع شرکت‌اند و زمان تبدیل آن‌ها به نقد متفاوت است. مبالغ دفتری با علامت مانده نمایش داده می‌شوند؛ بدهی بستانکار با علامت منفی است.</p>
          <ul className="divide-y divide-border text-sm">
            {['RECEIVABLE', 'CHEQUES_RECEIVABLE', 'PAYABLE', 'PREPAYMENT', 'FIXED_ASSET', 'OTHER_ASSET']
              .map(role => ({ role, amount: ready.balances.find(row => row.role === role)?.closing ?? null }))
              .map(row => <li key={row.role} className="flex flex-wrap items-center justify-between gap-1">
                <Button type="button" size="sm" variant="ghost" disabled={row.amount === null}
                  onClick={() => open({ title: roles[row.role], mode: 'balance', key: row.role })}>{roles[row.role]}</Button>
                <span className="tabular-nums">{money(row.amount)}</span>
              </li>)}
            <li className="flex flex-wrap items-center justify-between gap-1">
              <Button type="button" size="sm" variant="ghost" disabled={ready.fifo.closing === null}
                onClick={() => open({ title: 'ارزش موجودی پایان دوره', mode: 'fifo', key: 'closing' })}>ارزش موجودی با FIFO</Button>
              <span className="tabular-nums">{money(ready.fifo.closing)}</span>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-1">
              <Button type="button" size="sm" variant="ghost" disabled={ready.fifo.opening === null}
                onClick={() => open({ title: 'ارزش موجودی ابتدای دوره', mode: 'fifo', key: 'opening' })}>ارزش موجودی ابتدای دوره</Button>
              <span className="tabular-nums">{money(ready.fifo.opening)}</span>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-1 py-2">
              <span>سرمایهٔ در گردش عملیاتی پایان دوره</span><span className="tabular-nums">{money(ready.workingCapital.closing)}</span>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-1 py-2">
              <span>تغییر سرمایهٔ در گردش از پایان دورهٔ قبل</span><span className="tabular-nums">{money(ready.workingCapital.change)}</span>
            </li>
          </ul>
          <p className="text-caption text-text-secondary">سرمایهٔ در گردش عملیاتی شامل مطالبات، چک‌های در راه، پیش‌پرداخت و موجودی FIFO پس از کسر بدهی تأمین‌کنندگان است.</p>
          {ready.fifo.closing === null && <p className="text-caption text-text-secondary">ارزش FIFO پس از تطبیق ارزش‌گذاری منتشرشده با موجودی ERP در همان تاریخ نمایش داده می‌شود.</p>}
        </Card>
      </>}
      {evidence?.requestKey === requestKey && <MoneyEvidenceSheet key={JSON.stringify(evidence.selection)}
        period={period} selection={evidence.selection} onClose={() => setEvidence(null)} />}
    </section>
  );
}
