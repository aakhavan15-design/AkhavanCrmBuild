/**
 * Dispatch report reader. Only existing crm.DispatchPlan/Line and ERP mirrors.
 * Never substitute invoice-based account balance for posted journal receivables.
 * Request executes inside withTenantContext and SQL row-level permissions.
 */
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
   const missingMappings=journal.length-mapped.length;
   const journalBuckets=Object.fromEntries(
     ['CASH','CASH_DISCOUNT','INVOICE_SURCHARGE','CHEQUE','TRANSFER','CASH_REFUND']
       .map(code=>[code,missingMappings?null:mapped.filter(x=>x.BucketCode===code)
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
    if(!original){unbased.push({id:cr.CreditNoteMirrorId,amountRials:Number(cr.Amount),accountId:cr.AccountId});continue}
    const seller=bySeller.get(String(original.SalesRepExternalId||'UNASSIGNED'));
    seller.returnsRials+=Number(cr.Amount);seller.returnedInvoiceIds.add(String(original.InvoiceMirrorId));
   }
   return {status:'PARTIAL',reason:'SOURCE_COVERAGE_AND_LEDGER_RECONCILIATION_REQUIRED',
    source:'SQLSERVER_ERP_MIRROR',plan,
    invoiceCount:invoices.length,invoices,
    returnCount:returns.length,unbasedReturns:unbased,
    grossRials:invoices.reduce((n,i)=>n+Number(i.GrossAmount),0),
    linkedReturnsRials:returns.filter(x=>invoiceLookup.has(String(x.InvoiceMirrorId||'').toLowerCase()))
       .reduce((n,i)=>n+Number(i.Amount),0),
    sellers:[...bySeller.values()].map(({returnedInvoiceIds,...s})=>({...s,returnedInvoiceCount:returnedInvoiceIds.size})),
    journalBuckets,missingMappings,
    coverage:{invoices:true,returns:'NOT_RECONCILED',journal:missingMappings?'UNMAPPED':'NOT_RECONCILED',receivables:'UNAVAILABLE'},
    note:'هیچ مانده مطالبات یا سود قطعی تا تطبیق دفتر، FIFO و پوشش دوره منتشر نمی‌شود'};
  });
 };
}
