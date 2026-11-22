import React, {useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {AuthService} from '../services/AuthService';
import {GeoZoneMapEditor} from './GeoZoneMapEditor';
import type {GeoMapPin} from './GeoZoneMapEditor';
import {Card} from './ui/Card';
import {assessRouteMetric} from '../lib/routeMetricHealth';

type MetricId='customerCount'|'activeCustomerCount'|'invoiceCount'|'netSales'|'visitCount'|'attentionPercent'|'returnAmount'|'receivableAmount'|'profitAmount'|'targetAchievedPercent';
type Tone='good'|'warn'|'bad'|'unknown';
interface RouteSummary {
 routeId:string;routeCode:string;routeName:string;
 location:{latitude:number|null;longitude:number|null};
 customerCount:number|null;activeCustomerCount:number|null;invoiceCount:number|null;netSales:number|null;
 visitCount:number|null;attentionPercent:number|null;returnAmount:number|null;receivableAmount:number|null;
 profitAmount:number|null;targetAchievedPercent:number|null;
 missingCoordinateCount:number;coordinateCoveragePercent:number|null;
 health:string;source:string;metricAvailability:Record<string,string>;
}
interface MapResult {rows:RouteSummary[];source:string;period:{dateFrom:string;dateTo:string};caveats:string[];permittedMetrics:MetricId[]}
interface Choice{id:string;name:string}
interface FilterOptions{salesReps:Choice[];supervisors:Choice[];products:Choice[];suppliers:Choice[];brands:Choice[];categories:Choice[];unavailable:string[]}
interface DetailCustomer {
 id:string;name:string;code?:string;statusCode?:string;subRouteCode?:string;
 latitude:number|null;longitude:number|null;visitCount:number|null;lastVisitAt:string|null;
 lastVisitOutcome:string|null;noOrderReason:string|null;invoiceCount:number|null;netSales:number|null;
 lastInvoice:{number:string;date:string;items:Array<{name:string;quantity:number;unitPrice:number}>}|null;
 returnAmount?:number|null;receivableAmount?:number|null;receivableAsOf?:string|null;
 status:'BOUGHT'|'VISITED_NO_ORDER'|'NOT_BOUGHT'|'VISITED'|'UNKNOWN';
}
interface Detail {
 source:string;route:{RouteId:string;RouteCode:string;RouteName:string};
 customers:DetailCustomer[];financeVisible:boolean;coverage?:{hasVisitFeed:boolean;hasInvoiceFeed:boolean};period:{dateFrom:string;dateTo:string};
 topProducts:Array<{id:string;name:string;amount:number;quantity:number}>;
 warnings:string[];
}
const metricCatalog:Record<MetricId,{name:string;unit:string;finance:boolean}>={
 customerCount:{name:'مشتریان',unit:'نفر',finance:false},
 activeCustomerCount:{name:'خریدار فعال',unit:'نفر',finance:true},
 invoiceCount:{name:'تعداد فاکتور',unit:'عدد',finance:true},
 netSales:{name:'فروش خالص',unit:'ریال',finance:true},
 visitCount:{name:'ویزیت انجام‌شده',unit:'بار',finance:false},
 attentionPercent:{name:'پوشش مراجعه',unit:'٪',finance:false},
 returnAmount:{name:'برگشتی',unit:'ریال',finance:true},
 receivableAmount:{name:'مطالبات',unit:'ریال',finance:true},
 profitAmount:{name:'سود',unit:'ریال',finance:true},
 targetAchievedPercent:{name:'تحقق هدف',unit:'٪',finance:true},
};
const fa=(v:number)=>v.toLocaleString('fa-IR',{maximumFractionDigits:1});
const compact=(v:number)=>new Intl.NumberFormat('fa-IR',{notation:'compact',maximumFractionDigits:1}).format(v);
const displayMetric=(id:MetricId,v:number|null|undefined)=>v==null?'نامشخص':id==='netSales'||id==='returnAmount'||id==='receivableAmount'||id==='profitAmount'?compact(v)+' ریال':id==='attentionPercent'||id==='targetAchievedPercent'?fa(v)+'٪':fa(v);
const defaultDate=()=>new Date().toISOString().slice(0,10);
function monthAgo(d:string){const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()-30);return x.toISOString().slice(0,10);}
async function getJson<T>(url:string,signal:AbortSignal):Promise<T>{
 const token=AuthService.getAccessToken();
 if(!token)throw new Error('نشست ورود معتبر نیست.');
 const response=await fetch(url,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(result.error?.message||'دریافت گزارش از سرور ناموفق بود.');
 return result as T;
}
function MultiFilter({title,options,selected,onChange}:{
 title:string;options:Choice[];selected:string[];onChange:(next:string[])=>void
}){
 const [opened,setOpened]=useState(false);
 return <div className="relative min-w-0">
  <button type="button" onClick={()=>setOpened(!opened)}
   className="min-h-10 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-right text-xs font-bold text-text-main">
   {title}{selected.length?' · '+fa(selected.length):''} <span aria-hidden="true">⌄</span>
  </button>
  {opened&&<div className="absolute right-0 top-full z-30 mt-1 max-h-64 min-w-52 overflow-auto rounded-xl border border-border bg-white p-2 shadow-xl">
   <button type="button" onClick={()=>onChange([])} className="mb-2 text-xs font-bold text-primary">پاک‌کردن انتخاب</button>
   {options.length===0?<p className="p-2 text-xs text-text-secondary">گزینه‌ای در منبع مجاز وجود ندارد.</p>:
     options.map(option=><label key={option.id} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs hover:bg-canvas">
      <input type="checkbox" checked={selected.includes(option.id)}
        onChange={e=>onChange(e.target.checked?[...selected,option.id]:selected.filter(id=>id!==option.id))}/>
      <span className="min-w-0 flex-1 truncate">{option.name}</span>
     </label>)}
  </div>}
 </div>;
}
const statusLabels={
 BOUGHT:'خریده',VISITED_NO_ORDER:'ویزیت شده، بدون سفارش',NOT_BOUGHT:'بدون خرید در بازه',
 VISITED:'ویزیت ثبت‌شده',UNKNOWN:'وضعیت خرید نامشخص'
};
function detailColor(s:DetailCustomer['status']){
 if(s==='BOUGHT')return 'bg-emerald-100 text-emerald-900';
 if(s==='VISITED_NO_ORDER')return 'bg-amber-100 text-amber-900';
 if(s==='NOT_BOUGHT')return 'bg-rose-100 text-rose-900';
 return 'bg-slate-100 text-slate-700';
}
const metricIds=Object.keys(metricCatalog) as MetricId[];
export function RouteMapOverview(){
 const [dateTo,setDateTo]=useState(defaultDate);
 const [dateFrom,setDateFrom]=useState(()=>monthAgo(defaultDate()));
 const [primary,setPrimary]=useState<MetricId>('customerCount');
 const [metrics,setMetrics]=useState<MetricId[]>(['customerCount','activeCustomerCount','netSales']);
 const [expandedFilters,setExpandedFilters]=useState(false);
 const [selectedRoutes,setSelectedRoutes]=useState<string[]>([]);
 const [selectedReps,setSelectedReps]=useState<string[]>([]);
 const [selectedSupervisors,setSelectedSupervisors]=useState<string[]>([]);
 const [selectedProducts,setSelectedProducts]=useState<string[]>([]);
 const [selectedSuppliers,setSelectedSuppliers]=useState<string[]>([]);
 const [selectedBrands,setSelectedBrands]=useState<string[]>([]);
 const [selectedCategories,setSelectedCategories]=useState<string[]>([]);
 const [report,setReport]=useState<MapResult|null>(null);
 const [choices,setChoices]=useState<FilterOptions>({salesReps:[],supervisors:[],products:[],suppliers:[],brands:[],categories:[],unavailable:[]});
 const [selectedRoute,setSelectedRoute]=useState<string|null>(null);
 const [detail,setDetail]=useState<Detail|null>(null);
 const [detailOpen,setDetailOpen]=useState(false);
 const [customerSearch,setCustomerSearch]=useState('');
 const [segment,setSegment]=useState<'ALL'|DetailCustomer['status']>('ALL');
 const [openedCustomer,setOpenedCustomer]=useState<string|null>(null);
 const [loading,setLoading]=useState(false);
 const [loadingDetail,setLoadingDetail]=useState(false);
 const [error,setError]=useState('');
 const [detailError,setDetailError]=useState('');
 const filterQuery=useMemo(()=>{
  const p=new URLSearchParams({dateFrom,dateTo});
  for(const id of selectedRoutes)p.append('routeIds',id);
  for(const id of selectedReps)p.append('salesRepIds',id);
  for(const id of selectedSupervisors)p.append('supervisorIds',id);
  for(const id of selectedProducts)p.append('productIds',id);
  for(const id of selectedSuppliers)p.append('supplierIds',id);
  for(const id of selectedBrands)p.append('brandIds',id);
  for(const id of selectedCategories)p.append('customerCategoryIds',id);
  return p.toString();
 },[dateFrom,dateTo,selectedRoutes,selectedReps,selectedSupervisors,selectedProducts,selectedSuppliers,selectedBrands,selectedCategories]);
 useEffect(()=>{
  const ctrl=new AbortController();setLoading(true);setError('');
  void getJson<MapResult>('/api/v1/erp/route-map/summary?'+filterQuery,ctrl.signal)
   .then(setReport).catch(e=>{if(!ctrl.signal.aborted){setReport(null);setError(e.message||String(e));}})
   .finally(()=>{if(!ctrl.signal.aborted)setLoading(false);});
  return ()=>ctrl.abort();
 },[filterQuery]);
 useEffect(()=>{
  const ctrl=new AbortController();
  void getJson<FilterOptions>('/api/v1/erp/route-map/filter-options?date='+dateTo,ctrl.signal)
    .then(setChoices).catch(()=>{if(!ctrl.signal.aborted)setChoices({salesReps:[],supervisors:[],products:[],suppliers:[],brands:[],categories:[],unavailable:[]});});
  return ()=>ctrl.abort();
 },[dateTo]);
 useEffect(()=>{
  const ctrl=new AbortController();
  if(!selectedRoute){setDetail(null);return ()=>ctrl.abort();}
  setLoadingDetail(true);setDetailError('');
  void getJson<Detail>('/api/v1/erp/route-map/'+encodeURIComponent(selectedRoute)+'/detail?'+filterQuery,ctrl.signal)
   .then(setDetail).catch(e=>{if(!ctrl.signal.aborted){setDetail(null);setDetailError(e.message||String(e));}})
   .finally(()=>{if(!ctrl.signal.aborted)setLoadingDetail(false);});
  return ()=>ctrl.abort();
 },[selectedRoute,filterQuery]);
 const rows=report?.rows||[];
 const routeChoices=rows.map(r=>({id:r.routeId,name:r.routeCode+' · '+r.routeName}));
 const permitted=new Set<MetricId>(report?.permittedMetrics||['customerCount','visitCount','attentionPercent']);
 const currentPrimary=permitted.has(primary)?primary:'customerCount';
 const visibleMetricIds=metrics.filter(id=>id==='customerCount'||id===primary||id!=='customerCount');
 const color=(r:RouteSummary):Tone=>assessRouteMetric(r,rows,currentPrimary).tone;
 const colorBasis=rows.length?assessRouteMetric(rows[0],rows,currentPrimary).basis:'';
 const markers:GeoMapPin[]=rows.flatMap(r=>{
  const point=r.location;
  if(point.latitude==null||point.longitude==null)return [];
  return [{
   id:r.routeId,name:r.routeCode+' · '+r.routeName,kind:'ROUTE' as const,
   point:{latitude:point.latitude,longitude:point.longitude},
   tone:color(r),bubbleLabel:displayMetric(currentPrimary,r[currentPrimary])+'\n'+
    fa(r.customerCount??0)+' مشتری'+(permitted.has('activeCustomerCount')&&r.activeCustomerCount!==null
      ? ' · '+fa(r.activeCustomerCount)+' خریدار' : ''),detailPath:undefined
  }];
 });
 const selectedSummary=rows.find(r=>r.routeId===selectedRoute);
 const visibleCustomers=(detail?.customers||[]).filter(c=>
  (segment==='ALL'||c.status===segment) &&
  (!customerSearch||[c.name,c.code||'',c.subRouteCode||''].join(' ').includes(customerSearch.trim())));
 const groupedCounts=(detail?.customers||[]).reduce((map,c)=>{
  map[c.status]=(map[c.status]||0)+1;return map;
 },{} as Record<string,number>);
 const chooseMetric=(id:MetricId)=>{
  if(metrics.includes(id)){if(metrics.length>1)setMetrics(metrics.filter(x=>x!==id));if(primary===id){
   const next=metrics.find(x=>x!==id);if(next)setPrimary(next);
  }}else {setMetrics([...metrics,id]);}
 };
 const openRoute=(id:string)=>{setSelectedRoute(id);setDetailOpen(true);setSegment('ALL');setOpenedCustomer(null);setCustomerSearch('');};
 return <section className="space-y-3" dir="rtl" aria-label="اطلس تحلیلی مسیرهای فروش">
  <Card padding="lg" className="space-y-3">
   <div className="flex flex-wrap items-start justify-between gap-2">
    <div><h2 className="text-base font-black text-text-main">اطلس هوشمند مسیرهای فروش</h2>
     <p className="mt-1 text-xs text-text-secondary">هر حباب یک مسیر رسمی ERP است؛ مشتری بدون مختصات در آمار می‌ماند.</p></div>
    <div className="flex items-center gap-2">
     <button type="button" onClick={()=>setExpandedFilters(!expandedFilters)}
      className="min-h-10 rounded-xl border border-border px-3 text-xs font-bold text-primary">
      {expandedFilters?'بستن فیلترها':'فیلتر پیشرفته'}
     </button>
    </div>
   </div>
   <div className="grid grid-cols-2 gap-2">
    <label className="text-xs font-semibold text-text-secondary">از تاریخ
     <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-border bg-canvas px-2"/>
    </label>
    <label className="text-xs font-semibold text-text-secondary">تا تاریخ
     <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-border bg-canvas px-2"/>
    </label>
   </div>
   {expandedFilters&&<div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-canvas p-3 sm:grid-cols-3">
    <MultiFilter title="مسیر" options={routeChoices} selected={selectedRoutes} onChange={setSelectedRoutes}/>
    <MultiFilter title="فروشنده" options={choices.salesReps} selected={selectedReps} onChange={setSelectedReps}/>
    <MultiFilter title="سرپرست" options={choices.supervisors} selected={selectedSupervisors} onChange={setSelectedSupervisors}/>
    <MultiFilter title="کالا" options={choices.products} selected={selectedProducts} onChange={setSelectedProducts}/>
    <MultiFilter title="برند" options={choices.brands} selected={selectedBrands} onChange={setSelectedBrands}/>
    <MultiFilter title="تأمین‌کننده" options={choices.suppliers} selected={selectedSuppliers} onChange={setSelectedSuppliers}/>
    <MultiFilter title="صنف مشتری" options={choices.categories} selected={selectedCategories} onChange={setSelectedCategories}/>
    <div className="col-span-full text-xs text-text-secondary">
     گزینه‌های صنف، برند و تأمین‌کننده از کدهای رسمی منتقل‌شده ERP انتخاب می‌شوند؛ اگر نگاشت منبع موجود نباشد، گزینه‌ای نمایش داده نمی‌شود.
    </div>
   </div>}
   <div className="space-y-2">
    <div className="flex items-center justify-between gap-2">
     <strong className="text-xs text-text-main">شاخص‌های قابل نمایش</strong>
     <span className="text-micro text-text-secondary">چندانتخابی · شاخص اصلی داخل حباب</span>
    </div>
    <div className="flex flex-wrap gap-1.5">
     {metricIds.filter(id=>permitted.has(id)).map(id=><button key={id} type="button" onClick={()=>chooseMetric(id)}
       aria-pressed={metrics.includes(id)}
       className={`min-h-8 rounded-full border px-2.5 py-1 text-xs ${metrics.includes(id)?'border-primary bg-primary/10 font-bold text-primary':'border-border text-text-secondary'}`}>
      {metricCatalog[id].name}</button>)}
    </div>
    <label className="flex items-center gap-2 text-xs text-text-secondary">عدد اصلی روی نقشه
     <select value={primary} onChange={e=>{const id=e.target.value as MetricId;setPrimary(id);if(!metrics.includes(id))setMetrics([...metrics,id]);}}
       className="min-h-9 flex-1 rounded-xl border border-border bg-canvas px-2 text-text-main">
      {metrics.filter(id=>permitted.has(id)).map(id=><option key={id} value={id}>{metricCatalog[id].name}</option>)}
     </select>
    </label>
   </div>
  </Card>
  {error&&<p role="alert" className="rounded-xl border border-warning/30 bg-warning-soft p-3 text-xs text-warning">{error}</p>}
  {loading&&<p role="status" className="text-xs text-text-secondary">در حال واکشی گزارش مجاز مسیرها از SQL...</p>}
  {report&&<div className="space-y-3">
   <div className="flex flex-wrap gap-2 text-xs">
    <span className="rounded-lg border border-border px-2 py-1">مسیر قابل مشاهده: {fa(rows.length)}</span>
    <span className="rounded-lg border border-border px-2 py-1">با مختصات نقشه: {fa(markers.length)}</span>
    <span className="rounded-lg border border-border px-2 py-1">بی‌مختصات: {fa(rows.length-markers.length)}</span>
   </div>
   <div className="overflow-hidden rounded-2xl border border-border">
    <GeoZoneMapEditor key="all-erp-routes" coordinateText="" disabled
      onChange={()=>{}} markers={markers}
      onMarkerSelect={marker=>openRoute(marker.id)}/>
   </div>
   <div className="flex flex-wrap gap-2 text-micro text-text-secondary">
    <span className="rounded-md bg-emerald-100 px-2 py-1">سبز: عملکرد قوی در شاخص انتخابی</span>
    <span className="rounded-md bg-amber-100 px-2 py-1">زرد: میانه / نیازمند توجه</span>
    <span className="rounded-md bg-rose-100 px-2 py-1">قرمز: عملکرد ضعیف / ریسک بالا</span>
    <span className="rounded-md bg-slate-100 px-2 py-1">خاکستری: داده ناکافی</span>
   </div>
   <p className="text-micro leading-5 text-text-secondary">منطق رنگ: {colorBasis}. رنگ صرفاً ارزیابی همین شاخص و داده‌های مجاز است؛ تشخیص قطعی عملکرد یا تخلف نیست.</p>
   <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
    {rows.map(row=><button key={row.routeId} type="button" onClick={()=>openRoute(row.routeId)}
      className="rounded-2xl border border-border bg-canvas p-3 text-right transition-colors hover:border-primary/40">
      <div className="flex items-center justify-between gap-2">
       <strong className="truncate text-sm text-text-main">{row.routeCode} · {row.routeName}</strong>
       <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color(row)==='good'?'bg-emerald-600':color(row)==='warn'?'bg-amber-500':color(row)==='bad'?'bg-rose-600':'bg-slate-500'}`}/>
      </div>
      <p className="mt-1 text-lg font-black text-text-main">{displayMetric(currentPrimary,row[currentPrimary])}</p>
      <div className="mt-2 flex flex-wrap gap-1 text-micro text-text-secondary">
       <span className="rounded-md border border-border px-2 py-1">کل مشتری: {displayMetric('customerCount',row.customerCount)}</span>
       {visibleMetricIds.filter(x=>x!==primary && x!=='customerCount').slice(0,3).map(id=>
        <span key={id} className="rounded-md border border-border px-2 py-1">{metricCatalog[id].name}: {displayMetric(id,row[id])}</span>)}
      </div>
      {row.missingCoordinateCount>0&&<p className="mt-2 text-xs text-warning">{fa(row.missingCoordinateCount)} مشتری فاقد مختصات</p>}
    </button>)}
   </div>
   {report.caveats?.map(c=><p key={c} className="text-micro leading-5 text-text-secondary">{c}</p>)}
  </div>}
  {detailOpen&&<div className="fixed inset-0 z-(--z-modal) flex items-end justify-center bg-black/30 sm:items-stretch sm:justify-end"
    role="presentation" onClick={()=>setDetailOpen(false)}>
   <div className="max-h-[94dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:max-h-full sm:w-[min(600px,90vw)] sm:rounded-none"
     role="dialog" aria-modal="true" aria-label="جزئیات مسیر" onClick={e=>e.stopPropagation()}>
    <div className="sticky top-0 z-10 mb-3 flex items-center justify-between gap-2 bg-white pb-2">
     <div><h3 className="text-base font-black text-text-main">{selectedSummary?.routeName||'جزئیات مسیر'}</h3>
      <p className="text-xs text-text-secondary">کد مسیر: {selectedSummary?.routeCode||'—'}</p></div>
     <button type="button" onClick={()=>setDetailOpen(false)} className="min-h-10 rounded-xl border border-border px-3 text-xs font-bold">بستن</button>
    </div>
    {loadingDetail&&<p role="status" className="text-xs text-text-secondary">در حال دریافت مشتریان مجاز مسیر...</p>}
    {detailError&&<p role="alert" className="text-xs text-warning">{detailError}</p>}
    {detail&&<>
     <div className="grid grid-cols-2 gap-2">
      {[['کل مشتری',detail.customers.length],['دارای ویزیت',detail.coverage?.hasVisitFeed?detail.customers.filter(c=>(c.visitCount||0)>0).length:null],
        ['دارای فاکتور',detail.coverage?.hasInvoiceFeed?detail.customers.filter(c=>(c.invoiceCount||0)>0).length:null],
        ['فروش ریالی',detail.coverage?.hasInvoiceFeed?detail.customers.reduce((sum,c)=>sum+(c.netSales||0),0):null]].map(([name,value],index)=>
       <div key={String(name)} className="rounded-xl border border-border bg-canvas p-3">
        <p className="text-xs text-text-secondary">{name}</p>
        <strong className="mt-1 block text-lg text-text-main">{value==null?'نامشخص':index===3?compact(Number(value))+' ریال':fa(Number(value))}</strong>
       </div>)}
     </div>
     <h4 className="mt-4 text-sm font-black text-text-main">تقسیم‌بندی مشتریان</h4>
     <div className="mt-2 flex flex-wrap gap-1.5">
      {(['ALL','BOUGHT','VISITED_NO_ORDER','NOT_BOUGHT','UNKNOWN'] as const).map(id=>
       <button type="button" key={id} onClick={()=>setSegment(id)}
        className={`min-h-9 rounded-full border px-3 text-xs ${segment===id?'border-primary bg-primary/10 text-primary':'border-border'}`}>
        {id==='ALL'?'همه':statusLabels[id]} · {fa(id==='ALL'?detail.customers.length:groupedCounts[id]||0)}
       </button>)}
     </div>
     <label className="mt-3 block text-xs text-text-secondary">جست‌وجوی مشتری در همین مسیر
      <input value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)} placeholder="نام، کد یا زیرمسیر"
       className="mt-1 min-h-10 w-full rounded-xl border border-border bg-canvas px-3 text-text-main"/>
     </label>
     <div className="mt-2 space-y-2">
      {visibleCustomers.length===0&&<p className="rounded-xl border border-dashed border-border p-4 text-xs text-text-secondary">مشتری منطبق با فیلتر فعلی وجود ندارد.</p>}
      {visibleCustomers.slice(0,200).map(c=><div key={c.id} className="rounded-xl border border-border p-3">
       <div className="flex items-center justify-between gap-2">
        <div className="min-w-0"><strong className="block truncate text-sm text-text-main">{c.name}</strong>
         <p className="mt-1 text-micro text-text-secondary">{c.code||'بدون کد'}{c.subRouteCode?' · زیرمسیر '+c.subRouteCode:''}</p></div>
        <span className={`rounded-full px-2 py-1 text-micro ${detailColor(c.status)}`}>{statusLabels[c.status]}</span>
       </div>
       <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-text-secondary">
        <span>ویزیت: {c.visitCount==null?'نامشخص':fa(c.visitCount)+' بار'}</span>
        <span>فاکتور: {c.invoiceCount==null?'محدود':fa(c.invoiceCount)}</span>
        <span>فروش: {c.netSales==null?'نامشخص':compact(c.netSales)+' ریال'}</span>
        <span>آخرین ویزیت: {c.lastVisitAt?String(c.lastVisitAt).slice(0,10):'ثبت نشده'}</span>
        <span>برگشتی: {c.returnAmount==null?'نامشخص':compact(c.returnAmount)+' ریال'}</span>
        <span>مطالبات فعلی: {c.receivableAmount==null?'نامشخص':compact(c.receivableAmount)+' ریال'}</span>
       </div>
       <div className="mt-2 flex items-center justify-between gap-2">
        <Link to={'/accounts/'+encodeURIComponent(c.id)} className="text-xs font-bold text-primary">پرونده مشتری</Link>
        <button type="button" onClick={()=>setOpenedCustomer(openedCustomer===c.id?null:c.id)}
         className="min-h-9 rounded-lg border border-border px-2 text-xs">{openedCustomer===c.id?'بستن':'جزئیات خرید و مراجعه'}</button>
       </div>
       {openedCustomer===c.id&&<div className="mt-2 space-y-1 border-t border-border pt-2 text-xs leading-6 text-text-secondary">
        <p>آخرین نتیجه ویزیت: {c.lastVisitOutcome||'نامشخص'}</p>
        <p>علت عدم سفارش: {c.noOrderReason||'ثبت نشده'}</p>
        <p>آخرین فاکتور: {c.lastInvoice?.number||'نامشخص'} · {c.lastInvoice?.date||'—'}</p>
        {c.lastInvoice?.items?.map((item,i)=><p key={i} className="rounded-lg bg-canvas px-2 py-1">
         {item.name} · تعداد {fa(item.quantity)} · فی {fa(item.unitPrice)} ریال
        </p>)}
       </div>}
      </div>)}
      {visibleCustomers.length>200&&<p className="text-xs text-warning">۲۰۰ مشتری نخست نمایش داده شده‌اند؛ برای محدودکردن نتایج جست‌وجو کنید.</p>}
     </div>
     {detail.topProducts.length>0&&<div className="mt-4 rounded-xl border border-border p-3">
      <h4 className="text-sm font-black text-text-main">کالاهای پرفروش همین مسیر و بازه</h4>
      <div className="mt-2 space-y-2">{detail.topProducts.slice(0,10).map(item=>
       <div key={item.id} className="flex justify-between gap-2 text-xs"><span className="truncate">{item.name}</span>
        <strong>{compact(item.amount)} ریال</strong></div>)}</div>
     </div>}
     {detail.warnings.map(w=><p key={w} className="mt-2 text-micro leading-5 text-text-secondary">{w}</p>)}
    </>}
   </div>
  </div>}
 </section>;
}
