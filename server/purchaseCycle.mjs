const tehranDate = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'});

const query = `
DECLARE @minimumSales decimal(19,4),@minimumDays int;
SELECT @minimumDays=TRY_CONVERT(int,JSON_VALUE(JsonDoc,'$.orgConfig.churnRiskDays')),
  @minimumSales=TRY_CONVERT(decimal(19,4),JSON_VALUE(JsonDoc,'$.orgConfig.churnRiskMinSales'))
FROM sync.EntityStore WHERE TenantId=@tenantId AND CollectionName=N'__singleton__' AND EntityId=N'settings' AND IsDeleted=0;

SELECT @minimumDays AS minimumDays,CONVERT(varchar(42),@minimumSales) AS minimumSales;

WITH visibleAccounts AS (
  SELECT a.AccountId,a.Name,a.OwnerUserId,a.TerritoryId
  FROM crm.Account a
  CROSS APPLY security.fn_RecordReadScope(a.TenantId,N'accounts.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId)
  CROSS APPLY security.fn_RecordReadScope(a.TenantId,N'quotes.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId)
  WHERE a.TenantId=@tenantId AND a.DeletedAtUtc IS NULL
    AND (@search=N'' OR CHARINDEX(@search,a.Name)>0)
), purchaseDays AS (
  SELECT i.AccountId,i.SourceSystemCode,i.InvoiceDate,SUM(i.GrossAmount) AS snapshotSales,COUNT_BIG(*) AS invoiceCount,
    CASE WHEN COUNT_BIG(*)=1 THEN MAX(i.InvoiceNumber) END AS invoiceNumber,MAX(i.SyncedAtUtc) AS refreshedAt
  FROM crm.InvoiceMirror i JOIN visibleAccounts a ON a.AccountId=i.AccountId
  CROSS APPLY (
    SELECT CASE WHEN COUNT_BIG(*)=1 THEN MAX(m.StandardCode) END AS status
    FROM integration.CodeMapping m WHERE m.TenantId=i.TenantId AND m.SourceSystemCode=i.SourceSystemCode
      AND m.MappingDomain='INVOICE_STATUS' AND m.ExternalCode=i.StatusCode AND m.MapStatus='APPROVED'
      AND m.EffectiveFrom<=i.InvoiceDate AND (m.EffectiveTo IS NULL OR m.EffectiveTo>=i.InvoiceDate)
  ) mapping
  WHERE i.TenantId=@tenantId AND i.DeletedAtUtc IS NULL AND i.IsVoided=0 AND i.CurrencyCode='IRR'
    AND i.GrossAmount>0 AND i.InvoiceDate>=DATEADD(day,-364,@asOf) AND i.InvoiceDate<=@asOf
    AND mapping.status IN ('POSTED','FINAL')
  GROUP BY i.AccountId,i.SourceSystemCode,i.InvoiceDate
), gaps AS (
  SELECT *,DATEDIFF(day,LAG(InvoiceDate) OVER (PARTITION BY AccountId,SourceSystemCode ORDER BY InvoiceDate),InvoiceDate) AS gap
  FROM purchaseDays
), statistics AS (
  SELECT *,PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap) OVER (PARTITION BY AccountId,SourceSystemCode) AS medianGap,
    ROW_NUMBER() OVER(PARTITION BY AccountId,SourceSystemCode ORDER BY InvoiceDate DESC) AS recencyRank
  FROM gaps
), bySource AS (
  SELECT AccountId,SourceSystemCode,COUNT_BIG(*) AS purchaseDays,MAX(InvoiceDate) AS lastPurchase,
    MAX(CASE WHEN recencyRank=1 THEN invoiceCount END) AS lastInvoiceCount,
    MAX(CASE WHEN recencyRank=1 THEN invoiceNumber END) AS lastInvoiceNumber,MAX(refreshedAt) AS lastSynced,
    CASE WHEN COUNT_BIG(*)>=3 THEN MAX(medianGap) END AS medianGap,
    SUM(CASE WHEN InvoiceDate>=DATEADD(day,-89,@asOf) THEN snapshotSales ELSE 0 END) AS recentSales,
    SUM(CASE WHEN InvoiceDate BETWEEN DATEADD(day,-179,@asOf) AND DATEADD(day,-90,@asOf) THEN snapshotSales ELSE 0 END) AS previousSales,
    SUM(snapshotSales) AS observedSales
  FROM statistics GROUP BY AccountId,SourceSystemCode
), ranked AS (
  SELECT s.*,a.Name AS name,a.OwnerUserId AS ownerId,u.DisplayName AS owner,t.Name AS territory,
    DATEDIFF(day,s.lastPurchase,@asOf) AS daysSince,
    CASE WHEN @minimumDays>0 AND @minimumSales>0 AND s.observedSales>=@minimumSales AND s.medianGap IS NOT NULL
      AND DATEDIFF(day,s.lastPurchase,@asOf)>=@minimumDays AND DATEDIFF(day,s.lastPurchase,@asOf)>s.medianGap
      THEN 1 ELSE 0 END AS followUp
  FROM bySource s JOIN visibleAccounts a ON a.AccountId=s.AccountId
  LEFT JOIN core.AppUser u ON u.TenantId=@tenantId AND u.UserId=a.OwnerUserId AND u.IsActive=1
  LEFT JOIN core.Territory t ON t.TenantId=@tenantId AND t.TerritoryId=a.TerritoryId
), pageRows AS (
  SELECT * FROM ranked WHERE (@onlyRisk=0 OR followUp=1)
  ORDER BY followUp DESC,observedSales DESC,AccountId,SourceSystemCode OFFSET @offset ROWS FETCH NEXT 21 ROWS ONLY
)
SELECT r.AccountId AS accountId,r.SourceSystemCode AS source,r.name,r.owner,r.territory,r.purchaseDays,r.daysSince,r.medianGap,
  CONVERT(char(10),r.lastPurchase,126) AS lastPurchase,r.lastInvoiceCount,r.lastInvoiceNumber,r.lastSynced,r.followUp,
  CONVERT(varchar(52),r.observedSales) AS observedSales,CONVERT(varchar(52),r.recentSales) AS recentSales,
  CONVERT(varchar(52),r.previousSales) AS previousSales,
  visits.planned,visits.checkedIn,visits.latestCheckIn
FROM pageRows r
OUTER APPLY (
  SELECT COUNT_BIG(CASE WHEN v.PlannedAtUtc>=DATEADD(day,-30,@nextDayUtc) AND v.PlannedAtUtc<@nextDayUtc THEN 1 END) AS planned,
    COUNT_BIG(CASE WHEN v.PlannedAtUtc>=DATEADD(day,-30,@nextDayUtc) AND v.PlannedAtUtc<@nextDayUtc AND v.CheckInAtUtc<@nextDayUtc THEN 1 END) AS checkedIn,
    MAX(CASE WHEN v.CheckInAtUtc<@nextDayUtc THEN v.CheckInAtUtc END) AS latestCheckIn
  FROM crm.Visit v WHERE v.TenantId=@tenantId AND v.AccountId=r.AccountId AND r.ownerId IS NOT NULL AND v.VisitorUserId=r.ownerId
) visits
ORDER BY r.followUp DESC,r.observedSales DESC,r.AccountId,r.SourceSystemCode;`;

export function parsePurchaseCycleQuery(params) {
  const search=params.search ?? '', view=params.view ?? 'follow-up', page=Number(params.page ?? 1);
  return typeof search==='string' && search.length<=100 && ['all','follow-up'].includes(view) &&
    Number.isInteger(page) && page>=1 && page<=500 ? {search:search.trim(),view,page} : null;
}

export function createPurchaseCycleReader({sql,run}) {
  return (auth,filter) => run(auth,async tx=>{
    const asOf=tehranDate.format(new Date());
    const result=await new sql.Request(tx).input('tenantId',sql.UniqueIdentifier,auth.tenantId)
      .input('asOf',sql.Date,new Date(asOf)).input('search',sql.NVarChar(100),filter.search)
      .input('nextDayUtc',sql.DateTime2,new Date(`${asOf}T20:30:00Z`))
      .input('onlyRisk',sql.Bit,filter.view==='follow-up').input('offset',sql.Int,(filter.page-1)*20).query(query);
    const thresholds=result.recordsets[0][0];
    const rows=result.recordsets[1];
    return {asOf,configured:thresholds.minimumDays>0 && Number(thresholds.minimumSales)>0,
      rows:rows.slice(0,20),hasMore:filter.page<500 && rows.length>20};
  });
}
