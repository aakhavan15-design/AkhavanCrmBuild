import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVisitIntelligence } from '../src/lib/visitIntelligence.ts';
const c=(id,name,tags=[])=>({id,name,tags});
const v=(id,customerId,dateTime,outcome='NO_NEED',more={})=>({id,customerId,type:'VISIT',dateTime,outcome,...more});
const invoice=(id,customerId,date,totalAmount=1200000,more={})=>({
 id,customerId,date,totalAmount,status:'UNPAID',items:[{description:'لیموناد شیشه',quantity:12,unitPrice:40000,total:480000}],...more
});
const tour=(date,ids)=>({externalId:'TOUR-01',tourDate:date,routeExternalId:'ROUTE-07',salesRepExternalId:'REP-01',stops:ids.map((externalCustomerId,i)=>({externalCustomerId,stopSequence:i+1}))});
const base={asOf:'2026-11-22',customers:[c('C1','فروشگاه یک'),c('C2','تعاونی مصرف',['تعاونی'])],visits:[],invoices:[]};
test('lack of recorded visits is not proof of never visited',()=>{
 const r=buildVisitIntelligence(base); assert.equal(r.withoutRecordedVisits,2);
 assert.ok(r.incompleteSources.includes('تاریخچه کامل ویزیت تأیید نشده'));
 assert.equal(r.customerRows[0].salesTotal,null);
});
test('a scheduled visit is not counted as actual',()=>{
 const r=buildVisitIntelligence({...base,visits:[v('V1','C1','2026-11-21','FOLLOW_UP',{status:'PLANNED'}),{id:'V2',customerId:'C1',status:'PLANNED',plannedAt:'2026-11-20'},v('V3','C1','2026-11-20')]});
 assert.equal(r.totalActualVisits,1);
});
test('invoice details are not automatically attributed to last visit',()=>{
 const data={...base,visits:[v('V1','C2','2026-11-20')],invoices:[invoice('I1','C2','2026-11-20')]};
 const row=buildVisitIntelligence(data).customerRows.find(r=>r.customerId==='C2');
 assert.ok(row.reasons.includes('WHOLESALE'));assert.equal(row.lastInvoice.items[0].unitPrice,40000);assert.equal(row.visitLinkedInvoice,null);
 const linked=buildVisitIntelligence({...data,visits:[v('V1','C2','2026-11-20','ORDER_TAKEN',{invoiceId:'I1'})]});
 assert.equal(linked.customerRows.find(r=>r.customerId==='C2').visitLinkedInvoice.id,'I1');
});
test('a past scheduled ERP stop without actual visit is unconfirmed, not confirmed missed',()=>{
 const r=buildVisitIntelligence({...base,tours:[tour('2026-11-21',['C1','C2'])],visits:[v('V1','C1','2026-11-21','NO_NEED',{ownerId:'REP-01'})]});
 assert.equal(r.inErpTour,2);assert.equal(r.totalActualVisits,1);
 assert.equal(r.routes[0].plannedStops,2);assert.equal(r.routes[0].recordedVisitsOnTourDate,1);
 assert.equal(r.routes[0].unconfirmedPastStops,1);
 assert.ok(r.customerRows.find(x=>x.customerId==='C2').reasons.includes('UNCONFIRMED_TOUR_STOP'));
});
test('collection priority requires supplied verified ledger data',()=>{
 const r=buildVisitIntelligence({...base,receivables:[{customerId:'C1',outstandingAmount:3000000,overdueAmount:1000000,maxDaysOverdue:12}]});
 assert.ok(r.customerRows.find(x=>x.customerId==='C1').reasons.includes('COLLECTION_DUE'));
 assert.ok(!r.customerRows.find(x=>x.customerId==='C2').reasons.includes('COLLECTION_DUE'));
});
test('void invoices are excluded and valid sales returns remain a separate finding',()=>{
 const r=buildVisitIntelligence({...base,invoices:[invoice('I1','C1','2026-11-15',4000000),invoice('I2','C1','2026-11-16',9000000,{isVoided:true})],returns:[{id:'RET1',customerId:'C1',invoiceId:'I1',returnDate:'2026-11-18',totalAmount:300000}]});
 const row=r.customerRows.find(x=>x.customerId==='C1');
 assert.equal(row.invoiceCount,1);assert.equal(row.salesTotal,4000000);assert.equal(row.returnCount,1);
});
