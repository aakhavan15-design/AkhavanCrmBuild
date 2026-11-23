/**
 * Dispatch analysis contracts: business joins are by official dispatch number,
 * invoice identifiers and confirmed ERP financial journal links, never dates alone.
 * Read-only; the output is evidence for review, not a posting or penalty.
 */
const settled=new Set(['POSTED','CONFIRMED','FINAL','CLOSED']);
const valid=x=>typeof x==='number' && Number.isFinite(x) && x>=0;
const key=x=>String(x??'').trim();
const safeSum=xs=>xs.reduce((a,b)=>a+b,0);
export const DISPATCH_JOURNAL_BUCKETS=Object.freeze([
 'CASH','CASH_DISCOUNT','INVOICE_SURCHARGE','CHEQUE','TRANSFER','CASH_REFUND'
]);
/**
 * Journal signs must already be normalized by the finance/COA adapter; no
 * guessing credit/debit from textual journal descriptions.
 */
export function buildDispatchEvidence({
 dispatchNumber, invoices, returns, journalEntries, invoiceOutstanding=[], financeComplete=false,
 receivableComplete=false, returnComplete=false, invoiceComplete=false, asOf
}) {
 const unavailable=(reason)=>({status:'UNAVAILABLE',reason,dispatchNumber:key(dispatchNumber)});
 const number=key(dispatchNumber);
 if(!number)return unavailable('شماره حمل مشخص نیست');
 if(!invoiceComplete)return unavailable('پوشش فاکتورهای حمل از ERP تأیید نشده');
 if(!returnComplete)return unavailable('پوشش برگشتی‌های ERP کامل نیست');
 const selected=(invoices||[]).filter(i=>key(i.dispatchNumber)===number&&settled.has(key(i.status).toUpperCase())&&!i.isVoided);
 const invoiceMap=new Map();
 for(const i of selected){
  if(!key(i.id)||!key(i.customerId)||!key(i.sellerId)||!valid(i.grossRials))return unavailable('شناسه یا مبلغ فاکتور نامعتبر است');
  if(invoiceMap.has(key(i.id)))return unavailable('فاکتور تکراری در داده حمل');
  invoiceMap.set(key(i.id),i);
 }
 const indexed=new Map(),unbased=[],excluded=[];
 const seenReturns=new Set();
 for(const ret of returns||[]){
  if(!settled.has(key(ret.status).toUpperCase())||ret.isVoided)continue;
  if(!key(ret.id)||!valid(ret.amountRials))return unavailable('سند برگشتی معتبر نیست');
  const original=invoiceMap.get(key(ret.invoiceId));
  if(original && key(ret.customerId)!==key(original.customerId))
   return unavailable('برگشتی متصل به فاکتور با مشتری ناسازگار');
  const explicitDispatch=key(ret.dispatchNumber);
  // Linked returns can belong to the dispatch even if return processed later.
  const belongs=!!original || (!ret.invoiceId && explicitDispatch===number);
  if(!belongs){excluded.push(key(ret.id));continue}
  if(seenReturns.has(key(ret.id)))return unavailable('برگشتی تکراری');
  seenReturns.add(key(ret.id));
  if(!original){
   unbased.push({returnId:key(ret.id),sellerId:key(ret.sellerId),customerId:key(ret.customerId),amountRials:ret.amountRials});
   continue;
  }
  indexed.set(key(original.id),(indexed.get(key(original.id))||0)+ret.amountRials);
 }
 // Official finance must allocate current balances to each invoice; customer-wide
 // balances cannot be proportionally guessed per seller, supplier or dispatch.
 const remainingByInvoice=new Map();
 if(receivableComplete){
  for(const row of invoiceOutstanding){
   const id=key(row.invoiceId);
   if(!id||remainingByInvoice.has(id)||!valid(row.amountRials))return unavailable('شاهد مانده فاکتور از مالی ناقص یا تکراری است');
   remainingByInvoice.set(id,row.amountRials);
  }
  if([...invoiceMap.keys()].some(id=>!remainingByInvoice.has(id)))
   return unavailable('مانده قطعی یکی از فاکتورهای حمل از مالی دریافت نشده است');
 }
 const bySeller=new Map();
 for(const i of invoiceMap.values()){
  const id=key(i.sellerId);
  const row=bySeller.get(id)||{sellerId:id,invoiceCount:0,returnedInvoiceCount:0,grossRials:0,linkedReturnsRials:0,receivableRials:receivableComplete?0:null,customerIds:new Set()};
  row.invoiceCount++;row.grossRials+=i.grossRials;row.customerIds.add(key(i.customerId));
  const returned=indexed.get(key(i.id))||0;
  if(returned>0)row.returnedInvoiceCount++;
  row.linkedReturnsRials+=returned;
  if(receivableComplete)row.receivableRials+=remainingByInvoice.get(key(i.id));
  bySeller.set(id,row);
 }
 const sellers=[...bySeller.values()].map(({customerIds,...r})=>({...r,customerCount:customerIds.size,
   returnInvoiceRate:r.invoiceCount?r.returnedInvoiceCount/r.invoiceCount:null,
   returnValueRate:r.grossRials?r.linkedReturnsRials/r.grossRials:null,
   receivableRate:receivableComplete&&r.grossRials?r.receivableRials/r.grossRials:null}));
 const entries=(journalEntries||[]).filter(j=>key(j.dispatchNumber)===number&&settled.has(key(j.status).toUpperCase())&&!j.isVoided);
 const journal={};
 for(const bucket of DISPATCH_JOURNAL_BUCKETS)journal[bucket]=financeComplete?0:null;
 if(financeComplete){
  const seen=new Set();
  for(const j of entries){
   if(!key(j.id)||seen.has(key(j.id))||!DISPATCH_JOURNAL_BUCKETS.includes(j.bucket)||!valid(j.amountRials))
    return unavailable('سند مالی حمل تکراری یا دارای کدینگ نامعتبر است');
   seen.add(key(j.id)); journal[j.bucket]+=j.amountRials;
  }
 }
 const gross=safeSum(selected.map(i=>i.grossRials));
 const linkedReturns=safeSum([...indexed.values()]);
 // Unbased returns never get silently assigned to a sale or seller's denominator.
 return {status:financeComplete?'AVAILABLE':'PARTIAL',dispatchNumber:number,asOf:asOf||null,
   invoiceCount:selected.length,customerCount:new Set(selected.map(i=>key(i.customerId))).size,
   grossRials:gross,linkedReturnsRials:linkedReturns,
   unbasedReturnsRials:safeSum(unbased.map(r=>r.amountRials)),
   netLinkedSalesRials:gross-linkedReturns,
   invoiceReceivableRials:receivableComplete?safeSum([...remainingByInvoice].filter(([id])=>invoiceMap.has(id)).map(([,amount])=>amount)):null,
   receivableAsOf:receivableComplete?asOf||null:null,
   unbasedReturns:unbased, excludedReturnIds:excluded,
   sellers, journal, journalEvidenceStatus:financeComplete?'AVAILABLE':'UNAVAILABLE',
   invoiceIds:[...invoiceMap.keys()]};
}
/** Produces task proposals only; no automatic fine, payroll or ERP write. */
export function proposeDispatchPenaltyReviews(evidence, policies, existingTaskKeys=[]) {
 if(evidence?.status==='UNAVAILABLE')return [];
 const prior=new Set(existingTaskKeys);
 const proposals=[];
 for(const seller of evidence.sellers||[]){
  for(const policy of policies||[]){
   if(!policy.enabled||!key(policy.version)||!key(policy.code))continue;
   if(policy.supplierId && !policy.sellerSupplierEvidence?.[seller.sellerId]?.includes(policy.supplierId))continue;
   const metric=policy.metric==='RETURN_INVOICE_RATE'?seller.returnInvoiceRate:
    policy.metric==='RETURN_VALUE_RATE'?seller.returnValueRate:
    policy.metric==='RECEIVABLE_RATE'?seller.receivableRate:null;
   if(metric===null||metric===undefined||!valid(policy.maxRate)||policy.maxRate>1||metric<=policy.maxRate)continue;
   const taskKey=['DISPATCH_REVIEW',evidence.dispatchNumber,seller.sellerId,policy.code,policy.version].join(':');
   if(prior.has(taskKey))continue;
   prior.add(taskKey);
   proposals.push({taskKey,dispatchNumber:evidence.dispatchNumber,sellerId:seller.sellerId,
     policyCode:policy.code,policyVersion:policy.version,observedRate:metric,limitRate:policy.maxRate,
     status:'PENDING_HUMAN_REVIEW',action:'CREATE_TASK_PROPOSAL'});
  }
 }
 return proposals;
}
