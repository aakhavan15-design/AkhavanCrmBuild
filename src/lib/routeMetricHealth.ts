/**
 * Transparent, source-aware route comparison; never infer economic performance
 * from a route's raw size. A grey bubble means no defensible classification.
 */
export type RouteTone='good'|'warn'|'bad'|'unknown';
export interface MetricRoute {
 customerCount:number|null;
 activeCustomerCount:number|null;
 invoicedSales:number|null;
 netSales:number|null;
 invoiceCount:number|null;
 returnAmount:number|null;
 receivableAmount:number|null;
 profitAmount:number|null;
 targetAchievedPercent:number|null;
 attentionPercent:number|null;
 visitCount:number|null;
}
export type RouteMetricId=keyof Pick<MetricRoute,'customerCount'|'activeCustomerCount'|'invoicedSales'|'netSales'|'invoiceCount'|'returnAmount'|'receivableAmount'|'profitAmount'|'targetAchievedPercent'|'attentionPercent'|'visitCount'>;
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const asRate=(a:number|null,b:number|null)=>finite(a)&&finite(b)&&b>0?a/b:null;
function quartile(values:number[],fraction:number){
 const sorted=values.slice().sort((a,b)=>a-b);
 return sorted[Math.max(0,Math.min(sorted.length-1,Math.ceil(sorted.length*fraction)-1))];
}
export interface ToneAssessment {tone:RouteTone;basis:string;value:number|null}
export function assessRouteMetric(route:MetricRoute,all:MetricRoute[],metric:RouteMetricId):ToneAssessment {
 if(metric==='targetAchievedPercent'){
  const v=route.targetAchievedPercent;
  if(!finite(v))return {tone:'unknown',basis:'هدف هم‌بازه و مصوب موجود نیست',value:null};
  return {tone:v>=100?'good':v>=80?'warn':'bad',basis:'تحقق هدف مصوب مسیر',value:v};
 }
 if(metric==='attentionPercent'||metric==='visitCount'){
  const v=route.attentionPercent;
  if(!finite(v))return {tone:'unknown',basis:'پوشش ویزیت قابل اثبات نیست',value:null};
  return {tone:v>=70?'good':v>=35?'warn':'bad',basis:'پوشش مشتریان مسیر با ویزیت واقعی',value:v};
 }
 if(metric==='customerCount'){
  const active=asRate(route.activeCustomerCount,route.customerCount);
  const coverage=route.attentionPercent;
  if(active===null||!finite(coverage))return {tone:'unknown',basis:'خریداران یا پوشش ویزیت کافی نیست',value:null};
  const score=Math.round((active*100*0.6+coverage*0.4)*10)/10;
  return {tone:score>=70?'good':score>=40?'warn':'bad',basis:'۶۰٪ نرخ مشتری خریدار + ۴۰٪ پوشش مراجعه',value:score};
 }
 if(metric==='activeCustomerCount'){
  const v=asRate(route.activeCustomerCount,route.customerCount);
  if(v===null)return {tone:'unknown',basis:'نرخ خریدار قابل محاسبه نیست',value:null};
  return {tone:v>=.7?'good':v>=.4?'warn':'bad',basis:'نسبت مشتریان خریدار به تمام مشتریان مسیر',value:v*100};
 }
 const ratio=(r:MetricRoute)=>asRate(r[metric],r.customerCount);
 const value=ratio(route);
 const comparable=all.map(ratio).filter((v):v is number=>v!==null);
 if(value===null||comparable.length<4)
  return {tone:'unknown',basis:'برای مقایسه سرانه حداقل چهار مسیر با داده معتبر لازم است',value};
 const low=quartile(comparable,.25),high=quartile(comparable,.75);
 if(low===high)return {tone:'warn',basis:'شاخص سرانه در بیشتر مسیرها برابر است',value};
 const lowerBetter=metric==='returnAmount'||metric==='receivableAmount';
 const tone=value<=low?(lowerBetter?'good':'bad'):value>=high?(lowerBetter?'bad':'good'):'warn';
 return {tone,basis:'مقایسه سرانه مشتری با چارک مسیرهای مجاز و هم‌بازه',value};
}
