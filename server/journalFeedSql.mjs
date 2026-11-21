// These batches are invoked with parameters by the tenant-bound worker, never by a public route.
export const stageJournals = `
SET NOCOUNT ON;
SELECT h.*,SUM(CONVERT(decimal(38,4),l.debit)) AS totalDebit,SUM(CONVERT(decimal(38,4),l.credit)) AS totalCredit
INTO #headers
FROM OPENJSON(@normalized) WITH (
  externalId nvarchar(200) '$.id', revision decimal(20,0) '$.revision',
  number nvarchar(100) '$.number', documentDate date '$.date', postingDate date '$.postingDate',
  periodCode nvarchar(120) '$.periodCode', documentType varchar(40) '$.type', statusCode varchar(30) '$.status',
  isVoided bit '$.voided', description nvarchar(500) '$.description', externalReference nvarchar(200) '$.reference',
  sourceCreated datetime2(3) '$.createdAt', sourceModified datetime2(3) '$.modifiedAt',
  payloadHash varchar(64) '$.hash', lines nvarchar(max) '$.lines' AS JSON, links nvarchar(max) '$.links' AS JSON
) h
OUTER APPLY OPENJSON(h.lines) WITH(debit decimal(19,4),credit decimal(19,4)) l
GROUP BY h.externalId,h.revision,h.number,h.documentDate,h.postingDate,h.periodCode,h.documentType,h.statusCode,
  h.isVoided,h.description,h.externalReference,h.sourceCreated,h.sourceModified,h.payloadHash,h.lines,h.links;

SELECT h.externalId AS headerId,l.*
INTO #lines FROM #headers h CROSS APPLY OPENJSON(h.lines) WITH (
  externalId nvarchar(200) '$.id', lineNumber int '$.number', accountCode nvarchar(120), detailCode nvarchar(120),
  debit decimal(19,4),credit decimal(19,4),description nvarchar(500),
  originalCurrency char(3),originalAmount decimal(19,4),exchangeRate decimal(19,8),
  dimensions nvarchar(max) AS JSON,links nvarchar(max) AS JSON
) l;

SELECT h.*,existing.JournalEntryMirrorId AS existingId,p.FiscalPeriodId,sm.NormalizedStatusCode,sm.IncludeInBalance,
  CASE WHEN existing.JournalEntryMirrorId IS NULL THEN 'INSERT'
       WHEN existing.SourceRevision IS NULL THEN 'LEGACY'
       WHEN existing.SourceRevision>h.revision THEN 'STALE'
       WHEN existing.SourceRevision=h.revision AND existing.SourcePayloadHash=CONVERT(binary(32),h.payloadHash,2) THEN 'IDENTICAL'
       WHEN existing.SourceRevision=h.revision THEN 'CONFLICT'
       ELSE 'UPDATE' END AS action
INTO #documents
FROM #headers h
LEFT JOIN crm.JournalEntryMirror existing ON existing.TenantId=@tenantId AND existing.SourceSystemCode=@source
  AND existing.ExternalJournalId=h.externalId
LEFT JOIN crm.FiscalPeriod p ON p.TenantId=@tenantId AND p.SourceSystemCode=@source AND p.ExternalPeriodCode=h.periodCode
  AND COALESCE(h.postingDate,h.documentDate) BETWEEN p.StartDate AND p.EndDate
LEFT JOIN crm.JournalStatusMap sm ON sm.TenantId=@tenantId AND sm.SourceSystemCode=@source
  AND sm.ExternalStatusCode=h.statusCode AND sm.ApprovedAtUtc IS NOT NULL;

SELECT l.*,map.sourceMapId,map.mapCount,
  CASE WHEN m.MapStatus='APPROVED' THEN approvedLedger.LedgerAccountId ELSE NULL END AS ledgerAccountId,
  detail.DetailAccountId,
  CASE WHEN detail.MapStatus='APPROVED' THEN account.AccountId ELSE NULL END AS accountId,
  CASE WHEN relation.LinkSourceCode='ERP_DECLARED'
    AND (relation.SourceEffectiveFrom IS NULL OR relation.SourceEffectiveFrom<=COALESCE(h.postingDate,h.documentDate))
    AND (relation.SourceEffectiveTo>=COALESCE(h.postingDate,h.documentDate) OR (relation.SourceEffectiveTo IS NULL AND relation.SourceIsActive=1))
    THEN 1 ELSE 0 END AS allowedDetail
INTO #articles
FROM #lines l JOIN #documents h ON h.externalId=l.headerId AND h.action IN ('INSERT','UPDATE')
OUTER APPLY (
  SELECT MIN(m.LedgerAccountSourceMapId) AS sourceMapId,COUNT_BIG(*) AS mapCount
  FROM crm.LedgerAccountSourceMap m
  WHERE m.TenantId=@tenantId AND m.SourceSystemCode=@source AND m.ExternalAccountCode=l.accountCode
    AND m.EffectiveFrom<=COALESCE(h.postingDate,h.documentDate)
    AND (m.EffectiveTo IS NULL OR m.EffectiveTo>=COALESCE(h.postingDate,h.documentDate))
) map
LEFT JOIN crm.LedgerAccountSourceMap m ON m.LedgerAccountSourceMapId=map.sourceMapId
LEFT JOIN crm.LedgerAccount approvedLedger ON approvedLedger.TenantId=@tenantId AND approvedLedger.LedgerAccountId=m.LedgerAccountId
LEFT JOIN crm.DetailAccount detail ON detail.TenantId=@tenantId AND detail.SourceSystemCode=@source AND detail.ExternalDetailCode=l.detailCode
LEFT JOIN crm.Account account ON account.TenantId=@tenantId AND account.AccountId=detail.AccountId
LEFT JOIN crm.DetailSubsidiaryLink relation ON relation.TenantId=@tenantId AND relation.DetailAccountId=detail.DetailAccountId
  AND relation.LedgerAccountSourceMapId=map.sourceMapId;

SELECT externalId,ruleCode,N'ERROR' AS severity,messageFa INTO #errors FROM (
  SELECT externalId,'UNVERSIONED_JOURNAL' AS ruleCode,N'این سند پیش از ثبت نسخه وارد شده و به تعیین نسخهٔ مبنا نیاز دارد.' AS messageFa
    FROM #documents WHERE action='LEGACY'
  UNION ALL SELECT externalId,'REVISION_CONFLICT',N'دو محتوای متفاوت با نسخهٔ یکسان وجود دارد.' FROM #documents WHERE action='CONFLICT'
  UNION ALL SELECT externalId,'PERIOD_UNRESOLVED',N'دورهٔ مالی سند یا تاریخ اثر حسابداری قابل تأیید نیست.'
    FROM #documents WHERE action IN ('INSERT','UPDATE') AND FiscalPeriodId IS NULL
  UNION ALL SELECT externalId,'STATUS_UNRESOLVED',N'وضعیت منبع نگاشت تأییدشده و سازگار ندارد.'
    FROM #documents WHERE action IN ('INSERT','UPDATE') AND (NormalizedStatusCode IS NULL
      OR (isVoided=1 AND NormalizedStatusCode<>'VOID') OR (isVoided=0 AND NormalizedStatusCode='VOID')
      OR (IncludeInBalance=1 AND NormalizedStatusCode NOT IN ('POSTED','FINAL')))
  UNION ALL SELECT DISTINCT headerId,'ACCOUNT_UNRESOLVED',N'حساب ERP در تاریخ سند معتبر یا یکتا نیست.' FROM #articles WHERE mapCount<>1
  UNION ALL SELECT DISTINCT headerId,'DETAIL_RELATION_UNRESOLVED',N'تفصیلی یا رابطهٔ صریح معین و تفصیلی در ERP یافت نشد.'
    FROM #articles WHERE detailCode IS NOT NULL AND (DetailAccountId IS NULL OR allowedDetail=0)
  UNION ALL SELECT DISTINCT a.headerId,'LINE_ID_REASSIGNED',N'شناسهٔ آرتیکل در سند دیگری از همین منبع وجود دارد.'
    FROM #articles a JOIN #documents d ON d.externalId=a.headerId
    JOIN crm.JournalLineMirror l ON l.TenantId=@tenantId AND l.SourceSystemCode=@source AND l.ExternalJournalLineId=a.externalId
    WHERE d.existingId IS NULL OR d.existingId<>l.JournalEntryMirrorId
  UNION ALL SELECT MIN(externalId),'SOURCE_ID_COLLISION',N'شناسهٔ اسناد مطابق قواعد تطبیق پایگاه داده تکراری است.'
    FROM #headers GROUP BY externalId COLLATE DATABASE_DEFAULT HAVING COUNT_BIG(*)>1
  UNION ALL SELECT MIN(headerId),'ARTICLE_ID_COLLISION',N'شناسهٔ آرتیکل مطابق قواعد تطبیق پایگاه داده تکراری است.'
    FROM #lines GROUP BY externalId COLLATE DATABASE_DEFAULT HAVING COUNT_BIG(*)>1
) violations;
SELECT externalId,ruleCode,severity,messageFa FROM #errors ORDER BY externalId,ruleCode;

SELECT COUNT(CASE WHEN action='INSERT' THEN 1 END) AS inserted,
  COUNT(CASE WHEN action='UPDATE' THEN 1 END) AS updated,
  COUNT(CASE WHEN action='STALE' THEN 1 END) AS stale,
  COUNT(CASE WHEN action='IDENTICAL' THEN 1 END) AS identical
FROM #documents;`;

// No mirror write is attempted when validation fails. Old revisions are retained in integration.RawRecord.
export const publishJournals = `
IF NOT EXISTS (SELECT 1 FROM #errors)
BEGIN
INSERT crm.JournalEntryMirror(TenantId,SourceSystemCode,ExternalJournalId,DocumentNumber,DocumentDate,PostingDate,DocumentTypeCode,
  StatusCode,IsVoided,CurrencyCode,SourceModifiedAtUtc,SourceCreatedAtUtc,Description,ExternalReference,
  FiscalPeriodId,ExternalPeriodCode,TotalDebit,TotalCredit,ImportedBatchId,SourceRevision,SourcePayloadHash)
SELECT @tenantId,@source,externalId,number,documentDate,postingDate,documentType,statusCode,isVoided,@currency,
  sourceModified,sourceCreated,description,externalReference,FiscalPeriodId,periodCode,totalDebit,totalCredit,
  @batchId,revision,CONVERT(binary(32),payloadHash,2) FROM #documents WHERE action='INSERT';

UPDATE target SET DocumentNumber=d.number,DocumentDate=d.documentDate,PostingDate=d.postingDate,DocumentTypeCode=d.documentType,
  StatusCode=d.statusCode,IsVoided=d.isVoided,CurrencyCode=@currency,SourceModifiedAtUtc=d.sourceModified,
  SourceCreatedAtUtc=d.sourceCreated,Description=d.description,ExternalReference=d.externalReference,
  FiscalPeriodId=d.FiscalPeriodId,ExternalPeriodCode=d.periodCode,TotalDebit=COALESCE(d.totalDebit,target.TotalDebit),
  TotalCredit=COALESCE(d.totalCredit,target.TotalCredit),ImportedBatchId=@batchId,
  SourceRevision=d.revision,SourcePayloadHash=CONVERT(binary(32),d.payloadHash,2),SyncedAtUtc=SYSUTCDATETIME()
FROM crm.JournalEntryMirror target JOIN #documents d ON target.JournalEntryMirrorId=d.existingId
WHERE target.TenantId=@tenantId AND target.SourceSystemCode=@source AND d.action='UPDATE';

SELECT h.JournalEntryMirrorId AS headerId,d.externalId,d.links,
  CASE WHEN d.isVoided=1 AND d.totalDebit IS NULL THEN 0 ELSE 1 END AS replaceLines
INTO #applied
FROM #documents d JOIN crm.JournalEntryMirror h ON h.TenantId=@tenantId AND h.SourceSystemCode=@source
  AND h.ExternalJournalId=d.externalId WHERE d.action IN ('INSERT','UPDATE');

DELETE links FROM crm.JournalSourceLink links JOIN #applied d ON d.headerId=links.JournalEntryMirrorId
WHERE links.TenantId=@tenantId AND links.SourceSystemCode=@source AND d.replaceLines=1;

DELETE dimensions FROM crm.JournalLineDimension dimensions
JOIN crm.JournalLineMirror l ON l.TenantId=@tenantId AND l.JournalLineMirrorId=dimensions.JournalLineMirrorId
JOIN #applied d ON d.headerId=l.JournalEntryMirrorId
WHERE dimensions.TenantId=@tenantId AND d.replaceLines=1;

DELETE l FROM crm.JournalLineMirror l JOIN #applied d ON d.headerId=l.JournalEntryMirrorId
WHERE l.TenantId=@tenantId AND l.SourceSystemCode=@source AND d.replaceLines=1
  AND NOT EXISTS (SELECT 1 FROM #articles a WHERE a.headerId=d.externalId AND a.externalId=l.ExternalJournalLineId);

UPDATE l SET ExternalAccountCode=a.accountCode,ExternalDetailCode=a.detailCode,LedgerAccountId=a.ledgerAccountId,
  AccountId=a.accountId,DetailAccountId=a.DetailAccountId,DebitAmount=a.debit,CreditAmount=a.credit,Description=a.description,
  RefDocumentTypeCode=reference.type,RefExternalDocumentId=reference.id,SourceModifiedAtUtc=h.sourceModified,
  SyncedAtUtc=SYSUTCDATETIME(),OriginalCurrencyCode=a.originalCurrency,OriginalCurrencyAmount=a.originalAmount,
  SourceExchangeRate=a.exchangeRate,SourceLineNumber=a.lineNumber,ImportedBatchId=@batchId
FROM crm.JournalLineMirror l JOIN #applied d ON d.headerId=l.JournalEntryMirrorId
JOIN #articles a ON a.headerId=d.externalId AND a.externalId=l.ExternalJournalLineId
JOIN #documents h ON h.externalId=d.externalId
OUTER APPLY (SELECT type,id FROM OPENJSON(a.links) WITH(type varchar(24),id nvarchar(200))
  WHERE (SELECT COUNT_BIG(*) FROM OPENJSON(a.links))=1) reference
WHERE l.TenantId=@tenantId AND l.SourceSystemCode=@source;

INSERT crm.JournalLineMirror(TenantId,SourceSystemCode,ExternalJournalLineId,JournalEntryMirrorId,ExternalAccountCode,LedgerAccountId,
  AccountId,ExternalDetailCode,DetailAccountId,DebitAmount,CreditAmount,Description,RefDocumentTypeCode,RefExternalDocumentId,
  SourceModifiedAtUtc,OriginalCurrencyCode,OriginalCurrencyAmount,SourceExchangeRate,SourceLineNumber,ImportedBatchId)
SELECT @tenantId,@source,a.externalId,d.headerId,a.accountCode,a.ledgerAccountId,a.accountId,a.detailCode,a.DetailAccountId,
  a.debit,a.credit,a.description,reference.type,reference.id,h.sourceModified,
  a.originalCurrency,a.originalAmount,a.exchangeRate,a.lineNumber,@batchId
FROM #articles a JOIN #applied d ON d.externalId=a.headerId JOIN #documents h ON h.externalId=a.headerId
OUTER APPLY (SELECT type,id FROM OPENJSON(a.links) WITH(type varchar(24),id nvarchar(200))
  WHERE (SELECT COUNT_BIG(*) FROM OPENJSON(a.links))=1) reference
WHERE NOT EXISTS(SELECT 1 FROM crm.JournalLineMirror l WHERE l.TenantId=@tenantId AND l.SourceSystemCode=@source AND l.ExternalJournalLineId=a.externalId);

SELECT l.JournalLineMirrorId AS lineId,d.headerId,a.dimensions,a.links
INTO #appliedLines
FROM #articles a JOIN #applied d ON d.externalId=a.headerId
JOIN crm.JournalLineMirror l ON l.TenantId=@tenantId AND l.SourceSystemCode=@source AND l.ExternalJournalLineId=a.externalId;

INSERT crm.JournalLineDimension(TenantId,JournalLineMirrorId,DimensionCode,ExternalDimensionValueCode,DimensionValueTitleFa,DimensionLevel)
SELECT @tenantId,l.lineId,d.[key],d.[value],d.title,d.[level] FROM #appliedLines l
CROSS APPLY OPENJSON(l.dimensions) WITH ([key] varchar(40),[value] nvarchar(120),title nvarchar(250),[level] smallint) d;

INSERT crm.JournalSourceLink(TenantId,SourceSystemCode,JournalEntryMirrorId,JournalLineMirrorId,OperationType,
  ExternalOperationId,ExternalOperationNumber,ImportedBatchId)
SELECT @tenantId,@source,d.headerId,NULL,r.type,r.id,r.number,@batchId FROM #applied d
CROSS APPLY OPENJSON(d.links) WITH(type varchar(24),id nvarchar(200),number nvarchar(120)) r
WHERE NOT EXISTS (SELECT 1 FROM crm.JournalSourceLink previous WHERE previous.TenantId=@tenantId AND previous.SourceSystemCode=@source
  AND previous.JournalEntryMirrorId=d.headerId AND previous.JournalLineMirrorId IS NULL AND previous.OperationType=r.type
  AND previous.ExternalOperationId=r.id)
UNION ALL
SELECT @tenantId,@source,l.headerId,l.lineId,r.type,r.id,r.number,@batchId FROM #appliedLines l
CROSS APPLY OPENJSON(l.links) WITH(type varchar(24),id nvarchar(200),number nvarchar(120)) r;
END;
`;
