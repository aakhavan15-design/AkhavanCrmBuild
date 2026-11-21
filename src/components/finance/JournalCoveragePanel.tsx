import { useState } from 'react';
import { useDataQuery } from '../../hooks/useDataProvider';
import { formatCount, formatDecimalString } from '../../lib/format';
import { formatAppDate } from '../../lib/utils';
import type { JournalCoverageRow, JournalCoverageStatus, JournalOperation, MoneyPeriod } from '../../services/moneyIntelligence';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Input } from '../ui/Input';
import { LoadingState } from '../ui/LoadingState';
import { SearchableSelect } from '../ui/SearchableSelect';

const statuses: Record<JournalCoverageStatus, string> = {
  VALID: 'سند معتبر', MULTIPLE: 'چند سند معتبر', LATE: 'ثبت پس از پایان دوره', PENDING: 'در انتظار ثبت قطعی',
  INVALID: 'سند نیازمند بررسی', VOID: 'سند ابطال‌شده', MISSING: 'عملیات فاقد سند', NOT_OBSERVED: 'سند مشاهده نشده',
};
const operations: Record<JournalOperation, string> = { SALES_INVOICE: 'فاکتور فروش', SALES_RETURN: 'برگشت فروش', PAYMENT: 'دریافت و پرداخت' };
const options = (values: Record<string,string>, all: string) => [{ value: '',label: all },
  ...Object.entries(values).map(([value,label]) => ({ value,label }))];

type Document = JournalCoverageRow['documents'][number];
function JournalDocument({ selected, onClose }: { selected: Document; onClose: () => void }) {
  const [page,setPage] = useState(1);
  const { data,loading,error,refetch } = useDataQuery(provider => provider.getJournalLines({ journalId: selected.id },{ page,pageSize: 25 }),
    [selected.id,page]);
  return <BottomSheet isOpen onClose={onClose} title={`سند ${selected.number}`} subtitle={formatAppDate(selected.date)}>
    {error ? <EmptyState surface="finance_journal_control" title="ریز آرتیکل‌ها در دسترس نیست" actionLabel="تلاش دوباره" onAction={() => void refetch()} />
      : loading || data?.page!==page ? <LoadingState label="در حال دریافت آرتیکل‌ها" />
      : !data.items.length ? <EmptyState surface="finance_journal_control" title="آرتیکل مجاز در این سند یافت نشد" compact />
      : <>
        <ul className="divide-y divide-border">
          {data.items.map(line => <li key={String(line.id)} className="space-y-1 py-2 text-caption">
            <p>آرتیکل <bdi>{line.lineNumber == null ? String(line.externalLineId ?? '') : formatCount(Number(line.lineNumber))}</bdi>
              {' · '}معین <bdi>{String(line.subsidiaryCode ?? '')}</bdi>
              {line.detailKey!=null && <> · تفصیلی <bdi>{String(line.detailKey)}</bdi></>}</p>
            {typeof line.description==='string' && line.description && <p className="wrap-break-word text-text-secondary">{line.description}</p>}
            <p>بدهکار {formatDecimalString(String(line.debitAmount ?? ''))} · بستانکار {formatDecimalString(String(line.creditAmount ?? ''))}
              {' '}<bdi>{line.currencyCode==='IRR' ? 'ریال' : String(line.currencyCode ?? '')}</bdi></p>
          </li>)}
        </ul>
        <nav aria-label="صفحه‌بندی آرتیکل‌ها" className="flex justify-between gap-2 pt-2">
          <Button type="button" variant="ghost" disabled={page<=1} onClick={() => setPage(page-1)}>قبلی</Button>
          <Button type="button" variant="ghost" disabled={page>=data.totalPages} onClick={() => setPage(page+1)}>بعدی</Button>
        </nav>
      </>}
  </BottomSheet>;
}

export function JournalCoveragePanel({ period }: { period: MoneyPeriod }) {
  const [active,setActive] = useState(false);
  const [operation,setOperation] = useState<JournalOperation | ''>('');
  const [state,setState] = useState<JournalCoverageStatus | ''>('');
  const [page,setPage] = useState(1);
  const [draft,setDraft] = useState('');
  const [search,setSearch] = useState('');
  const [document,setDocument] = useState<Document | null>(null);
  const requestKey = JSON.stringify([period.from,period.to,operation,state,page,search]);
  const { data,loading,error,refetch } = useDataQuery(async provider => active ? {
    requestKey, result: await provider.getJournalCoverage(period,{ operation: operation || undefined,state: state || undefined,search,page }),
  } : null,[active,requestKey]);
  const result = data?.requestKey===requestKey ? data.result : null;

  return <details className="rounded-2xl border border-border bg-surface p-3" onToggle={event => setActive(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer content-center text-sm font-bold">پوشش اسناد حسابداری و مغایرت عملیات</summary>
    {active && <div className="space-y-3">
      <p className="text-caption text-text-secondary">فروش، برگشت فروش و دریافت یا پرداخت بر اساس پیوند رسمی ERP به سند گزارش می‌شوند. در دورهٔ فاقد پوشش تأییدشده، نبود پیوند فقط «سند مشاهده نشده» است.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <SearchableSelect label="عملیات" options={options(operations,'همهٔ عملیات')} value={operation}
          onChange={value => { setOperation(value as JournalOperation | ''); setPage(1); }} />
        <SearchableSelect label="وضعیت سند" options={options(statuses,'همهٔ وضعیت‌ها')} value={state}
          onChange={value => { setState(value as JournalCoverageStatus | ''); setPage(1); }} />
      </div>
      <form className="flex items-end gap-2" onSubmit={event => { event.preventDefault(); setSearch(draft.trim()); setPage(1); }}>
        <div className="min-w-0 flex-1"><Input label="شمارهٔ عملیات یا طرف‌حساب" type="search" maxLength={100}
          value={draft} onChange={event => setDraft(event.target.value)} /></div>
        <Button type="submit" size="sm" variant="outline">جست‌وجو</Button>
      </form>
      {error ? <EmptyState surface="finance_journal_control" title="دریافت پوشش اسناد ممکن نیست" actionLabel="تلاش دوباره" onAction={() => void refetch()} />
        : loading || !result ? <LoadingState label="در حال تطبیق اسناد" />
        : result.status==='UNAVAILABLE' ? <EmptyState surface="finance_journal_control" title="منبع مالی برای این گزارش تنظیم نشده است" compact />
        : <>
          {result.verifiedThrough && <p className="text-caption text-text-secondary">آخرین تاریخ گواهی پوشش {formatAppDate(result.verifiedThrough)}</p>}
          {result.counts.length>0 && <div className="flex flex-wrap gap-1" aria-label="شمار عملیات به تفکیک وضعیت">
            {result.counts.map(row => <Button key={row.coverageStatus} type="button" size="sm" variant={state===row.coverageStatus ? 'soft' : 'ghost'}
              aria-pressed={state===row.coverageStatus} onClick={() => { setState(state===row.coverageStatus ? '' : row.coverageStatus); setPage(1); }}>
              {statuses[row.coverageStatus]} · {formatCount(row.count)}
            </Button>)}
          </div>}
          {!result.items.length ? <EmptyState surface="finance_journal_control" title="عملیات منطبق یافت نشد" compact /> :
            <ul className="divide-y divide-border">
              {result.items.map(row => <li key={`${row.operation}:${row.externalId}`} className="space-y-1 py-2 text-caption">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-bold wrap-break-word">{operations[row.operation]} <bdi>{row.documentNumber || row.externalId}</bdi> · {formatAppDate(row.date)}</p>
                  <p>{statuses[row.coverageStatus]}</p>
                </div>
                <p className="text-text-secondary">{row.accountTitle && `${row.accountTitle} · `}
                  {row.amount===null ? 'مبلغ نامشخص' : <>{formatDecimalString(row.amount)} <bdi>{row.currency==='IRR' ? 'ریال' : row.currency}</bdi></>}</p>
                {row.documents.length>0 && <div className="flex flex-wrap gap-1" aria-label="اسناد مرتبط">
                  {row.documents.map(item => item.quality==='VALID' ? <Button key={item.id} type="button" size="sm" variant="outline"
                    onClick={() => setDocument(item)}>آرتیکل‌های سند {item.number}</Button> :
                    <span key={item.id} className="text-text-secondary">سند <bdi>{item.number}</bdi> · نیازمند بررسی</span>)}
                </div>}
                {row.validCount+row.lateCount>row.documents.length && <p className="text-text-secondary">شواهد این ردیف حداکثر پنج سند اخیر را نشان می‌دهد.</p>}
              </li>)}
            </ul>}
          <nav aria-label="صفحه‌بندی پوشش اسناد" className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" disabled={page<=1} onClick={() => setPage(page-1)}>قبلی</Button>
            <span className="text-caption">صفحهٔ {formatCount(page)}</span>
            <Button type="button" variant="ghost" disabled={!result.hasMore} onClick={() => setPage(page+1)}>بعدی</Button>
          </nav>
        </>}
      {document && <JournalDocument key={document.id} selected={document} onClose={() => setDocument(null)} />}
    </div>}
  </details>;
}
