/**
 * Read-only ERP cash-discount monitor (F12-23).
 * No calculation, approval, posting or mutation of a discount is performed here.
 * Returns UNAVAILABLE rather than treating missing ERP fields as zero.
 */
export interface CashDiscountInvoice {
  id: string;
  issuedOn: string;
  status: string;
  distributionNoteId?: string | null;
  cashDiscountRials?: number | null;
  invoiceNumber?: string | null;
  discountBaseRials?: number | null;
  isVoided?: boolean;
}
export type CashDiscountResult =
  | { status:'UNAVAILABLE'; reason:string; source:'ERP_INVOICE'; }
  | { status:'AVAILABLE'; source:'ERP_INVOICE'; invoiceCount:number; invoiceDiscountRials:number;
      distributionNoteCount:number; unassignedInvoiceCount:number;
      byInvoice:Array<{invoiceId:string;distributionNoteId:string|null;amountRials:number;invoiceNumber:string|null;discountPercent:number|null;limitExceeded:boolean|null}>;
      byDistribution:Array<{distributionNoteId:string;invoiceCount:number;amountRials:number}> };
const finalStatuses = new Set(['POSTED','CONFIRMED','FINAL']);
export function monitorCashDiscounts(
  invoices: CashDiscountInvoice[],
  options: { from:string; to:string; sourceComplete:boolean; maxDiscountPercent?:number }
): CashDiscountResult {
  const unavailable = (reason:string):CashDiscountResult=>({status:'UNAVAILABLE',reason,source:'ERP_INVOICE'});
  if (!options.sourceComplete) return unavailable('پوشش رسمی فاکتور، حواله و فیلد تخفیف نقدی ERP تأیید نشده است.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.from) || !/^\d{4}-\d{2}-\d{2}$/.test(options.to)
    || options.from > options.to) return unavailable('دوره گزارش نامعتبر است.');
  const seen=new Map<string,CashDiscountInvoice>();
  for (const invoice of invoices) {
    if (invoice.isVoided || !finalStatuses.has(String(invoice.status).toUpperCase())) continue;
    const day=String(invoice.issuedOn||'').slice(0,10);
    if (day<options.from || day>options.to) continue;
    if (!invoice.id || !/^\d{4}-\d{2}-\d{2}$/.test(day))
      return unavailable('شناسه یا تاریخ فاکتور قطعی معتبر نیست.');
    const prior=seen.get(invoice.id);
    if (prior) {
      if (prior.cashDiscountRials!==invoice.cashDiscountRials ||
          prior.distributionNoteId!==invoice.distributionNoteId ||
          prior.issuedOn!==invoice.issuedOn || prior.discountBaseRials!==invoice.discountBaseRials || prior.invoiceNumber!==invoice.invoiceNumber)
        return unavailable('داده متعارض برای شناسه تکراری فاکتور وجود دارد.');
      continue;
    }
    if (typeof invoice.cashDiscountRials!=='number' ||
      !Number.isFinite(invoice.cashDiscountRials) || invoice.cashDiscountRials<0)
      return unavailable('مبلغ تخفیف نقدی فاکتور قطعی وجود ندارد یا معتبر نیست؛ صفر فرض نشد.');
    seen.set(invoice.id,invoice);
  }
  const limit=options.maxDiscountPercent;
  const validLimit=typeof limit==='number'&&Number.isFinite(limit)&&limit>=0&&limit<=100;
  const byInvoice=[...seen.values()].map(invoice=>{
    const base=invoice.discountBaseRials;
    const percent=typeof base==='number'&&Number.isFinite(base)&&base>0?(invoice.cashDiscountRials as number)/base*100:null;
    return ({
    invoiceId:invoice.id,
    distributionNoteId:invoice.distributionNoteId||null,
    amountRials:invoice.cashDiscountRials as number,
    invoiceNumber:invoice.invoiceNumber||null,discountPercent:percent,limitExceeded:validLimit&&percent!==null?percent>limit!:null
  });});
  const grouped=new Map<string,{distributionNoteId:string;invoiceCount:number;amountRials:number}>();
  for(const row of byInvoice) {
    if (!row.distributionNoteId) continue;
    const old=grouped.get(row.distributionNoteId)||{distributionNoteId:row.distributionNoteId,invoiceCount:0,amountRials:0};
    old.invoiceCount++;
    old.amountRials+=row.amountRials;
    grouped.set(row.distributionNoteId,old);
  }
  const total=byInvoice.reduce((sum,row)=>sum+row.amountRials,0);
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(total*1))
    return unavailable('جمع تخفیف‌ها خارج از محدوده عدد صحیح امن است.');
  return {status:'AVAILABLE',source:'ERP_INVOICE',invoiceCount:byInvoice.length,
    invoiceDiscountRials:total,distributionNoteCount:grouped.size,
    unassignedInvoiceCount:byInvoice.filter(x=>!x.distributionNoteId).length,
    byInvoice,byDistribution:[...grouped.values()]};
}
