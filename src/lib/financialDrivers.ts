import { computeLedgerPnl, type PnlJournalLine, type BucketDef } from './ledgerPnl.ts';
import type { LedgerAccountDef } from './etlPipeline.ts';
/** Period comparisons use the canonical P&L engine, never quote or invoice estimates. */
export function analyzeFinancialDrivers(lines:PnlJournalLine[],accounts:LedgerAccountDef[],buckets:BucketDef[],period:{from:string;to:string},trusted:boolean){
 const start=Date.parse(period.from+'T00:00:00Z'),end=Date.parse(period.to+'T00:00:00Z');
 if(!trusted||!Number.isFinite(start)||!Number.isFinite(end)||end<start)return null;
 const day=86400000,span=end-start+day;
 const previous={from:new Date(start-span).toISOString().slice(0,10),to:new Date(start-day).toISOString().slice(0,10)};
 const current=computeLedgerPnl(lines,accounts,buckets,period);
 const prior=computeLedgerPnl(lines,accounts,buckets,previous);
 const keys=['GROSS_SALES','SALES_RETURNS','COGS','OPERATING_EXPENSES'] as const;
 const drivers=keys.map(key=>{
  const value=current.values[key]??null,baseline=prior.values[key]??null;
  const delta=value===null||baseline===null?null:value-baseline;
  return {key,value,baseline,delta,profitImpact:delta===null?null:key==='GROSS_SALES'?delta:-delta,
   changePercent:delta!==null&&baseline!==null&&baseline>0?delta/baseline*100:null};
 });
 const profit=current.values.OPERATING_PROFIT??null,previousProfit=prior.values.OPERATING_PROFIT??null;
 const profitDelta=profit===null||previousProfit===null?null:profit-previousProfit;
 const expense=drivers.find(x=>x.key==='OPERATING_EXPENSES')!;
 const warnings=drivers.filter(x=>x.key!=='GROSS_SALES'&&x.delta!==null&&x.delta>0&&x.changePercent!==null&&x.changePercent>=20);
 return {period,previous,drivers,profitDelta,warnings,expenseShare:expense.value!==null&&current.values.NET_SALES!=null&&current.values.NET_SALES>0?expense.value/current.values.NET_SALES*100:null,
 unmappedLines:current.unmappedLines,previousUnmappedLines:prior.unmappedLines,
 reconciled:profitDelta!==null&&drivers.every(x=>x.profitImpact!==null)&&Math.abs(drivers.reduce((n,x)=>n+(x.profitImpact??0),0)-profitDelta)<0.01};
}
