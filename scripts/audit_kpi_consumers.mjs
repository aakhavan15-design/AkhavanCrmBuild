#!/usr/bin/env node
/**
 * Source-driven KPI consumer inventory. Deliberately reports suspects rather
 * than modifying code or granting false VERIFIED status from regex matches.
 * Run: node scripts/audit_kpi_consumers.mjs [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
const roots=['src/components','src/services','src/lib','server'];
const extensions=new Set(['.ts','.tsx','.mjs','.js']);
function walk(dir,out=[]){
 if(!fs.existsSync(dir))return out;
 for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  const p=path.join(dir,e.name);
  if(e.isDirectory())walk(p,out);else if(e.isFile()&&extensions.has(path.extname(e.name)))out.push(p);
 }
 return out;
}
const rules=[
 {code:'STORED_INVOICE_BALANCE',severity:'P0',re:/\b(?:invoice|inv|invoices\[[^\]]+\])\.balance\b/},
 {code:'GROSS_INVOICE_SUM',severity:'P1',re:/\breduce\s*\([^\n]{0,160}\b(?:totalAmount|GrossAmount)\b/},
 {code:'PAYMENT_AS_LEDGER',severity:'P0',re:/\b(?:totalAmount|amount)\s*-\s*(?:invoice\.)?paidAmount\b/},
 {code:'NET_SALES_AD_HOC',severity:'P0',re:/\b(?:netSales|netRevenue|netAmount)\b.{0,90}[-−].{0,60}\b(?:return|refund|credit)/i},
 {code:'UNKNOWN_TO_ZERO',severity:'P1',re:/\b(?:netSales|receivableAmount|outstandingAmount|returnAmount|currentBalance)\b[^\n]{0,90}(?:\|\||\?\?)\s*0\b/},
 {code:'QUOTE_PRODUCT_REVENUE',severity:'P1',re:/\b(?:quotes|quote)\b.{0,90}\b(?:lineTotal|totalAmount)\b/i}
];
const metricWords=/\b(?:netSales|receivable|outstanding|ledger|cashFlow|grossProfit|margin|revenueTarget|salesTarget|returnAmount|pnl|targetAchievement)\b/i;
const references=/financialMetricKernel|financialArithmetic|receivableReconciliation|receivableReports|ledgerPnl|metricRegistry|officialLedger|reportAnalytics|cashFlowEngine|agingBuckets|routeMapMoney/;
const findings=[],consumers=[];
for(const file of roots.flatMap(root=>walk(root)).sort()){
 const text=fs.readFileSync(file,'utf8'),lines=text.split(/\r?\n/),imports=lines.slice(0,125).join('\n');
 const matched=[];
 lines.forEach((line,index)=>{
  const trimmed=line.trim();if(!trimmed||trimmed.startsWith('//')||trimmed.startsWith('*')||trimmed.startsWith('/*'))return;
  for(const rule of rules){
   if(rule.re.test(line)){
    const finding={file:file.replaceAll('\\','/'),line:index+1,rule:rule.code,severity:rule.severity,
      excerpt:trimmed.slice(0,190)};
    findings.push(finding);matched.push(rule.code);
   }
  }
 });
 const kpiUse=metricWords.test(text);
 if(kpiUse)consumers.push({file:file.replaceAll('\\','/'),importsCanonical:references.test(imports),
  suspiciousRules:[...new Set(matched)]});
}
const catalog='src/lib/metricRegistry.ts';
const catalogText=fs.readFileSync(catalog,'utf8');
const registryCodes=[...catalogText.matchAll(/\bM\(\{\s*code:\s*'([A-Z_]+)'/g)].map(m=>m[1]);
const report={
 scannedFiles:roots.flatMap(root=>walk(root)).length,consumerFiles:consumers.length,
 catalogCodeCount:registryCodes.length,catalogCodes:registryCodes,
 canonicalImportConsumers:consumers.filter(x=>x.importsCanonical).length,
 flaggedFiles:new Set(findings.map(f=>f.file)).size,
 findings,consumers,
 caveats:[
 'Pattern findings are REVIEW CANDIDATES, not proven defects; they require functional triage.',
 'An imported calculator is not proof a screen actually uses its results.',
 'Live ERP coverage, SQL permissions, posted ledger validity and browser behavior cannot be certified by this source audit.'
 ]};
if(process.argv.includes('--json'))process.stdout.write(JSON.stringify(report,null,2)+'\n');
else {
 console.log('KPI consumer audit | scanned='+report.scannedFiles+' | metric-aware='+report.consumerFiles+
  ' | canonical-reference='+report.canonicalImportConsumers+
  ' | flagged-files='+report.flaggedFiles+' | findings='+findings.length+
  ' | catalog-codes='+registryCodes.length);
 for(const f of findings)console.log(f.severity+' '+f.rule+' '+f.file+':'+f.line+' '+f.excerpt);
 console.log('AUDIT_STATUS=SOURCE_REVIEW_ONLY (not release VERIFIED)');
}
