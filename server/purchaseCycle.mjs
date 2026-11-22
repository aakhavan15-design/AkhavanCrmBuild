import { uuid } from './taskRequestContract.mjs';

const tehranDate = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'});

const verifiedInvoiceStatus = `CROSS APPLY (
  SELECT CASE WHEN COUNT_BIG(*)=1 THEN MAX(m.StandardCode) END AS status
  FROM integration.CodeMapping m WHERE m.TenantId=i.TenantId AND m.SourceSystemCode=i.SourceSystemCode
    AND m.MappingDomain='INVOICE_STATUS' AND m.ExternalCode=i.StatusCode AND m.MapStatus='APPROVED'
    AND m.EffectiveFrom<=i.InvoiceDate AND (m.EffectiveTo IS NULL OR m.EffectiveTo>=i.InvoiceDate)
) mapping`;

const accountScope = `CROSS APPLY security.fn_RecordReadScope(a.TenantId,N'accounts.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId) accountGrant
  CROSS APPLY security.fn_RecordReadScope(a.TenantId,N'quotes.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId) quoteGrant`;
const organizationManagerGrants = viewer => `
  CROSS APPLY security.fn_TaskRequestGrant(@tenantId,${viewer},N'accounts.view',NULL,NULL,NULL,NULL,0) accountGrant
  CROSS APPLY security.fn_TaskRequestGrant(@tenantId,${viewer},N'quotes.view',NULL,NULL,NULL,NULL,0) quoteGrant
  CROSS APPLY security.fn_TaskRequestGrant(@tenantId,${viewer},N'quotes.approve',NULL,NULL,NULL,NULL,1) decisionGrant`;

const thresholdsSql = `
DECLARE @minimumSales decimal(19,4),@minimumDays int;
SELECT @minimumDays=TRY_CONVERT(int,JSON_VALUE(JsonDoc,'$.orgConfig.churnRiskDays')),
  @minimumSales=TRY_CONVERT(decimal(19,4),JSON_VALUE(JsonDoc,'$.orgConfig.churnRiskMinSales'))
FROM sync.EntityStore WHERE TenantId=@tenantId AND CollectionName=N'__singleton__' AND EntityId=N'settings' AND IsDeleted=0;`;

const purchaseRiskSql = visibleAccounts => `
WITH visibleAccounts AS (
  ${visibleAccounts}
), purchaseDays AS (
  SELECT i.AccountId,i.SourceSystemCode,i.InvoiceDate,SUM(i.GrossAmount) AS snapshotSales,COUNT_BIG(*) AS invoiceCount,
    CASE WHEN COUNT_BIG(*)=1 THEN MAX(i.InvoiceNumber) END AS invoiceNumber,MAX(i.SyncedAtUtc) AS refreshedAt
  FROM crm.InvoiceMirror i JOIN visibleAccounts a ON a.AccountId=i.AccountId
  ${verifiedInvoiceStatus}
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
  SELECT s.*,a.Name AS name,a.OwnerUserId AS ownerId,a.TerritoryId,u.DisplayName AS owner,t.Name AS territory,
    DATEDIFF(day,s.lastPurchase,@asOf) AS daysSince,
    CASE WHEN @minimumDays>0 AND @minimumSales>0 AND s.observedSales>=@minimumSales AND s.medianGap IS NOT NULL
      AND DATEDIFF(day,s.lastPurchase,@asOf)>=@minimumDays AND DATEDIFF(day,s.lastPurchase,@asOf)>s.medianGap
      THEN 1 ELSE 0 END AS followUp
  FROM bySource s JOIN visibleAccounts a ON a.AccountId=s.AccountId
  LEFT JOIN core.AppUser u ON u.TenantId=@tenantId AND u.UserId=a.OwnerUserId AND u.IsActive=1
  LEFT JOIN core.Territory t ON t.TenantId=@tenantId AND t.TerritoryId=a.TerritoryId
)
SELECT * INTO #rankedPurchase FROM ranked;`;

const query = `
IF @audience='manager' AND NOT EXISTS(
  SELECT 1 FROM core.AppUser viewer ${organizationManagerGrants('viewer.UserId')}
  WHERE viewer.TenantId=@tenantId AND viewer.UserId=@viewer AND viewer.IsActive=1
)
BEGIN
  SELECT CAST(1 AS bit) AS denied;
  RETURN;
END;
${thresholdsSql}
SELECT @minimumDays AS minimumDays,CONVERT(varchar(42),@minimumSales) AS minimumSales;
SELECT a.AccountId,a.Name,a.OwnerUserId,a.TerritoryId INTO #visiblePurchaseAccounts FROM crm.Account a
  ${accountScope}
  WHERE a.TenantId=@tenantId AND a.DeletedAtUtc IS NULL AND (@search=N'' OR CHARINDEX(@search,a.Name)>0)
    AND (@account IS NULL OR a.AccountId=@account)
    AND (@audience IN('','manager') OR (@audience='owner' AND a.OwnerUserId=@viewer) OR (@audience='supervisor' AND EXISTS(
      SELECT 1 FROM core.AppUser owner WHERE owner.TenantId=a.TenantId AND owner.UserId=a.OwnerUserId
        AND owner.ManagerUserId=@viewer AND owner.IsActive=1 AND owner.UserId<>@viewer)));
${purchaseRiskSql('SELECT AccountId,Name,OwnerUserId,TerritoryId FROM #visiblePurchaseAccounts')}

WITH pageRows AS (
  SELECT * FROM #rankedPurchase WHERE (@onlyRisk=0 OR followUp=1)
    AND (@territory IS NULL OR TerritoryId=@territory) AND (@owner IS NULL OR ownerId=@owner)
  ORDER BY followUp DESC,observedSales DESC,AccountId,SourceSystemCode OFFSET @offset ROWS FETCH NEXT 21 ROWS ONLY
)
SELECT r.AccountId AS accountId,r.SourceSystemCode AS source,r.name,r.owner,r.territory,r.purchaseDays,r.daysSince,r.medianGap,
  CONVERT(char(10),r.lastPurchase,126) AS lastPurchase,r.lastInvoiceCount,r.lastInvoiceNumber,r.lastSynced,r.followUp,
  CONVERT(varchar(52),r.observedSales) AS observedSales,CONVERT(varchar(52),r.recentSales) AS recentSales,
  CONVERT(varchar(52),r.previousSales) AS previousSales,
  visits.planned,visits.checkedIn,visits.latestCheckIn
FROM pageRows r
OUTER APPLY (
  SELECT COUNT_BIG(CASE WHEN v.IsUnplanned=0 AND v.PlannedAtUtc>=DATEADD(day,-30,@nextDayUtc) AND v.PlannedAtUtc<=@nowUtc THEN 1 END) AS planned,
    COUNT_BIG(CASE WHEN v.IsUnplanned=0 AND v.PlannedAtUtc>=DATEADD(day,-30,@nextDayUtc) AND v.PlannedAtUtc<=@nowUtc AND v.CheckInAtUtc<=@nowUtc THEN 1 END) AS checkedIn,
    MAX(CASE WHEN v.CheckInAtUtc<=@nowUtc THEN v.CheckInAtUtc END) AS latestCheckIn
  FROM crm.Visit v WHERE v.TenantId=@tenantId AND v.AccountId=r.AccountId AND r.ownerId IS NOT NULL AND v.VisitorUserId=r.ownerId
) visits
ORDER BY r.followUp DESC,r.observedSales DESC,r.AccountId,r.SourceSystemCode;

WITH accountsOnce AS (
  SELECT AccountId,TerritoryId,ownerId,MAX(territory) AS territory,MAX(owner) AS owner,MAX(followUp) AS followUp
  FROM #rankedPurchase WHERE TerritoryId IS NOT NULL AND ownerId IS NOT NULL AND owner IS NOT NULL
  GROUP BY AccountId,TerritoryId,ownerId
), visitsPerAccount AS (
  SELECT a.*,visits.planned,visits.checkedIn,visits.observedCheckIns
  FROM accountsOnce a OUTER APPLY (
    SELECT COUNT_BIG(CASE WHEN v.IsUnplanned=0 AND v.PlannedAtUtc>=DATEADD(day,-30,@nextDayUtc) AND v.PlannedAtUtc<=@nowUtc THEN 1 END) AS planned,
      COUNT_BIG(CASE WHEN v.IsUnplanned=0 AND v.PlannedAtUtc>=DATEADD(day,-30,@nextDayUtc) AND v.PlannedAtUtc<=@nowUtc AND v.CheckInAtUtc<=@nowUtc THEN 1 END) AS checkedIn,
      COUNT_BIG(CASE WHEN v.CheckInAtUtc>=DATEADD(day,-30,@nextDayUtc) AND v.CheckInAtUtc<=@nowUtc THEN 1 END) AS observedCheckIns
    FROM crm.Visit v WHERE v.TenantId=@tenantId AND v.AccountId=a.AccountId AND v.VisitorUserId=a.ownerId
      AND (v.PlannedAtUtc>=DATEADD(day,-30,@nextDayUtc) OR v.CheckInAtUtc>=DATEADD(day,-30,@nextDayUtc))
  ) visits
)
SELECT TOP(12) TerritoryId AS territoryId,ownerId,MAX(territory) AS territory,MAX(owner) AS owner,
  COUNT_BIG(*) AS observedCustomers,
  CASE WHEN @minimumDays>0 AND @minimumSales>0 THEN SUM(CONVERT(bigint,followUp)) END AS needingFollowUp,
  CASE WHEN @minimumDays>0 AND @minimumSales>0 THEN COUNT_BIG(CASE WHEN followUp=1 AND planned>0 AND observedCheckIns=0 THEN 1 END) END AS followUpWithoutCheckIn,
  CASE WHEN @minimumDays>0 AND @minimumSales>0 THEN COUNT_BIG(CASE WHEN followUp=1 AND planned=0 AND observedCheckIns=0 THEN 1 END) END AS followUpWithoutVisitEvidence,
  SUM(planned) AS planned,SUM(checkedIn) AS checkedIn
FROM visitsPerAccount GROUP BY TerritoryId,ownerId
ORDER BY needingFollowUp DESC,planned DESC,TerritoryId,ownerId;

SELECT visit.AccountId,orders.SalesOrderId,
  CASE WHEN visit.ResultingSalesOrderId IS NULL THEN NULLIF(LTRIM(RTRIM(visit.NoOrderReasonCode)),'') END AS noOrderReason
INTO #observedVisits
FROM crm.Visit visit JOIN #visiblePurchaseAccounts account ON account.AccountId=visit.AccountId AND account.OwnerUserId=visit.VisitorUserId
LEFT JOIN crm.SalesOrder orders ON orders.TenantId=visit.TenantId AND orders.SalesOrderId=visit.ResultingSalesOrderId
  AND orders.AccountId=visit.AccountId AND orders.StatusCode NOT IN ('DRAFT','FAILED','REJECTED','CANCELLED')
WHERE visit.TenantId=@tenantId AND visit.CheckInAtUtc>=DATEADD(day,-30,@nextDayUtc) AND visit.CheckInAtUtc<=@nowUtc
  AND (@territory IS NULL OR account.TerritoryId=@territory) AND (@owner IS NULL OR account.OwnerUserId=@owner);

SELECT COUNT_BIG(*) AS checkIns,COUNT_BIG(DISTINCT AccountId) AS visitedCustomers,
  COUNT_BIG(DISTINCT SalesOrderId) AS linkedOrders,
  COUNT_BIG(CASE WHEN noOrderReason IS NOT NULL THEN 1 END) AS visitsWithNoOrderReason,
  COUNT_BIG(CASE WHEN SalesOrderId IS NULL AND noOrderReason IS NULL THEN 1 END) AS visitsWithUnknownOutcome
FROM #observedVisits;
SELECT TOP (10) noOrderReason AS code,COUNT_BIG(*) AS visits FROM #observedVisits
  WHERE noOrderReason IS NOT NULL GROUP BY noOrderReason ORDER BY visits DESC,noOrderReason;`;

const productQuery = `
WITH periodInvoices AS (
  SELECT i.InvoiceMirrorId,i.InvoiceDate,i.InvoiceNumber,i.ExternalInvoiceId
  FROM crm.InvoiceMirror i JOIN crm.Account a ON a.TenantId=i.TenantId AND a.AccountId=i.AccountId
  ${accountScope}
  ${verifiedInvoiceStatus}
  WHERE i.TenantId=@tenantId AND i.AccountId=@account AND a.DeletedAtUtc IS NULL AND i.SourceSystemCode=@source
    AND i.DeletedAtUtc IS NULL AND i.IsVoided=0 AND i.CurrencyCode='IRR' AND i.GrossAmount>0 AND mapping.status IN('POSTED','FINAL')
    AND i.InvoiceDate BETWEEN DATEADD(day,-179,@asOf) AND @asOf
), lines AS (
  SELECT l.ExternalProductId,i.InvoiceDate,i.InvoiceNumber,
    ROW_NUMBER() OVER(PARTITION BY l.ExternalProductId ORDER BY i.InvoiceDate DESC,i.InvoiceMirrorId,l.InvoiceLineMirrorId) AS seq
  FROM periodInvoices i JOIN crm.InvoiceLineMirror l ON l.TenantId=@tenantId AND l.SourceSystemCode=@source
    AND l.InvoiceMirrorId=i.InvoiceMirrorId AND l.ExternalInvoiceId=i.ExternalInvoiceId
  WHERE NULLIF(l.ExternalProductId,N'') IS NOT NULL AND l.Quantity>0
), seenProducts AS (
  SELECT ExternalProductId,COUNT(DISTINCT CASE WHEN InvoiceDate<DATEADD(day,-89,@asOf) THEN InvoiceDate END) AS priorDays,
    MAX(InvoiceDate) AS lastSeen,MAX(CASE WHEN seq=1 THEN InvoiceNumber END) AS lastInvoiceNumber
  FROM lines GROUP BY ExternalProductId
  HAVING COUNT(DISTINCT CASE WHEN InvoiceDate<DATEADD(day,-89,@asOf) THEN InvoiceDate END)>=2
    AND MAX(InvoiceDate)<DATEADD(day,-89,@asOf)
)
SELECT TOP(12) p.ExternalProductId AS productId,p.ProductName AS name,p.SKU AS sku,s.priorDays,s.lastInvoiceNumber,
  CONVERT(char(10),s.lastSeen,126) AS lastSeen
FROM seenProducts s JOIN crm.ExternalProduct p ON p.TenantId=@tenantId AND p.SourceSystemCode=@source
  AND p.ExternalProductId=s.ExternalProductId AND p.IsActive=1
ORDER BY s.priorDays DESC,s.lastSeen DESC,p.ExternalProductId;`;

export function parsePurchaseCycleQuery(params) {
  const search=params.search ?? '', view=params.view ?? 'follow-up', page=Number(params.page ?? 1);
  const territory=params.territory ?? null, owner=params.owner ?? null, audience=params.audience ?? '';
  const account=params.account ?? null;
  return typeof search==='string' && search.length<=100 && ['all','follow-up'].includes(view) &&
    Number.isInteger(page) && page>=1 && page<=500 && ['','owner','supervisor','manager'].includes(audience) && ((territory===null && owner===null) || (uuid(territory) && uuid(owner)))
    && (account===null || uuid(account))
    ? {search:search.trim(),view,page,territory,owner,...(audience ? {audience} : {}), ...(account ? {account} : {})} : null;
}

export function parsePurchaseProductQuery(params) {
  const {account,source}=params;
  return uuid(account) &&
    typeof source==='string' && source.length<=40 && source.trim().length>0 ? {account,source} : null;
}

export function createPurchaseProductReader({sql,run}) {
  return (auth,filter)=>run(auth,async tx=>{
    const asOf=tehranDate.format(new Date());
    const result=await new sql.Request(tx).input('tenantId',sql.UniqueIdentifier,auth.tenantId)
      .input('asOf',sql.Date,new Date(asOf)).input('account',sql.UniqueIdentifier,filter.account)
      .input('source',sql.VarChar(40),filter.source).query(productQuery);
    return {asOf,rows:result.recordset};
  });
}

export function createPurchaseCycleReader({sql,run}) {
  return (auth,filter) => run(auth,async tx=>{
    const now=new Date();
    const asOf=tehranDate.format(now);
    const result=await new sql.Request(tx).input('tenantId',sql.UniqueIdentifier,auth.tenantId)
      .input('asOf',sql.Date,new Date(asOf)).input('search',sql.NVarChar(100),filter.search)
      .input('viewer',sql.UniqueIdentifier,auth.userId).input('audience',sql.VarChar(12),filter.audience ?? '')
      .input('account',sql.UniqueIdentifier,filter.account ?? null)
      .input('territory',sql.UniqueIdentifier,filter.territory).input('owner',sql.UniqueIdentifier,filter.owner)
      .input('nextDayUtc',sql.DateTime2,new Date(`${asOf}T20:30:00Z`))
      .input('nowUtc',sql.DateTime2,now)
      .input('onlyRisk',sql.Bit,filter.view==='follow-up').input('offset',sql.Int,(filter.page-1)*20).query(query);
    const thresholds=result.recordsets[0][0];
    if (thresholds.denied) return { forbidden:true };
    const rows=result.recordsets[1];
    return {asOf,configured:thresholds.minimumDays>0 && Number(thresholds.minimumSales)>0,
      rows:rows.slice(0,20),hasMore:filter.page<500 && rows.length>20,coverage:result.recordsets[2],
      visitOutcomes:result.recordsets[3]?.[0], noOrderReasons:result.recordsets[4] ?? []};
  });
}

const churnAudienceSql = `
SET NOCOUNT ON;
DECLARE @lock int,@lockName nvarchar(120)=CONCAT('churn-alerts:',@tenantId);
EXEC @lock=sys.sp_getapplock @Resource=@lockName,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=1000;
IF @lock<0 THROW 50408,N'Could not acquire churn publication lock.',1;
IF NOT EXISTS(SELECT 1 FROM security.fn_TaskRequestGrant(@tenantId,@actor,N'settings.manage',NULL,NULL,NULL,NULL,1))
  BEGIN SELECT CAST(NULL AS uniqueidentifier) AS recipient WHERE 1=0; RETURN; END;
${thresholdsSql}
IF @minimumSales IS NULL OR @minimumSales<=0 OR @minimumDays IS NULL OR @minimumDays<=0
  BEGIN SELECT CAST(NULL AS uniqueidentifier) AS recipient WHERE 1=0; RETURN; END;

${purchaseRiskSql(`SELECT a.AccountId,a.Name,a.OwnerUserId,a.TerritoryId FROM crm.Account a
  WHERE a.TenantId=@tenantId AND a.DeletedAtUtc IS NULL`)}

SELECT DISTINCT a.AccountId,a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId
INTO #riskAccounts
FROM #rankedPurchase r JOIN crm.Account a ON a.TenantId=@tenantId AND a.AccountId=r.AccountId
WHERE r.followUp=1 AND a.DeletedAtUtc IS NULL;

WITH organizationManagers AS (
  SELECT u.UserId FROM core.AppUser u ${organizationManagerGrants('u.UserId')}
  WHERE u.TenantId=@tenantId AND u.IsActive=1
), candidates AS (
  SELECT a.AccountId,a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId,recipient.userId,recipient.tier
  FROM #riskAccounts a
  JOIN core.AppUser owner ON owner.TenantId=@tenantId AND owner.UserId=a.OwnerUserId AND owner.IsActive=1
  CROSS APPLY (VALUES(owner.UserId,1),(owner.ManagerUserId,2)) recipient(userId,tier)
  WHERE recipient.userId IS NOT NULL AND (recipient.tier=1 OR recipient.userId<>owner.UserId)
  UNION ALL
  SELECT a.AccountId,a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId,manager.UserId,3
  FROM #riskAccounts a CROSS JOIN organizationManagers manager
), permitted AS (
  SELECT c.userId AS recipient,c.tier,COUNT_BIG(DISTINCT c.AccountId) AS customerCount
  FROM candidates c
  CROSS APPLY security.fn_TaskRequestGrant(@tenantId,c.userId,N'accounts.view',c.OwnerUserId,c.BranchId,c.TerritoryId,c.TeamId,0) accountGrant
  CROSS APPLY security.fn_TaskRequestGrant(@tenantId,c.userId,N'quotes.view',c.OwnerUserId,c.BranchId,c.TerritoryId,c.TeamId,0) quotesGrant
  GROUP BY c.userId,c.tier
), preferred AS (
  SELECT *,ROW_NUMBER() OVER(PARTITION BY recipient ORDER BY tier DESC) AS seq FROM permitted
)
SELECT p.recipient,p.tier,p.customerCount FROM preferred p WHERE p.seq=1 AND NOT EXISTS(
  SELECT 1 FROM sync.EntityStore n WHERE n.TenantId=@tenantId AND n.CollectionName=N'notifications'
    AND n.EntityId LIKE N'churn-alert-%' AND n.CreatedAtUtc>DATEADD(day,-7,SYSUTCDATETIME())
    AND TRY_CONVERT(uniqueidentifier,JSON_VALUE(n.JsonDoc,'$.recipientId'))=p.recipient
    AND JSON_VALUE(n.JsonDoc,'$.linkTab')=CASE p.tier WHEN 1 THEN 'churn-owner' WHEN 2 THEN 'churn-supervisor' ELSE 'churn-manager' END
);`;

const countFa = new Intl.NumberFormat('fa-IR');

export function churnNotice(rank, count) {
  const amount = countFa.format(count);
  if (rank === 1) return { linkTab: 'churn-owner', title: 'مشتریان شما در اولویت مراجعه',
    message: `برای ${amount} مشتری فاصلهٔ خرید از الگوی مشاهده‌شده بیشتر است. پیشنهاد کالا و اقدام پیگیری را در گزارش ببینید.` };
  if (rank === 2) return { linkTab: 'churn-supervisor', title: 'اولویت پیگیری در تیم فروش شما',
    message: `در تیم شما ${amount} مشتری در اولویت پیگیری‌اند. پوشش ثبت مراجعه و مسئول هر مورد را بررسی کنید.` };
  return { linkTab: 'churn-manager', title: 'هشدار مدیریتی ریسک ریزش',
    message: `در سطح سازمان ${amount} مشتری در اولویت پیگیری‌اند. پراکندگی مناطق، پوشش و مسئولان را در گزارش مرور کنید.` };
}

export function createChurnAlertPublisher({ sql, run }) {
  return (auth, asOf) => run(auth, async tx => {
    const request = () => new sql.Request(tx).input('tenantId', sql.UniqueIdentifier, auth.tenantId)
      .input('actor', sql.UniqueIdentifier, auth.userId);
    const { recordset } = await request().input('asOf', sql.Date, new Date(asOf)).query(churnAudienceSql);
    if (!recordset.length) return;
    const payload = recordset.map(row => ({
      id: `churn-alert-${row.tier}-${asOf}-${row.recipient.toLowerCase()}`,
      recipientId: row.recipient.toLowerCase(), ...churnNotice(row.tier, row.customerCount),
      type: 'WARNING', read: false, createdAt: new Date().toISOString(),
    }));
    await request().input('articles', sql.NVarChar(sql.MAX), JSON.stringify(payload)).query(`
      INSERT sync.EntityStore(TenantId,CollectionName,EntityId,JsonDoc,UpdatedByUserId)
      SELECT @tenantId,N'notifications',JSON_VALUE(entry.value,'$.id'),entry.value,@actor
      FROM OPENJSON(@articles) entry
      WHERE NOT EXISTS(SELECT 1 FROM sync.EntityStore stored WITH(UPDLOCK,HOLDLOCK)
        WHERE stored.TenantId=@tenantId AND stored.CollectionName=N'notifications' AND stored.EntityId=JSON_VALUE(entry.value,'$.id'));`);
  });
}
