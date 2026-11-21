const operationKinds = new Set(['SALES_INVOICE','SALES_RETURN','PAYMENT']);
const coverageStates = new Set(['VALID','MULTIPLE','LATE','PENDING','INVALID','VOID','MISSING','NOT_OBSERVED']);

export function coverageFilter(query) {
  const operation = query.operation ?? null, state = query.state ?? null, search = query.search ?? '';
  if ((operation!==null && !operationKinds.has(operation)) || (state!==null && !coverageStates.has(state))
      || typeof search!=='string' || search.length>100) return null;
  return { operation, state, search: search.trim() };
}

const operationCoverageSql = `
SET NOCOUNT ON;
SELECT s.SourceSystemCode,s.JournalLinksVerifiedFrom,s.JournalLinksVerifiedThrough,s.ApprovedAtUtc
INTO #scope FROM analytics.MoneyReportSource s
JOIN core.AppUser approver ON approver.TenantId=s.TenantId AND approver.UserId=s.ApprovedBy
WHERE s.TenantId=@tenantId AND EXISTS(SELECT 1 FROM security.fn_RecordReadScope(@tenantId,N'finance.view',NULL,NULL,NULL,NULL));

SELECT * INTO #operations FROM (
  SELECT 'SALES_INVOICE' AS operation,i.ExternalInvoiceId AS externalId,i.InvoiceNumber AS documentNumber,i.InvoiceDate AS operationDate,
    i.CurrencyCode,i.GrossAmount AS amount,i.AccountId,i.StatusCode,i.SourceSystemCode
  FROM crm.InvoiceMirror i JOIN #scope s ON s.SourceSystemCode=i.SourceSystemCode
  WHERE i.TenantId=@tenantId AND i.IsVoided=0 AND i.InvoiceDate BETWEEN @from AND @to
  UNION ALL
  SELECT 'SALES_RETURN',r.ExternalReturnId,NULL,r.ReturnDate,i.CurrencyCode,r.TotalAmount,r.AccountId,r.StatusCode,r.SourceSystemCode
  FROM crm.SalesReturnMirror r JOIN #scope s ON s.SourceSystemCode=r.SourceSystemCode
  LEFT JOIN crm.InvoiceMirror i ON i.TenantId=r.TenantId AND i.SourceSystemCode=r.SourceSystemCode AND i.InvoiceMirrorId=r.InvoiceMirrorId
  WHERE r.TenantId=@tenantId AND r.IsVoided=0 AND r.ReturnDate BETWEEN @from AND @to
  UNION ALL
  SELECT 'PAYMENT',p.ExternalPaymentId,p.ReferenceNumber,p.PaymentDate,p.CurrencyCode,p.Amount,p.AccountId,p.StatusCode,p.SourceSystemCode
  FROM crm.PaymentMirror p JOIN #scope s ON s.SourceSystemCode=p.SourceSystemCode
  WHERE p.TenantId=@tenantId AND p.IsVoided=0 AND p.PaymentDate BETWEEN @from AND @to
) o
WHERE @operation IS NULL OR o.operation=@operation;

SELECT DISTINCT o.operation,o.externalId,l.JournalEntryMirrorId
INTO #linked
FROM #operations o JOIN crm.JournalSourceLink l ON l.TenantId=@tenantId AND l.SourceSystemCode=o.SourceSystemCode
  AND l.OperationType=o.operation AND l.ExternalOperationId=o.externalId;
CREATE INDEX IX_linked ON #linked(operation,externalId);

SELECT l.operation,l.externalId,e.JournalEntryMirrorId,e.DocumentNumber,e.AccountingDate,e.JournalQuality
INTO #evidence FROM #linked l
JOIN analytics.vw_FinancialJournalState e ON e.TenantId=@tenantId AND e.JournalEntryMirrorId=l.JournalEntryMirrorId;

WITH linkedQuality AS (
  SELECT operation,externalId,
    COUNT(CASE WHEN JournalQuality='VALID' AND AccountingDate<=@to THEN 1 END) AS validCount,
    COUNT(CASE WHEN JournalQuality='VALID' AND AccountingDate>@to THEN 1 END) AS lateCount,
    COUNT(CASE WHEN JournalQuality='VOID' THEN 1 END) AS voidCount,
    COUNT(CASE WHEN JournalQuality='PENDING' THEN 1 END) AS pendingCount,
    COUNT(CASE WHEN JournalQuality NOT IN ('VALID','VOID','PENDING') THEN 1 END) AS invalidCount
  FROM #evidence GROUP BY operation,externalId
)
SELECT o.*,a.Name AS accountTitle,COALESCE(l.validCount,0) AS validCount,COALESCE(l.lateCount,0) AS lateCount,
  CASE WHEN l.invalidCount>0 THEN 'INVALID'
       WHEN l.validCount>1 THEN 'MULTIPLE'
       WHEN l.validCount=1 THEN 'VALID'
       WHEN l.lateCount>0 THEN 'LATE'
       WHEN l.pendingCount>0 OR m.status='PENDING' THEN 'PENDING'
       WHEN l.voidCount>0 THEN 'VOID'
       WHEN m.status='ACCOUNTING_REQUIRED' AND o.operationDate>=s.JournalLinksVerifiedFrom AND @to<=s.JournalLinksVerifiedThrough
         AND NOT EXISTS(
           SELECT 1 FROM integration.SyncBatch b WHERE b.TenantId=@tenantId AND b.SourceSystemCode=o.SourceSystemCode
             AND b.EntityType=N'FINANCIAL_JOURNAL' AND b.ModeCode<>'REPLAY' AND b.StartedAtUtc>s.ApprovedAtUtc AND b.StatusCode<>'SUCCEEDED'
             AND (b.WindowFromUtc IS NULL OR b.WindowFromUtc<DATEADD(day,1,CONVERT(datetime2(3),@to)))
             AND (b.WindowToUtc IS NULL OR b.WindowToUtc>=CONVERT(datetime2(3),o.operationDate))
         ) THEN 'MISSING'
       ELSE 'NOT_OBSERVED' END AS coverageStatus
INTO #classified
FROM #operations o JOIN #scope s ON s.SourceSystemCode=o.SourceSystemCode
LEFT JOIN linkedQuality l ON l.operation=o.operation AND l.externalId=o.externalId
LEFT JOIN crm.Account a ON a.TenantId=@tenantId AND a.AccountId=o.AccountId
OUTER APPLY (
  SELECT MAX(mapping.StandardCode) AS status FROM integration.CodeMapping mapping
  WHERE mapping.TenantId=@tenantId AND mapping.SourceSystemCode=o.SourceSystemCode
    AND mapping.MappingDomain=CONCAT('ACCOUNTING_',o.operation) AND mapping.ExternalCode=o.StatusCode
    AND mapping.MapStatus='APPROVED' AND mapping.EffectiveFrom<=o.operationDate
    AND (mapping.EffectiveTo IS NULL OR mapping.EffectiveTo>=o.operationDate)
  HAVING COUNT_BIG(*)=1
) m
WHERE COALESCE(m.status,'')<>'OUTSIDE_SCOPE' OR l.externalId IS NOT NULL;

SELECT SourceSystemCode AS sourceSystem,CONVERT(char(10),JournalLinksVerifiedThrough,126) AS verifiedThrough FROM #scope;
SELECT coverageStatus,COUNT_BIG(*) AS [count] FROM #classified GROUP BY coverageStatus;
SELECT c.operation,c.externalId,c.documentNumber,CONVERT(char(10),c.operationDate,126) AS [date],c.CurrencyCode AS currency,
  CASE WHEN c.CurrencyCode IS NOT NULL THEN CONVERT(varchar(48),c.amount) END AS amount,
  c.accountTitle,c.coverageStatus,c.validCount,c.lateCount,
  (SELECT TOP (5) JournalEntryMirrorId AS id,DocumentNumber AS number,CONVERT(char(10),AccountingDate,126) AS [date],JournalQuality AS quality
    FROM #evidence e WHERE e.operation=c.operation AND e.externalId=c.externalId
    ORDER BY e.AccountingDate DESC,e.JournalEntryMirrorId FOR JSON PATH) AS documents
FROM #classified c
WHERE (@state IS NULL OR c.coverageStatus=@state)
  AND (@search='' OR CHARINDEX(@search,c.externalId)>0 OR CHARINDEX(@search,c.documentNumber)>0 OR CHARINDEX(@search,c.accountTitle)>0)
ORDER BY c.operationDate DESC,c.operation,c.externalId
OFFSET @offset ROWS FETCH NEXT 26 ROWS ONLY;`;

export function createJournalCoverageReader({ sql, run }) {
  return (auth, { from,to,page,operation,state,search }) => run(auth, async tx => {
    const result = await new sql.Request(tx).input('tenantId',sql.UniqueIdentifier,auth.tenantId)
      .input('from',sql.Date,new Date(from)).input('to',sql.Date,new Date(to))
      .input('offset',sql.Int,(page-1)*25).input('operation',sql.VarChar(20),operation)
      .input('state',sql.VarChar(20),state).input('search',sql.NVarChar(100),search).query(operationCoverageSql);
    const [sources,counts,rows] = result.recordsets;
    if (!sources.length) return { status:'UNAVAILABLE', counts: [], items:[], hasMore:false };
    return { status:'AVAILABLE', ...sources[0], counts: counts.map(row => ({ ...row,count:Number(row.count) })),
      items: rows.slice(0,25).map(row => ({ ...row,documents: JSON.parse(row.documents ?? '[]') })),
      hasMore: page<1000 && rows.length>25 };
  });
}
