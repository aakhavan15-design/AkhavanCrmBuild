/**
 * Conservative collection candidates for an actual dispatch plan.
 * The boundary is NOT an official service zone: it is a convex hull of
 * geocoded invoiced stops, and candidates must also be near a stop.
 * Missing/uncertain GPS is never interpreted as inside.
 */
const earth=6371000;
const radians=n=>n*Math.PI/180;
export function metersBetween(a,b){
 const p1=radians(a.latitude),p2=radians(b.latitude),dlat=p2-p1,dlon=radians(b.longitude-a.longitude);
 const h=Math.sin(dlat/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dlon/2)**2;
 return 2*earth*Math.asin(Math.min(1,Math.sqrt(h)));
}
const point=p=>p&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180&&!(p.latitude===0&&p.longitude===0);
function hull(points){
 const sorted=[...points].sort((a,b)=>a.longitude-b.longitude||a.latitude-b.latitude);
 const cross=(a,b,c)=>(b.longitude-a.longitude)*(c.latitude-a.latitude)-(b.latitude-a.latitude)*(c.longitude-a.longitude);
 const lower=[],upper=[];
 for(const p of sorted){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p)}
 for(const p of [...sorted].reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p)}
 return [...lower.slice(0,-1),...upper.slice(0,-1)];
}
const inside=(p,poly)=>{
 if(poly.length<3)return false;
 let result=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];
  if((a.latitude>p.latitude)!==(b.latitude>p.latitude)&&
     p.longitude<(b.longitude-a.longitude)*(p.latitude-a.latitude)/(b.latitude-a.latitude)+a.longitude)
   result=!result;
 }
 return result;
};
export function buildDispatchCollectionZone({
 dispatchNumber,invoiceStops,receivableCustomers,sourceComplete=false,
 radiusMeters=350,minimumGeocoded=3,showAllReceivables=false,manualOutsideIds=[]
}){
 const unavailable=reason=>({status:'UNAVAILABLE',reason,dispatchNumber,rows:[],markers:[],geometry:null});
 if(!sourceComplete)return unavailable('مانده قطعی مالی یا مختصات مشتری از منبع مجاز ناقص است');
 if(!Number.isFinite(radiusMeters)||radiusMeters<0||radiusMeters>1500)
  return unavailable('حداکثر فاصله از توقف باید بین ۰ تا ۱۵۰۰ متر باشد');
 const uniqueStops=new Map();
 for(const stop of invoiceStops||[]){
  if(!stop.customerId)continue;
  if(point(stop.point) && (stop.accuracyMeters==null||stop.accuracyMeters<=100))
   uniqueStops.set(String(stop.customerId),stop);
 }
 const gpsStops=[...uniqueStops.values()];
 const totalStops=new Set((invoiceStops||[]).map(s=>String(s.customerId))).size;
 if(gpsStops.length<minimumGeocoded || minimumGeocoded<3)
  return unavailable('تعداد مشتریان فاکتوردار با مختصات معتبر برای ترسیم محدوده کافی نیست');
 const polygon=hull(gpsStops.map(s=>s.point));
 if(polygon.length<3)return unavailable('مختصات مسیر هم‌خط هستند و محدوده قابل اثبات نیست');
 const perimeter=polygon.reduce((sum,p,i)=>sum+metersBetween(p,polygon[(i+1)%polygon.length]),0);
 if(!Number.isFinite(perimeter)||perimeter>50000)
  return unavailable('پراکندگی مختصات زیاد است؛ محدوده پیشنهادی قابل اعتماد نیست');
 const manual=new Set(manualOutsideIds.map(String));
 const rows=[];
 for(const c of receivableCustomers||[]){
  if(!c.customerId||!Number.isFinite(c.officialBalanceRials)||c.officialBalanceRials<=0)continue;
  const hasGeo=point(c.point)&&(c.accuracyMeters==null||c.accuracyMeters<=100);
  const close=hasGeo?Math.min(...gpsStops.map(s=>metersBetween(s.point,c.point))):Infinity;
  const inHull=hasGeo&&inside(c.point,polygon);
  const suggested=inHull&&close<=radiusMeters;
  const included=suggested||manual.has(String(c.customerId))||showAllReceivables;
  rows.push({customerId:String(c.customerId),name:String(c.name||c.customerId),
    officialBalanceRials:c.officialBalanceRials,point:hasGeo?c.point:null,
    inZone:suggested,manualOutside:!suggested&&manual.has(String(c.customerId)),
    nearStopMeters:Number.isFinite(close)?Math.round(close):null,included});
 }
 rows.sort((a,b)=>Number(b.inZone)-Number(a.inZone)||b.officialBalanceRials-a.officialBalanceRials);
 const invoiceMarkers=gpsStops.map(s=>({id:'dispatch:'+s.customerId,customerId:String(s.customerId),
   name:String(s.name||s.customerId),point:s.point,kind:'DISPATCH',tone:'good'}));
 const collectionMarkers=rows.filter(c=>c.included&&c.point).map(c=>({id:'collection:'+c.customerId,
   customerId:c.customerId,name:c.name,point:c.point,kind:'COLLECTION',tone:'bad',outside:!c.inZone,
   balanceRials:c.officialBalanceRials}));
 return {status:'AVAILABLE',dispatchNumber,source:'OFFICIAL_LEDGER_CURRENT',asOf:'CURRENT',
   mappedStopCount:gpsStops.length,totalStopCount:totalStops,missingGeoStopCount:Math.max(0,totalStops-gpsStops.length),
   geometry:{type:'Polygon',coordinates:[[...polygon.map(p=>[p.longitude,p.latitude]),[polygon[0].longitude,polygon[0].latitude]]]},
   suggestedCount:rows.filter(x=>x.inZone).length,
   rows,markers:[...invoiceMarkers,...collectionMarkers],
   notes:['محدوده هندسی تقریبی است؛ نه مسیر رانندگی و نه مجوز قطعی مأموریت وصول','مطالبات، مانده امروز است نه الزاماً مانده روز توزیع']};
}
