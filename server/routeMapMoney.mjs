/**
 * Money displayed as "net sales" must subtract authenticated effective sales returns.
 * The official mirror may have no rows because the feed is unavailable, so two
 * independent source-coverage flags are mandatory. No inferred zero from absence.
 * Returns from earlier invoices can make a period negative.
 *
 * All output numbers are guarded against unsafe IEEE-754 integer magnitudes;
 * raw financial SQL decimals should use the dedicated decimal-string reporting
 * contract for very large figures.
 */
export function reconcileRouteNetSales({
 invoicedAmount, returnedAmount, invoiceSourceReady, returnSourceReady,
} = {}) {
 if (!invoiceSourceReady || !returnSourceReady) {
  return {status:'UNVERIFIED',netSales:null,billedSales:null,returnAmount:null};
 }
 const billed=Number(invoicedAmount??0);
 const returned=Number(returnedAmount??0);
 const safe=(n)=>Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER;
 if (!safe(billed)||!safe(returned)||!safe(billed-returned)) {
  return {status:'UNSAFE_AMOUNT',netSales:null,billedSales:null,returnAmount:null};
 }
 return {status:'VERIFIED',netSales:billed-returned,billedSales:billed,returnAmount:returned};
}
