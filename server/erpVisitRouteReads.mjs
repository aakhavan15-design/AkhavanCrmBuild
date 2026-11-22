/**
 * SQL-first read-only ERP visit route/tour projection.
 * Tenant RLS is enforced by withTenantContext; route membership and account record
 * scope are ALSO enforced in the queries. No state-snapshot bypass.
 */
export function createErpVisitRouteReader({sql,run}){
 const validDate=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
   Number.isFinite(Date.parse(value)) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 const makeRequest=(transaction,auth,org)=>new sql.Request(transaction)
  .input('tenant',sql.UniqueIdentifier,auth.tenantId)
  .input('actor',sql.UniqueIdentifier,auth.userId)
  .input('organizationWide',sql.Bit,org?1:0);
 const staffAccess=`(@organizationWide=1 OR EXISTS (
     SELECT 1 FROM crm.VisitRouteStaffMirror staff
     WHERE staff.TenantId=route.TenantId AND staff.RouteId=route.RouteId
       AND staff.StaffUserId=@actor AND staff.EffectiveFrom<=@date
       AND (staff.EffectiveTo IS NULL OR staff.EffectiveTo>=@date)
 ))`;
 const list=async(auth,{organizationWide=false,date,limit=200}={})=>{
  if(!validDate(date))throw Object.assign(new Error('تاریخ معتبر نیست.'),{status:400});
  const take=Math.max(1,Math.min(500,Number(limit)||200));
  return run(auth,async transaction=>{
   const result=await makeRequest(transaction,auth,organizationWide)
    .input('date',sql.Date,date).input('take',sql.Int,take)
    .query(`SELECT TOP (@take) route.RouteId,route.SourceSystemCode,route.ExternalRouteId,
       route.RouteCode,route.RouteName,route.StatusCode,
       (SELECT COUNT(DISTINCT member.AccountId) FROM crm.VisitRouteCustomerMirror member
         WHERE member.TenantId=route.TenantId AND member.RouteId=route.RouteId
           AND member.EffectiveFrom<=@date AND (member.EffectiveTo IS NULL OR member.EffectiveTo>=@date)
           AND EXISTS (SELECT 1 FROM crm.Account a WHERE a.TenantId=route.TenantId AND a.AccountId=member.AccountId
             AND EXISTS(SELECT 1 FROM security.fn_RecordReadScope(a.TenantId,N'accounts.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId))
           )) AS VisibleCustomerCount
       FROM crm.VisitRouteMirror route WHERE route.TenantId=@tenant AND route.IsDeleted=0 AND ${staffAccess}
       ORDER BY route.RouteCode,route.RouteId`);
   return {source:'ERP_SQL',asOf:date,rows:result.recordset,hasMore:result.recordset.length===take};
  });
 };
 const overview=async(auth,{routeId,date,organizationWide=false}={})=>{
  if(!validDate(date))throw Object.assign(new Error('تاریخ معتبر نیست.'),{status:400});
  return run(auth,async transaction=>{
   const request=()=>makeRequest(transaction,auth,organizationWide)
     .input('routeId',sql.UniqueIdentifier,routeId).input('date',sql.Date,date);
   const routes=await request().query(`SELECT TOP (1) route.RouteId,route.SourceSystemCode,
    route.ExternalRouteId,route.RouteCode,route.RouteName
    FROM crm.VisitRouteMirror route
    WHERE route.TenantId=@tenant AND route.RouteId=@routeId AND route.IsDeleted=0 AND ${staffAccess}`);
   if(!routes.recordset.length)return null;
   const statements=[
    () => request().query(`SELECT member.AccountId,member.SubRouteCode,member.ExternalCustomerId,a.AccountCode,a.Name,
       a.Latitude,a.Longitude,a.GeoAccuracyMeters,a.GeoSourceCode
       FROM crm.VisitRouteCustomerMirror member
       JOIN crm.Account a ON a.TenantId=member.TenantId AND a.AccountId=member.AccountId
       WHERE member.TenantId=@tenant AND member.RouteId=@routeId
         AND member.EffectiveFrom<=@date AND (member.EffectiveTo IS NULL OR member.EffectiveTo>=@date)
         AND EXISTS(SELECT 1 FROM security.fn_RecordReadScope(a.TenantId,N'accounts.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId))
       ORDER BY member.SubRouteCode,a.Name,a.AccountId`),
    () => request().query(`SELECT staff.ExternalStaffId,staff.StaffRoleCode,staff.StaffUserId
       FROM crm.VisitRouteStaffMirror staff
       WHERE staff.TenantId=@tenant AND staff.RouteId=@routeId
       AND staff.EffectiveFrom<=@date AND (staff.EffectiveTo IS NULL OR staff.EffectiveTo>=@date)
       ORDER BY staff.StaffRoleCode,staff.ExternalStaffId`),
    () => request().query(`SELECT tour.TourId,tour.ExternalTourId,tour.TourCode,tour.TourDate,
       tour.ExternalSalesRepId,stop.StopSequence,stop.ExternalCustomerId,stop.AccountId
       FROM crm.VisitTourMirror tour
       LEFT JOIN crm.VisitTourStopMirror stop
          ON stop.TenantId=tour.TenantId AND stop.TourId=tour.TourId AND stop.IsDeleted=0
          AND EXISTS (SELECT 1 FROM crm.Account sa WHERE sa.TenantId=stop.TenantId AND sa.AccountId=stop.AccountId
            AND EXISTS(SELECT 1 FROM security.fn_RecordReadScope(sa.TenantId,N'accounts.view',sa.OwnerUserId,sa.BranchId,sa.TerritoryId,sa.TeamId)))
       WHERE tour.TenantId=@tenant AND tour.RouteId=@routeId AND tour.TourDate=@date AND tour.IsDeleted=0
       AND (@organizationWide=1 OR tour.SalesRepUserId=@actor OR EXISTS(SELECT 1 FROM crm.VisitRouteStaffMirror manager
         WHERE manager.TenantId=tour.TenantId AND manager.RouteId=tour.RouteId AND manager.StaffUserId=@actor
           AND manager.StaffRoleCode='SUPERVISOR' AND manager.EffectiveFrom<=@date
           AND (manager.EffectiveTo IS NULL OR manager.EffectiveTo>=@date)))
       ORDER BY tour.ExternalSalesRepId,tour.TourId,stop.StopSequence`),
    () => request().query(`SELECT TOP (1500) visit.ExternalVisitId,visit.AccountId,visit.VisitedAtUtc,
       visit.ExternalSalesRepId,visit.OutcomeCode,visit.NoOrderReasonCode,
       reason.ReasonTitleFa,visit.ResultingExternalOrderId,
       visit.Latitude,visit.Longitude,visit.AccuracyMeters
       FROM crm.ErpVisitEventMirror visit
       JOIN crm.VisitTourMirror sourceTour ON sourceTour.TenantId=visit.TenantId
         AND sourceTour.TourId=visit.TourId AND sourceTour.RouteId=@routeId
       JOIN crm.VisitRouteCustomerMirror member ON member.TenantId=visit.TenantId
         AND member.AccountId=visit.AccountId AND member.RouteId=@routeId
         AND member.EffectiveFrom<=@date AND (member.EffectiveTo IS NULL OR member.EffectiveTo>=@date)
       JOIN crm.Account a ON a.TenantId=visit.TenantId AND a.AccountId=visit.AccountId
       LEFT JOIN crm.VisitNoOrderReasonMirror reason ON reason.TenantId=visit.TenantId
         AND reason.SourceSystemCode=visit.SourceSystemCode AND reason.ExternalReasonCode=visit.NoOrderReasonCode
       WHERE visit.TenantId=@tenant AND visit.IsDeleted=0 AND CONVERT(date,visit.VisitedAtUtc)=@date
         AND (@organizationWide=1 OR visit.SalesRepUserId=@actor OR EXISTS(SELECT 1 FROM crm.VisitRouteStaffMirror manager
           WHERE manager.TenantId=visit.TenantId AND manager.RouteId=@routeId AND manager.StaffUserId=@actor
           AND manager.StaffRoleCode='SUPERVISOR' AND manager.EffectiveFrom<=@date
           AND (manager.EffectiveTo IS NULL OR manager.EffectiveTo>=@date)))
         AND EXISTS(SELECT 1 FROM security.fn_RecordReadScope(a.TenantId,N'accounts.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId))
       ORDER BY visit.VisitedAtUtc DESC`),
    () => request().query(`SELECT TOP (1500) gps.ExternalLocationId,gps.ExternalSalesRepId,
       gps.RecordedAtUtc,gps.Latitude,gps.Longitude,gps.AccuracyMeters
       FROM crm.SalesRepGpsMirror gps
       WHERE gps.TenantId=@tenant AND CONVERT(date,gps.RecordedAtUtc)=@date
         AND EXISTS(SELECT 1 FROM crm.VisitRouteStaffMirror staff
           WHERE staff.TenantId=gps.TenantId AND staff.RouteId=@routeId AND staff.ExternalStaffId=gps.ExternalSalesRepId
           AND staff.StaffRoleCode='SALES_REP'
           AND (@organizationWide=1 OR gps.SalesRepUserId=@actor OR EXISTS (
             SELECT 1 FROM crm.VisitRouteStaffMirror supervisor WHERE supervisor.TenantId=staff.TenantId
               AND supervisor.RouteId=staff.RouteId AND supervisor.StaffUserId=@actor
               AND supervisor.StaffRoleCode='SUPERVISOR' AND supervisor.EffectiveFrom<=@date
               AND (supervisor.EffectiveTo IS NULL OR supervisor.EffectiveTo>=@date)))
           AND staff.EffectiveFrom<=@date
           AND (staff.EffectiveTo IS NULL OR staff.EffectiveTo>=@date))
       ORDER BY gps.RecordedAtUtc DESC`),
   ];
   const results=[];
   for(const query of statements) results.push(await query());
   const [members,staff,tours,visits,gps]=results;
   return {source:'ERP_SQL',asOf:date,route:routes.recordset[0],
     customers:members.recordset,staff:staff.recordset,tours:tours.recordset,
     visits:visits.recordset,gps:gps.recordset,
     limits:{visitsMax:1500,gpsMax:1500,mayBeTruncated:visits.recordset.length===1500||gps.recordset.length===1500}};
  });
 };
 return {list,overview};
}
