/**
 * Visit intelligence: evidence-based recommendations, never authoritative ERP writes.
 * The caller MUST pass already RBAC-scoped customers, visits and financial records.
 * A missing visit/invoice is not proof that the underlying event never happened.
 */
export interface VisitIntelCustomer {
  id: string; name: string; code?: string; tags?: string[]; channel?: string;
  customerClass?: string; businessType?: string; createdAt?: string;
}
export interface VisitIntelVisit {
  id: string; customerId?: string; accountId?: string;
  dateTime?: string; checkInAt?: string; plannedAt?: string;
  status?: string; type?: string; outcome?: string;
  ownerId?: string; repId?: string; description?: string; notes?: string;
  orderId?: string; salesOrderId?: string; invoiceId?: string;
  noOrderReason?: string; reasonCode?: string;
}
export interface VisitIntelInvoice {
  id: string; customerId?: string; accountId?: string; date: string;
  invoiceNumber?: string; totalAmount?: number; status?: string;
  salesOrderId?: string; deletedAt?: string | null; isVoided?: boolean;
  items?: Array<{ description?: string; quantity?: number; unitPrice?: number; total?: number }>;
}
export interface VisitIntelReturn {
  id?: string; customerId?: string; accountId?: string;
  externalInvoiceId?: string; invoiceId?: string; returnDate?: string;
  totalAmount?: number; totalValue?: number; isVoided?: boolean; statusCode?: string;
}
export interface VisitIntelTour {
  externalId: string; tourDate: string; routeExternalId: string; salesRepExternalId: string;
  sourceSystemCode?: string; statusCode?: string; isDeleted?: boolean;
  stops: Array<{ externalCustomerId: string; stopSequence: number }>;
}
export interface VisitIntelReceivable {customerId: string; outstandingAmount: number; overdueAmount: number; maxDaysOverdue: number}
export interface VisitIntelArgs {
  customers: VisitIntelCustomer[];
  visits: VisitIntelVisit[];
  invoices: VisitIntelInvoice[];
  returns?: VisitIntelReturn[];
  tours?: VisitIntelTour[];
  receivables?: VisitIntelReceivable[];
  asOf: string;
  historyComplete?: boolean;
  invoiceHistoryComplete?: boolean;
  visitTargetDays?: number;
}
export type VisitIntelLabel = 'NO_RECORDED_VISIT'|'OVERDUE_VISIT'|'HIGH_VALUE'|'WHOLESALE'|'NO_ORDER'|'RETURN_REVIEW'|'COLLECTION_DUE'|'IN_WEEK_TOUR'|'OUTSIDE_WEEK_TOUR'|'UNCONFIRMED_TOUR_STOP';
export interface VisitIntelRow {
  customerId: string; name: string; score: number; reasons: VisitIntelLabel[];
  recordedVisits: number; lastVisitDate: string | null; lastVisitOutcome: string | null; lastNoOrderReason: string | null;
  daysSinceVisit: number | null; invoiceCount: number; salesTotal: number | null;
  visitLinkedInvoice: VisitIntelInvoice | null; unconfirmedTourStops: number;
  averageInvoice: number | null; lastInvoiceDate: string | null; lastInvoice: VisitIntelInvoice | null;
  returnedInvoiceIds: string[]; returnCount: number;
  receivable: VisitIntelReceivable | null;
  tourStops: Array<{tourId:string;date:string;routeId:string;repId:string;sequence:number}>;
  evidence: string[]; warnings: string[];
}
export interface VisitIntelReport {
  asOf: string; weekStart: string; weekEnd: string;
  customerCount: number; withRecordedVisits: number; withoutRecordedVisits: number;
  inErpTour: number; totalActualVisits: number; customerRows: VisitIntelRow[];
  incompleteSources: string[]; reasonCounts: Array<{reason: string; count: number}>;
  routes: Array<{routeId: string; repId: string; plannedStops: number; recordedVisitsOnTourDate: number; unconfirmedPastStops: number; collectionDueStops: number}>;
}
const DAY_MS = 86400000;
const ymd = (value: unknown): string | null => {
  if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const date = value.slice(0,10);
  const d = new Date(date+'T00:00:00Z');
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0,10)===date ? date : null;
};
const diffDays = (start: string,end: string): number => Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/DAY_MS);
const money = (n: unknown): number | null => typeof n==='number' && Number.isFinite(n) && n>=0 ? n : null;
const emptyOrVoided = (record: {deletedAt?:string|null; isVoided?:boolean;status?:string;statusCode?:string}): boolean =>
  !!record.deletedAt || record.isVoided === true || ['VOID','VOIDED','CANCELLED','CANCELED','DELETED'].includes(String(record.statusCode||record.status||'').toUpperCase());
const realVisit = (v: VisitIntelVisit): boolean =>
  v.type==='VISIT'
    ? Boolean(ymd(v.checkInAt||v.dateTime) && !['PLANNED','PENDING','CANCELLED','CANCELED'].includes(String(v.status||'').toUpperCase()))
    : Boolean(v.checkInAt && ymd(v.checkInAt) && ['COMPLETED','DONE'].includes(String(v.status||'').toUpperCase()));
const normalizedChannel = (c: VisitIntelCustomer) => [c.channel,c.customerClass,c.businessType,...(c.tags||[])].filter(Boolean).join(' ').toLowerCase();
export const visitReasonLabel: Record<VisitIntelLabel,string> = {
  NO_RECORDED_VISIT:'فاقد مراجعه ثبت‌شده',OVERDUE_VISIT:'فاصله زیاد از مراجعه قبلی',
  HIGH_VALUE:'سابقه خرید ارزشمند',WHOLESALE:'مشتری عمده/تعاونی',
  NO_ORDER:'ویزیت بدون سفارش',RETURN_REVIEW:'برگشت فروش نیازمند بررسی',
  COLLECTION_DUE:'مانده معوق معتبر',IN_WEEK_TOUR:'در تور رسمی این هفته',
  UNCONFIRMED_TOUR_STOP:'ایستگاه گذشته بدون ثبت مراجعه',
  OUTSIDE_WEEK_TOUR:'خارج از تور رسمی هفته',
};
export function buildVisitIntelligence(args: VisitIntelArgs): VisitIntelReport {
  const asOf=ymd(args.asOf);
  if(!asOf) throw new Error('تاریخ گزارش معتبر نیست.');
  const weekday=new Date(asOf+'T00:00:00Z').getUTCDay();
  // Operational Iranian week starts on Saturday.
  const weekStart=new Date(Date.parse(asOf+'T00:00:00Z') - ((weekday+1)%7)*DAY_MS).toISOString().slice(0,10);
  const weekEnd=new Date(Date.parse(weekStart+'T00:00:00Z')+6*DAY_MS).toISOString().slice(0,10);
  const target=Math.max(1,Math.min(365,Math.floor(args.visitTargetDays||14)));
  const ids=new Set(args.customers.map(c=>c.id));
  const visits=(args.visits||[]).filter(v=>ids.has(String(v.customerId||v.accountId||'')) && realVisit(v) && (ymd(v.checkInAt||v.dateTime)||'')<=asOf);
  const invoices=(args.invoices||[]).filter(i=>ids.has(String(i.customerId||i.accountId||'')) && !emptyOrVoided(i) && !!ymd(i.date) && (ymd(i.date)||'')<=asOf);
  const returns=(args.returns||[]).filter(r=>!emptyOrVoided(r) && !!ymd(r.returnDate) && (ymd(r.returnDate) as string) <= asOf);
  const tourStops=new Map<string,VisitIntelRow['tourStops']>();
  for(const tour of args.tours||[]) {
    if(tour.isDeleted||!ymd(tour.tourDate)||tour.tourDate<weekStart||tour.tourDate>weekEnd || emptyOrVoided(tour)) continue;
    for(const stop of tour.stops||[]) {
      const customerId=String(stop.externalCustomerId||'');
      if(!ids.has(customerId)||!Number.isSafeInteger(stop.stopSequence)||stop.stopSequence<1) continue;
      const arr=tourStops.get(customerId)||[];
      arr.push({tourId:tour.externalId,date:tour.tourDate,routeId:tour.routeExternalId,repId:tour.salesRepExternalId,sequence:stop.stopSequence});
      tourStops.set(customerId,arr);
    }
  }
  const balanceMap=new Map((args.receivables||[]).filter(r=>ids.has(r.customerId)).map(r=>[r.customerId,r]));
  const provisional = args.customers.map(customer=>{
    const cv=visits.filter(v=>String(v.customerId||v.accountId||'')===customer.id).sort((a,b)=>String(b.checkInAt||b.dateTime).localeCompare(String(a.checkInAt||a.dateTime)));
    const ci=invoices.filter(i=>String(i.customerId||i.accountId||'')===customer.id).sort((a,b)=>b.date.localeCompare(a.date));
    const last=cv[0];const lastDate=last?ymd(last.checkInAt||last.dateTime):null;
    const amounts=ci.map(i=>money(i.totalAmount));
    const salesTotal=ci.length > 0 && amounts.every(a=>a!==null)?amounts.reduce<number>((sum,a)=>sum+(a||0),0):null;
    const matches=returns.filter(r=>
      String(r.customerId||r.accountId||'')===customer.id ||
      ci.some(i=>r.invoiceId===i.id||r.externalInvoiceId===i.id||r.externalInvoiceId===i.invoiceNumber));
    const first=ci[0]||null;
    return {customer,cv,ci,last,lastDate,amounts,salesTotal,matches,first};
  });
  const historical=provisional.map(p=>p.salesTotal).filter((n):n is number=>n!==null && n>0).sort((a,b)=>a-b);
  const highValueThreshold=historical.length>=4?historical[Math.max(0,Math.ceil(historical.length*.75)-1)]:null;
  const customerRows:VisitIntelRow[]=provisional.map(p=>{
    const {customer,cv,ci,last,lastDate,salesTotal,matches,first}=p;
    const recordedVisits=cv.length,daysSinceVisit=lastDate?diffDays(lastDate,asOf):null;
    const reasons:VisitIntelLabel[]=[];const evidence:string[]=[];const warnings:string[]=[];
    const add=(r:VisitIntelLabel)=>{if(!reasons.includes(r))reasons.push(r)};
    if(!recordedVisits) add('NO_RECORDED_VISIT');
    if(daysSinceVisit!==null && daysSinceVisit>=target) add('OVERDUE_VISIT');
    if(highValueThreshold!==null&&salesTotal!==null&&salesTotal>=highValueThreshold&&salesTotal>0)add('HIGH_VALUE');
    if(/عمده|تعاون|wholesale|cooperativ|horeca|هتل|رستوران/.test(normalizedChannel(customer)))add('WHOLESALE');
    if(last && (['NO_ORDER','NO_NEED','FOLLOW_UP','PRICE_OBJECTION','NOT_ORDERED','NO_PURCHASE'].includes(String(last.outcome||'').toUpperCase()) || Boolean(last.noOrderReason))) add('NO_ORDER');
    if(matches.length)add('RETURN_REVIEW');
    const receivable=balanceMap.get(customer.id)||null;
    if(receivable&&receivable.overdueAmount>0)add('COLLECTION_DUE');
    const stops=(tourStops.get(customer.id)||[]).sort((a,b)=>a.date.localeCompare(b.date)||a.sequence-b.sequence);
    if(stops.length)add('IN_WEEK_TOUR');
    const unconfirmedTourStops=stops.filter(stop=>stop.date<asOf&&!cv.some(v=>ymd(v.checkInAt||v.dateTime)===stop.date && (!v.repId&&!v.ownerId||[v.repId,v.ownerId].includes(stop.repId)))).length;
    if(unconfirmedTourStops)add('UNCONFIRMED_TOUR_STOP');
    else if((args.tours||[]).length)add('OUTSIDE_WEEK_TOUR');
    if(last) evidence.push('VISIT:'+last.id);
    if(first) evidence.push('INVOICE:'+first.id);
    for(const r of matches) if(r.id)evidence.push('RETURN:'+r.id);
    for(const stop of stops)evidence.push('TOUR:'+stop.tourId);
    if(!args.historyComplete)warnings.push('پوشش تاریخچه ویزیت تأیید نشده؛ نبود رکورد به معنی هرگز ویزیت‌نشدن نیست.');
    if(!args.invoiceHistoryComplete)warnings.push('پوشش تاریخچه فاکتور تأیید نشده؛ رتبه خرید نسبی به داده موجود است.');
    if(!receivable)warnings.push('مانده رسمی قابل اتکا برای این مشتری ارائه نشده است.');
    const score=(reasons.includes('UNCONFIRMED_TOUR_STOP')?20:0)+(reasons.includes('NO_RECORDED_VISIT')?22:0)+(reasons.includes('OVERDUE_VISIT')?18:0)+
      (reasons.includes('HIGH_VALUE')?18:0)+(reasons.includes('WHOLESALE')?10:0)+
      (reasons.includes('NO_ORDER')?12:0)+(reasons.includes('RETURN_REVIEW')?8:0)+
      (reasons.includes('COLLECTION_DUE')?15:0)+(reasons.includes('IN_WEEK_TOUR')?12:0);
    return {customerId:customer.id,name:customer.name,score,reasons,recordedVisits,lastVisitDate:lastDate,
      lastVisitOutcome:last?String(last.outcome||last.status||'ثبت نشده'):null,
      lastNoOrderReason:last?String(last.noOrderReason||last.reasonCode||last.description||last.notes||'').trim()||null:null,
      daysSinceVisit,invoiceCount:ci.length,salesTotal,
      unconfirmedTourStops,
      visitLinkedInvoice:last ? ci.find(i=>(last.invoiceId&&[i.id,i.invoiceNumber].includes(last.invoiceId))||(last.salesOrderId||last.orderId)&&i.salesOrderId===(last.salesOrderId||last.orderId))||null : null,
      averageInvoice:salesTotal===null||!ci.length?null:salesTotal/ci.length,
      lastInvoiceDate:first?.date||null,lastInvoice:first,
      returnedInvoiceIds:[...new Set(matches.map(r=>String(r.invoiceId||r.externalInvoiceId||'')).filter(Boolean))],
      returnCount:matches.length,receivable,tourStops:stops,evidence,warnings};
  }).sort((a,b)=>b.score-a.score||b.invoiceCount-a.invoiceCount||a.name.localeCompare(b.name,'fa'));
  const reasonMap=new Map<string,number>();
  for(const v of visits){
    const reason=String(v.noOrderReason||v.reasonCode||
      (['NO_ORDER','NO_NEED','FOLLOW_UP','PRICE_OBJECTION','NOT_ORDERED','NO_PURCHASE'].includes(String(v.outcome||'').toUpperCase())?v.outcome:'')).trim();
    if(reason)reasonMap.set(reason,(reasonMap.get(reason)||0)+1);
  }
  const reasonCounts=[...reasonMap].map(([reason,count])=>({reason,count})).sort((a,b)=>b.count-a.count);
  const routesMap=new Map<string,{routeId:string;repId:string;plannedStops:number;recordedVisitsOnTourDate:number;unconfirmedPastStops:number;collectionDueStops:number}>();
  for(const row of customerRows)for(const stop of row.tourStops){
    const key=stop.routeId+'|'+stop.repId;
    const entry=routesMap.get(key)||{routeId:stop.routeId,repId:stop.repId,plannedStops:0,recordedVisitsOnTourDate:0,unconfirmedPastStops:0,collectionDueStops:0};
    entry.plannedStops++;
    const done=visits.some(v=>String(v.customerId||v.accountId||'')===row.customerId && ymd(v.checkInAt||v.dateTime)===stop.date && (!v.repId&&!v.ownerId||[v.repId,v.ownerId].includes(stop.repId)));
    if(done)entry.recordedVisitsOnTourDate++;
    else if(stop.date<asOf)entry.unconfirmedPastStops++;
    if(row.receivable && row.receivable.overdueAmount>0)entry.collectionDueStops++;
    routesMap.set(key,entry);
  }
  return {asOf,weekStart,weekEnd,customerCount:args.customers.length,
    withRecordedVisits:customerRows.filter(r=>r.recordedVisits>0).length,
    withoutRecordedVisits:customerRows.filter(r=>!r.recordedVisits).length,
    inErpTour:customerRows.filter(r=>r.tourStops.length>0).length,totalActualVisits:visits.length,
    customerRows,routes:[...routesMap.values()].sort((a,b)=>b.unconfirmedPastStops-a.unconfirmedPastStops||b.collectionDueStops-a.collectionDueStops),incompleteSources:[
      ...(!args.historyComplete?['تاریخچه کامل ویزیت تأیید نشده']:[]),
      ...(!args.invoiceHistoryComplete?['تاریخچه کامل فروش تأیید نشده']:[]),
      ...(!(args.tours||[]).length?['تور ERP برای هفته جاری در داده قابل مشاهده نیست']:[]),
      ...(!(args.receivables||[]).length?['مانده تأییدشده دفتر کل برای اولویت وصول در دسترس نیست']:[])
    ],reasonCounts};
}
