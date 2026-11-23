import { calculateNetSalesCore } from '../shared/financialArithmetic.mjs';

/**
 * Financial truth for route maps uses the SAME arithmetic as the report engine.
 * A live feed is not proof of complete coverage; neither a map marker nor an
 * invoice mirror can certify a net-sales KPI without a scope-matched posted
 * ERP journal reconciliation.
 */
export function reconcileRouteNetSales({
 invoicedAmount,returnedAmount,invoiceSourceReady,returnSourceReady,
 ledgerEvidence=null
}={}){
 const blank={netSales:null,billedSales:null,returnAmount:null};
 if(!invoiceSourceReady||!returnSourceReady)
  return {status:'UNVERIFIED',reason:'OFFICIAL_SOURCE_COVERAGE_MISSING',...blank};
 const parse=(v)=>{
  if(typeof v==='number')return Number.isFinite(v)&&Math.abs(v)<=Number.MAX_SAFE_INTEGER?v:null;
  if(typeof v!=='string'||!/^\d+(?:\.\d+)?$/.test(v.trim()))return null;
  const n=Number(v);return Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER?n:null;
 };
 const billed=parse(invoicedAmount),returned=parse(returnedAmount);
 if(billed===null||returned===null)return {status:'UNVERIFIED',reason:'MISSING_OR_UNSAFE_AMOUNT',...blank};
 const possible=calculateNetSalesCore(billed,returned);
 if(possible===null)return {status:'UNSAFE_AMOUNT',...blank};
 if(!ledgerEvidence?.verified||!ledgerEvidence?.scopeMatches)
  return {status:'UNVERIFIED',reason:'POSTED_LEDGER_RECONCILIATION_REQUIRED',
   netSales:null,billedSales:billed,returnAmount:returned};
 const officialGross=parse(ledgerEvidence.gross),officialReturns=parse(ledgerEvidence.returns);
 if(officialGross===null||officialReturns===null||
   Math.abs(billed-officialGross)>0.01||Math.abs(returned-officialReturns)>0.01)
  return {status:'MISMATCH',reason:'SCOPED_LEDGER_AMOUNTS_DIFFER',netSales:null,billedSales:billed,returnAmount:returned};
 return {status:'VERIFIED',netSales:possible,billedSales:billed,returnAmount:returned};
}
