import type { GeoPoint, GeoPolygonGeometry } from '../types';
import { isPointInsideZone, readCustomerGeoPoint, validateZonePolygon } from './geoIntelligence';

/** Advisory boundaries never alter ERP-assigned route membership or official tour order. */
export interface GeoCustomer { id:string; name:string; [key:string]:unknown }
export interface GeoVisit { id:string; customerId?:string; accountId?:string; latitude?:number|string|null; longitude?:number|string|null; checkInLatitude?:number|string|null; checkInLongitude?:number|string|null; [key:string]:unknown }
export interface RouteGeometrySuggestion {
  geometry: GeoPolygonGeometry | null;
  validCustomerCount:number;
  coreCustomerCount:number;
  actualCoveragePercent:number;
  excluded: Array<{id:string;name:string;distanceKm:number}>;
  missingCoordinates: Array<{id:string;name:string}>;
  status:'READY'|'INSUFFICIENT_COORDINATES';
  explanation:string;
}
const rad=(d:number)=>d*Math.PI/180;
export function geoDistanceKm(a:GeoPoint,b:GeoPoint):number{
 const dLat=rad(b.latitude-a.latitude),dLon=rad(b.longitude-a.longitude);
 const h=Math.sin(dLat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dLon/2)**2;
 return 6371.0088*2*Math.atan2(Math.sqrt(Math.max(0,h)),Math.sqrt(Math.max(0,1-h)));
}
const median=(values:number[])=>{const s=[...values].sort((a,b)=>a-b);const m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
/** Suggested boundary covers the geographically concentrated 80% of mapped route customers.
 * The outer 20% are candidates for review, never automatically removed from ERP routes.
 * An approximate rectangle is intentional: editable on the existing fullscreen map.
 */
export function suggestRoutePolygonFromCustomers(customers:GeoCustomer[],fraction=.8):RouteGeometrySuggestion{
 const mapped: Array<{id:string;name:string;point:GeoPoint}>=[];
 const missingCoordinates:RouteGeometrySuggestion['missingCoordinates']=[];
 for(const c of customers){
  const point=readCustomerGeoPoint(c);
  if(point)mapped.push({id:c.id,name:c.name,point});
  else missingCoordinates.push({id:c.id,name:c.name});
 }
 if(mapped.length<3)return {geometry:null,validCustomerCount:mapped.length,coreCustomerCount:0,actualCoveragePercent:0,excluded:[],missingCoordinates,status:'INSUFFICIENT_COORDINATES',explanation:'حداقل سه مشتری با مختصات معتبر برای پیشنهاد محدوده لازم است.'};
 const center:GeoPoint={latitude:median(mapped.map(p=>p.point.latitude)),longitude:median(mapped.map(p=>p.point.longitude))};
 const sorted=mapped.map(p=>({...p,distanceKm:geoDistanceKm(center,p.point)}))
  .sort((a,b)=>a.distanceKm-b.distanceKm||a.id.localeCompare(b.id));
 const keep=Math.max(3,Math.min(sorted.length,Math.ceil(sorted.length*Math.max(.5,Math.min(1,fraction)))));
 const core=sorted.slice(0,keep);
 const latitudes=core.map(p=>p.point.latitude),longitudes=core.map(p=>p.point.longitude);
 const avgLat=median(latitudes);
 const padLatitude=Math.max(.001,0.15/111);
 const padLongitude=Math.max(.001,0.15/(111*Math.max(.1,Math.cos(rad(avgLat)))));
 const south=Math.max(-90,Math.min(...latitudes)-padLatitude),north=Math.min(90,Math.max(...latitudes)+padLatitude);
 const west=Math.max(-180,Math.min(...longitudes)-padLongitude),east=Math.min(180,Math.max(...longitudes)+padLongitude);
 const geometry:GeoPolygonGeometry={type:'Polygon',coordinates:[[[west,south],[east,south],[east,north],[west,north],[west,south]]]};
 const actualCount=mapped.filter(p=>isPointInsideZone(p.point,geometry)).length;
 return {
  geometry,validCustomerCount:mapped.length,coreCustomerCount:keep,
  actualCoveragePercent:Math.round(actualCount*10000/mapped.length)/100,
  excluded:sorted.filter(p=>!isPointInsideZone(p.point,geometry)).map(({id,name,distanceKm})=>({id,name,distanceKm})),
  missingCoordinates,status:'READY',
  explanation:'محدوده پیشنهادی از ۸۰٪ نقاط متراکم ساخته شده؛ پیش از تأیید روی نقشه تمام‌صفحه مرز را بررسی و اصلاح کنید. نقاط پرت از مسیر ERP حذف نمی‌شوند.'
 };
}
export function inspectRouteCoordinates(customers:GeoCustomer[],visits:GeoVisit[],geometry:GeoPolygonGeometry){
 if(!validateZonePolygon(geometry).valid)return {customersOutside:[],visitsOutside:[],unknownCustomers:customers.map(c=>c.id),unknownVisits:visits.map(v=>v.id),invalidBoundary:true};
 const customersOutside: Array<{id:string;name:string;point:GeoPoint}>=[];
 const unknownCustomers:string[]=[];
 const customerSet=new Set(customers.map(c=>c.id));
 for(const customer of customers){
  const point=readCustomerGeoPoint(customer);
  if(!point)unknownCustomers.push(customer.id);
  else if(!isPointInsideZone(point,geometry)) customersOutside.push({id:customer.id,name:customer.name,point});
 }
 const visitsOutside: Array<{id:string;customerId:string;point:GeoPoint}>=[];
 const unknownVisits:string[]=[];
 for(const v of visits){
  const customerId=String(v.customerId||v.accountId||'');
  if(!customerSet.has(customerId))continue;
  const point=readCustomerGeoPoint({latitude:v.checkInLatitude??v.latitude,longitude:v.checkInLongitude??v.longitude});
  if(!point)unknownVisits.push(v.id);
  else if(!isPointInsideZone(point,geometry))visitsOutside.push({id:v.id,customerId,point});
 }
 return {customersOutside,visitsOutside,unknownCustomers,unknownVisits,invalidBoundary:false};
}
