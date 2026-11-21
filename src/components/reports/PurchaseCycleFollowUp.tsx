import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDataQuery } from '../../hooks/useDataProvider';
import { formatCount, formatDecimalString } from '../../lib/format';
import { formatAppDate } from '../../lib/utils';
import { useDataSyncStatus } from '../../services/dataSyncController';
import type { PurchaseCycleRow, PurchaseCycleView } from '../../services/purchaseCycle';
import type { Account } from '../../types';
import { QuickTaskRequest } from '../tasks/QuickTaskRequest';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Input } from '../ui/Input';
import { LoadingState } from '../ui/LoadingState';
import { SearchableSelect } from '../ui/SearchableSelect';

const views=[{value:'follow-up',label:'اولویت پیگیری'},{value:'all',label:'همهٔ مشتریان دارای فاکتور'}];
const observedMoney=(value:string)=>Number(value)>0 ? `${formatDecimalString(value)} ریال` : 'فاکتوری مشاهده نشده';

export function PurchaseCycleFollowUp({viewer,accounts,canCreate}:{viewer:string;accounts:Account[];canCreate:boolean}) {
  const [view,setView]=useState<PurchaseCycleView>('all');
  const [search,setSearch]=useState('');
  const [activeSearch,setActiveSearch]=useState('');
  const [page,setPage]=useState(1);
  const [selected,setSelected]=useState<PurchaseCycleRow|null>(null);
  const navigate=useNavigate();
  const {serverVersion}=useDataSyncStatus();
  const requestKey=JSON.stringify([viewer,view,activeSearch,page,serverVersion]);
  const {data,loading,error,refetch}=useDataQuery(async provider=>({requestKey,
    report:await provider.getPurchaseCycle(activeSearch,view,page),
  }),[requestKey]);
  const report=data?.requestKey===requestKey ? data.report : null;
  const taskAccount=selected ? accounts.find(account=>account.id.toLowerCase()===selected.accountId.toLowerCase()) : null;

  return <Card padding="md" className="space-y-3">
    <div>
      <h3 className="text-sm font-bold">چرخهٔ خرید و اولویت پیگیری</h3>
      <p className="text-caption text-text-secondary">بر اساس فاکتورهای قطعیِ مشاهده‌شده در ۳۶۵ روز اخیر، به تفکیک منبع ERP. کامل بودن دریافت ویزیت و فاکتور تأیید نشده است.</p>
    </div>
    <form className="flex flex-wrap items-end gap-2" onSubmit={event=>{event.preventDefault();setActiveSearch(search.trim());setPage(1);}}>
      <Input label="نام مشتری" value={search} onChange={event=>setSearch(event.target.value)} maxLength={100} />
      <Button type="submit" variant="outline">جست‌وجو</Button>
      <SearchableSelect label="نمای مشتریان" value={view} options={views} onChange={value=>{setView(value as PurchaseCycleView);setPage(1);}} />
    </form>
    {error ? <EmptyState surface="purchase-follow-up" title="گزارش در دسترس نیست" description={error.message} compact actionLabel="تلاش دوباره" onAction={()=>void refetch()} />
      : loading || !report ? <LoadingState label="در حال خواندن فاکتورهای ERP" /> : <>
        {!report.configured && <p className="text-caption text-warning">اولویت پیگیری بعد از تنظیم حداقل فاصلهٔ خرید و حداقل فروش در سیاست سازمان مشخص می‌شود.</p>}
        <p className="text-caption text-text-secondary">تاریخ مبنا {formatAppDate(report.asOf)}</p>
        {!report.rows.length ? <EmptyState surface="purchase-follow-up" title="فاکتور منطبق در دادهٔ دریافت‌شده مشاهده نشد" compact /> :
          <ul className="divide-y divide-border">{report.rows.map(row=><li key={`${row.accountId}:${row.source}`} className="space-y-1 py-2">
            <details>
              <summary className="min-h-11 cursor-pointer py-1 text-sm font-semibold">
                {row.name} {row.followUp===1 && <span className="text-caption text-warning">· اولویت پیگیری</span>}
                <span className="block text-caption font-normal text-text-secondary">{row.owner || 'مسئول نامشخص'} · {row.territory || 'منطقه نامشخص'}</span>
              </summary>
              <dl className="grid grid-cols-1 gap-x-3 gap-y-1 py-2 text-caption sm:grid-cols-2">
                <div><dt className="text-text-secondary">فاصلهٔ فعلی / چرخهٔ معمول</dt><dd>{formatCount(row.daysSince)} روز / {row.medianGap===null?'سابقه کافی نیست':`${formatCount(row.medianGap)} روز`}</dd></div>
                <div><dt className="text-text-secondary">آخرین خرید مشاهده‌شده</dt><dd>{formatAppDate(row.lastPurchase)} · {row.lastInvoiceNumber ? <bdi>{row.lastInvoiceNumber}</bdi> : `${formatCount(row.lastInvoiceCount)} فاکتور`}</dd></div>
                <div><dt className="text-text-secondary">۹۰ روز اخیر / ۹۰ روز پیش از آن</dt><dd>{observedMoney(row.recentSales)} / {observedMoney(row.previousSales)}</dd></div>
                <div><dt className="text-text-secondary">ثبت ورود در برنامهٔ ۳۰ روز اخیر همین مسئول</dt><dd>{row.planned>0 ? `${formatCount(row.checkedIn)} از ${formatCount(row.planned)} برنامه` : 'برنامه‌ای در دادهٔ مشاهده‌شده وجود ندارد'}</dd></div>
                <div><dt className="text-text-secondary">آخرین ثبت ورود این مسئول</dt><dd>{row.latestCheckIn ? formatAppDate(row.latestCheckIn) : 'نامشخص'}</dd></div>
                <div><dt className="text-text-secondary">منبع و تازگی فاکتورها</dt><dd><bdi>{row.source}</bdi> · {formatAppDate(row.lastSynced)}</dd></div>
              </dl>
              {row.followUp===1 && <p className="text-caption text-warning">فاصلهٔ خرید از الگوی ثبت‌شده بیشتر شده است. در تماس یا مراجعه، وضعیت خرید و علت احتمالی را بررسی کنید.</p>}
              <div className="flex flex-wrap items-center gap-2">
                <Link className="inline-flex min-h-11 items-center text-sm text-primary" to={`/accounts/${encodeURIComponent(row.accountId)}`}>پروندهٔ مشتری</Link>
                {canCreate && accounts.some(account=>account.id.toLowerCase()===row.accountId.toLowerCase()) &&
                  <Button type="button" variant="outline" size="sm" onClick={()=>setSelected(row)}>ثبت پیگیری</Button>}
              </div>
            </details>
          </li>)}</ul>}
        {(page>1 || report.hasMore) && <nav aria-label="صفحه‌بندی چرخهٔ خرید" className="flex items-center justify-between">
          <Button type="button" variant="ghost" disabled={page===1} onClick={()=>setPage(current=>current-1)}>قبلی</Button>
          <span className="text-caption">صفحهٔ {formatCount(page)}</span>
          <Button type="button" variant="ghost" disabled={!report.hasMore} onClick={()=>setPage(current=>current+1)}>بعدی</Button>
        </nav>}
      </>}
    {selected && taskAccount && <QuickTaskRequest open viewer={viewer} accounts={[taskAccount]} onClose={()=>setSelected(null)}
      initial={{kind:'GENERAL',accountId:taskAccount.id,priority:selected.followUp===1?'HIGH':'NORMAL',title:`پیگیری چرخهٔ خرید ${selected.name}`.slice(0,160),
        description:`آخرین خرید مشاهده‌شده: ${formatAppDate(selected.lastPurchase)}${selected.lastInvoiceNumber ? `، فاکتور ${selected.lastInvoiceNumber}` : ''}\nمنبع ERP: ${selected.source}\nلطفاً علت فاصلهٔ خرید و اقدام بعدی را در پرونده ثبت کنید.`}}
      onSaved={id=>navigate(`/tasks?request=${encodeURIComponent(id)}`)} />}
  </Card>;
}
