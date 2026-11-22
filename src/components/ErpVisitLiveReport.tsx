import React, {useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {AuthService} from '../services/AuthService';
import {GeoZoneMapEditor} from './GeoZoneMapEditor';
import type {GeoMapPin} from './GeoZoneMapEditor';
import {Card} from './ui/Card';
import type {GeoPolygonGeometry} from '../types';
import {inspectRouteCoordinates,suggestRoutePolygonFromCustomers} from '../lib/geoRouteAnalysis';
import {readCustomerGeoPoint} from '../lib/geoIntelligence';

interface LiveRoute {
 RouteId:string;RouteCode:string;RouteName:string;VisibleCustomerCount:number;SourceSystemCode:string;ExternalRouteId:string;
}
interface RouteOverview{
 source:string;asOf:string;
 route:LiveRoute;
 customers:Array<{AccountId:string;AccountCode?:string;Name:string;Latitude?:number|null;Longitude?:number|null;SubRouteCode?:string}>;
 staff:Array<{ExternalStaffId:string;StaffRoleCode:string;StaffUserId?:string}>;
 tours:Array<{TourId:string;TourCode?:string|null;ExternalTourId:string;TourDate:string;ExternalSalesRepId:string;StopSequence?:number|null;AccountId?:string|null;ExternalCustomerId?:string|null}>;
 visits:Array<{ExternalVisitId:string;AccountId?:string;ExternalSalesRepId:string;VisitedAtUtc:string;OutcomeCode?:string|null;NoOrderReasonCode?:string|null;ReasonTitleFa?:string|null;Latitude?:number|null;Longitude?:number|null}>;
 gps:Array<{ExternalLocationId:string;ExternalSalesRepId:string;RecordedAtUtc:string;Latitude:number;Longitude:number;AccuracyMeters?:number|null}>;
 analysisBoundary?:{version:number;status:string;method:string;coveragePercent?:number|null;sourceCount?:number|null;geometry:GeoPolygonGeometry}|null;
 limits:{mayBeTruncated:boolean};
}
const fa=(n:number)=>n.toLocaleString('fa-IR');
const toStringGeometry=(geometry?:GeoPolygonGeometry|null)=>geometry?.coordinates?.[0]?.slice(0,-1).map(p=>p[0]+', '+p[1]).join('\n')||'';
const day=()=>new Date().toISOString().slice(0,10);
async function authorizedGet<T>(url:string,signal:AbortSignal):Promise<T>{
 const token=AuthService.getAccessToken();
 if(!token)throw new Error('برای دریافت داده زنده باید مجدداً وارد حساب شوید.');
 const response=await fetch(url,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal});
 if(!response.ok){
  const error=await response.json().catch(()=>({}));
  throw new Error(error.error?.message||'خواندن اطلاعات ERP ناموفق بود.');
 }
 return response.json() as Promise<T>;
}
/**
 * Read-only SQL projection for every role. Server decides which routes/accounts/tours
 * the caller may see. No local state snapshot or client-side scope is trusted.
 */
export function ErpVisitLiveReport({canManage=false}:{canManage?:boolean}){
 const [date,setDate]=useState(day);
 const [routes,setRoutes]=useState<LiveRoute[]>([]);
 const [routeId,setRouteId]=useState('');
 const [detail,setDetail]=useState<RouteOverview|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [showGps,setShowGps]=useState(false);
 const [showVisits,setShowVisits]=useState(true);
 const [showCustomers,setShowCustomers]=useState(true);
 const [editedGeometry,setEditedGeometry]=useState<GeoPolygonGeometry|null>(null);
 const [saveMessage,setSaveMessage]=useState('');
 const [saving,setSaving]=useState(false);
 useEffect(()=>{setEditedGeometry(null);setSaveMessage('');},[routeId,date]);
 useEffect(()=>{
  const controller=new AbortController();
  setLoading(true);setError('');
  void authorizedGet<{rows:LiveRoute[]}>('/api/v1/erp/visit-routes?date='+encodeURIComponent(date),controller.signal)
    .then(result=>{setRoutes(result.rows||[]);setRouteId(current=>(result.rows||[]).some(r=>r.RouteId===current)?current:(result.rows?.[0]?.RouteId||''));})
    .catch(e=>{if(!controller.signal.aborted){setRoutes([]);setDetail(null);setError(String(e.message||e));}})
    .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
  return ()=>controller.abort();
 },[date]);
 useEffect(()=>{
  const controller=new AbortController();
  if(!routeId){setDetail(null);return ()=>controller.abort();}
  setLoading(true);setError('');
  void authorizedGet<RouteOverview>('/api/v1/erp/visit-routes/'+encodeURIComponent(routeId)+'/overview?date='+encodeURIComponent(date),controller.signal)
    .then(result=>setDetail(result))
    .catch(e=>{if(!controller.signal.aborted){setDetail(null);setError(String(e.message||e));}})
    .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
  return ()=>controller.abort();
 },[routeId,date]);
 const selected=routes.find(r=>r.RouteId===routeId);
 const customers=detail?.customers||[];
 const visits=detail?.visits||[];
 const gps=detail?.gps||[];
 const officialStops=(detail?.tours||[]).filter(r=>r.AccountId&&Number.isInteger(r.StopSequence));
 const orderedStops=[...officialStops].sort((a,b)=>(a.StopSequence||0)-(b.StopSequence||0));
 const sourceCustomers=useMemo(()=>customers.map(c=>({id:c.AccountId,name:c.Name,latitude:c.Latitude,longitude:c.Longitude})),[detail]);
 const suggested=useMemo(()=>suggestRoutePolygonFromCustomers(sourceCustomers),[sourceCustomers]);
 const boundary=editedGeometry||detail?.analysisBoundary?.geometry||suggested.geometry;
 const anomaly=useMemo(()=>boundary?inspectRouteCoordinates(sourceCustomers,visits.map(v=>({
  id:v.ExternalVisitId,customerId:v.AccountId,latitude:v.Latitude,longitude:v.Longitude,
 })),boundary):null,[sourceCustomers,visits,boundary]);
 const gpsTrack = showGps ? [...gps].sort((a,b)=>a.RecordedAtUtc.localeCompare(b.RecordedAtUtc))
   .slice(-500).flatMap(log=>{
     const point=readCustomerGeoPoint({latitude:log.Latitude,longitude:log.Longitude});
     return point?[point]:[];
   }) : [];
 const markers:GeoMapPin[]=[
  ...(showCustomers?customers.flatMap(c=>{
   const point=readCustomerGeoPoint({latitude:c.Latitude,longitude:c.Longitude});
   if(!point)return [];
   return [{id:c.AccountId,name:c.Name,point,kind:'CUSTOMER' as const,
    sequence:orderedStops.find(t=>t.AccountId===c.AccountId)?.StopSequence ?? undefined,
    outside:!!anomaly?.customersOutside.some(x=>x.id===c.AccountId),
    detailPath:'/accounts/'+encodeURIComponent(c.AccountId)}];
  }):[]),
  ...(showVisits?visits.flatMap(v=>{
   const point=readCustomerGeoPoint({latitude:v.Latitude,longitude:v.Longitude});
   if(!point)return [];
   return [{id:v.ExternalVisitId,name:'ویزیت '+(customers.find(c=>c.AccountId===v.AccountId)?.Name||v.AccountId||''),point,
    kind:'VISIT' as const,outside:!!anomaly?.visitsOutside.some(x=>x.id===v.ExternalVisitId)}];
  }):[]),
  ...(showGps?gps.slice(0,300).flatMap(g=>{
   const point=readCustomerGeoPoint({latitude:g.Latitude,longitude:g.Longitude});
   if(!point)return [];
   return [{id:g.ExternalLocationId,name:g.ExternalSalesRepId+' · '+g.RecordedAtUtc,point,kind:'GPS' as const}];
  }):[]),
 ];
 return <Card padding="lg" className="space-y-4" >
  <header className="space-y-2">
   <h2 className="text-base font-black text-text-main">نقشه و گزارش رسمی مسیر و تور ERP</h2>
   <p className="text-xs leading-6 text-text-secondary">نمای فقط‌خواندنی و محدود به مجوز SQL: مسیر اصلی، زیرمسیر، فروشنده‌ها، سرپرست، تور تاریخ انتخاب‌شده، ویزیت‌ها و GPS.</p>
  </header>
  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
   <label className="text-xs font-bold text-text-secondary">تاریخ تور<input type="date" value={date} onChange={e=>setDate(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-canvas px-3"/></label>
   <label className="text-xs font-bold text-text-secondary">مسیر قابل مشاهده در دسترسی فعلی
    <select value={routeId} onChange={e=>setRouteId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-canvas px-3">
     <option value="">انتخاب مسیر</option>{routes.map(r=><option key={r.RouteId} value={r.RouteId}>{r.RouteCode} — {r.RouteName} ({fa(r.VisibleCustomerCount||0)} مشتری مجاز)</option>)}
    </select>
   </label>
  </div>
  {loading&&<p role="status" className="text-xs text-text-secondary">در حال دریافت اطلاعات مجاز از SQL...</p>}
  {error&&<p role="alert" className="rounded-xl border border-warning/30 bg-warning-soft p-3 text-xs text-warning">{error}</p>}
  {!error&&!loading&&!routes.length&&<p className="text-xs text-text-secondary">مسیر قابل مشاهده‌ای در SQL موجود نیست یا برای شما تعریف نشده است.</p>}
  {detail&&selected&&<>
   <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
    {[['مشتری',customers.length],['ایستگاه رسمی امروز',officialStops.length],['ویزیت ثبت‌شده',visits.length],['GPS دریافت‌شده',gps.length]].map(([label,value])=>
      <div key={String(label)} className="rounded-xl border border-border bg-canvas p-3"><div className="text-xs text-text-secondary">{label}</div><strong className="text-lg">{fa(Number(value))}</strong></div>)}
   </div>
   <div className="flex flex-wrap gap-2 text-xs">
    <span className="rounded-lg border border-border p-2">فروشندگان: {detail.staff.filter(s=>s.StaffRoleCode==='SALES_REP').map(s=>s.ExternalStaffId).join('، ')||'ثبت نشده'}</span>
    <span className="rounded-lg border border-border p-2">سرپرستان: {detail.staff.filter(s=>s.StaffRoleCode==='SUPERVISOR').map(s=>s.ExternalStaffId).join('، ')||'ثبت نشده'}</span>
    <span className="rounded-lg border border-border p-2">زیرمسیرها: {[...new Set(customers.map(c=>c.SubRouteCode).filter(Boolean))].join('، ')||'ثبت نشده'}</span>
   </div>
   {detail.limits?.mayBeTruncated&&<p className="text-xs text-warning">بخشی از ویزیت‌ها یا GPS به سقف واکشی صفحه رسید؛ نتیجه کامل نیست.</p>}
   <p className="rounded-xl border border-warning/30 bg-warning-soft p-3 text-xs leading-6 text-text-main">
    پیشنهاد محدوده ۸۰٪ مشتریان صرفاً تحلیل است و هنوز تأیید مدیریتی ندارد؛ تشخیص خروج از مرز، نیازمند بررسی علت، دقت GPS و تأیید مرز رسمی تحلیلی است.
    {anomaly&&<> مشتری مشکوک خارج از مرز: {fa(anomaly.customersOutside.length)}؛ ویزیت خارج از مرز: {fa(anomaly.visitsOutside.length)}؛ مختصات نامشخص: {fa(anomaly.unknownCustomers.length+anomaly.unknownVisits.length)}.</>}
   </p>
   <div className="flex flex-wrap items-center gap-2">
    <span className="text-xs text-text-secondary">{detail.analysisBoundary
      ? 'نسخه ذخیره‌شده '+fa(detail.analysisBoundary.version)+' · وضعیت '+detail.analysisBoundary.status
      : 'مرز فعلی پیشنهاد اولیه ۸۰٪ و ذخیره نشده است'}</span>
    {canManage&&boundary&&<button type="button" disabled={saving} onClick={async()=>{
      setSaveMessage('');setSaving(true);
      try{
        const token=AuthService.getAccessToken();
        if(!token)throw new Error('نشست معتبر نیست.');
        const resp=await fetch('/api/v1/erp/visit-routes/'+encodeURIComponent(selected.RouteId)+'/geometry',{
          method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
          body:JSON.stringify({geometry:boundary,method:editedGeometry?'MANUAL':'AUTO_80_PERCENT',
            coveragePercent:suggested.actualCoveragePercent,sourceCount:suggested.validCustomerCount})
        });
        const result=await resp.json();
        if(!resp.ok)throw new Error(result.error?.message||'ذخیره مرز ناموفق بود.');
        setDetail(current=>current?{...current,analysisBoundary:{
          version:result.VersionNumber,status:'DRAFT',method:editedGeometry?'MANUAL':'AUTO_80_PERCENT',
          geometry:boundary,coveragePercent:suggested.actualCoveragePercent,sourceCount:suggested.validCustomerCount}}:current);
        setEditedGeometry(null);setSaveMessage('نسخه پیشنهادی مرز در SQL ذخیره شد؛ برای قطعی‌شدن به بازبینی مدیریتی نیاز دارد.');
      }catch(e){setSaveMessage(e instanceof Error?e.message:'خطای ثبت مرز');}
      finally{setSaving(false);}
    }} className="min-h-10 rounded-xl bg-primary px-3 text-xs font-bold text-white disabled:opacity-50">
     {saving?'در حال ثبت…':'ثبت نسخه مرز در SQL'}
    </button>}
    {saveMessage&&<span role="status" className="text-xs text-text-secondary">{saveMessage}</span>}
   </div>
   <div className="flex flex-wrap gap-3 text-xs">
    <label><input type="checkbox" checked={showCustomers} onChange={e=>setShowCustomers(e.target.checked)}/> مشتریان</label>
    <label><input type="checkbox" checked={showVisits} onChange={e=>setShowVisits(e.target.checked)}/> ویزیت‌ها</label>
    <label><input type="checkbox" checked={showGps} onChange={e=>setShowGps(e.target.checked)}/> GPS فروشنده</label>
   </div>
   <GeoZoneMapEditor
    key={selected.RouteId+date+':'+(detail.analysisBoundary?.version??'proposal')}
    geometry={boundary||undefined} coordinateText={toStringGeometry(boundary)}
    disabled={!canManage} onChange={geometry=>setEditedGeometry(geometry)}
    markers={markers} gpsTrack={gpsTrack}
   />
   {anomaly&&<div className="grid gap-2 sm:grid-cols-2">
    <section className="rounded-xl border border-border p-3 text-xs">
     <h3 className="font-black text-text-main">مشتریان مشکوک خارج از محدوده پیشنهادی</h3>
     <p className="my-2 text-text-secondary">احتمال اشتباه GPS مشتری یا انتساب مسیر؛ نیازمند بررسی انسانی، نه حذف خودکار.</p>
     {anomaly.customersOutside.length===0?<p>موردی در مختصات موجود تشخیص داده نشد.</p>:<ul className="max-h-48 space-y-1 overflow-auto">
      {anomaly.customersOutside.slice(0,50).map(customer=><li key={customer.id} className="flex justify-between gap-2">
       <span>{customer.name}</span><Link className="font-bold text-primary" to={'/accounts/'+encodeURIComponent(customer.id)}>جزئیات</Link>
      </li>)}
     </ul>}
    </section>
    <section className="rounded-xl border border-border p-3 text-xs">
     <h3 className="font-black text-text-main">ویزیت‌های مشکوک خارج از محدوده</h3>
     <p className="my-2 text-text-secondary">مختصات زمان ویزیت با محدوده پیشنهادی مقایسه شده؛ دقت GPS و زمان ثبت باید بررسی شود.</p>
     {anomaly.visitsOutside.length===0?<p>موردی در مختصات موجود تشخیص داده نشد.</p>:<ul className="max-h-48 space-y-1 overflow-auto">
      {anomaly.visitsOutside.slice(0,50).map(visit=><li key={visit.id} className="flex justify-between gap-2">
       <span>ویزیت {visit.id}</span>{visit.customerId&&<Link className="font-bold text-primary" to={'/accounts/'+encodeURIComponent(visit.customerId)}>پرونده مشتری</Link>}
      </li>)}
     </ul>}
    </section>
   </div>}
   <div className="space-y-2">
    <h3 className="text-sm font-black text-text-main">فهرست رسمی ترتیب مراجعه</h3>
    {!orderedStops.length?<p className="text-xs text-text-secondary">تور یا ایستگاه مجاز برای این تاریخ موجود نیست.</p>:<ol className="max-h-64 space-y-2 overflow-auto">
     {orderedStops.map((stop,index)=>{
      const customer=customers.find(c=>c.AccountId===stop.AccountId);
      return <li key={stop.TourId+':'+stop.StopSequence} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-xs">
       <span><strong>{fa(stop.StopSequence||index+1)}. </strong>{customer?.Name||'نام مشتری نامشخص'} · ویزیتور {stop.ExternalSalesRepId}</span>
       {customer&&<Link to={'/accounts/'+encodeURIComponent(customer.AccountId)} className="font-bold text-primary">مشاهده جزئیات</Link>}
      </li>;
     })}
    </ol>}
   </div>
   <div className="space-y-2">
    <h3 className="text-sm font-black text-text-main">نتایج و علت‌های عدم سفارش ثبت‌شده</h3>
    {!visits.length?<p className="text-xs text-text-secondary">ویزیت ثبت‌شده و قابل انتساب در این روز وجود ندارد.</p>:<div className="max-h-72 overflow-auto">
     {visits.slice(0,100).map(v=><div key={v.ExternalVisitId} className="border-b border-border py-2 text-xs">
      <strong>{customers.find(c=>c.AccountId===v.AccountId)?.Name||'مشتری نامشخص'}</strong> · {v.VisitedAtUtc} · نتیجه {v.OutcomeCode||'نامشخص'}
      {v.NoOrderReasonCode&&<p className="text-warning">علت عدم سفارش: {v.ReasonTitleFa||v.NoOrderReasonCode}</p>}
     </div>)}
    </div>}
   </div>
  </>}
 </Card>;
}
