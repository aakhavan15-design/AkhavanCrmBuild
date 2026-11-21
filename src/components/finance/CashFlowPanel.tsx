import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { formatCount, formatMoney } from '../../lib/format';
import { useDataSyncStatus } from '../../services/dataSyncController';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
import { EChartCard } from '../charts/EChartCard';
import { ledgerTrendOption } from '../charts/echartsTheme';
import { Card } from '../ui/Card';
import { QuickTaskRequest } from '../tasks/QuickTaskRequest';
import { useAppStore } from '../../lib/storage';
import { RBACService } from '../../lib/rbac';
import { useDataQuery } from '../../hooks/useDataProvider';
import { toLocalDateISO, formatAppDate } from '../../lib/utils';
import { toLatinDigits } from '../../lib/digits';
import { buildCashFlowProjection, evaluatePayability, type CashItem } from '../../lib/cashFlowEngine';

/**
 * جریان نقدینگی خزانه (R8 / F6-04): ورودی/خروجی آتی از چک، فاکتور خرید و هزینهٔ سررسیددار + مانده خزانه.
 * داده فقط از DataProvider.getCashFlowData(؛ نه State). نبود داده/خطا/مجوز هرگز صفر نمایش داده نمی‌شود.
 */
const HORIZONS = [2, 7, 30, 90] as const;
const SCENARIOS = [
  {value:'BASE',label:'طبق سررسید',description:'وصول‌های پیش‌بینی‌شده طبق سررسید و تعهدات معوق از روز اول لحاظ می‌شوند.'},
  {value:'NO_RECEIPTS',label:'محافظه‌کارانه',description:'تعهدات ثبت‌شده لحاظ می‌شوند و هیچ وصول پیش‌بینی‌شده‌ای منظور نمی‌شود.'},
  {value:'OVERDUE_RECEIPTS',label:'خوش‌بینانه',description:'وصول مطالبات معوقِ ثبت‌شده نیز در روز اول فرض می‌شود.'},
] as const;
const money = (value: number | null) => value === null ? 'نامشخص' : formatMoney(value);
const SOURCE_LABELS: Record<string, string> = {
  cheques: 'چک‌ها', supplierBills: 'فاکتور خرید', expenses: 'هزینه‌های سررسیددار',
  treasuryAccounts: 'حساب خزانه', treasuryTransactions: 'گردش خزانه', receivableSchedule: 'سررسید معتبر مطالبات بدون چک',
};
const REASONS: Record<string, string> = {
  NO_DUE_DATE: 'بدون تاریخ سررسید', BAD_DUE_DATE: 'تاریخ سررسید نامعتبر', BAD_AMOUNT: 'مبلغ نامعتبر',
  GUARANTEE: 'چک ضمانتی', VOIDED: 'باطل‌شده', SETTLED: 'تسویه/وصول‌شده', LINKED_TO_BILL: 'پوشش‌داده‌شده با چک پرداختنی'
};

export function CashFlowPanel() {
  const state = useAppStore(s => s.state);
  const rbac = useMemo(() => new RBACService(state), [state]);
  const canView = rbac.can('finance', 'VIEW');
  const navigate=useNavigate();
  const { serverVersion } = useDataSyncStatus();
  const [scenario, setScenario] = useState<(typeof SCENARIOS)[number]['value']>('BASE');
  const [followUp,setFollowUp]=useState<CashItem|null>(null);
  const [horizon, setHorizon] = useState<number>(30);
  const [amountText, setAmountText] = useState('');
  const [dueLimit, setDueLimit] = useState(10);
  const [reserveText, setReserveText] = useState('');
  const [payDate, setPayDate] = useState('');
  const followUpAccount=followUp && state.accounts.find(account=>account.id.toLowerCase()===followUp.accountId?.toLowerCase());

  const { data: snapshot, loading, error, refetch } = useDataQuery(async provider =>
    canView ? { viewer: state.currentUserId, data: await provider.getCashFlowData() } : null,
    [canView, state.currentUserId, serverVersion]);
  const data = snapshot?.viewer === state.currentUserId ? snapshot?.data : null;

  const asOf = data?.asOf ?? toLocalDateISO();
  const projection = useMemo(() => data?.source === 'SQLSERVER_BACKEND' && (data.status === 'LIVE' || data.status === 'PARTIAL')
    ? buildCashFlowProjection({ ...data, asOf, horizonDays: horizon, includeIncoming: scenario !== 'NO_RECEIPTS',
      overdueTreatment: scenario === 'OVERDUE_RECEIPTS' ? 'FIRST_DAY' : 'SEPARATE' })
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
  if (error || data?.status === 'UNAVAILABLE' || data?.source === 'CLIENT_INDEXEDDB') {
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
  const periodSize = horizon <= 7 ? 1 : 7;
  const periods: Array<{ date: string; inflow: number; outflow: number }> = [];
  projection.days.forEach((day, index) => {
    if (index % periodSize === 0) periods.push({ date: day.date, inflow: 0, outflow: 0 });
    const period = periods[periods.length - 1];
    period.inflow += day.inflow;
    period.outflow += day.outflow;
  });
  const trend = ledgerTrendOption(periods.map(period => formatAppDate(period.date, state.settings?.locale)), [
    { name: 'دریافت برنامه‌ریزی‌شده', values: periods.map(period => period.inflow), colorToken: '--c-forest' },
    { name: 'پرداخت برنامه‌ریزی‌شده', values: periods.map(period => period.outflow), colorToken: '--c-burgundy' },
  ]);
  return (
    <div className="space-y-3" dir="rtl">
      {data?.missingSources.length ? <Card padding="md" className="border-warning/40 bg-warning/10 text-xs text-text-main">هشدار: برخی منابع نقدینگی خوانده نشده‌اند؛ نتایج ناقص‌اند و امکان‌سنجی پرداخت غیرفعال است. منابع: {data.missingSources.map(key => SOURCE_LABELS[key] || 'منبع نامشخص').join('، ')}</Card> : null}
      <Card padding="md" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-black text-text-main">جریان نقدینگی {formatCount(horizon)} روز آینده</h3>
          <div className="flex gap-1" role="group" aria-label="افق پیش‌بینی">
            {HORIZONS.map(h => (
              <button key={h} type="button" aria-pressed={horizon === h} onClick={() => { setHorizon(h); setDueLimit(10); }}
                className={`min-h-11 rounded-lg border px-3 py-1 text-xs ${horizon === h ? 'border-primary bg-primary-soft text-primary' : 'border-border text-text-secondary'}`}>{formatCount(h)} روز</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="سناریوی نقدینگی">
          {SCENARIOS.map(item=><Button key={item.value} type="button" size="sm" variant={scenario===item.value ? 'soft' : 'ghost'}
            aria-pressed={scenario===item.value} onClick={()=>setScenario(item.value)}>{item.label}</Button>)}
          {data?.updatedAt && <span className="text-caption text-text-secondary">آخرین ثبت در دادهٔ خزانه {formatAppDate(data.updatedAt, state.settings?.locale)}</span>}
        </div>
        <p className="text-caption text-text-secondary">{SCENARIOS.find(item=>item.value===scenario)?.description}</p>
        <p className="text-caption text-text-secondary">
          {data?.chequeEvidence === 'ERP_MIRROR' ? 'چک‌ها از آینهٔ ERP با وضعیت نگاشت‌شده خوانده شده‌اند.' : 'چک‌های برنامهٔ خزانه هنوز با آینهٔ ERP تطبیق داده نشده‌اند.'}
        </p>
        {(data?.unverifiedCheques ?? 0) > 0 && <p className="text-caption text-warning">
          {formatCount(data?.unverifiedCheques)} چک با مبلغ یا وضعیت تأییدنشده در برآورد لحاظ نشده است.
        </p>}
        {(data?.overlappingBills ?? 0) > 0 && <p className="text-caption text-warning">
          {formatCount(data?.overlappingBills)} فاکتور خرید تا زمان تطبیق با چک‌های پرداختنی ERP از جمع پیش‌بینی کنار گذاشته شده است.
        </p>}
        <p className="text-caption text-text-secondary">این ارقام برآورد بر اساس سررسیدهای ثبت‌شده‌اند. وضعیت تطبیق بانک مستقل از این پیش‌بینی است.</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-border p-3"><div className="text-text-secondary">ماندهٔ ثبت‌شدهٔ خزانه</div><div className="mt-1 font-bold tabular-nums">{money(op.status === 'KNOWN' ? op.balance : null)}</div>
            {op.status !== 'KNOWN' && <div className="mt-1 text-warning">{op.status === 'UNKNOWN' ? 'مانده افتتاحیه حساب‌ها ثبت نشده' : `${formatCount(op.unknownAccounts)} حساب بدون مانده معتبر`}</div>}</div>
          <div className="rounded-xl border border-border p-3"><div className="text-text-secondary">خالص سررسیدهای خوانده‌شده</div><div className="mt-1 font-bold tabular-nums">{money(projection.items.length || !data?.missingSources.length ? projection.totals.net : null)}</div></div>
          <div className="rounded-xl border border-border p-3"><div className="text-text-secondary">ورودی / خروجی برنامه‌ریزی‌شده</div><div className="mt-1 tabular-nums">{money(projection.totals.inflow || (!data?.missingSources.length || scenario === 'NO_RECEIPTS') ? projection.totals.inflow : null)} / {money(projection.totals.outflow || !data?.missingSources.length ? projection.totals.outflow : null)}</div></div>
          <div className="rounded-xl border border-border p-3"><div className="text-text-secondary">کمترین مانده پیش‌بینی‌شده</div><div className="mt-1 font-bold tabular-nums">{canAssess && projection.lowest ? `${money(projection.lowest.balance)} · ${formatAppDate(projection.lowest.date, state.settings?.locale)}` : 'نامشخص'}</div></div>
        </div>
        {canAssess && projection.lowest && (
          <div className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${short ? 'border-danger-border bg-danger-soft text-danger' : 'border-border bg-canvas text-text-main'}`}>
            {short ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span>{short ? `مانده پیش‌بینی‌شده از ${formatAppDate(short, state.settings?.locale)} منفی می‌شود.` : 'در این افق، مانده پیش‌بینی‌شده منفی نمی‌شود.'}</span>
          </div>
        )}
        {!canAssess && short && <p className="rounded-xl border border-warning bg-warning-soft p-3 text-sm text-warning" role="status">
          اقلام خوانده‌شده در سناریوی انتخابی از {formatAppDate(short, state.settings?.locale)} نشانهٔ کسری دارند. میزان وجه در دسترس و سررسیدها نیازمند تطبیق‌اند.
        </p>}
        {(projection.overdue.inflow > 0 || projection.overdue.outflow > 0) && (
          <p className="text-xs text-warning">دریافتنی معوق {money(projection.overdue.inflow)} · پرداختنی معوق {money(projection.overdue.outflow)}</p>
        )}
        <EChartCard title="ورودی و خروجی برنامه‌ریزی‌شده"
          periodLabel={periodSize === 1 ? 'مبالغ روزانه به ریال' : 'مبالغ هفتگی به ریال'}
          option={{ ...trend, xAxis: { ...(trend.xAxis as object), inverse: true } }}
          empty={projection.items.length === 0} emptyMessage="سررسید منطبق در افق انتخابی ثبت نشده است"
          sourceLabel="اقلام خزانه از سرور" freshnessLabel="برآورد؛ تطبیق بانکی لازم است" />
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
        {projection.items.slice(0, dueLimit).map(i => (
          <div key={`${i.kind}-${i.id}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-1.5 text-xs last:border-0">
            <span className="min-w-0 wrap-break-word">{i.label} <span className="text-text-secondary">· {formatAppDate(i.dueDate, state.settings?.locale)}</span></span>
            <span className={`shrink-0 font-bold tabular-nums ${i.direction === 'IN' ? 'text-success' : 'text-danger'}`}>{i.direction === 'IN' ? '+' : '−'}{money(i.amount)}</span>
            {state.currentUserId && i.kind==='CHEQUE_OUT' && data?.chequeEvidence==='ERP_MIRROR' && rbac.can('tasks','CREATE') &&
              state.accounts.some(account=>account.id.toLowerCase()===i.accountId?.toLowerCase()) && <Button type="button" variant="ghost" size="sm"
              aria-label={`پیگیری ${i.label}`} onClick={()=>setFollowUp(i)}>پیگیری</Button>}
          </div>
        ))}
        {projection.items.length > dueLimit && <Button type="button" size="sm" variant="outline"
          onClick={() => setDueLimit(current => current + 10)}>سررسیدهای بیشتر</Button>}
        {projection.excluded.length > 0 && (
          <details className="text-xs text-text-secondary">
            <summary>{formatCount(projection.excluded.length)} ردیف از محاسبه خارج شد</summary>
            <ul className="mt-1 space-y-0.5">{projection.excluded.slice(0, 50).map(x => <li key={`${x.source}-${x.id}`}>{x.id} — {REASONS[x.reason]}</li>)}</ul>
          </details>
        )}
      </Card>
      {followUp && followUpAccount && state.currentUserId && <QuickTaskRequest open viewer={state.currentUserId} accounts={[followUpAccount]} onClose={()=>setFollowUp(null)}
        initial={{kind:'FINANCE',accountId:followUpAccount.id,links:[{type:'CHEQUE',id:followUp.id}],priority:'HIGH',
          dueDate:followUp.dueDate,title:`بررسی پوشش ${followUp.label}`.slice(0,160),
          description:`سررسید خوانده‌شده: ${formatAppDate(followUp.dueDate)}\nمبلغ ریالی ثبت‌شده: ${money(followUp.amount)}\nلطفاً سند منبع و وجه نقد در دسترس را بررسی و نتیجه را ثبت کنید.`}}
        initialLinkLabels={{[`CHEQUE:${followUp.id}`]:followUp.label}}
        onSaved={id=>navigate(`/tasks?request=${encodeURIComponent(id)}`)}/>}
    </div>
  );
}

export default CashFlowPanel;
