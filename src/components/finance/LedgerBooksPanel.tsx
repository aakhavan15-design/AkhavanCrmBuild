import { useState } from 'react';
import { useDataQuery } from '../../hooks/useDataProvider';
import { useLedgerBookScope } from '../../hooks/useLedgerBookScope';
import { formatCount, formatDecimalString } from '../../lib/format';
import { toLocalDateISO } from '../../lib/utils';
import { useDataSyncStatus } from '../../services/dataSyncController';
import type { LedgerBookRow, LedgerRole } from '../../services/officialLedger';
import { LedgerMovementList } from '../shared/SubsidiaryBalancesPanel';
import { Button } from '../ui/Button';
import { BottomSheet } from '../ui/BottomSheet';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { EmptyState } from '../ui/EmptyState';
import { Input } from '../ui/Input';
import { LoadingState } from '../ui/LoadingState';
import { SearchableSelect } from '../ui/SearchableSelect';

const roles = [{ value:'',label:'همهٔ سرفصل‌ها' },{ value:'RECEIVABLE',label:'مطالبات دفتری' },{ value:'PAYABLE',label:'بدهی دفتری' }];
const day = 86_400_000;

export function LedgerBooksPanel({ viewer }: { viewer?: string | null }) {
  const {scope} = useLedgerBookScope();
  const {serverVersion} = useDataSyncStatus();
  const [active,setActive] = useState(false);
  const today = toLocalDateISO();
  const [period,setPeriod] = useState({from:new Date(Date.parse(today)-29*day).toISOString().slice(0,10),to:today});
  const [draft,setDraft] = useState(period);
  const [role,setRole] = useState<LedgerRole | ''>('');
  const [draftSearch,setDraftSearch] = useState('');
  const [search,setSearch] = useState('');
  const [page,setPage] = useState(1);
  const [selected,setSelected] = useState<LedgerBookRow | null>(null);
  const validRange = draft.from<=draft.to && Number.isFinite(Date.parse(draft.from))
    && Date.parse(draft.to)-Date.parse(draft.from)<=365*day;
  const requestKey = JSON.stringify([viewer,scope,period,role,search,page]);
  const query = useDataQuery(async provider => active ? { requestKey,
    report:await provider.getLedgerBooks({...scope,...period,role:role || undefined,search,page}),
  } : null,[active,requestKey,serverVersion]);
  const report = query.data?.requestKey===requestKey ? query.data.report : null;
  const ready = report && report.status!=='UNAVAILABLE' ? report : null;
  const unit = ready?.currency==='IRR' ? 'ریال' : ready?.currency ?? '';
  const amount = (value: string | null) => value===null ? 'نامشخص' : `${formatDecimalString(value)} ${unit}`;

  return <details className="rounded-2xl border border-border bg-surface p-3" onToggle={event => setActive(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer content-center text-sm font-bold">مرور دفتر و تراز آزمایشی</summary>
    {active && <div className="space-y-3">
      <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={event => {
        event.preventDefault();
        if (validRange) { setPeriod(draft); setPage(1); setSelected(null); }
      }}>
        <fieldset className="min-w-0"><legend className="text-caption">از تاریخ اثر مالی</legend>
          <CustomDatePicker value={draft.from} onChange={from => setDraft({...draft,from})}/></fieldset>
        <fieldset className="min-w-0"><legend className="text-caption">تا تاریخ اثر مالی</legend>
          <CustomDatePicker value={draft.to} onChange={to => setDraft({...draft,to})}/></fieldset>
        <Button type="submit" variant="outline" disabled={!validRange}>اعمال بازه</Button>
        {!validRange && <p role="alert" className="text-caption text-danger">یک بازهٔ معتبر حداکثر ۳۶۶روزه انتخاب کنید.</p>}
      </form>
      <SearchableSelect label="نوع مانده" options={roles} value={role}
        onChange={value => { setRole(value as LedgerRole | ''); setPage(1); setSelected(null); }}/>
      <form className="flex items-end gap-2" onSubmit={event => { event.preventDefault(); setSearch(draftSearch.trim()); setPage(1); }}>
        <div className="min-w-0 flex-1"><Input label="نام حساب، معین، تفصیلی یا طرف‌حساب" maxLength={100} type="search"
          value={draftSearch} onChange={event => setDraftSearch(event.target.value)}/></div>
        <Button type="submit" variant="outline">جست‌وجو</Button>
      </form>
      {query.error ? <EmptyState surface="finance_ledger_books" title="دریافت دفتر ممکن نیست" actionLabel="تلاش دوباره" onAction={() => void query.refetch()} />
        : query.loading || !report ? <LoadingState label="در حال دریافت آرتیکل‌های مالی" />
        : !ready ? <EmptyState surface="finance_ledger_books" title={report.status==='UNAVAILABLE' ? report.reason : 'دفتر در دسترس نیست'} compact />
        : <>
          {ready.status==='PARTIAL' && <p role="status" className="text-caption text-warning">پوشش کامل دفتر گواهی نشده است. گردش مشاهده‌شده نمایش داده می‌شود و مانده‌ها نامشخص‌اند.</p>}
          <p className="text-caption text-text-secondary">{ready.title} · {unit}</p>
          <dl className="grid gap-2 rounded-xl border border-border p-3 text-caption sm:grid-cols-3">
            <div><dt>جمع بدهکار دوره</dt><dd>{amount(ready.totals.debit)}</dd></div>
            <div><dt>جمع بستانکار دوره</dt><dd>{amount(ready.totals.credit)}</dd></div>
            <div><dt>{role ? 'خالص گردش گروه حساب' : 'اختلاف بدهکار و بستانکار'}</dt><dd>{amount(ready.totals.difference)}</dd></div>
          </dl>
          {search && <p className="text-caption text-text-secondary">جست‌وجو فقط فهرست حساب‌ها را محدود می‌کند.</p>}
          {!ready.items.length ? <EmptyState surface="finance_ledger_books" title="حساب منطبق پیدا نشد" compact /> :
            <ul className="divide-y divide-border">
              {ready.items.map(row => <li key={JSON.stringify([row.accountCode,row.detailCode])}>
                <button type="button" className="min-h-11 w-full rounded-lg p-2 text-start hover:bg-hover" onClick={() => setSelected(row)}>
                  <span className="block wrap-break-word font-bold">{row.title || 'حساب ERP'} <bdi>{row.accountCode}</bdi></span>
                  <span className="block wrap-break-word text-caption text-text-secondary">
                    {row.detailCode && <>تفصیلی <bdi>{row.detailCode}</bdi> · </>}
                    {row.party && <>{row.party} · </>}
                    {row.parentCode && <>والد <bdi>{row.parentCode}</bdi> · </>}{formatCount(row.articleCount)} آرتیکل
                  </span>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-caption tabular-nums sm:grid-cols-4">
                    <div><dt>ماندهٔ ابتدا</dt><dd>{amount(row.opening)}</dd></div>
                    <div><dt>بدهکار دوره</dt><dd>{amount(row.debit)}</dd></div>
                    <div><dt>بستانکار دوره</dt><dd>{amount(row.credit)}</dd></div>
                    <div><dt>ماندهٔ پایان</dt><dd>{amount(row.closing)}</dd></div>
                  </dl>
                </button>
              </li>)}
            </ul>}
          <nav aria-label="صفحه‌بندی دفتر" className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" disabled={page<=1} onClick={() => setPage(page-1)}>قبلی</Button>
            <span className="text-caption">صفحهٔ {formatCount(page)}</span>
            <Button type="button" variant="ghost" disabled={!ready.hasMore} onClick={() => setPage(page+1)}>بعدی</Button>
          </nav>
          {selected && <BottomSheet isOpen onClose={() => setSelected(null)} title={selected.title || 'گردش حساب'}
            subtitle="آرتیکل‌های همین حساب در بازهٔ انتخابی">
            <LedgerMovementList unit={unit} filter={{
              source:ready.source,currency:ready.currency,subsidiaryCode:selected.accountCode,
              detailKey:selected.detailCode ?? undefined, withoutDetail:selected.detailCode===null,
              role:role || undefined,activityOnly:true,
              fromDate:period.from,toDate:period.to,
            }}/>
          </BottomSheet>}
        </>}
    </div>}
  </details>;
}
