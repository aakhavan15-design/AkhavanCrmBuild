/**
 * Route-map analytics over ERP SQL mirrors. One source-of-truth per metric.
 * A customer can belong to multiple routes: aggregates are PER ROUTE and
 * MUST NOT be summed across routes to obtain organisation totals.
 *
 * This reader accepts only server-authenticated scope; no client-owned
 * financial totals or owner supplied filters are trusted.
 */
const validDate = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) &&
  !Number.isNaN(Date.parse(x)) && new Date(x + 'T00:00:00Z').toISOString().startsWith(x);
const numberOrNull = value => value == null ? null : Number(value);
const safe = s => typeof s === 'string' ? s.trim() : '';
export function parseRouteMapFilters(query = {}) {
 const from=safe(query.dateFrom),to=safe(query.dateTo);
 if(!validDate(from)||!validDate(to)||from>to)
  throw Object.assign(new Error('بازه تاریخی معتبر وارد کنید.'),{status:400});
 const days=(Date.parse(to)-Date.parse(from))/86400000;
 if(days>366)throw Object.assign(new Error('بازه گزارش نباید بیش از یک سال باشد.'),{status:400});
 const values=field=>{
  const source=query[field];
  const list=Array.isArray(source)?source:source==null?[]:String(source).split(',');
  if(list.length>40)throw Object.assign(new Error('تعداد فیلتر بیش از حد مجاز است.'),{status:400});
  return [...new Set(list.map(v=>safe(String(v))).filter(Boolean))];
 };
 const productIds=values('productIds'),repIds=values('salesRepIds'),routeIds=values('routeIds');
 const supplierIds=values('supplierIds'),brandIds=values('brandIds'),customerCategoryIds=values('customerCategoryIds');
 const unsupported=['supervisorIds']
   .filter(field=>values(field).length);
 if(unsupported.length)throw Object.assign(new Error('فیلترهای '+unsupported.join('، ')+' هنوز به نگاشت تأییدشده ERP متصل نیستند.'),{status:422});
 if([...productIds,...repIds,...supplierIds,...brandIds,...customerCategoryIds].some(x=>x.length>200)||
   routeIds.some(x=>!/^[0-9a-f-]{36}$/i.test(x)))
  throw Object.assign(new Error('شناسه فیلتر معتبر نیست.'),{status:400});
 return {from,to,productIds,repIds,routeIds,supplierIds,brandIds,customerCategoryIds};
}
const money = x => x === null || x === undefined ? null : Number(x);
const shapeRow=(row,financial,customerCount,visited,invoiceCount,netSales,customerActiveCount,visitCount,orderOutcomes,missingCoords,coverage)=>{
 const counts=customerCount==null?null:Number(customerCount);
 return {
  routeId:String(row.RouteId),routeCode:row.RouteCode,routeName:row.RouteName,
  location:{latitude:row.CenterLat==null?null:Number(row.CenterLat),longitude:row.CenterLon==null?null:Number(row.CenterLon)},
  customerCount:counts,activeCustomerCount:financial?Number(customerActiveCount):null,
  visitCount:Number(visitCount||0),visitedCustomerCount:Number(visited||0),
  orderOutcomeCount:Number(orderOutcomes||0),
  invoiceCount:financial?Number(invoiceCount):null,netSales:financial?money(netSales):null,
  missingCoordinateCount:Number(missingCoords||0),coordinateCoveragePercent:coverage,
  returnAmount:null,profitAmount:null,receivableAmount:null,targetAchievedPercent:null,
  attentionPercent:counts>0?Math.round(Number(visited||0)*10000/counts)/100:null,
  health:'UNKNOWN',metricAvailability:{
   customerCount:'ERP_ROUTE_MEMBERSHIP',activeCustomerCount:financial?'ERP_INVOICE':'DENIED',
   visitCount:'ERP_VISIT_EVENT',invoiceCount:financial?'ERP_INVOICE':'DENIED',
   netSales:financial?'ERP_INVOICE_LINE':'DENIED',
   returnAmount:'UNAVAILABLE',profitAmount:'UNAVAILABLE',
   receivableAmount:'UNAVAILABLE',targetAchievedPercent:'UNAVAILABLE',
  },source:'ERP_SQL',sourceStatus:'PARTIAL'
 };
};
export function createRouteMapAnalytics({sql,run}) {
 const filtersRequest=(transaction,auth,{from,to,productIds,repIds,routeIds,supplierIds,brandIds,customerCategoryIds},organizationWide,financeOrganizationWide)=>{
  const req=new sql.Request(transaction)
   .input('tenant',sql.UniqueIdentifier,auth.tenantId)
   .input('actor',sql.UniqueIdentifier,auth.userId)
   .input('organizationWide',sql.Bit,organizationWide?1:0)
   .input('financeWide',sql.Bit,financeOrganizationWide?1:0)
   .input('dateFrom',sql.Date,from).input('dateTo',sql.Date,to)
   .input('productJson',sql.NVarChar(sql.MAX),JSON.stringify(productIds))
   .input('supplierJson',sql.NVarChar(sql.MAX),JSON.stringify(supplierIds))
   .input('brandJson',sql.NVarChar(sql.MAX),JSON.stringify(brandIds))
   .input('categoryJson',sql.NVarChar(sql.MAX),JSON.stringify(customerCategoryIds))
   .input('repJson',sql.NVarChar(sql.MAX),JSON.stringify(repIds))
   .input('routeJson',sql.NVarChar(sql.MAX),JSON.stringify(routeIds));
  return req;
 };
 /** Avoid SQL fanout across many-to-many route membership. Customer IDs are
  * deduplicated within a route; same official sale in two routes is marked
  * per-route and never shown as an organisation-wide sum.
  */
 const mapSummary=async(auth,{filters,organizationWide=false,financeAllowed=false,financeOrganizationWide=false}={})=>run(auth,async tx=>{
  const sqlText=`
  WITH AllowedRoutes AS (
   SELECT r.RouteId,r.RouteCode,r.RouteName,r.TenantId
   FROM crm.VisitRouteMirror r
   WHERE r.TenantId=@tenant AND r.IsDeleted=0 AND
    (NOT EXISTS(SELECT 1 FROM OPENJSON(@routeJson))
      OR CONVERT(nvarchar(36),r.RouteId) IN (SELECT value FROM OPENJSON(@routeJson)))
    AND (@organizationWide=1 OR EXISTS(
     SELECT 1 FROM crm.VisitRouteStaffMirror st WHERE st.TenantId=r.TenantId
      AND st.RouteId=r.RouteId AND st.StaffUserId=@actor
      AND st.EffectiveFrom<=@dateTo AND (st.EffectiveTo IS NULL OR st.EffectiveTo>=@dateFrom)
    ))
  ), Members AS (
   SELECT DISTINCT r.RouteId,a.AccountId,a.Latitude,a.Longitude
   FROM AllowedRoutes r JOIN crm.VisitRouteCustomerMirror m ON m.TenantId=r.TenantId AND m.RouteId=r.RouteId
   JOIN crm.Account a ON a.TenantId=m.TenantId AND a.AccountId=m.AccountId
   WHERE m.EffectiveFrom<=@dateTo AND (m.EffectiveTo IS NULL OR m.EffectiveTo>=@dateFrom)
    AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@categoryJson)) OR a.BusinessCategoryCode IN (SELECT value FROM OPENJSON(@categoryJson)))
    AND EXISTS(SELECT 1 FROM security.fn_RecordReadScope(a.TenantId,N'accounts.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId))
  ), RouteVisits AS (
    SELECT m.RouteId,COUNT_BIG(*) AS VisitCount,COUNT(DISTINCT v.AccountId) AS VisitedCount,
     SUM(CASE WHEN v.OutcomeCode='ORDER_TAKEN' THEN 1 ELSE 0 END) AS OrderOutcomes
    FROM Members m JOIN crm.ErpVisitEventMirror v ON v.TenantId=@tenant AND v.AccountId=m.AccountId
     JOIN crm.VisitTourMirror tour ON tour.TenantId=v.TenantId AND tour.TourId=v.TourId AND tour.RouteId=m.RouteId
    WHERE v.IsDeleted=0 AND v.VisitedAtUtc>=@dateFrom AND v.VisitedAtUtc<DATEADD(day,1,@dateTo)
     AND (@organizationWide=1 OR v.SalesRepUserId=@actor OR EXISTS(
      SELECT 1 FROM crm.VisitRouteStaffMirror st WHERE st.TenantId=v.TenantId
       AND st.RouteId=m.RouteId AND st.StaffUserId=@actor AND st.StaffRoleCode='SUPERVISOR'
       AND st.EffectiveFrom<=@dateTo AND (st.EffectiveTo IS NULL OR st.EffectiveTo>=@dateFrom)
     ))
     AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@repJson))
      OR v.ExternalSalesRepId IN (SELECT value FROM OPENJSON(@repJson)))
    GROUP BY m.RouteId
  ), RouteStats AS (
    SELECT RouteId,COUNT(DISTINCT AccountId) AS CustomerCount,
      SUM(CASE WHEN Latitude IS NULL OR Longitude IS NULL THEN 1 ELSE 0 END) AS MissingGps,
      AVG(CASE WHEN Latitude IS NOT NULL THEN CONVERT(float,Latitude) END) AS CenterLat,
      AVG(CASE WHEN Longitude IS NOT NULL THEN CONVERT(float,Longitude) END) AS CenterLon
    FROM Members GROUP BY RouteId
  )
  SELECT r.RouteId,r.RouteCode,r.RouteName,
   COALESCE(s.CustomerCount,0) AS CustomerCount,COALESCE(s.MissingGps,0) AS MissingGps,s.CenterLat,s.CenterLon,
   COALESCE(v.VisitCount,0) AS VisitCount,COALESCE(v.VisitedCount,0) AS VisitedCount,COALESCE(v.OrderOutcomes,0) AS OrderOutcomes
  FROM AllowedRoutes r LEFT JOIN RouteStats s ON s.RouteId=r.RouteId
  LEFT JOIN RouteVisits v ON v.RouteId=r.RouteId ORDER BY r.RouteCode,r.RouteId`;
  const rows=(await filtersRequest(tx,auth,filters,organizationWide,financeOrganizationWide).query(sqlText)).recordset;
  // Financial query is entirely skipped without the server-side permission.
  let financial=new Map();
  if(financeAllowed) {
   const amountQuery=`
    WITH AllowedRoutes AS (
      SELECT r.RouteId FROM crm.VisitRouteMirror r
      WHERE r.TenantId=@tenant AND r.IsDeleted=0
      AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@routeJson)) OR
        CONVERT(nvarchar(36),r.RouteId) IN (SELECT value FROM OPENJSON(@routeJson)))
      AND (@organizationWide=1 OR EXISTS(SELECT 1 FROM crm.VisitRouteStaffMirror st
       WHERE st.TenantId=r.TenantId AND st.RouteId=r.RouteId AND st.StaffUserId=@actor
         AND st.EffectiveFrom<=@dateTo AND (st.EffectiveTo IS NULL OR st.EffectiveTo>=@dateFrom)))
    ), Members AS (
      SELECT DISTINCT r.RouteId,m.AccountId
      FROM AllowedRoutes r JOIN crm.VisitRouteCustomerMirror m ON m.TenantId=@tenant AND m.RouteId=r.RouteId
      JOIN crm.Account a ON a.TenantId=m.TenantId AND a.AccountId=m.AccountId
      WHERE m.EffectiveFrom<=@dateTo AND (m.EffectiveTo IS NULL OR m.EffectiveTo>=@dateFrom)
       AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@categoryJson)) OR a.BusinessCategoryCode IN (SELECT value FROM OPENJSON(@categoryJson)))
       AND EXISTS(SELECT 1 FROM security.fn_RecordReadScope(a.TenantId,N'accounts.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId))
    ), FilteredInvoices AS (
      SELECT i.InvoiceMirrorId,i.AccountId,i.SourceSystemCode,i.GrossAmount
      FROM crm.InvoiceMirror i WHERE i.TenantId=@tenant AND i.IsVoided=0 AND i.CurrencyCode='IRR'
       AND i.StatusCode IN ('POSTED','CONFIRMED','CLOSED')
       AND i.InvoiceDate BETWEEN @dateFrom AND @dateTo
       AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@repJson)) OR i.SalesRepExternalId IN (SELECT value FROM OPENJSON(@repJson)))
    ), InvoiceLines AS (
      SELECT i.InvoiceMirrorId,SUM(l.NetLineAmount) AS Amount
      FROM FilteredInvoices i JOIN crm.InvoiceLineMirror l ON l.TenantId=@tenant AND l.InvoiceMirrorId=i.InvoiceMirrorId
      LEFT JOIN crm.ExternalProduct p ON p.TenantId=l.TenantId AND p.SourceSystemCode=l.SourceSystemCode AND p.ExternalProductId=l.ExternalProductId
      WHERE (NOT EXISTS(SELECT 1 FROM OPENJSON(@productJson)) OR l.ExternalProductId IN (SELECT value FROM OPENJSON(@productJson)))
      AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@supplierJson)) OR p.SupplierExternalId IN (SELECT value FROM OPENJSON(@supplierJson)))
      AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@brandJson)) OR p.BrandExternalId IN (SELECT value FROM OPENJSON(@brandJson)))
      GROUP BY i.InvoiceMirrorId
    )
    SELECT m.RouteId,COUNT(DISTINCT i.InvoiceMirrorId) AS InvoiceCount,
      COUNT(DISTINCT i.AccountId) AS ActiveCustomerCount,SUM(l.Amount) AS NetSales
    FROM Members m JOIN FilteredInvoices i ON i.AccountId=m.AccountId
    JOIN InvoiceLines l ON l.InvoiceMirrorId=i.InvoiceMirrorId
    WHERE @financeWide=1 OR i.SalesRepUserId=@actor OR EXISTS (
      SELECT 1 FROM crm.VisitRouteStaffMirror manager
      WHERE manager.TenantId=@tenant AND manager.RouteId=m.RouteId AND manager.StaffUserId=@actor
      AND manager.StaffRoleCode='SUPERVISOR'
      AND manager.EffectiveFrom<=@dateTo AND (manager.EffectiveTo IS NULL OR manager.EffectiveTo>=@dateFrom))
    GROUP BY m.RouteId`;
   financial=new Map((await filtersRequest(tx,auth,filters,organizationWide,financeOrganizationWide).query(amountQuery)).recordset.map(x=>[String(x.RouteId).toLowerCase(),x]));
  }
  return {source:'ERP_SQL',period:{dateFrom:filters.from,dateTo:filters.to},
    caveats:['مشتری چندمسیره در هر مسیر مستقل شمرده می‌شود؛ مجموع مسیرها لزوماً جمع سازمان نیست.',
      'خرید و فروش فیلترشده با کالا از ریز فاکتور معتبر محاسبه شده؛ مرجوعی، سود، مطالبات و هدف تا نگاشت قابل استناد نامشخص‌اند.'],
    rows:rows.map(r=>{
      const f=financial.get(String(r.RouteId).toLowerCase());
      const count=Number(r.CustomerCount);
      return shapeRow(r,financeAllowed,count,r.VisitedCount,Number(f?.InvoiceCount||0),
       financeAllowed?(f?.NetSales??0):null,Number(f?.ActiveCustomerCount||0),
       r.VisitCount,r.OrderOutcomes,r.MissingGps,
       count>0?Math.round((count-Number(r.MissingGps))*10000/count)/100:null);
    })};
 });
 const filterOptions=async(auth,{organizationWide=false,financeAllowed=false,date}={})=>run(auth,async tx=>{
   const request=()=>new sql.Request(tx)
     .input('tenant',sql.UniqueIdentifier,auth.tenantId)
     .input('actor',sql.UniqueIdentifier,auth.userId)
     .input('organizationWide',sql.Bit,organizationWide?1:0)
     .input('asOf',sql.Date,date);
   const staff=(await request().query(`
     SELECT DISTINCT st.ExternalStaffId,st.StaffRoleCode
     FROM crm.VisitRouteStaffMirror st JOIN crm.VisitRouteMirror route
      ON route.TenantId=st.TenantId AND route.RouteId=st.RouteId
     WHERE st.TenantId=@tenant AND route.IsDeleted=0
       AND st.EffectiveFrom<=@asOf AND (st.EffectiveTo IS NULL OR st.EffectiveTo>=@asOf)
       AND (@organizationWide=1 OR EXISTS (
        SELECT 1 FROM crm.VisitRouteStaffMirror mine WHERE mine.TenantId=route.TenantId
         AND mine.RouteId=route.RouteId AND mine.StaffUserId=@actor
         AND mine.EffectiveFrom<=@asOf AND (mine.EffectiveTo IS NULL OR mine.EffectiveTo>=@asOf)))
     ORDER BY st.StaffRoleCode,st.ExternalStaffId`)).recordset;
   let products=[];
   if(financeAllowed){
     products=(await request().query(`SELECT TOP(500) p.ExternalProductId,p.ProductName
       FROM crm.ExternalProduct p WHERE p.TenantId=@tenant AND p.IsActive=1
       ORDER BY p.ProductName,p.ExternalProductId`)).recordset;
   }
   return {source:'ERP_SQL',salesReps:staff.filter(x=>x.StaffRoleCode==='SALES_REP').map(x=>({id:x.ExternalStaffId,name:x.ExternalStaffId})),
     supervisors:staff.filter(x=>x.StaffRoleCode==='SUPERVISOR').map(x=>({id:x.ExternalStaffId,name:x.ExternalStaffId})),
     products:products.map(x=>({id:x.ExternalProductId,name:x.ProductName})),
     supported:['dateFrom','dateTo','routeIds','salesRepIds','productIds'],
     unavailable:['supplierIds','brandIds','customerCategoryIds','supervisorIds']};
 });
 return {mapSummary,filterOptions};
}
