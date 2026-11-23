import React,{useEffect,useMemo,useState} from 'react';
import {AuthService} from '../../services/AuthService';
import {SearchableSelect} from '../ui/SearchableSelect';
import {GeoZoneMapEditor,type GeoMapPin} from '../GeoZoneMapEditor';
import type {GeoPolygonGeometry} from '../../types';
import {formatMoneyCompact,formatCount} from '../../lib/format';
type Invoice={InvoiceMirrorId:string;InvoiceNumber:string;SalesRepExternalId:string|null;CustomerName:string;
 AccountId:string;GrossAmount:number;Latitude:number|null;Longitude:number|null;GeoAccuracyMeters:number|null};
type Seller={sellerId:string;invoiceCount:number;grossRials:number;returnsRials:number;returnedInvoiceCount:number};
type Report={status:'PARTIAL'|'UNAVAILABLE';reason?:string;plan?:{PlanNumber:string;PlanDate:string;DriverExternalId:string;DistributorExternalId:string|null};
 invoices?:Invoice[];sellers?:Seller[];invoiceCount?:number;grossRials?:number;linkedReturnsRials?:number;
 journalBuckets?:Record<string,number|null>;missingMappings?:number;coverage?:Record<string,string>;note?:string;
 receivableCoverage?:string;collectionZone?:{
  status:'AVAILABLE'|'UNAVAILABLE';reason?:string;geometry?:GeoPolygonGeometry|null;
  rows?:Array<{customerId:string;name:string;officialBalanceRials:number;point:{latitude:number;longitude:number}|null;inZone:boolean;manualOutside:boolean;included:boolean}>;
  markers?:Array<{id:string;customerId:string;name:string;point:{latitude:number;longitude:number};kind:'DISPATCH'|'COLLECTION';outside?:boolean}>;
  suggestedCount?:number;missingGeoStopCount?:number;mappedStopCount?:number;
 }};
const buckets=[['CASH','وجه نقد'],['CASH_DISCOUNT','تخفیف نقدی'],['INVOICE_SURCHARGE','اضافه فاکتور'],
 ['CHEQUE','چک'],['TRANSFER','حواله بانکی'],['CASH_REFUND','وجه برگشتی']];
const fmt=(n:number|null|undefined)=>n==null?'نامشخص':formatMoneyCompact(n);
export function DispatchIntelligenceReports({plans}: {plans:Array<Record<string,unknown>>}){
 const [plan,setPlan]=useState('');
 const [seller,setSeller]=useState('ALL');
 const [showAllReceivables,setShowAllReceivables]=useState(false);
 const [manualOutsideIds,setManualOutsideIds]=useState<string[]>([]);
 const [report,setReport]=useState<Report|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const options=useMemo(()=>[...new Set(plans.map(p=>String(p.planNumber||p.PlanNumber||'')).filter(Boolean))], [plans]);
 useEffect(()=>{if(!plan&&options.length)setPlan(options[0]);},[plan,options]);
 useEffect(()=>{
  if(!plan){setReport(null);return;}
  const ctrl=new AbortController();setLoading(true);setError('');
  const token=AuthService.getAccessToken();
  if(!token){setError('نشست معتبر نیست');setLoading(false);return;}
  void fetch('/api/v1/erp/dispatch/'+encodeURIComponent(plan)+'/analysis',{
   headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:ctrl.signal
  }).then(async resp=>{
   const body=await resp.json().catch(()=>({}));
   if(!resp.ok)throw new Error(body.error?.message||body.reason||'دریافت گزارش ناموفق بود');
   setReport(body as Report);
  }).catch(e=>{if(!ctrl.signal.aborted){setReport(null);setError(String(e.message||e));}})
    .finally(()=>{if(!ctrl.signal.aborted)setLoading(false);});
  return()=>ctrl.abort();
 },[plan]);
 const invoices=useMemo(()=>report?.invoices?.filter(i=>seller==='ALL'||i.SalesRepExternalId===seller)||[],[report,seller]);
 const sellers=report?.sellers||[];
 const filteredSellers=seller==='ALL'?sellers:sellers.filter(s=>s.sellerId===seller);
 const gross=filteredSellers.reduce((n,s)=>n+s.grossRials,0);
 const returns=filteredSellers.reduce((n,s)=>n+s.returnsRials,0);
 const mapped=invoices.filter(i=>i.Latitude!=null&&i.Longitude!=null&&Number.isFinite(Number(i.Latitude))&&Number.isFinite(Number(i.Longitude))
  &&(i.GeoAccuracyMeters==null||Number(i.GeoAccuracyMeters)<=100));
 const pins:GeoMapPin[]=mapped.map(i=>({
  id:String(i.InvoiceMirrorId),name:i.CustomerName,kind:'CUSTOMER',
  point:{latitude:Number(i.Latitude),longitude:Number(i.Longitude)},tone:'good'
 }));
 const zone=report?.collectionZone;
 const candidateRows=zone?.status==='AVAILABLE'?zone.rows||[]:[];
 const eligibleCandidates=candidateRows.filter(c=>c.inZone||manualOutsideIds.includes(c.customerId)||showAllReceivables);
 const redPins:GeoMapPin[]=eligibleCandidates.filter(c=>c.point).map(c=>({
  id:'receivable:'+c.customerId,name:c.name,kind:'COLLECTION',
  point:c.point!,tone:'bad',outside:!c.inZone
 }));
 const mapPins:GeoMapPin[]=[...pins.map(pin=>({...pin,kind:'DISPATCH' as const})),...redPins];
 const current=report?.status==='PARTIAL';
 return <section className="space-y-3" dir="rtl" aria-label="تحلیل پیوسته حمل">
  <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-surface p-3">
   <div className="min-w-48 flex-1">
    <SearchableSelect label="برنامه حمل" value={plan}
     onChange={value=>{setPlan(value);setSeller('ALL');setManualOutsideIds([]);setShowAllReceivables(false);}}
     options={options.map(x=>({value:x,label:x}))} placeholder="انتخاب برنامه حمل"/>
   </div>
   <div className="min-w-40 flex-1">
    <SearchableSelect label="فیلتر مشترک فروشنده" value={seller}
     onChange={value=>setSeller(value||'ALL')}
     options={[{value:'ALL',label:'همه فروشندگان'},...sellers.map(x=>({value:x.sellerId,label:x.sellerId}))]}/>
   </div>
  </div>
  {loading&&<p role="status" className="text-xs text-text-secondary">در حال دریافت اسناد حمل از سرور…</p>}
  {error&&<p role="alert" className="rounded-xl border border-warning/40 p-3 text-xs text-warning">{error}</p>}
  {current&&<>
   <p className="rounded-xl border border-warning/40 bg-warning-soft p-3 text-xs leading-6 text-warning">
    گزارش اسناد اولیه حمل است؛ تا زمان تطبیق دفتر مالی، دریافت برگشتی کامل و FIFO، ارقام سود و مطالبات قطعی محسوب نمی‌شوند.
   </p>
   <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
     <strong className="text-sm text-text-main">۱ · فروش و برگشتی حمل</strong>
     <div className="grid grid-cols-2 gap-2">
      <div><p className="text-xs text-text-secondary">فروش فاکتور</p><strong className="text-xl text-text-main">{fmt(gross)}</strong></div>
      <div><p className="text-xs text-text-secondary">برگشتی متصل</p><strong className="text-xl text-text-main">{fmt(returns)}</strong></div>
     </div>
     <div className="h-3 overflow-hidden rounded-full bg-border">
      <div className="h-full rounded-full bg-rose-600" style={{width:`${gross>0?Math.min(100,Math.max(0,returns/gross*100)):0}%`}}/>
     </div>
     <p className="text-xs text-text-secondary">فروش خالص رسمی نیازمند تطبیق با دفتر است؛ این نوار فقط نسبت برگشتی متصل به فاکتور را نشان می‌دهد.</p>
    </div>
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
     <strong className="text-sm text-text-main">۲ · عملکرد فروشندگان</strong>
     <div className="max-h-60 space-y-2 overflow-y-auto">
      {filteredSellers.map(s=><button type="button" key={s.sellerId} onClick={()=>setSeller(s.sellerId)}
       className="w-full rounded-xl border border-border p-2 text-right text-xs hover:border-primary">
       <span className="flex justify-between"><strong>{s.sellerId}</strong><span>{formatCount(s.invoiceCount)} فاکتور · {formatCount(s.returnedInvoiceCount)} فاکتور برگشتی</span></span>
       <span className="mt-1 block">{fmt(s.grossRials)} فروش · {fmt(s.returnsRials)} برگشتی</span>
       <span className="mt-1 block h-2 overflow-hidden rounded-full bg-border"><span className="block h-full bg-rose-600" style={{width:`${s.grossRials>0?Math.min(100,s.returnsRials/s.grossRials*100):0}%`}}/></span>
      </button>)}
      {!filteredSellers.length&&<p className="text-xs text-text-secondary">فروشنده‌ای در این حمل ثبت نشده است.</p>}
     </div>
    </div>
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
     <strong className="text-sm text-text-main">۳ · طبقه‌بندی وجه و اسناد حمل</strong>
     {seller!=='ALL'&&<p className="text-xs text-warning">طبقه‌بندی سند مالی در سطح کل حمل است؛ قابل انتساب حدسی به فروشنده انتخابی نیست.</p>}
     <div className="grid grid-cols-2 gap-2">
      {buckets.map(([code,label])=><div key={code} className="rounded-xl bg-canvas p-2">
       <p className="text-xs text-text-secondary">{label}</p>
       <strong className="text-sm text-text-main">{fmt(report.journalBuckets?.[code])}</strong>
      </div>)}
     </div>
     {!!report.missingMappings&&<p className="text-xs text-warning">{formatCount(report.missingMappings)} سطر سند بدون نگاشت حساب معتبر است.</p>}
    </div>
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
     <strong className="text-sm text-text-main">۴ · مشتریان و جغرافیای حمل</strong>
     <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
      <span>{formatCount(invoices.length)} فاکتور</span>
      <span>{formatCount(new Set(invoices.map(i=>i.AccountId)).size)} مشتری</span>
      <span>{formatCount(mapped.length)} فاکتور با مختصات معتبر</span>
     </div>
     <div className="flex flex-wrap items-center gap-3 text-xs">
      <span className="font-bold text-emerald-700">● فاکتور حمل</span>
      <span className="font-bold text-rose-700">● مطالبات قطعی</span>
      <label className="flex items-center gap-1"><input type="checkbox" checked={showAllReceivables}
        disabled={zone?.status!=='AVAILABLE'}
        onChange={e=>setShowAllReceivables(e.target.checked)}/>نمایش همه مطالبات روی نقشه</label>
     </div>
     {mapPins.length>0?<GeoZoneMapEditor key={'dispatch:'+plan} coordinateText="" onChange={()=>{}}
       disabled geometry={zone?.status==='AVAILABLE'?zone.geometry||undefined:undefined} markers={mapPins}/>:
      <p className="rounded-xl border border-dashed border-border p-3 text-xs text-text-secondary">مختصات معتبر برای نقشه این حمل دریافت نشد.</p>}
     {zone?.status==='AVAILABLE'?<div className="max-h-52 space-y-1 overflow-y-auto">
      <p className="text-xs font-bold text-text-main">پیشنهاد وصول داخل محدوده: {formatCount(zone.suggestedCount||0)} مشتری ·
       تعداد مشتریان فاکتوردار بدون GPS: {formatCount(zone.missingGeoStopCount||0)}</p>
      {candidateRows.map(c=><label key={c.customerId} className="flex items-center gap-2 rounded-lg border border-border p-2 text-xs">
       <input type="checkbox" checked={c.inZone||manualOutsideIds.includes(c.customerId)}
        disabled={c.inZone||!c.point}
        onChange={e=>setManualOutsideIds(prev=>e.target.checked?[...prev,c.customerId]:prev.filter(x=>x!==c.customerId))}/>
       <span className="min-w-0 flex-1 truncate">{c.name}{c.inZone?' · در محدوده':' · خارج محدوده'}</span>
       <strong>{fmt(c.officialBalanceRials)}</strong>
      </label>)}
     </div>:<p className="text-xs text-warning">
       لایه مطالبات تا تأیید کامل دفتر مالی فعال نیست: {zone?.reason||report.receivableCoverage||'منبع نامشخص'}
      </p>}
     <p className="text-xs text-text-secondary">زون پیشنهادی تقریبی است؛ مشتری باید از نظر دسترسی خیابانی و امکان وصول توسط مسئول بررسی شود.</p>
    </div>
   </div>
   <div className="rounded-xl border border-border bg-surface p-3">
    <strong className="text-sm text-text-main">فاکتورهای حمل (فیلتر مرتبط)</strong>
    <div className="mt-2 max-h-56 overflow-auto">
     {invoices.map(i=><div key={i.InvoiceMirrorId} className="flex justify-between gap-3 border-b border-border py-2 text-xs">
      <span>{i.InvoiceNumber} · {i.CustomerName}</span><span>{fmt(Number(i.GrossAmount))}</span>
     </div>)}
    </div>
   </div>
  </>}
  {report?.status==='UNAVAILABLE'&&<p className="rounded-xl border border-warning/30 p-3 text-xs text-warning">منبع رسمی حمل در دسترس نیست: {report.reason}</p>}
 </section>;
}
