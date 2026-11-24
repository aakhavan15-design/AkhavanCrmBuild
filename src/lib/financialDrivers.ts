import { computeLedgerPnl, type PnlJournalLine, type BucketDef } from './ledgerPnl.ts';
import type { LedgerAccountDef } from './etlPipeline.ts';
/** Period comparisons use the canonical P&L engine, never quote or invoice estimates. */
export function analyzeFinancialDrivers(lines:PnlJournalLine[],accounts:LedgerAccountDef[],buckets:BucketDef[],period:{from:string;to:string},trusted:boolean, anomalyPercent=20){
 const start=Date.parse(period.from+'T00:00:00Z'),end=Date.parse(period.to+'T00:00:00Z');
 if(!trusted||!Number.isFinite(start)||!Number.isFinite(end)||end<start)return null;
 const threshold=Number.isFinite(anomalyPercent)&&anomalyPercent>=0?anomalyPercent:20;
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
 const warnings=drivers.filter(x=>x.key!=='GROSS_SALES'&&x.delta!==null&&x.delta>0&&x.changePercent!==null&&x.changePercent>=threshold);
 const expenseAccounts=accounts.filter(a=>a.reportBucketCode==='OPERATING_EXPENSES'&&a.levelCode!=='GROUP');
 const accountGroups=new Map<string,LedgerAccountDef[]>();
 for(const a of expenseAccounts){const code=a.accountCode||a.id; const group=accountGroups.get(code)??[];group.push(a);accountGroups.set(code,group);}
 const expenseRows=[...accountGroups].map(([code,group])=>{
  const ids=new Set(group.map(a=>a.id));const subset=lines.filter(l=>l.ledgerAccountId!==null&&ids.has(l.ledgerAccountId));
  const value=computeLedgerPnl(subset,group,buckets,period).values.OPERATING_EXPENSES??null;
  const baseline=computeLedgerPnl(subset,group,buckets,previous).values.OPERATING_EXPENSES??null;
  const delta=value===null||baseline===null?null:value-baseline;
  const changePercent=delta!==null&&baseline!==null&&baseline>0?delta/baseline*100:null;
  const dates=[...new Set(subset.map(l=>l.documentDate.slice(0,10)).filter(d=>d>=period.from&&d<=period.to))].sort();
  const trend=dates.map(date=>({date,value:computeLedgerPnl(subset,group,buckets,{from:date,to:date}).values.OPERATING_EXPENSES??null})).filter(p=>p.value!==null);
  return {trend,code,title:group[0].titleFa||code,value,baseline,delta,changePercent,warning:changePercent!==null&&changePercent>=threshold&&delta!==null&&delta>0};
 }).filter(r=>r.value!==null||r.baseline!==null).sort((a,b)=>(b.value??0)-(a.value??0));
 const positiveTotal=expenseRows.reduce((sum,r)=>sum+Math.max(0,r.value??0),0);
 let cumulative=0;
 const expensePareto=expenseRows.map(r=>{const share=positiveTotal>0&&r.value!==null?Math.max(0,r.value)/positiveTotal*100:null;cumulative+=share??0;return {...r,share,cumulativeShare:share===null?null:cumulative};});
 return {threshold,period,previous,drivers,profitDelta,warnings,expensePareto,expenseShare:expense.value!==null&&current.values.NET_SALES!=null&&current.values.NET_SALES>0?expense.value/current.values.NET_SALES*100:null,
 unmappedLines:current.unmappedLines,previousUnmappedLines:prior.unmappedLines,
 reconciled:profitDelta!==null&&drivers.every(x=>x.profitImpact!==null)&&Math.abs(drivers.reduce((n,x)=>n+(x.profitImpact??0),0)-profitDelta)<0.01};
}
