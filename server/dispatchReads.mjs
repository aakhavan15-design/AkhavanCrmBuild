/**
 * Dispatch report reader. Only existing crm.DispatchPlan/Line and ERP mirrors.
 * Never substitute invoice-based account balance for posted journal receivables.
 * Request executes inside withTenantContext and SQL row-level permissions.
 */
import { buildDispatchCollectionZone } from '../src/lib/dispatchCollectionZone.mjs';
import { proposeDispatchPenaltyReviews } from '../src/lib/dispatchIntelligence.mjs';
import crypto from 'node:crypto';

export function createDispatchReader({sql,run}){
 return async(auth,planNumber)=>{
  if(!planNumber||planNumber.length>80)throw Object.assign(new Error('INVALID_DISPATCH_NUMBER'),{status:400});
  return run(auth,async(tx)=>{
   const request=()=>new sql.Request(tx).input('tenant',sql.UniqueIdentifier,auth.tenantId)
     .input('number',sql.NVarChar(80),planNumber);
   const plans=(await request().query(`
     SELECT TOP (1) DispatchPlanId,PlanNumber,PlanDate,DriverExternalId,DistributorExternalId,
       VehicleExternalId,StatusCode FROM crm.DispatchPlan
     WHERE TenantId=@tenant AND PlanNumber=@number`)).recordset;
   if(!plans.length)return {status:'UNAVAILABLE',reason:'DISPATCH_NOT_FOUND'};
   const plan=plans[0];
   const invoices=(await request().query(`
     SELECT DISTINCT i.InvoiceMirrorId,i.InvoiceNumber,i.InvoiceDate,i.AccountId,
       a.Name AS CustomerName,a.Latitude,a.Longitude,a.GeoAccuracyMeters,
       i.SalesRepExternalId,i.GrossAmount,i.NetAmount,i.CurrencyCode,
       i.StatusCode,i.IsVoided
     FROM crm.InvoiceMirror i
     JOIN crm.Account a ON a.TenantId=i.TenantId AND a.AccountId=i.AccountId
     WHERE i.TenantId=@tenant AND i.IsVoided=0 AND i.StatusCode IN ('POSTED','CONFIRMED','CLOSED')
       AND (i.DispatchPlanNumber=@number OR EXISTS(
         SELECT 1 FROM crm.DispatchPlanLine l
         JOIN crm.DispatchPlan p ON p.DispatchPlanId=l.DispatchPlanId AND p.TenantId=l.TenantId
         WHERE l.TenantId=i.TenantId AND l.InvoiceMirrorId=i.InvoiceMirrorId AND p.PlanNumber=@number))
       AND EXISTS(SELECT 1 FROM security.fn_RecordReadScope(
         a.TenantId,N'accounts.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId))
   `)).recordset;
   const invoiceIds=invoices.map(i=>i.InvoiceMirrorId);
   const invoiceLines=(await request().query(`
     SELECT TOP (10001) i.InvoiceMirrorId,l.InvoiceLineMirrorId,l.ExternalProductId,
       l.ProductNameSnapshot,l.Quantity,l.NetLineAmount,
       product.SupplierExternalId,product.BrandExternalId
     FROM crm.InvoiceLineMirror l
     JOIN crm.InvoiceMirror i ON i.TenantId=l.TenantId AND i.InvoiceMirrorId=l.InvoiceMirrorId
     JOIN crm.Account a ON a.TenantId=i.TenantId AND a.AccountId=i.AccountId
     LEFT JOIN crm.ExternalProduct product ON product.TenantId=l.TenantId
      AND product.SourceSystemCode=l.SourceSystemCode AND product.ExternalProductId=l.ExternalProductId
     WHERE l.TenantId=@tenant AND i.IsVoided=0 AND i.StatusCode IN ('POSTED','CONFIRMED','CLOSED')
      AND (i.DispatchPlanNumber=@number OR EXISTS(
        SELECT 1 FROM crm.DispatchPlanLine d
        JOIN crm.DispatchPlan p ON p.DispatchPlanId=d.DispatchPlanId AND p.TenantId=d.TenantId
        WHERE d.TenantId=i.TenantId AND d.InvoiceMirrorId=i.InvoiceMirrorId AND p.PlanNumber=@number))
      AND EXISTS(SELECT 1 FROM security.fn_RecordReadScope(
       a.TenantId,N'accounts.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId))
   `)).recordset;
   const lineCoverage=invoiceLines.length>10000?'ROW_LIMIT_EXCEEDED':'AVAILABLE';

   // Ledger clearance and all source row coverage are separate acceptance gates.
   const journal=(await request().query(`
     SELECT jl.JournalLineMirrorId,je.JournalEntryMirrorId,je.DocumentNumber,je.DocumentDate,
       jl.ExternalAccountCode,jl.DebitAmount,jl.CreditAmount,
       m.BucketCode,m.BalanceSide
     FROM crm.JournalEntryMirror je
     JOIN crm.JournalLineMirror jl ON jl.TenantId=je.TenantId AND jl.JournalEntryMirrorId=je.JournalEntryMirrorId
     JOIN crm.JournalStatusMap sm ON sm.TenantId=je.TenantId AND sm.SourceSystemCode=je.SourceSystemCode
       AND sm.ExternalStatusCode=je.StatusCode AND sm.IncludeInBalance=1
     LEFT JOIN crm.DispatchFinancialBucketMap m ON m.TenantId=jl.TenantId
       AND m.SourceSystemCode=je.SourceSystemCode AND m.ExternalAccountCode=jl.ExternalAccountCode
       AND m.IsActive=1 AND je.DocumentDate>=m.EffectiveFrom
       AND (m.EffectiveTo IS NULL OR je.DocumentDate<=m.EffectiveTo)
       AND ((m.BalanceSide='DEBIT' AND jl.DebitAmount>0) OR (m.BalanceSide='CREDIT' AND jl.CreditAmount>0))
     WHERE je.TenantId=@tenant AND je.DispatchPlanNumber=@number AND je.IsVoided=0
       AND EXISTS(SELECT 1 FROM security.fn_RecordReadScope(je.TenantId,N'finance.view',NULL,NULL,NULL,NULL))
   `)).recordset;
   const returns=(await request().query(`
     SELECT cn.CreditNoteMirrorId,cn.InvoiceMirrorId,cn.AccountId,cn.CreditDate,cn.Amount,
       cn.StatusCode,cn.IsVoided,cn.DispatchPlanNumber
     FROM crm.CreditNoteMirror cn
     WHERE cn.TenantId=@tenant AND cn.IsVoided=0 AND cn.StatusCode IN ('POSTED','CONFIRMED','FINAL')
      AND (cn.DispatchPlanNumber=@number OR cn.InvoiceMirrorId IN (
        SELECT i.InvoiceMirrorId FROM crm.InvoiceMirror i
        WHERE i.TenantId=@tenant AND i.IsVoided=0
          AND (i.DispatchPlanNumber=@number OR EXISTS (
           SELECT 1 FROM crm.DispatchPlanLine d
           JOIN crm.DispatchPlan p ON p.DispatchPlanId=d.DispatchPlanId AND p.TenantId=d.TenantId
           WHERE d.TenantId=i.TenantId AND d.InvoiceMirrorId=i.InvoiceMirrorId AND p.PlanNumber=@number))))
   `)).recordset;
   const mapped=journal.filter(x=>x.BucketCode);
   const uniqueLines=new Set(journal.map(row=>String(row.JournalLineMirrorId)));
   const ambiguousMappings=journal.length-uniqueLines.size;
   const missingMappings=journal.filter(x=>!x.BucketCode).length;
   const journalBuckets=Object.fromEntries(
     ['CASH','CASH_DISCOUNT','INVOICE_SURCHARGE','CHEQUE','TRANSFER','CASH_REFUND']
       .map(code=>[code,(missingMappings||ambiguousMappings)?null:mapped.filter(x=>x.BucketCode===code)
         .reduce((sum,row)=>sum+Number(row.BalanceSide==='DEBIT'?row.DebitAmount:row.CreditAmount),0)]));
   const invoiceLookup=new Map(invoices.map(i=>[String(i.InvoiceMirrorId).toLowerCase(),i]));
   const bySeller=new Map();
   for(const i of invoices){
    const id=String(i.SalesRepExternalId||'UNASSIGNED');
    const row=bySeller.get(id)||{sellerId:id,invoiceCount:0,grossRials:0,returnsRials:0,returnedInvoiceIds:new Set()};
    row.invoiceCount++;row.grossRials+=Number(i.GrossAmount);bySeller.set(id,row);
   }
   const unbased=[];
   for(const cr of returns){
    const original=invoiceLookup.get(String(cr.InvoiceMirrorId||'').toLowerCase());
    if(!original){
      if(cr.InvoiceMirrorId)continue; // linked to a different dispatch: not an unbased return
      unbased.push({id:cr.CreditNoteMirrorId,amountRials:Number(cr.Amount),accountId:cr.AccountId});continue
    }
    const seller=bySeller.get(String(original.SalesRepExternalId||'UNASSIGNED'));
    seller.returnsRials+=Number(cr.Amount);seller.returnedInvoiceIds.add(String(original.InvoiceMirrorId));
   }
   // The only admissible receivables source is the verified, posted ERP journal.
   // The invoice/payment mirror view is deliberately NOT used here.
   let receivables=[];
   let receivableCoverage='UNAVAILABLE';
   const approved=(await request().query(`
     SELECT TOP (1) s.SourceSystemCode,s.OpeningDate,s.VerifiedThrough
     FROM analytics.MoneyReportSource s
     JOIN core.AppUser approver ON approver.TenantId=s.TenantId AND approver.UserId=s.ApprovedBy
     WHERE s.TenantId=@tenant AND s.VerifiedThrough>=CONVERT(date,SYSUTCDATETIME())
       AND approver.IsActive=1`)).recordset[0];
   if(approved){
    const scopeRequest=()=>request().input('source',sql.VarChar(40),approved.SourceSystemCode)
      .input('opening',sql.Date,approved.OpeningDate).input('verified',sql.Date,approved.VerifiedThrough);
    const audit=(await scopeRequest().query(`
      SELECT CASE WHEN EXISTS(
        SELECT 1 FROM analytics.vw_FinancialJournalState j
        WHERE j.TenantId=@tenant AND j.SourceSystemCode=@source AND
         j.AccountingDate BETWEEN @opening AND @verified AND
         j.JournalQuality NOT IN ('VALID','VOID','PENDING')
      ) OR EXISTS(
        SELECT 1 FROM analytics.vw_FinancialJournalArticle l
        WHERE l.TenantId=@tenant AND l.SourceSystemCode=@source AND l.CurrencyCode='IRR'
         AND l.AccountingDate BETWEEN @opening AND @verified
         AND l.ExternalDetailCode IS NOT NULL AND (l.LedgerAccountId IS NULL OR l.LinkedAccountId IS NULL)
      ) THEN 0 ELSE 1 END AS IsComplete`)).recordset[0];
    if(audit?.IsComplete===1){
     const rows=(await scopeRequest().query(`
      SELECT TOP (5001) a.AccountId,a.Name,a.Latitude,a.Longitude,a.GeoAccuracyMeters,
       SUM(l.DebitAmount-l.CreditAmount) AS OutstandingRials
      FROM analytics.vw_FinancialJournalArticle l
      JOIN crm.Account a ON a.TenantId=l.TenantId AND a.AccountId=l.LinkedAccountId
      WHERE l.TenantId=@tenant AND l.SourceSystemCode=@source AND l.CurrencyCode='IRR'
       AND l.AccountingDate BETWEEN @opening AND @verified AND l.MoneyRoleCode='RECEIVABLE'
       AND EXISTS(SELECT 1 FROM security.fn_RecordReadScope(
        a.TenantId,N'accounts.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId))
      GROUP BY a.AccountId,a.Name,a.Latitude,a.Longitude,a.GeoAccuracyMeters
      HAVING SUM(l.DebitAmount-l.CreditAmount)>0
      ORDER BY OutstandingRials DESC`)).recordset;
     if(rows.length<=5000){
       receivables=rows.map(row=>({
        customerId:String(row.AccountId),name:String(row.Name),
        officialBalanceRials:Number(row.OutstandingRials),
        point:row.Latitude==null||row.Longitude==null?null:
          {latitude:Number(row.Latitude),longitude:Number(row.Longitude)},
        accuracyMeters:row.GeoAccuracyMeters==null?null:Number(row.GeoAccuracyMeters)
       }));
       receivableCoverage='VERIFIED_POSTED_LEDGER';
     }else receivableCoverage='ROW_LIMIT_EXCEEDED';
    }else receivableCoverage='JOURNAL_MAPPING_OR_STATUS_INCOMPLETE';
   }
   const policyRows=(await request().query(`
     SELECT PolicyCode,PolicyVersion,MetricCode,MaxRate,SupplierExternalId
     FROM crm.DispatchPenaltyPolicy
     WHERE TenantId=@tenant AND IsActive=1 AND EffectiveFrom<=
       (SELECT PlanDate FROM crm.DispatchPlan WHERE TenantId=@tenant AND PlanNumber=@number)
       AND (EffectiveTo IS NULL OR EffectiveTo>=
        (SELECT PlanDate FROM crm.DispatchPlan WHERE TenantId=@tenant AND PlanNumber=@number))
     ORDER BY PolicyCode,PolicyVersion DESC`)).recordset;
   const sellerRatios=[...bySeller.values()].map(row=>({
      sellerId:row.sellerId,invoiceCount:row.invoiceCount,grossRials:row.grossRials,
      returnedInvoiceCount:row.returnedInvoiceIds.size,linkedReturnsRials:row.returnsRials,
      returnInvoiceRate:row.invoiceCount?row.returnedInvoiceIds.size/row.invoiceCount:null,
      returnValueRate:row.grossRials?row.returnsRials/row.grossRials:null,
      receivableRate:null // invoice-level posted-ledger allocation is not yet verified
   }));
   const policies=policyRows.filter(row=>!row.SupplierExternalId)
     .map(row=>({enabled:true,code:String(row.PolicyCode),version:String(row.PolicyVersion),
       metric:String(row.MetricCode),maxRate:Number(row.MaxRate)}));
   const proposals=proposeDispatchPenaltyReviews(
     {status:'PARTIAL',dispatchNumber:plan.PlanNumber,sellers:sellerRatios},policies
   ).map(p=>({...p,taskId:'tsk_dispatch_'+crypto.createHash('sha256').update(p.taskKey).digest('hex').slice(0,40)}));
   const supplierScopedPoliciesSkipped=policyRows.filter(row=>row.SupplierExternalId!=null).length;
   const stops=invoices.map(i=>({
     customerId:String(i.AccountId),name:String(i.CustomerName),
     point:i.Latitude==null||i.Longitude==null?null:
       {latitude:Number(i.Latitude),longitude:Number(i.Longitude)},
     accuracyMeters:i.GeoAccuracyMeters==null?null:Number(i.GeoAccuracyMeters)
   }));
   const collectionZone=buildDispatchCollectionZone({
     dispatchNumber:plan.PlanNumber,invoiceStops:stops,receivableCustomers:receivables,
     sourceComplete:receivableCoverage==='VERIFIED_POSTED_LEDGER',
     showAllReceivables:true
   });
   return {status:'PARTIAL',reason:'SOURCE_COVERAGE_AND_LEDGER_RECONCILIATION_REQUIRED',
    source:'SQLSERVER_ERP_MIRROR',plan,
    invoiceCount:invoices.length,invoices,invoiceLines:lineCoverage==='AVAILABLE'?invoiceLines:[],lineCoverage,
    returnCount:returns.length,unbasedReturns:unbased,
    grossRials:invoices.reduce((n,i)=>n+Number(i.GrossAmount),0),
    linkedReturnsRials:returns.filter(x=>invoiceLookup.has(String(x.InvoiceMirrorId||'').toLowerCase()))
       .reduce((n,i)=>n+Number(i.Amount),0),
    sellers:[...bySeller.values()].map(({returnedInvoiceIds,...s})=>({...s,returnedInvoiceCount:returnedInvoiceIds.size})),
    journalBuckets,missingMappings,ambiguousMappings,collectionZone,receivableCoverage,proposals,supplierScopedPoliciesSkipped,
    coverage:{invoices:true,returns:'NOT_RECONCILED',journal:missingMappings||ambiguousMappings?'UNMAPPED_OR_AMBIGUOUS':'NOT_RECONCILED',receivables:receivableCoverage},
    note:'هیچ مانده مطالبات یا سود قطعی تا تطبیق دفتر، FIFO و پوشش دوره منتشر نمی‌شود'};
  });
 };
}
