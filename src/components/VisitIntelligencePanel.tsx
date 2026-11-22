import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from './ui/Card';
import { InputControl } from './ui/Input';
import { buildVisitIntelligence, visitReasonLabel } from '../lib/visitIntelligence';
import type { VisitIntelCustomer, VisitIntelInvoice, VisitIntelReceivable, VisitIntelReturn, VisitIntelTour, VisitIntelVisit, VisitIntelLabel } from '../lib/visitIntelligence';

interface Props {
  customers: VisitIntelCustomer[];
  visits: VisitIntelVisit[];
  invoices: VisitIntelInvoice[];
  returns: VisitIntelReturn[];
  tours: VisitIntelTour[];
  receivables: VisitIntelReceivable[];
  financeVisible: boolean;
  asOf: string;
  /** Source completeness is unknown until the integration is verified. */
  historyComplete?: boolean;
  invoiceHistoryComplete?: boolean;
}
const fmt=(n:number)=>n.toLocaleString('fa-IR',{maximumFractionDigits:0});
const currency=(n:number|null)=>n===null?'نامشخص':fmt(n)+' ریال';
const fdate=(date:string|null)=>date?new Date(date+'T00:00:00Z').toLocaleDateString('fa-IR'):'ثبت نشده';
type Filter='all'|'unvisited'|'tour'|'collection'|'valuable'|'no-order';
const filterNames:Record<Filter,string>={all:'همه',unvisited:'فاقد ویزیت ثبت‌شده',tour:'تور این هفته',collection:'وصول معوق',valuable:'ارزشمند / عمده', 'no-order':'بدون سفارش'};
export function VisitIntelligencePanel(props: Props) {
  const [filter,setFilter]=useState<Filter>('all');
  const [search,setSearch]=useState('');
  const [days,setDays]=useState(14);
  const [expanded,setExpanded]=useState<string|null>(null);
  const report=useMemo(()=>buildVisitIntelligence({
    customers:props.customers,visits:props.visits,invoices:props.financeVisible?props.invoices:[],
    returns:props.financeVisible?props.returns:[],tours:props.tours,
    receivables:props.financeVisible?props.receivables:[],
    asOf:props.asOf,historyComplete:props.historyComplete,
    invoiceHistoryComplete:props.invoiceHistoryComplete,visitTargetDays:days,
  }),[props.customers,props.visits,props.invoices,props.returns,props.tours,props.receivables,props.financeVisible,props.asOf,props.historyComplete,props.invoiceHistoryComplete,days]);
  const filtered=report.customerRows.filter(row=>{
    if(search && !(row.name+' '+row.customerId).toLocaleLowerCase('fa').includes(search.trim().toLocaleLowerCase('fa')))return false;
    if(filter==='unvisited')return row.recordedVisits===0;
    if(filter==='tour')return row.tourStops.length>0;
    if(filter==='collection')return !!row.receivable&&row.receivable.overdueAmount>0;
    if(filter==='valuable')return row.reasons.includes('HIGH_VALUE')||row.reasons.includes('WHOLESALE');
    if(filter==='no-order')return row.reasons.includes('NO_ORDER');
    return true;
  });
  return <Card padding="lg" className="space-y-4">
    <div>
      <h2 className="text-base font-black text-text-main">هوش و اولویت‌بندی ویزیت مشتریان</h2>
      <p className="mt-1 text-xs leading-6 text-text-secondary">ترکیب مراجعه واقعیِ ثبت‌شده، تور رسمی ERP و سابقه فروش در محدوده دسترسی شما؛ امتیاز یک اولویت پیشنهادی توضیح‌پذیر است، نه رتبه رسمی یا پیش‌بینی قطعی.</p>
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[['مشتری قابل بررسی',report.customerCount],['فاقد ویزیت ثبت‌شده',report.withoutRecordedVisits],['در تور ERP این هفته',report.inErpTour],['ویزیت واقعی ثبت‌شده',report.totalActualVisits]].map(([title,value])=>
        <div key={String(title)} className="rounded-xl border border-border bg-canvas p-3"><div className="text-xs text-text-secondary">{title}</div><div className="mt-1 text-xl font-black text-text-main">{fmt(Number(value))}</div></div>)}
    </div>
    {report.incompleteSources.length>0&&<div role="status" className="rounded-xl border border-warning/30 bg-warning-soft p-3 text-xs leading-6 text-text-main">
      <strong>محدودیت داده:</strong> {report.incompleteSources.join('؛ ')}. نبود سابقه در این گزارش، اثبات «هرگز مراجعه نشده» نیست.
    </div>}
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_130px]">
      <label className="text-xs font-bold text-text-secondary">جست‌وجوی مشتری<InputControl className="mt-1" value={search} onChange={e=>setSearch(e.target.value)} placeholder="نام یا شناسه"/></label>
      <label className="text-xs font-bold text-text-secondary">فیلتر
        <select className="mt-1 min-h-10 w-full rounded-xl border border-border bg-canvas px-3 text-text-main" value={filter} onChange={e=>setFilter(e.target.value as Filter)}>{Object.entries(filterNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
      </label>
      <label className="text-xs font-bold text-text-secondary">آستانه عدم مراجعه (روز)<InputControl className="mt-1" type="number" min={1} max={365} value={days} onChange={e=>setDays(Math.max(1,Math.min(365,Number(e.target.value)||14)))}/></label>
    </div>
    {report.reasonCounts.length>0 && <div className="rounded-xl border border-border bg-canvas p-3">
      <h3 className="text-xs font-black text-text-main">علت‌های ثبت‌شده برای ویزیت‌های بدون سفارش</h3>
      <div className="mt-2 flex flex-wrap gap-2">{report.reasonCounts.slice(0,8).map(item=><span key={item.reason} className="rounded-lg border border-border px-2 py-1 text-xs text-text-secondary">{item.reason}: {fmt(item.count)}</span>)}</div>
      <p className="mt-2 text-micro text-text-secondary">برچسب‌ها مطابق نتیجه ثبت‌شده‌اند؛ برای تشخیص قطعی عدم سفارش باید ارتباط ویزیت با سفارش ERP معتبر باشد.</p>
    </div>}
    <div className="space-y-2">
      {filtered.length===0?<p className="rounded-xl border border-dashed border-border p-4 text-xs text-text-secondary">مشتری سازگار با این فیلتر یا رکورد قابل مشاهده وجود ندارد.</p>:filtered.slice(0,100).map((row,index)=>
        <div key={row.customerId} className="rounded-xl border border-border p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-black text-primary">{fmt(index+1)}.</span><strong className="text-sm text-text-main">{row.name}</strong><span className="text-xs text-text-secondary">اولویت {fmt(row.score)}</span></div>
              <div className="mt-1 flex flex-wrap gap-1">{row.reasons.filter(r=>r!=='OUTSIDE_WEEK_TOUR').map(reason=><span key={reason} className="rounded-md bg-canvas px-2 py-1 text-micro text-text-secondary">{visitReasonLabel[reason as VisitIntelLabel]}</span>)}</div>
            </div>
            <div className="flex items-center gap-2">
              <Link className="rounded-lg border border-border px-2 py-1.5 text-xs font-bold text-primary" to={'/accounts/'+encodeURIComponent(row.customerId)}>پرونده مشتری</Link>
              <button type="button" className="rounded-lg border border-border px-2 py-1.5 text-xs" aria-expanded={expanded===row.customerId} onClick={()=>setExpanded(expanded===row.customerId?null:row.customerId)}>{expanded===row.customerId?'بستن':'جزئیات'}</button>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-text-secondary sm:grid-cols-4">
            <span>ویزیت ثبت‌شده: <strong className="text-text-main">{fmt(row.recordedVisits)}</strong></span>
            <span>آخرین ویزیت: <strong className="text-text-main">{fdate(row.lastVisitDate)}</strong></span>
            <span>فاکتور ثبت‌شده: <strong className="text-text-main">{props.financeVisible?fmt(row.invoiceCount):'محدود'}</strong></span>
            <span>تور این هفته: <strong className="text-text-main">{row.tourStops.length?row.tourStops.map(s=>s.sequence.toLocaleString('fa-IR')).join('، '):'ثبت نشده'}</strong></span>
          </div>
          {expanded===row.customerId&&<div className="mt-3 space-y-2 border-t border-border pt-3 text-xs leading-6 text-text-main">
            <p><strong>آخرین نتیجه مراجعه:</strong> {row.lastVisitOutcome||'نامشخص'} {row.lastNoOrderReason?' — '+row.lastNoOrderReason:''}</p>
            <p><strong>سابقه خرید موجود:</strong> {props.financeVisible?currency(row.salesTotal):'مجوز مشاهده مالی وجود ندارد'} {props.financeVisible&&row.averageInvoice!==null?' · میانگین هر فاکتور '+currency(row.averageInvoice):''}</p>
            {props.financeVisible&&row.lastInvoice&&<div className="rounded-lg bg-canvas p-2">
              <p><strong>آخرین فاکتور:</strong> {row.lastInvoice.invoiceNumber||row.lastInvoice.id} · {fdate(row.lastInvoiceDate)} · {currency(typeof row.lastInvoice.totalAmount==='number'?row.lastInvoice.totalAmount:null)}</p>
              {row.lastInvoice.items?.length ? <div className="mt-1 space-y-1">{row.lastInvoice.items.slice(0,15).map((item,i)=><p key={i}>{item.description||'کالای بدون نام'} · {fmt(Number(item.quantity)||0)} عدد · فی {currency(typeof item.unitPrice==='number'?item.unitPrice:null)}</p>)}</div>:<p className="text-text-secondary">ریز کالا و قیمت آخرین فاکتور در منبع حاضر موجود نیست.</p>}
            </div>}
            {props.financeVisible&&<p><strong>برگشت‌های مرتبط:</strong> {fmt(row.returnCount)} مورد · <strong>مانده معوق:</strong> {row.receivable?currency(row.receivable.overdueAmount):'تأییدشده در دسترس نیست'}</p>}
            {row.tourStops.map(s=><p key={s.tourId+':'+s.sequence}><strong>تور رسمی ERP:</strong> {fdate(s.date)} · مسیر {s.routeId} · ویزیتور {s.repId} · ایستگاه {fmt(s.sequence)}</p>)}
            <p className="text-text-secondary"><strong>مستندات:</strong> {row.evidence.length?row.evidence.join(' | '):'رکورد مستند موجود نیست'}</p>
            {row.warnings.length>0&&<p className="text-warning">{row.warnings.join('؛ ')}</p>}
          </div>}
        </div>)}
      {filtered.length>100&&<p className="text-xs text-text-secondary">۱۰۰ مشتری نخست نمایش داده شده‌اند؛ برای محدودکردن نتایج از فیلتر استفاده کنید.</p>}
    </div>
    <p className="text-micro leading-5 text-text-secondary">شروع هفته شنبه است. فقط مراجعه واقعی در آمار ویزیت شمرده می‌شود؛ برنامه ERP جایگزین مراجعه واقعی نیست. پرداخت قطعی، برگشت، سود و مانده باید از منابع مالی مجاز تأیید شوند.</p>
  </Card>;
}
