import { createHash } from 'node:crypto';

const operationKinds = new Set(['SALES_INVOICE','SALES_RETURN','PAYMENT']);
const coverageStates = new Set(['VALID','MULTIPLE','LATE','PENDING','INVALID','VOID','MISSING','NOT_OBSERVED']);

export function coverageFilter(query) {
  const operation = query.operation ?? null, state = query.state ?? null, search = query.search ?? '';
  const returnReason = query.returnReason ?? null;
  if ((operation!==null && !operationKinds.has(operation)) || (state!==null && !coverageStates.has(state))
      || typeof search!=='string' || search.length>100 || (returnReason!==null &&
        (operation!=='SALES_RETURN' || typeof returnReason!=='string' || returnReason.length>120))) return null;
  return { operation, state, search: search.trim(), ...(returnReason!==null ? {returnReason} : {}) };
}

const operationCoverageSql = `
SET NOCOUNT ON;
SELECT s.SourceSystemCode,s.JournalLinksVerifiedFrom,s.JournalLinksVerifiedThrough,s.ApprovedAtUtc
INTO #scope FROM analytics.MoneyReportSource s
JOIN core.AppUser approver ON approver.TenantId=s.TenantId AND approver.UserId=s.ApprovedBy
WHERE s.TenantId=@tenantId AND EXISTS(SELECT 1 FROM security.fn_RecordReadScope(@tenantId,N'finance.view',NULL,NULL,NULL,NULL));

SELECT * INTO #operations FROM (
  SELECT 'SALES_INVOICE' AS operation,i.ExternalInvoiceId AS externalId,i.InvoiceNumber AS documentNumber,i.InvoiceDate AS operationDate,
    i.CurrencyCode,i.GrossAmount AS amount,i.AccountId,i.StatusCode,i.SourceSystemCode,CAST(NULL AS nvarchar(120)) AS returnReason,i.InvoiceMirrorId
  FROM crm.InvoiceMirror i JOIN #scope s ON s.SourceSystemCode=i.SourceSystemCode
  WHERE i.TenantId=@tenantId AND i.IsVoided=0 AND i.DeletedAtUtc IS NULL AND i.InvoiceDate BETWEEN @from AND @to
  UNION ALL
  SELECT 'SALES_RETURN',r.ExternalReturnId,NULL,r.ReturnDate,i.CurrencyCode,r.TotalAmount,r.AccountId,r.StatusCode,r.SourceSystemCode,
    COALESCE(NULLIF(r.ReasonCode,''),NULLIF(r.ReasonSourceCode,N'')),i.InvoiceMirrorId
  FROM crm.SalesReturnMirror r JOIN #scope s ON s.SourceSystemCode=r.SourceSystemCode
  LEFT JOIN crm.InvoiceMirror i ON i.TenantId=r.TenantId AND i.SourceSystemCode=r.SourceSystemCode AND i.InvoiceMirrorId=r.InvoiceMirrorId
    AND i.IsVoided=0 AND i.DeletedAtUtc IS NULL AND i.AccountId=r.AccountId
  WHERE r.TenantId=@tenantId AND r.IsVoided=0 AND r.ReturnDate BETWEEN @from AND @to
  UNION ALL
  SELECT 'PAYMENT',p.ExternalPaymentId,p.ReferenceNumber,p.PaymentDate,p.CurrencyCode,p.Amount,p.AccountId,p.StatusCode,p.SourceSystemCode,NULL,NULL
  FROM crm.PaymentMirror p JOIN #scope s ON s.SourceSystemCode=p.SourceSystemCode
  WHERE p.TenantId=@tenantId AND p.IsVoided=0 AND p.PaymentDate BETWEEN @from AND @to
) o
WHERE (@operation IS NULL OR o.operation=@operation) AND (@externalId IS NULL OR o.externalId=@externalId);

SELECT DISTINCT o.operation,o.externalId,l.JournalEntryMirrorId,o.SourceSystemCode
INTO #linked
FROM #operations o JOIN crm.JournalSourceLink l ON l.TenantId=@tenantId AND l.SourceSystemCode=o.SourceSystemCode
  AND l.OperationType=o.operation AND l.ExternalOperationId=o.externalId;
CREATE INDEX IX_linked ON #linked(operation,externalId);

SELECT l.operation,l.externalId,e.JournalEntryMirrorId,e.DocumentNumber,e.AccountingDate,e.JournalQuality
INTO #evidence FROM #linked l
JOIN analytics.vw_FinancialJournalState e ON e.TenantId=@tenantId AND e.SourceSystemCode=l.SourceSystemCode AND e.JournalEntryMirrorId=l.JournalEntryMirrorId;

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
  c.accountTitle,c.coverageStatus,c.validCount,c.lateCount,c.returnReason,
  (SELECT TOP (5) JournalEntryMirrorId AS id,DocumentNumber AS number,CONVERT(char(10),AccountingDate,126) AS [date],JournalQuality AS quality
    FROM #evidence e WHERE e.operation=c.operation AND e.externalId=c.externalId
    ORDER BY e.AccountingDate DESC,e.JournalEntryMirrorId FOR JSON PATH) AS documents
FROM #classified c
WHERE (@state IS NULL OR c.coverageStatus=@state)
  AND (@returnReason IS NULL OR COALESCE(c.returnReason,N'')=@returnReason)
  AND (@search='' OR CHARINDEX(@search,c.externalId)>0 OR CHARINDEX(@search,c.documentNumber)>0 OR CHARINDEX(@search,c.accountTitle)>0)
ORDER BY c.operationDate DESC,c.operation,c.externalId
OFFSET @offset ROWS FETCH NEXT 26 ROWS ONLY;

SELECT TOP(8) returnReason AS reason,COUNT_BIG(*) AS [count]
FROM #classified WHERE @operation='SALES_RETURN' AND operation='SALES_RETURN' AND coverageStatus='VALID'
GROUP BY returnReason ORDER BY [count] DESC,returnReason;

WITH cohort AS (
  SELECT i.InvoiceMirrorId FROM crm.InvoiceMirror i JOIN #scope s ON s.SourceSystemCode=i.SourceSystemCode
  CROSS APPLY (
    SELECT MAX(m.StandardCode) AS status FROM integration.CodeMapping m
    WHERE m.TenantId=i.TenantId AND m.SourceSystemCode=i.SourceSystemCode
      AND m.MappingDomain='INVOICE_STATUS' AND m.ExternalCode=i.StatusCode AND m.MapStatus='APPROVED'
      AND m.EffectiveFrom<=i.InvoiceDate AND (m.EffectiveTo IS NULL OR m.EffectiveTo>=i.InvoiceDate)
    HAVING COUNT_BIG(*)=1
  ) mapped
  WHERE @operation='SALES_RETURN' AND i.TenantId=@tenantId AND i.InvoiceDate BETWEEN @from AND @to
    AND i.IsVoided=0 AND i.DeletedAtUtc IS NULL AND mapped.status IN ('POSTED','FINAL')
)
SELECT COUNT_BIG(DISTINCT i.InvoiceMirrorId) AS invoices,COUNT_BIG(DISTINCT returned.InvoiceMirrorId) AS returnedInvoices
FROM cohort i LEFT JOIN #classified returned ON returned.InvoiceMirrorId=i.InvoiceMirrorId AND returned.operation='SALES_RETURN'
  AND returned.coverageStatus='VALID';`;

async function readCoverageInTransaction(sql, tx, auth, { from,to,page,operation,state,search,externalId = null,returnReason = null }) {
  const result = await new sql.Request(tx).input('tenantId',sql.UniqueIdentifier,auth.tenantId)
    .input('from',sql.Date,new Date(from)).input('to',sql.Date,new Date(to))
    .input('offset',sql.Int,(page-1)*25).input('operation',sql.VarChar(20),operation)
    .input('state',sql.VarChar(20),state).input('search',sql.NVarChar(100),search).input('returnReason',sql.NVarChar(120),returnReason)
    .input('externalId',sql.NVarChar(200),externalId).query(operationCoverageSql);
  const [sources,counts,rows,returnReasons=[],returnCohort=[]] = result.recordsets;
  if (!sources.length) return { status:'UNAVAILABLE', counts: [], items:[], hasMore:false };
  return { status:'AVAILABLE', ...sources[0], counts: counts.map(row => ({ ...row,count:Number(row.count) })),
    returnReasons:returnReasons.map(row=>({...row,count:Number(row.count)})),
    ...(operation === 'SALES_RETURN' && returnCohort[0] ? { returnCohort: returnCohort[0] } : {}),
    items: rows.slice(0,25).map(row => ({ ...row,documents: JSON.parse(row.documents ?? '[]') })),
    hasMore: page<1000 && rows.length>25 };
}

export function createJournalCoverageReader({ sql, run }) {
  return (auth, filter) => run(auth, tx => readCoverageInTransaction(sql,tx,auth,filter));
}

const followUpStates = new Set(['LATE','INVALID','VOID','MISSING','NOT_OBSERVED']);
const reasons = {
  LATE:'اثر مالی سند پس از پایان بازه ثبت شده است.',
  INVALID:'سند مرتبط در کنترل وضعیت، دوره یا توازن آرتیکل‌ها نیاز به بررسی دارد.',
  VOID:'ارجاع موجود به سند ابطال‌شده است.',
  MISSING:'با پوشش گواهی‌شدهٔ بازه، سند معتبر مرتبط یافت نشد.',
  NOT_OBSERVED:'سند معتبر مرتبط مشاهده نشده است. ابتدا پوشش همگام‌سازی را بررسی کنید.',
};

export function createJournalCoverageFollowUp({ sql, run }) {
  return (auth,{from,to,operation,externalId},correlationId) => {
    if (!operationKinds.has(operation) || typeof externalId!=='string' || !externalId.trim() || externalId.length>200) {
      return {status:400,message:'مرجع پیگیری عملیات معتبر نیست.'};
    }
    return run(auth,async tx => {
      const coverage = await readCoverageInTransaction(sql,tx,auth,{from,to,operation,externalId,page:1,state:null,search:''});
      const record = coverage.items[0];
      if (coverage.items.length!==1 || !followUpStates.has(record?.coverageStatus)) {
        return {status:409,message:'یافته برای محدودهٔ فعلی قابل پیگیری نیست. پوشش اسناد را دوباره بررسی کنید.'};
      }
      const evidence = { source:coverage.sourceSystem,operation:record.operation,externalId:record.externalId,
        status:record.coverageStatus,date:record.date,period:{from,to},documents:record.documents,
        amount:record.amount,currency:record.currency,verifiedThrough:coverage.verifiedThrough };
      const issueKey = createHash('sha256').update(JSON.stringify([auth.tenantId,coverage.sourceSystem,record.operation,
        record.externalId,record.coverageStatus])).digest('hex');
      const taskId = `journal-review-${issueKey}`;
      const createdAt = new Date().toISOString();
      const task = {
        id:taskId,title:'بررسی پوشش سند حسابداری',
        description:'نتیجهٔ بررسی را از بخش پوشش اسناد خزانه‌داری در پروندهٔ وظیفه ثبت کنید.',status:'OPEN',type:'REVIEW',
        createdBy:auth.userId,createdAt,ownerId:auth.userId,assigneeType:'USER',assigneeId:auth.userId,assignedTo:auth.userId,
        priority:['MISSING','INVALID'].includes(record.coverageStatus) ? 'HIGH' : 'NORMAL',financeReviewRef:issueKey,
      };
      const request = () => new sql.Request(tx).input('tenantId',sql.UniqueIdentifier,auth.tenantId);
      const previous = (await request().input('id',sql.NVarChar(200),taskId).query(`
        SELECT IsDeleted,CASE WHEN EXISTS(SELECT 1 FROM security.fn_TaskEntityScope(@tenantId,JsonDoc,'VIEW')) THEN 1 ELSE 0 END AS canView
        FROM sync.EntityStore WITH (UPDLOCK,HOLDLOCK)
        WHERE TenantId=@tenantId AND CollectionName=N'tasks' AND EntityId=@id;`)).recordset[0];
      if (previous) {
        return previous.IsDeleted || previous.canView!==1
          ? {status:409,message:'پیگیری این یافته از قبل در گردش وظایف ثبت شده است.'}
          : {status:200,id:taskId,replayed:true};
      }
      const json = JSON.stringify(task);
      const authorized = (await request().input('task',sql.NVarChar(sql.MAX),json)
        .query("SELECT 1 FROM security.fn_TaskEntityScope(@tenantId,@task,'CREATE');")).recordset.length;
      if (!authorized) return {status:403,message:'مجوز ایجاد وظیفهٔ رسیدگی را ندارید.'};
      await request().input('userId',sql.UniqueIdentifier,auth.userId)
        .input('rows',sql.NVarChar(sql.MAX),JSON.stringify([{c:'tasks',i:taskId,j:json,d:0}])).execute('sync.usp_ApplyEntityChanges');
      await request().input('userId',sql.UniqueIdentifier,auth.userId)
        .input('correlationId',sql.NVarChar(100),correlationId)
        .input('taskId',sql.NVarChar(200),taskId)
        .input('details',sql.NVarChar(sql.MAX),JSON.stringify({...evidence,reason:reasons[record.coverageStatus]}))
        .query(`INSERT security.AuditEvent(TenantId,ActorUserId,CorrelationId,EventType,EntityType,EntityId,OutcomeCode,DetailsJson)
          VALUES(@tenantId,@userId,@correlationId,N'FINANCIAL_JOURNAL_FOLLOW_UP',N'Task',@taskId,'SUCCESS',@details);`);
      return {status:201,id:taskId,replayed:false};
    });
  };
}


export function createJournalFollowUpEvidenceReader({sql,run}) {
  return (auth,id) => {
    if (typeof id!=='string' || !/^journal-review-[a-f0-9]{64}$/.test(id)) return null;
    return run(auth,async tx => {
      const result = await new sql.Request(tx)
        .input('tenantId',sql.UniqueIdentifier,auth.tenantId).input('taskId',sql.NVarChar(120),id)
        .query(`SELECT TOP (1) a.DetailsJson,a.OccurredAtUtc
          FROM security.AuditEvent a
          JOIN sync.EntityStore task ON task.TenantId=a.TenantId AND task.CollectionName=N'tasks'
            AND task.EntityId=a.EntityId AND task.IsDeleted=0
          WHERE a.TenantId=@tenantId AND a.EntityId=@taskId AND a.EntityType=N'Task'
            AND a.EventType=N'FINANCIAL_JOURNAL_FOLLOW_UP' AND a.OutcomeCode='SUCCESS'
            AND EXISTS(SELECT 1 FROM security.fn_RecordReadScope(@tenantId,N'finance.view',NULL,NULL,NULL,NULL))
            AND EXISTS(SELECT 1 FROM security.fn_TaskEntityScope(@tenantId,task.JsonDoc,'VIEW'))
          ORDER BY a.OccurredAtUtc DESC,a.AuditEventId DESC;`);
      const row = result.recordset[0];
      return row ? { ...JSON.parse(row.DetailsJson),recordedAt:row.OccurredAtUtc } : null;
    });
  };
}
