import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { formatCount, formatMoney } from '../../lib/format';
import { useDataSyncStatus } from '../../services/dataSyncController';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
import { ChartCard } from '../charts/ChartCard';
import { Card } from '../ui/Card';
import { CashFlowChart } from '../charts';
import { useAppStore } from '../../lib/storage';
import { RBACService } from '../../lib/rbac';
import { useDataQuery } from '../../hooks/useDataProvider';
import { toLocalDateISO, formatAppDate } from '../../lib/utils';
import { toLatinDigits } from '../../lib/digits';
import { buildCashFlowProjection, evaluatePayability } from '../../lib/cashFlowEngine';

/**
 * جریان نقدینگی خزانه (R8 / F6-04): ورودی/خروجی آتی از چک، فاکتور خرید و هزینهٔ سررسیددار + مانده خزانه.
 * داده فقط از DataProvider.getCashFlowData(؛ نه State). نبود داده/خطا/مجوز هرگز صفر نمایش داده نمی‌شود.
 */
const HORIZONS = [7, 14, 30] as const;
const money = (value: number | null) => value === null ? 'نامشخص' : formatMoney(value);
const SOURCE_LABELS: Record<string, string> = {
  cheques: 'چک‌ها', supplierBills: 'فاکتور خرید', expenses: 'هزینه‌های سررسیددار',
  treasuryAccounts: 'حساب خزانه', treasuryTransactions: 'گردش خزانه',
};
const REASONS: Record<string, string> = {
  NO_DUE_DATE: 'بدون تاریخ سررسید', BAD_DUE_DATE: 'تاریخ سررسید نامعتبر', BAD_AMOUNT: 'مبلغ نامعتبر',
  GUARANTEE: 'چک ضمانتی', VOIDED: 'باطل‌شده', SETTLED: 'تسویه/وصول‌شده', LINKED_TO_BILL: 'پوشش‌داده‌شده با چک پرداختنی'
};

export function CashFlowPanel() {
  const state = useAppStore(s => s.state);
  const canView = useMemo(() => new RBACService(state).can('finance', 'VIEW'), [state]);
  const { serverVersion } = useDataSyncStatus();
  const [scenario, setScenario] = useState<'BASE' | 'NO_RECEIPTS'>('BASE');
  const [horizon, setHorizon] = useState<number>(14);
  const [amountText, setAmountText] = useState('');
  const [reserveText, setReserveText] = useState('');
  const [payDate, setPayDate] = useState('');

  const { data: snapshot, loading, error, refetch } = useDataQuery(async provider =>
    canView ? { viewer: state.currentUserId, data: await provider.getCashFlowData() } : null,
    [canView, state.currentUserId, serverVersion]);
  const data = snapshot?.viewer === state.currentUserId ? snapshot?.data : null;

  const asOf = toLocalDateISO();
  const projection = useMemo(() => data && (data.status === 'LIVE' || data.status === 'PARTIAL')
    ? buildCashFlowProjection({ asOf, horizonDays: horizon, ...data, includeIncoming: scenario === 'BASE' })
    : null, [data, asOf, horizon, scenario]);

  const parse = (text: string): number | null => {
    const digits = toLatinDigits(text).replace(/[,٬\s]/g, '');
    if (!/^\d+$/.test(digits)) return null;
    const amount = Number(digits);
    return Number.isSafeInteger(amount) ? amount : null;
  };
  const amount = parse(amountText);
  const reserve = reserveText.trim() ? parse(reserveText) : 0;
  const canAssess = data?.bankVerification === 'VERIFIED' && data.missingSources.length === 0
    && projection?.opening.status === 'KNOWN';
  const pay = canAssess && projection && payDate && amount !== null && reserve !== null && amount > 0
    ? evaluatePayability(projection, payDate, amount, reserve) : null;

  if (!canView) return <Card padding="md" className="text-sm text-text-secondary">دسترسی مشاهده جریان نقدینگی ندارید.</Card>;
  if ((!data || loading) && !error) return <Card padding="md" className="text-sm text-text-secondary">در حال دریافت داده نقدینگی…</Card>;
  if (error || data?.status === 'UNAVAILABLE') {
    return (
      <Card padding="md" className="space-y-2 border-danger-border bg-danger-soft">
        <p className="text-sm font-bold text-danger">داده نقدینگی در دسترس نیست؛ این به‌معنای صفر بودن نیست.</p>
        <p className="text-xs text-text-secondary">{error?.message || data?.reason}</p>
        <button type="button" onClick={() => void refetch()} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs"><RefreshCw size={14} />تلاش مجدد</button>
      </Card>
    );
  }
  if (data?.status === 'RESTRICTED') return <Card padding="md" className="text-sm text-text-secondary">{data.reason || 'دسترسی به منابع نقدینگی مجاز نیست.'}</Card>;
  if (!projection || (data?.status === 'EMPTY' && data.missingSources.length === 0)) {
    return <Card padding="md" className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-text-secondary">هنوز چک، فاکتور خرید، هزینهٔ سررسیددار یا حساب خزانه‌ای ثبت نشده است.</Card>;
  }

  const op = projection.opening;
  const short = projection.firstShortfallDate;
  return (
    <div className="space-y-3" dir="rtl">
      {data?.missingSources.length ? <Card padding="md" className="border-warning/40 bg-warning/10 text-xs text-text-main">هشدار: برخی منابع نقدینگی خوانده نشده‌اند؛ نتایج ناقص‌اند و امکان‌سنجی پرداخت غیرفعال است. منابع: {data.missingSources.map(key => SOURCE_LABELS[key] || 'منبع نامشخص').join('، ')}</Card> : null}
      <Card padding="md" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-black text-text-main">جریان نقدینگی {formatCount(horizon)} روز آینده</h3>
          <div className="flex gap-1" role="group" aria-label="افق پیش‌بینی">
            {HORIZONS.map(h => (
              <button key={h} type="button" aria-pressed={horizon === h} onClick={() => setHorizon(h)}
                className={`min-h-11 rounded-lg border px-3 py-1 text-xs ${horizon === h ? 'border-primary bg-primary-soft text-primary' : 'border-border text-text-secondary'}`}>{formatCount(h)} روز</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="سناریوی نقدینگی">
          <Button type="button" size="sm" variant={scenario === 'BASE' ? 'soft' : 'ghost'} aria-pressed={scenario === 'BASE'}
            onClick={() => setScenario('BASE')}>برنامهٔ جاری</Button>
          <Button type="button" size="sm" variant={scenario === 'NO_RECEIPTS' ? 'soft' : 'ghost'} aria-pressed={scenario === 'NO_RECEIPTS'}
            onClick={() => setScenario('NO_RECEIPTS')}>بدون وصول پیش‌بینی‌شده</Button>
          {data?.updatedAt && <span className="text-caption text-text-secondary">آخرین ثبت در دادهٔ خزانه {formatAppDate(data.updatedAt, state.settings?.locale)}</span>}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-border p-3"><div className="text-text-secondary">ماندهٔ ثبت‌شدهٔ خزانه</div><div className="mt-1 font-bold tabular-nums">{money(op.status === 'KNOWN' ? op.balance : null)}</div>
            {op.status !== 'KNOWN' && <div className="mt-1 text-warning">{op.status === 'UNKNOWN' ? 'مانده افتتاحیه حساب‌ها ثبت نشده' : `${formatCount(op.unknownAccounts)} حساب بدون مانده معتبر`}</div>}</div>
          <div className="rounded-xl border border-border p-3"><div className="text-text-secondary">خالص دوره</div><div className="mt-1 font-bold tabular-nums">{money(projection.totals.net)}</div></div>
          <div className="rounded-xl border border-border p-3"><div className="text-text-secondary">ورودی / خروجی برنامه‌ریزی‌شده</div><div className="mt-1 tabular-nums">{money(projection.totals.inflow)} / {money(projection.totals.outflow)}</div></div>
          <div className="rounded-xl border border-border p-3"><div className="text-text-secondary">کمترین مانده پیش‌بینی‌شده</div><div className="mt-1 font-bold tabular-nums">{projection.lowest ? `${money(projection.lowest.balance)} · ${formatAppDate(projection.lowest.date, state.settings?.locale)}` : 'نامشخص'}</div></div>
        </div>
        {projection.lowest && !data?.missingSources.length && (
          <div className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${short ? 'border-danger-border bg-danger-soft text-danger' : 'border-border bg-canvas text-text-main'}`}>
            {short ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span>{short ? `مانده پیش‌بینی‌شده از ${formatAppDate(short, state.settings?.locale)} منفی می‌شود.` : 'در این افق، مانده پیش‌بینی‌شده منفی نمی‌شود.'}</span>
          </div>
        )}
        {(projection.overdue.inflow > 0 || projection.overdue.outflow > 0) && (
          <p className="text-xs text-warning">سررسیدگذشته: دریافتنی {money(projection.overdue.inflow)} (وصول‌نشده فرض می‌شود) و پرداختنی {money(projection.overdue.outflow)} (روز اول پرداخت فرض می‌شود).</p>
        )}
        <ChartCard title="ورودی و خروجی برنامه‌ریزی‌شده" periodLabel="مبالغ به ریال"
          sourceLabel={data?.source === 'SQLSERVER_BACKEND' ? 'اقلام خوانده‌شدهٔ خزانه از سرور' : 'دادهٔ محلی؛ فاقد تأیید بانک'} freshnessLabel="برآورد؛ تطبیق بانکی لازم است">
          <CashFlowChart days={projection.days.slice(0, 14)} />
        </ChartCard>
        {projection.days.length > 14 && <p className="text-micro text-text-secondary">نمودار ۱۴ روز اول را نشان می‌دهد؛ جمع‌ها برای کل افق است.</p>}
      </Card>

      <Card padding="md" className="space-y-2">
        <h3 className="text-sm font-black text-text-main">امکان‌سنجی پرداخت</h3>
        {!canAssess ? <p role="status" className="text-sm text-text-secondary">
          امکان‌سنجی پس از تأیید مانده و پوشش کامل منابع بانک و خزانه فعال می‌شود.
        </p> : <>
          <div className="grid gap-2 sm:grid-cols-3">
            <SearchableSelect label="تاریخ پرداخت" value={payDate} onChange={setPayDate}
              options={projection.days.map(day => ({ value: day.date, label: formatAppDate(day.date, state.settings?.locale) }))} />
            <Input label="مبلغ به ریال" inputMode="numeric" value={amountText} onChange={event => setAmountText(event.target.value)} />
            <Input label="حداقل ذخیره به ریال (اختیاری)" inputMode="numeric" value={reserveText} onChange={event => setReserveText(event.target.value)} />
          </div>
          {pay && <p role="status" className="text-sm font-semibold text-text-main">
            {pay.feasible === null ? 'پیش‌بینی برای این ورودی کامل نیست. تاریخ و اقلام بدون سررسید را بررسی کنید.'
              : pay.feasible ? `ماندهٔ برآوردی پس از پرداخت ${money(pay.projectedAfter)}.`
              : `کسری برآوردی در افق انتخابی ${money(pay.shortfall)}.`}
          </p>}
          {(reserve === null || (amountText.trim() && amount === null)) && <p className="text-sm text-danger">مبلغ را به‌صورت عدد صحیح و به ریال وارد کنید.</p>}
        </>}
      </Card>

      <Card padding="md" className="space-y-2">
        <h3 className="text-sm font-black text-text-main">تقویم سررسیدها</h3>
        {projection.items.length === 0 && <p className="text-xs text-text-secondary">سررسیدی در این افق ثبت نشده است.</p>}
        {projection.items.map(i => (
          <div key={`${i.kind}-${i.id}`} className="flex items-center justify-between gap-2 border-b border-border py-1.5 text-xs last:border-0">
            <span className="min-w-0 wrap-break-word">{i.label} <span className="text-text-secondary">· {formatAppDate(i.dueDate, state.settings?.locale)}</span></span>
            <span className={`shrink-0 font-bold tabular-nums ${i.direction === 'IN' ? 'text-success' : 'text-danger'}`}>{i.direction === 'IN' ? '+' : '−'}{money(i.amount)}</span>
          </div>
        ))}
        {projection.excluded.length > 0 && (
          <details className="text-xs text-text-secondary">
            <summary>{formatCount(projection.excluded.length)} ردیف از محاسبه خارج شد</summary>
            <ul className="mt-1 space-y-0.5">{projection.excluded.slice(0, 50).map(x => <li key={`${x.source}-${x.id}`}>{x.id} — {REASONS[x.reason]}</li>)}</ul>
          </details>
        )}
      </Card>
    </div>
  );
}

export default CashFlowPanel;
