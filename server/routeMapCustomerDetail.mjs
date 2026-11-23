/**
 * Drilldown of ERP route membership, scoped to account and rep permissions.
 * Supports official date/product/rep filters. Never turn absent official
 * return/receivable/target data into 0.
 */
export function createRouteCustomerDetailReader({sql,run}){
 return async(auth,{routeId,filters,organizationWide=false,financeAllowed=false,financeOrganizationWide=false,returnAllowed=false,receivableAllowed=false})=>run(auth,async transaction=>{
  const request=()=>new sql.Request(transaction)
   .input('tenant',sql.UniqueIdentifier,auth.tenantId)
   .input('actor',sql.UniqueIdentifier,auth.userId)
   .input('routeId',sql.UniqueIdentifier,routeId)
   .input('organizationWide',sql.Bit,organizationWide?1:0)
   .input('financeWide',sql.Bit,financeOrganizationWide?1:0)
   .input('dateFrom',sql.Date,filters.from).input('dateTo',sql.Date,filters.to)
   .input('productJson',sql.NVarChar(sql.MAX),JSON.stringify(filters.productIds))
   .input('supplierJson',sql.NVarChar(sql.MAX),JSON.stringify(filters.supplierIds))
   .input('brandJson',sql.NVarChar(sql.MAX),JSON.stringify(filters.brandIds))
   .input('categoryJson',sql.NVarChar(sql.MAX),JSON.stringify(filters.customerCategoryIds))
   .input('supervisorJson',sql.NVarChar(sql.MAX),JSON.stringify(filters.supervisorIds))
   .input('repJson',sql.NVarChar(sql.MAX),JSON.stringify(filters.repIds));
  const allowed=`(@organizationWide=1 OR EXISTS(
    SELECT 1 FROM crm.VisitRouteStaffMirror staff
    WHERE staff.TenantId=route.TenantId AND staff.RouteId=route.RouteId
      AND staff.StaffUserId=@actor AND staff.EffectiveFrom<=@dateTo
      AND (staff.EffectiveTo IS NULL OR staff.EffectiveTo>=@dateFrom)))`;
  const route=(await request().query(`SELECT TOP(1) route.RouteId,route.RouteCode,route.RouteName
    FROM crm.VisitRouteMirror route WHERE route.TenantId=@tenant AND route.RouteId=@routeId
    AND route.IsDeleted=0 AND ${allowed}`)).recordset[0];
  if(!route)return null;
  if(filters.supervisorIds.length){
    const match=(await request().query(`SELECT TOP(1) 1 AS Match
      FROM crm.VisitRouteStaffMirror st
      WHERE st.TenantId=@tenant AND st.RouteId=@routeId AND st.StaffRoleCode='SUPERVISOR'
        AND st.ExternalStaffId IN (SELECT value FROM OPENJSON(@supervisorJson))
        AND st.EffectiveFrom<=@dateTo AND (st.EffectiveTo IS NULL OR st.EffectiveTo>=@dateFrom)`)).recordset;
    if(!match.length)return null;
  }
  // Source-authoritative membership, never WHERE customer.Latitude IS NOT NULL.
  const members=(await request().query(`
   SELECT DISTINCT a.AccountId,a.Name,a.AccountCode,a.StatusCode,
      a.Latitude,a.Longitude,a.GeoAccuracyMeters,a.BusinessCategoryCode,m.SubRouteCode
   FROM crm.VisitRouteCustomerMirror m
   JOIN crm.Account a ON a.TenantId=m.TenantId AND a.AccountId=m.AccountId
   WHERE m.TenantId=@tenant AND m.RouteId=@routeId
     AND m.EffectiveFrom<=@dateTo AND (m.EffectiveTo IS NULL OR m.EffectiveTo>=@dateFrom)
     AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@categoryJson)) OR a.BusinessCategoryCode IN(SELECT value FROM OPENJSON(@categoryJson)))
     AND EXISTS(SELECT 1 FROM security.fn_RecordReadScope(a.TenantId,N'accounts.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId))
   ORDER BY a.Name,a.AccountId`)).recordset;
  const memberById=new Map();
  for(const member of members){
    const id=String(member.AccountId).toLowerCase();
    const existing=memberById.get(id);
    if(!existing){memberById.set(id,{...member});continue;}
    const codes=[...new Set([...(String(existing.SubRouteCode||'').split('،').filter(Boolean)),member.SubRouteCode].filter(Boolean))];
    existing.SubRouteCode=codes.join('، ');
  }
  const uniqueMembers=[...memberById.values()];
  const visits=(await request().query(`
   SELECT v.AccountId,v.ExternalVisitId,v.ExternalSalesRepId,v.VisitedAtUtc,
      v.OutcomeCode,v.NoOrderReasonCode,reason.ReasonTitleFa
   FROM crm.ErpVisitEventMirror v
   JOIN crm.VisitTourMirror tour ON tour.TenantId=v.TenantId AND tour.TourId=v.TourId
      AND tour.RouteId=@routeId
   JOIN crm.Account a ON a.TenantId=v.TenantId AND a.AccountId=v.AccountId
   LEFT JOIN crm.VisitNoOrderReasonMirror reason ON reason.TenantId=v.TenantId
      AND reason.SourceSystemCode=v.SourceSystemCode AND reason.ExternalReasonCode=v.NoOrderReasonCode
   WHERE v.TenantId=@tenant AND v.IsDeleted=0
     AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@categoryJson)) OR a.BusinessCategoryCode IN (SELECT value FROM OPENJSON(@categoryJson)))
     AND v.VisitedAtUtc>=@dateFrom AND v.VisitedAtUtc<DATEADD(day,1,@dateTo)
     AND EXISTS(SELECT 1 FROM security.fn_RecordReadScope(a.TenantId,N'accounts.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId))
     AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@repJson)) OR v.ExternalSalesRepId IN(SELECT value FROM OPENJSON(@repJson)))
     AND (@organizationWide=1 OR v.SalesRepUserId=@actor OR EXISTS (
       SELECT 1 FROM crm.VisitRouteStaffMirror manager
       WHERE manager.TenantId=@tenant AND manager.RouteId=@routeId AND manager.StaffRoleCode='SUPERVISOR'
         AND manager.StaffUserId=@actor AND manager.EffectiveFrom<=@dateTo
         AND (manager.EffectiveTo IS NULL OR manager.EffectiveTo>=@dateFrom)))
   ORDER BY v.VisitedAtUtc DESC`)).recordset;
  let invoices=[];
  let products=[];
  if(financeAllowed){
   invoices=(await request().query(`
     SELECT i.InvoiceMirrorId,i.AccountId,i.InvoiceNumber,i.InvoiceDate,
       i.SalesRepExternalId,i.NetAmount,i.StatusCode
     FROM crm.InvoiceMirror i
     JOIN crm.Account a ON a.TenantId=i.TenantId AND a.AccountId=i.AccountId
     WHERE i.TenantId=@tenant AND i.IsVoided=0 AND i.CurrencyCode='IRR'
      AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@categoryJson)) OR a.BusinessCategoryCode IN (SELECT value FROM OPENJSON(@categoryJson)))
      AND i.StatusCode IN ('POSTED','CONFIRMED','CLOSED')
      AND i.InvoiceDate BETWEEN @dateFrom AND @dateTo
      AND EXISTS(SELECT 1 FROM crm.VisitRouteCustomerMirror m WHERE m.TenantId=i.TenantId
        AND m.RouteId=@routeId AND m.AccountId=i.AccountId
        AND m.EffectiveFrom<=i.InvoiceDate AND (m.EffectiveTo IS NULL OR m.EffectiveTo>=i.InvoiceDate))
      AND EXISTS(SELECT 1 FROM security.fn_RecordReadScope(a.TenantId,N'accounts.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId))
      AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@repJson)) OR i.SalesRepExternalId IN(SELECT value FROM OPENJSON(@repJson)))
      AND (@financeWide=1 OR i.SalesRepUserId=@actor OR EXISTS(
        SELECT 1 FROM crm.VisitRouteStaffMirror manager WHERE manager.TenantId=@tenant
        AND manager.RouteId=@routeId AND manager.StaffRoleCode='SUPERVISOR' AND manager.StaffUserId=@actor
        AND manager.EffectiveFrom<=@dateTo AND (manager.EffectiveTo IS NULL OR manager.EffectiveTo>=@dateFrom)))
   `)).recordset;
   const lines=(await request().query(`
     SELECT i.InvoiceMirrorId,l.ExternalProductId,l.ProductNameSnapshot,
       l.Quantity,l.NetUnitPrice,l.NetLineAmount
     FROM crm.InvoiceLineMirror l
     LEFT JOIN crm.ExternalProduct product ON product.TenantId=l.TenantId
       AND product.SourceSystemCode=l.SourceSystemCode AND product.ExternalProductId=l.ExternalProductId
     JOIN crm.InvoiceMirror i ON i.TenantId=l.TenantId AND i.InvoiceMirrorId=l.InvoiceMirrorId
     JOIN crm.Account a ON a.TenantId=i.TenantId AND a.AccountId=i.AccountId
     WHERE i.TenantId=@tenant AND i.IsVoided=0 AND i.CurrencyCode='IRR'
      AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@categoryJson)) OR a.BusinessCategoryCode IN (SELECT value FROM OPENJSON(@categoryJson)))
      AND i.StatusCode IN ('POSTED','CONFIRMED','CLOSED')
      AND i.InvoiceDate BETWEEN @dateFrom AND @dateTo
      AND EXISTS(SELECT 1 FROM crm.VisitRouteCustomerMirror m WHERE m.TenantId=i.TenantId
       AND m.RouteId=@routeId AND m.AccountId=i.AccountId
       AND m.EffectiveFrom<=i.InvoiceDate AND (m.EffectiveTo IS NULL OR m.EffectiveTo>=i.InvoiceDate))
      AND EXISTS(SELECT 1 FROM security.fn_RecordReadScope(a.TenantId,N'accounts.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId))
      AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@repJson)) OR i.SalesRepExternalId IN(SELECT value FROM OPENJSON(@repJson)))
      AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@productJson)) OR l.ExternalProductId IN(SELECT value FROM OPENJSON(@productJson)))
      AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@supplierJson)) OR product.SupplierExternalId IN(SELECT value FROM OPENJSON(@supplierJson)))
      AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@brandJson)) OR product.BrandExternalId IN(SELECT value FROM OPENJSON(@brandJson)))
      AND (@financeWide=1 OR i.SalesRepUserId=@actor OR EXISTS(
        SELECT 1 FROM crm.VisitRouteStaffMirror manager WHERE manager.TenantId=@tenant
        AND manager.RouteId=@routeId AND manager.StaffRoleCode='SUPERVISOR' AND manager.StaffUserId=@actor
        AND manager.EffectiveFrom<=@dateTo AND (manager.EffectiveTo IS NULL OR manager.EffectiveTo>=@dateFrom)))
   `)).recordset;
   const validInvoiceIds=new Set(lines.map(l=>String(l.InvoiceMirrorId).toLowerCase()));
   invoices=invoices.filter(i=>validInvoiceIds.has(String(i.InvoiceMirrorId).toLowerCase()));
   products=lines;
  }
  let returnRows=[];
  if(returnAllowed){
    returnRows=(await request().query(`
      SELECT ret.AccountId,SUM(ret.ReturnedAmount) AS ReturnAmount
      FROM analytics.vw_FactReturns ret
      JOIN crm.SalesReturnMirror sr ON sr.TenantId=ret.TenantId AND sr.SalesReturnMirrorId=ret.SalesReturnMirrorId
      JOIN crm.Account a ON a.TenantId=ret.TenantId AND a.AccountId=ret.AccountId
      LEFT JOIN crm.ExternalProduct product ON product.TenantId=ret.TenantId
        AND product.SourceSystemCode=sr.SourceSystemCode AND product.ExternalProductId=ret.ExternalProductId
      WHERE ret.TenantId=@tenant AND ret.IsEffective=1
        AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@categoryJson)) OR a.BusinessCategoryCode IN (SELECT value FROM OPENJSON(@categoryJson))) AND ret.DateKey BETWEEN @dateFrom AND @dateTo
        AND EXISTS(SELECT 1 FROM crm.VisitRouteCustomerMirror member WHERE member.TenantId=ret.TenantId
          AND member.RouteId=@routeId AND member.AccountId=ret.AccountId
          AND member.EffectiveFrom<=ret.DateKey AND (member.EffectiveTo IS NULL OR member.EffectiveTo>=ret.DateKey))
        AND EXISTS(SELECT 1 FROM security.fn_RecordReadScope(a.TenantId,N'accounts.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId))
        AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@productJson)) OR ret.ExternalProductId IN(SELECT value FROM OPENJSON(@productJson)))
        AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@supplierJson)) OR product.SupplierExternalId IN(SELECT value FROM OPENJSON(@supplierJson)))
        AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@brandJson)) OR product.BrandExternalId IN(SELECT value FROM OPENJSON(@brandJson)))
        AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@repJson)) OR EXISTS(
          SELECT 1 FROM crm.VisitRouteStaffMirror st WHERE st.TenantId=@tenant AND st.RouteId=@routeId
            AND st.StaffUserId=ret.SalesRepUserId AND st.ExternalStaffId IN(SELECT value FROM OPENJSON(@repJson))))
        AND (@financeWide=1 OR ret.SalesRepUserId=@actor OR EXISTS(
          SELECT 1 FROM crm.VisitRouteStaffMirror manager WHERE manager.TenantId=@tenant
            AND manager.RouteId=@routeId AND manager.StaffRoleCode='SUPERVISOR'
            AND manager.StaffUserId=@actor AND manager.EffectiveFrom<=@dateTo
            AND (manager.EffectiveTo IS NULL OR manager.EffectiveTo>=@dateFrom)))
      GROUP BY ret.AccountId
    `)).recordset;
  }
  // Balance is a present-time ledger snapshot, not a historical report-period amount.
  let balanceRows=[];
  if(receivableAllowed && filters.repIds.length===0 && filters.productIds.length===0 &&
     filters.supplierIds.length===0 && filters.brandIds.length===0){
    balanceRows=(await request().query(`
      SELECT b.AccountId,SUM(b.OutstandingAmount) AS ReceivableAmount
      FROM analytics.vw_AccountReceivable b
      JOIN crm.Account a ON a.TenantId=b.TenantId AND a.AccountId=b.AccountId
      WHERE b.TenantId=@tenant AND b.CurrencyCode='IRR'
       AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@categoryJson)) OR a.BusinessCategoryCode IN (SELECT value FROM OPENJSON(@categoryJson)))
       AND EXISTS(SELECT 1 FROM crm.VisitRouteCustomerMirror m WHERE m.TenantId=b.TenantId
         AND m.RouteId=@routeId AND m.AccountId=b.AccountId AND m.EffectiveFrom<=@dateTo
         AND (m.EffectiveTo IS NULL OR m.EffectiveTo>=@dateFrom))
       AND EXISTS(SELECT 1 FROM security.fn_RecordReadScope(a.TenantId,N'accounts.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId))
       AND (@financeWide=1 OR EXISTS(
         SELECT 1 FROM crm.VisitRouteStaffMirror manager WHERE manager.TenantId=@tenant
          AND manager.RouteId=@routeId AND manager.StaffRoleCode='SUPERVISOR'
          AND manager.StaffUserId=@actor AND manager.EffectiveFrom<=@dateTo
          AND (manager.EffectiveTo IS NULL OR manager.EffectiveTo>=@dateFrom)))
      GROUP BY b.AccountId`)).recordset;
  }
  const returnMap=new Map(returnRows.map(r=>[String(r.AccountId).toLowerCase(),Number(r.ReturnAmount)]));
  const balanceMap=new Map(balanceRows.map(r=>[String(r.AccountId).toLowerCase(),Number(r.ReceivableAmount)]));
  const sourceCoverage=(await request().query(`
    SELECT
      CASE WHEN EXISTS(SELECT 1 FROM crm.ErpVisitEventMirror e WHERE e.TenantId=@tenant AND e.IsDeleted=0)
        THEN 1 ELSE 0 END AS HasVisitFeed,
      CASE WHEN EXISTS(SELECT 1 FROM crm.InvoiceMirror i WHERE i.TenantId=@tenant
        AND i.IsVoided=0 AND i.StatusCode IN ('POSTED','CONFIRMED','CLOSED'))
        THEN 1 ELSE 0 END AS HasInvoiceFeed
  `)).recordset[0]||{};
  const hasVisitFeed=sourceCoverage.HasVisitFeed===1;
  const hasInvoiceFeed=financeAllowed && sourceCoverage.HasInvoiceFeed===1;
  const hasReturnFeed=returnAllowed && (await request().query(`
     SELECT CASE WHEN EXISTS(SELECT 1 FROM crm.SalesReturnMirror WHERE TenantId=@tenant)
       THEN 1 ELSE 0 END AS HasReturnFeed`)).recordset[0]?.HasReturnFeed===1;
  const visitByAccount=new Map();
  for(const v of visits){const k=String(v.AccountId).toLowerCase();const a=visitByAccount.get(k)||[];a.push(v);visitByAccount.set(k,a);}
  const invoiceByAccount=new Map();
  for(const i of invoices){const k=String(i.AccountId).toLowerCase();const a=invoiceByAccount.get(k)||[];a.push(i);invoiceByAccount.set(k,a);}
  const linesByInvoice=new Map();
  for(const l of products){const k=String(l.InvoiceMirrorId).toLowerCase();const a=linesByInvoice.get(k)||[];a.push(l);linesByInvoice.set(k,a);}
  const customers=uniqueMembers.map(m=>{
    const id=String(m.AccountId).toLowerCase(),cv=visitByAccount.get(id)||[],ci=invoiceByAccount.get(id)||[];
    const sales=ci.reduce((sum,i)=>sum+(linesByInvoice.get(String(i.InvoiceMirrorId).toLowerCase())||[])
       .reduce((sub,l)=>sub+Number(l.NetLineAmount||0),0),0);
    const lastVisit=cv[0],lastInvoice=ci.sort((a,b)=>String(b.InvoiceDate).localeCompare(String(a.InvoiceDate)))[0];
    const bought=financeAllowed&&ci.length>0,visited=cv.length>0;
    return {id:m.AccountId,name:m.Name,code:m.AccountCode,statusCode:m.StatusCode,businessCategoryCode:m.BusinessCategoryCode,
      subRouteCode:m.SubRouteCode,latitude:numberOrNull(m.Latitude),longitude:numberOrNull(m.Longitude),
      visitCount:hasVisitFeed?cv.length:null,lastVisitAt:lastVisit?.VisitedAtUtc||null,
      lastVisitOutcome:lastVisit?.OutcomeCode||null,noOrderReason:lastVisit?.ReasonTitleFa||lastVisit?.NoOrderReasonCode||null,
      invoiceCount:hasInvoiceFeed?ci.length:null,
      invoicedSales:hasInvoiceFeed?sales:null,
      netSales:hasInvoiceFeed&&hasReturnFeed?sales-(returnMap.get(id)||0):null,
      returnAmount:hasReturnFeed?(returnMap.get(id)||0):null,
      receivableAmount:balanceMap.has(id)?balanceMap.get(id):null,
      receivableAsOf:balanceMap.has(id)?new Date().toISOString().slice(0,10):null,
      lastInvoice:lastInvoice?{number:lastInvoice.InvoiceNumber,date:lastInvoice.InvoiceDate,
        items:(linesByInvoice.get(String(lastInvoice.InvoiceMirrorId).toLowerCase())||[])
          .slice(0,25).map(l=>({name:l.ProductNameSnapshot,quantity:Number(l.Quantity),unitPrice:Number(l.NetUnitPrice)}))}:null,
      status:!hasInvoiceFeed?(hasVisitFeed&&visited?'VISITED':'UNKNOWN'):(bought?'BOUGHT':hasVisitFeed&&visited?'VISITED_NO_ORDER':hasVisitFeed?'NOT_BOUGHT':'UNKNOWN'),
      evidence:{visitIds:cv.slice(0,5).map(v=>v.ExternalVisitId),
        invoiceIds:financeAllowed?ci.slice(0,5).map(i=>i.InvoiceMirrorId):[]}};
  });
  const topProducts=financeAllowed?[...products.reduce((map,l)=>{
    const key=String(l.ExternalProductId||l.ProductNameSnapshot);
    const item=map.get(key)||{id:key,name:l.ProductNameSnapshot,amount:0,quantity:0};
    item.amount+=Number(l.NetLineAmount||0);item.quantity+=Number(l.Quantity||0);map.set(key,item);return map;
  },new Map()).values()].sort((a,b)=>b.amount-a.amount).slice(0,20):[];
  return {route,period:{dateFrom:filters.from,dateTo:filters.to},customers,topProducts,
    source:'ERP_SQL',moneyUnit:'IRR',financeVisible:financeAllowed,coverage:{hasVisitFeed,hasInvoiceFeed,hasReturnFeed},
    warnings:['بازه زمانی بر اساس عضویت رسمی ERP محاسبه شده است.',
      'برای مشتری چندمسیره ممکن است یک فاکتور در هر مسیر مربوط نمایش داده شود.',
      'فروش خالص فقط در صورت تأیید فاکتور و مرجوعی، از مبلغ ریز فاکتور منهای برگشتی معتبر محاسبه می‌شود. مبلغ فاکتور قبل از برگشت جداست.',
      'مطالبات مانده فعلی حسابداری است؛ سود و هدف نیازمند منبع قابل اتکا هستند.']};
 });
}
const numberOrNull=x=>x==null?null:Number(x);
