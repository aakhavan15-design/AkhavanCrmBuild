import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDataQuery } from '../../hooks/useDataProvider';
import { formatCount, formatDecimalString } from '../../lib/format';
import { formatAppDate } from '../../lib/utils';
import { useDataSyncStatus } from '../../services/dataSyncController';
import type { PurchaseCoverageScope, PurchaseCycleRow, PurchaseCycleView, PurchaseProductHint } from '../../services/purchaseCycle';
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

function PurchaseProductHints({account,source,onSelect}:{account:string;source:string;onSelect?:(item:PurchaseProductHint)=>void}) {
  const [open,setOpen]=useState(false);
  const {serverVersion}=useDataSyncStatus();
  const {data,loading,error,refetch}=useDataQuery(provider=>open ? provider.getPurchaseProductHints(account,source) : Promise.resolve(null),
    [open,account,source,serverVersion]);
  return <div className="space-y-2">
    <Button type="button" variant="ghost" size="sm" aria-expanded={open} onClick={()=>setOpen(current=>!current)}>کالاهای قابل پیگیری</Button>
    {open && (error ? <EmptyState surface="purchase-product-hints" title="دریافت ردیف فاکتور ممکن نیست" compact
      actionLabel="تلاش دوباره" onAction={()=>void refetch()} /> : loading || !data ? <LoadingState label="در حال بررسی ردیف فاکتورها" /> : <>
      <p className="text-caption text-text-secondary">در دو روز یا بیشتر از بازهٔ قبلی خرید ثبت شده و در فاکتورهای دریافتی ۹۰ روز اخیر مشاهده نشده است. موجودی و علت تغییر باید بررسی شوند.</p>
      {data.rows.length ? <ul className="divide-y divide-border">{data.rows.map(item=><li key={item.productId}
        className="flex flex-wrap items-center justify-between gap-2 py-2 text-caption">
        <div className="min-w-0 wrap-break-word"><p className="font-semibold">{item.name} {item.sku && <bdi>· {item.sku}</bdi>}</p>
          <p>{formatCount(item.priorDays)} روز خرید · {formatAppDate(item.lastSeen)} · فاکتور <bdi>{item.lastInvoiceNumber}</bdi></p></div>
        {onSelect && <Button type="button" variant="outline" size="sm" onClick={()=>onSelect(item)}>پیگیری کالا</Button>}
      </li>)}</ul> : <p className="text-caption">کالایی با این الگو در دادهٔ دریافت‌شده مشاهده نشد.</p>}
    </>)}
  </div>;
}

export function PurchaseCycleFollowUp({viewer,accounts,canCreate}:{viewer:string;accounts:Account[];canCreate:boolean}) {
  const [view,setView]=useState<PurchaseCycleView>('all');
  const [search,setSearch]=useState('');
  const [activeSearch,setActiveSearch]=useState('');
  const [page,setPage]=useState(1);
  const [scope,setScope]=useState<PurchaseCoverageScope>();
  const [coverageOpen,setCoverageOpen]=useState(false);
  const [selection,setSelection]=useState<{row:PurchaseCycleRow; product?:PurchaseProductHint}|null>(null);
  const selected=selection?.row;
  const navigate=useNavigate();
  const {serverVersion}=useDataSyncStatus();
  const requestKey=JSON.stringify([viewer,view,activeSearch,page,serverVersion,scope]);
  const {data,loading,error,refetch}=useDataQuery(async provider=>({requestKey,
    report:await provider.getPurchaseCycle(activeSearch,view,page,scope),
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
        {(report.coverage?.length ?? 0)>0 && <details open={coverageOpen} onToggle={event=>setCoverageOpen(event.currentTarget.open)} className="rounded-xl border border-border p-2">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">پوشش ثبت ویزیت به تفکیک منطقه و مسئول</summary>
          <p className="pb-1 text-caption text-text-secondary">برنامه‌های ۳۰ روز اخیرِ مشتریان دارای فاکتور مشاهده‌شده. پوشش، سهم برنامه‌های دارای ثبت ورود است.</p>
          {scope && <Button type="button" variant="ghost" size="sm" onClick={()=>{setScope(undefined);setPage(1);}}>پاک‌کردن فیلتر منطقه و مسئول</Button>}
          <ul className="divide-y divide-border">{report.coverage.map(entry=>{
            const selectedGroup=scope?.territory===entry.territoryId && scope?.owner===entry.ownerId;
            const percent=entry.planned ? new Intl.NumberFormat('fa-IR',{style:'percent',maximumFractionDigits:1}).format(entry.checkedIn/entry.planned) : null;
            return <li key={`${entry.territoryId}:${entry.ownerId}`}>
              <button type="button" className="min-h-11 w-full rounded-lg px-1.5 py-2 text-start hover:bg-hover" aria-pressed={selectedGroup}
                onClick={()=>{setScope(selectedGroup ? undefined : {territory:entry.territoryId,owner:entry.ownerId});setPage(1);}}>
                <span className="block text-sm font-semibold">{entry.territory || 'منطقهٔ نامشخص'} · {entry.owner}</span>
                <span className="mt-1 block text-caption">{formatCount(entry.observedCustomers)} مشتری · {entry.needingFollowUp===null ? 'اولویت نامشخص' : `${formatCount(entry.needingFollowUp)} نیازمند پیگیری`}</span>
                <span className="block text-caption text-text-secondary">{percent ? `${percent} پوشش، ${formatCount(entry.checkedIn)} ثبت ورود از ${formatCount(entry.planned)} برنامه` : 'برنامهٔ ثبت‌شده در دسترس نیست'}</span>
              </button>
            </li>;
          })}</ul>
        </details>}
        {!report.rows.length ? <EmptyState surface="purchase-follow-up" title="فاکتور منطبق در دادهٔ دریافت‌شده مشاهده نشد" compact /> :
          <ul className="divide-y divide-border">{report.rows.map(row=>{
            const canFollow=canCreate && accounts.some(account=>account.id.toLowerCase()===row.accountId.toLowerCase());
            return <li key={`${row.accountId}:${row.source}`} className="space-y-1 py-2">
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
                {canFollow && <Button type="button" variant="outline" size="sm" onClick={()=>setSelection({row})}>ثبت پیگیری</Button>}
              </div>
              <PurchaseProductHints account={row.accountId} source={row.source} onSelect={canFollow ? product=>setSelection({row,product}) : undefined} />
            </details>
          </li>;})}</ul>}
        {(page>1 || report.hasMore) && <nav aria-label="صفحه‌بندی چرخهٔ خرید" className="flex items-center justify-between">
          <Button type="button" variant="ghost" disabled={page===1} onClick={()=>setPage(current=>current-1)}>قبلی</Button>
          <span className="text-caption">صفحهٔ {formatCount(page)}</span>
          <Button type="button" variant="ghost" disabled={!report.hasMore} onClick={()=>setPage(current=>current+1)}>بعدی</Button>
        </nav>}
      </>}
    {selected && taskAccount && <QuickTaskRequest open viewer={viewer} accounts={[taskAccount]} onClose={()=>setSelection(null)}
      initial={{kind:'GENERAL',accountId:taskAccount.id,priority:selected.followUp===1?'HIGH':'NORMAL',
        title:(selection?.product ? `پیگیری ${selection.product.name} برای ${selected.name}` : `پیگیری چرخهٔ خرید ${selected.name}`).slice(0,160),
        description:selection?.product ? `آخرین خرید مشاهده‌شدهٔ ${selection.product.name}: ${formatAppDate(selection.product.lastSeen)}، فاکتور ${selection.product.lastInvoiceNumber}\nمنبع ERP: ${selected.source}\nلطفاً وضعیت و نیاز مشتری به این کالا را بررسی کنید.`
          : `آخرین خرید مشاهده‌شده: ${formatAppDate(selected.lastPurchase)}${selected.lastInvoiceNumber ? `، فاکتور ${selected.lastInvoiceNumber}` : ''}\nمنبع ERP: ${selected.source}\nلطفاً علت فاصلهٔ خرید و اقدام بعدی را در پرونده ثبت کنید.`}}
      onSaved={id=>navigate(`/tasks?request=${encodeURIComponent(id)}`)} />}
  </Card>;
}
