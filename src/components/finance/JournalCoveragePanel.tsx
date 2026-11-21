import { useState } from 'react';
import { getActiveDataProvider } from '../../services/dataProvider';
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

export function JournalCoveragePanel({ period, canFollowUp, focusReturns=false }: { period: MoneyPeriod; canFollowUp: boolean; focusReturns?:boolean }) {
  const [active,setActive] = useState(focusReturns);
  const [operation,setOperation] = useState<JournalOperation | ''>(focusReturns ? 'SALES_RETURN' : '');
  const [state,setState] = useState<JournalCoverageStatus | ''>('');
  const [returnReason,setReturnReason]=useState<string|undefined>();
  const [page,setPage] = useState(1);
  const [draft,setDraft] = useState('');
  const [search,setSearch] = useState('');
  const [document,setDocument] = useState<Document | null>(null);
  const [pending,setPending] = useState<string | null>(null);
  const [messages,setMessages] = useState<Record<string,{ok:boolean;text:string}>>({});
  async function createFollowUp(row:JournalCoverageRow, key:string) {
    setPending(key);
    try {
      const receipt = await getActiveDataProvider().createJournalCoverageFollowUp(period,row.operation,row.externalId);
      if (!receipt.id) throw new Error('ثبت وظیفه تأیید نشد.');
      const message = receipt.replayed ? 'این پیگیری قبلاً در وظایف ثبت شده است.' : 'پیگیری در وظایف شما ثبت شد.';
      setMessages(current => ({...current,[key]:{ok:true,text:message}}));
    } catch (error) {
      setMessages(current => ({...current,[key]:{ok:false,text:error instanceof Error ? error.message : 'ثبت پیگیری انجام نشد.'}}));
    } finally {
      setPending(null);
    }
  }
  const requestKey = JSON.stringify([period.from,period.to,operation,state,page,search,returnReason]);
  const { data,loading,error,refetch } = useDataQuery(async provider => active ? {
    requestKey, result: await provider.getJournalCoverage(period,{ operation: operation || undefined,state: state || undefined,search,returnReason,page }),
  } : null,[active,requestKey]);
  const result = data?.requestKey===requestKey ? data.result : null;

  return <details open={focusReturns ? active : undefined} className="rounded-2xl border border-border bg-surface p-3" onToggle={event => setActive(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer content-center text-sm font-bold">{focusReturns ? 'مرجوعی‌های ERP و مرجع سند' : 'پوشش اسناد حسابداری و مغایرت عملیات'}</summary>
    {active && <div className="space-y-3">
      <p className="text-caption text-text-secondary">فروش، برگشت فروش و دریافت یا پرداخت بر اساس پیوند رسمی ERP به سند گزارش می‌شوند. در دورهٔ فاقد پوشش تأییدشده، نبود پیوند فقط «سند مشاهده نشده» است.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {!focusReturns && <SearchableSelect label="عملیات" options={options(operations,'همهٔ عملیات')} value={operation}
          onChange={value => { setOperation(value as JournalOperation | ''); setPage(1); }} />}
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
          {focusReturns && (result.returnReasons?.length ? <div className="space-y-2">
            <h4 className="text-sm font-semibold">دلایل ثبت‌شده در برگشت‌های دارای یک سند معتبر</h4>
            {result.returnReasons.map(row=><button type="button" key={row.reason ?? ''}
              className="min-h-11 w-full rounded-lg px-2 text-start text-caption hover:bg-hover" aria-pressed={returnReason===(row.reason ?? '')}
              onClick={()=>{setReturnReason(current=>current===(row.reason ?? '') ? undefined : row.reason ?? '');setState('VALID');setPage(1);}}>
              <div className="flex justify-between gap-2"><bdi className="wrap-break-word">{row.reason || 'علت ثبت نشده'}</bdi><span>{formatCount(row.count)} سند</span></div>
              <progress className="w-full accent-primary" aria-label={row.reason || 'علت ثبت نشده'} value={row.count} max={result.returnReasons?.[0].count ?? row.count} />
            </button>)}
            {returnReason!==undefined && <Button type="button" size="sm" variant="ghost" onClick={()=>{setReturnReason(undefined);setPage(1);}}>پاک کردن فیلتر علت</Button>}
          </div> : <p className="text-caption">در این بازه، برگشت فروش با یک سند معتبر مشاهده نشد.</p>)}
          {result.counts.length>0 && <div className="flex flex-wrap gap-1" aria-label="شمار عملیات به تفکیک وضعیت">
            {result.counts.map(row => <Button key={row.coverageStatus} type="button" size="sm" variant={state===row.coverageStatus ? 'soft' : 'ghost'}
              aria-pressed={state===row.coverageStatus} onClick={() => { setState(state===row.coverageStatus ? '' : row.coverageStatus); setPage(1); }}>
              {statuses[row.coverageStatus]} · {formatCount(row.count)}
            </Button>)}
          </div>}
          {!result.items.length ? <EmptyState surface="finance_journal_control" title="عملیات منطبق یافت نشد" compact /> :
            <ul className="divide-y divide-border">
              {result.items.map(row => {
                const key = JSON.stringify([row.operation,row.externalId,row.coverageStatus]);
                const message = messages[key];
                return <li key={key} className="space-y-1 py-2 text-caption">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-bold wrap-break-word">{operations[row.operation]} <bdi>{row.documentNumber || row.externalId}</bdi> · {formatAppDate(row.date)}</p>
                  <p>{statuses[row.coverageStatus]}</p>
                </div>
                <p className="text-text-secondary">{row.accountTitle && `${row.accountTitle} · `}
                  {row.amount===null ? 'مبلغ نامشخص' : <>{formatDecimalString(row.amount)} <bdi>{row.currency==='IRR' ? 'ریال' : row.currency}</bdi></>}</p>
                {row.operation==='SALES_RETURN' && <p className="text-text-secondary">علت ثبت‌شده <bdi>{row.returnReason || 'نامشخص'}</bdi></p>}
                {row.documents.length>0 && <div className="flex flex-wrap gap-1" aria-label="اسناد مرتبط">
                  {row.documents.map(item => item.quality==='VALID' ? <Button key={item.id} type="button" size="sm" variant="outline"
                    onClick={() => setDocument(item)}>آرتیکل‌های سند {item.number}</Button> :
                    <span key={item.id} className="text-text-secondary">سند <bdi>{item.number}</bdi> · نیازمند بررسی</span>)}
                </div>}
                {row.validCount+row.lateCount>row.documents.length && <p className="text-text-secondary">شواهد این ردیف حداکثر پنج سند اخیر را نشان می‌دهد.</p>}
                {canFollowUp && ['LATE','INVALID','VOID','MISSING','NOT_OBSERVED'].includes(row.coverageStatus) && !message?.ok &&
                  <Button type="button" size="sm" variant="outline" disabled={pending!==null} onClick={() => void createFollowUp(row,key)}>
                    {pending===key ? 'در حال ثبت…' : 'ثبت وظیفهٔ پیگیری برای من'}
                  </Button>}
                {message && <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'text-success' : 'text-danger'}>{message.text}</p>}
              </li>;
              })}
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


export function JournalFollowUpTaskEvidence({ taskId }: { taskId: string }) {
  const [open,setOpen] = useState(false);
  const { data,loading,error,refetch } = useDataQuery(async provider => open
    ? { taskId, evidence:await provider.getJournalFollowUpEvidence(taskId) } : null,
    [open,taskId]);
  const evidence = data?.taskId===taskId ? data.evidence : null;
  return <details className="rounded-xl border border-border p-2" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer content-center font-bold">شاهد مالی ثبت‌شده</summary>
    {open && (error
      ? <EmptyState surface="finance_journal_control" title="شاهد مالی در دسترس نیست"
        actionLabel="تلاش دوباره" onAction={() => void refetch()} compact />
      : loading || !evidence ? <LoadingState label="در حال دریافت شاهد مالی" />
      : <div className="space-y-1 p-2 text-caption">
        <p className="font-bold">{statuses[evidence.status]}</p>
        <p>{evidence.reason}</p>
        <p className="wrap-break-word">{operations[evidence.operation]} <bdi>{evidence.externalId}</bdi> · {formatAppDate(evidence.date)}</p>
        {evidence.amount!==null && <p>مبلغ عملیات {formatDecimalString(evidence.amount)} <bdi>{evidence.currency==='IRR' ? 'ریال' : evidence.currency}</bdi></p>}
        {evidence.documents.length>0 && <p>اسناد مرتبط {evidence.documents.map(item => item.number).join('، ')}</p>}
        <p className="text-text-secondary">وضعیت هنگام ایجاد وظیفه · {formatAppDate(evidence.recordedAt)}</p>
      </div>)}
  </details>;
}
