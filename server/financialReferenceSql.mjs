// Reuse the original ERP account codes and preserve the separately authorized CRM reporting mappings.
export const publishFinancialReference = `
SET NOCOUNT ON;
DECLARE @revision decimal(20,0)=CONVERT(decimal(20,0),@revisionText);
SELECT ROW_NUMBER() OVER(ORDER BY (SELECT NULL)) AS rowId,r.* INTO #reference
FROM OPENJSON(@normalized) WITH (
  kind varchar(20),code nvarchar(120),id nvarchar(200),title nvarchar(250),[from] date,[to] date,status varchar(12),[year] nvarchar(40),
  parent nvarchar(120),hierarchy nvarchar(60),level tinyint,nature varchar(6),active bit,
  groupKind varchar(24),[group] nvarchar(120),account nvarchar(120),accountFrom date
) r;

SELECT r.rowId,p.FiscalPeriodId AS periodId,a.LedgerAccountSourceMapId AS mapId,g.DetailGroupId AS groupId,d.DetailAccountId AS detailId,
  CASE r.kind WHEN 'PERIOD' THEN p.SourceRevision WHEN 'ACCOUNT' THEN a.SourceRevision
    WHEN 'DETAIL_GROUP' THEN g.SourceRevision WHEN 'DETAIL' THEN d.SourceRevision ELSE rel.SourceRevision END AS existingRevision,
  CASE WHEN p.FiscalPeriodId IS NOT NULL OR a.LedgerAccountSourceMapId IS NOT NULL OR g.DetailGroupId IS NOT NULL
    OR d.DetailAccountId IS NOT NULL OR rel.DetailAccountId IS NOT NULL THEN 1 ELSE 0 END AS existsAlready
INTO #existing
FROM #reference r
LEFT JOIN crm.FiscalPeriod p ON r.kind='PERIOD' AND p.TenantId=@tenantId AND p.SourceSystemCode=@source AND p.ExternalPeriodCode=r.code
LEFT JOIN crm.LedgerAccountSourceMap a ON r.kind='ACCOUNT' AND a.TenantId=@tenantId AND a.SourceSystemCode=@source
  AND a.ExternalAccountCode=r.code AND a.EffectiveFrom=r.[from]
OUTER APPLY (
  SELECT TRY_CONVERT(uniqueidentifier,MIN(CONVERT(char(36),g.DetailGroupId))) AS DetailGroupId,MIN(g.SourceRevision) AS SourceRevision
  FROM crm.DetailGroup g WHERE r.kind='DETAIL_GROUP' AND g.TenantId=@tenantId AND g.SourceSystemCode=@source AND g.ExternalGroupCode=r.code
  HAVING COUNT_BIG(*)=1
) g
LEFT JOIN crm.DetailAccount d ON r.kind='DETAIL' AND d.TenantId=@tenantId AND d.SourceSystemCode=@source AND d.ExternalDetailCode=r.code
LEFT JOIN crm.DetailAccount relationDetail ON r.kind='DETAIL_RELATION' AND relationDetail.TenantId=@tenantId AND relationDetail.SourceSystemCode=@source
  AND relationDetail.ExternalDetailCode=r.code
LEFT JOIN crm.LedgerAccountSourceMap relationAccount ON r.kind='DETAIL_RELATION' AND relationAccount.TenantId=@tenantId
  AND relationAccount.SourceSystemCode=@source AND relationAccount.ExternalAccountCode=r.account AND relationAccount.EffectiveFrom=r.accountFrom
LEFT JOIN crm.DetailSubsidiaryLink rel ON rel.TenantId=@tenantId AND rel.DetailAccountId=relationDetail.DetailAccountId
  AND rel.LedgerAccountSourceMapId=relationAccount.LedgerAccountSourceMapId;

SELECT r.*,e.periodId,e.mapId,e.groupId,e.detailId,e.existsAlready INTO #ready
FROM #reference r JOIN #existing e ON e.rowId=r.rowId WHERE e.existingRevision IS NULL OR e.existingRevision<@revision;

SELECT externalId,ruleCode,N'ERROR' AS severity,messageFa INTO #errors FROM (
  SELECT MIN(code) AS externalId,'REFERENCE_COLLISION' AS ruleCode,N'شناسهٔ کدینگ مطابق قواعد تطبیق پایگاه داده تکراری است.' AS messageFa
    FROM #reference GROUP BY kind,code COLLATE DATABASE_DEFAULT,CASE WHEN kind='ACCOUNT' THEN [from] END,account,accountFrom HAVING COUNT_BIG(*)>1
  UNION ALL SELECT r.code,'DETAIL_GROUP_AMBIGUOUS',N'بیش از یک گروه با شناسهٔ تفصیلی منبع موجود است.'
    FROM #ready r WHERE r.kind='DETAIL_GROUP' AND (SELECT COUNT_BIG(*) FROM crm.DetailGroup g
      WHERE g.TenantId=@tenantId AND g.SourceSystemCode=@source AND g.ExternalGroupCode=r.code)>1
  UNION ALL SELECT r.code,'MISSING_PARENT',N'والد کدینگ ERP در این منبع یافت نشد یا با خود حساب یکی است.' FROM #ready r
    WHERE r.kind='ACCOUNT' AND r.parent IS NOT NULL AND (r.parent=r.code
      OR (NOT EXISTS(SELECT 1 FROM #reference p WHERE p.kind='ACCOUNT' AND p.code=r.parent)
        AND NOT EXISTS(SELECT 1 FROM crm.LedgerAccountSourceMap p WHERE p.TenantId=@tenantId AND p.SourceSystemCode=@source AND p.ExternalAccountCode=r.parent)))
  UNION ALL SELECT r.code,'MISSING_DETAIL_GROUP',N'گروه تفصیلی در این منبع یافت نشد یا یکتا نیست.' FROM #ready r
    WHERE r.kind='DETAIL' AND r.[group] IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM #reference p WHERE p.kind='DETAIL_GROUP' AND p.code=r.[group])
    AND (SELECT COUNT_BIG(*) FROM crm.DetailGroup p WHERE p.TenantId=@tenantId AND p.SourceSystemCode=@source AND p.ExternalGroupCode=r.[group])<>1
  UNION ALL SELECT r.code,'MISSING_RELATION_TARGET',N'حساب یا تفصیلی رابطه در کدینگ همین منبع یافت نشد.' FROM #ready r WHERE r.kind='DETAIL_RELATION' AND
    ((NOT EXISTS(SELECT 1 FROM #reference p WHERE p.kind='DETAIL' AND p.code=r.code)
       AND NOT EXISTS(SELECT 1 FROM crm.DetailAccount p WHERE p.TenantId=@tenantId AND p.SourceSystemCode=@source AND p.ExternalDetailCode=r.code))
      OR (NOT EXISTS(SELECT 1 FROM #reference p WHERE p.kind='ACCOUNT' AND p.code=r.account AND p.[from]=r.accountFrom)
       AND NOT EXISTS(SELECT 1 FROM crm.LedgerAccountSourceMap p WHERE p.TenantId=@tenantId AND p.SourceSystemCode=@source
         AND p.ExternalAccountCode=r.account AND p.EffectiveFrom=r.accountFrom)))
) violations;
SELECT externalId,ruleCode,severity,messageFa FROM #errors ORDER BY externalId,ruleCode;
SELECT COUNT(CASE WHEN existsAlready=0 THEN 1 END) AS inserted,COUNT(CASE WHEN existsAlready=1 THEN 1 END) AS updated,
  (SELECT COUNT(*) FROM #existing WHERE existingRevision>@revision) AS stale,
  (SELECT COUNT(*) FROM #existing WHERE existingRevision=@revision) AS identical FROM #ready;

IF NOT EXISTS (SELECT 1 FROM #errors)
BEGIN
  UPDATE p SET FiscalYearCode=r.[year],TitleFa=r.title,StartDate=r.[from],EndDate=r.[to],StatusCode=r.status,
    SourceRevision=@revision,SyncedAtUtc=SYSUTCDATETIME()
  FROM crm.FiscalPeriod p JOIN #ready r ON r.periodId=p.FiscalPeriodId WHERE p.TenantId=@tenantId AND p.SourceSystemCode=@source;
  INSERT crm.FiscalPeriod(TenantId,SourceSystemCode,ExternalPeriodCode,FiscalYearCode,TitleFa,StartDate,EndDate,StatusCode,SourceRevision)
  SELECT @tenantId,@source,code,[year],title,[from],[to],status,@revision FROM #ready WHERE kind='PERIOD' AND existsAlready=0;

  UPDATE a SET ExternalNativeId=r.id,ExternalAccountTitle=r.title,ExternalLevelNo=r.level,ExternalHierarchyKey=r.hierarchy,
    ExternalParentCode=r.parent,ExternalNatureCode=r.nature,EffectiveTo=r.[to],IsActive=r.active,SourceRevision=@revision,SyncedAtUtc=SYSUTCDATETIME()
  FROM crm.LedgerAccountSourceMap a JOIN #ready r ON r.mapId=a.LedgerAccountSourceMapId WHERE a.TenantId=@tenantId AND a.SourceSystemCode=@source;
  INSERT crm.LedgerAccountSourceMap(TenantId,SourceSystemCode,ExternalAccountCode,ExternalNativeId,ExternalAccountTitle,ExternalLevelNo,
    ExternalHierarchyKey,ExternalParentCode,ExternalNatureCode,EffectiveFrom,EffectiveTo,IsActive,SourceRevision,SyncedAtUtc)
  SELECT @tenantId,@source,code,id,title,level,hierarchy,parent,nature,[from],[to],active,@revision,SYSUTCDATETIME()
  FROM #ready WHERE kind='ACCOUNT' AND existsAlready=0;

  UPDATE target SET TitleFa=r.title,KindCode=r.groupKind,IsActive=r.active,SourceRevision=@revision,SyncedAtUtc=SYSUTCDATETIME()
  FROM crm.DetailGroup target JOIN #ready r ON r.groupId=target.DetailGroupId WHERE target.TenantId=@tenantId AND target.SourceSystemCode=@source;
  INSERT crm.DetailGroup(TenantId,SourceSystemCode,ExternalGroupCode,GroupCode,TitleFa,KindCode,IsActive,SourceRevision,SyncedAtUtc)
  SELECT @tenantId,@source,code,'ERP:'+LEFT(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONCAT(@source,N':',code)),2),56),
    title,groupKind,active,@revision,SYSUTCDATETIME() FROM #ready WHERE kind='DETAIL_GROUP' AND existsAlready=0;

  SELECT r.*,g.DetailGroupId AS externalGroupId INTO #details FROM #ready r
  LEFT JOIN crm.DetailGroup g ON g.TenantId=@tenantId AND g.SourceSystemCode=@source AND g.ExternalGroupCode=r.[group]
  WHERE r.kind='DETAIL';
  UPDATE d SET TitleFa=r.title,DetailGroupId=COALESCE(r.externalGroupId,d.DetailGroupId),IsActive=r.active,SourceRevision=@revision,SyncedAtUtc=SYSUTCDATETIME()
  FROM crm.DetailAccount d JOIN #details r ON r.detailId=d.DetailAccountId WHERE d.TenantId=@tenantId AND d.SourceSystemCode=@source;
  INSERT crm.DetailAccount(TenantId,SourceSystemCode,ExternalDetailCode,TitleFa,DetailGroupId,IsActive,SourceRevision)
  SELECT @tenantId,@source,code,title,externalGroupId,active,@revision FROM #details WHERE existsAlready=0;

  SELECT r.*,d.DetailAccountId AS relationDetailId,a.LedgerAccountSourceMapId AS relationMapId INTO #relations FROM #ready r
  JOIN crm.DetailAccount d ON d.TenantId=@tenantId AND d.SourceSystemCode=@source AND d.ExternalDetailCode=r.code
  JOIN crm.LedgerAccountSourceMap a ON a.TenantId=@tenantId AND a.SourceSystemCode=@source AND a.ExternalAccountCode=r.account AND a.EffectiveFrom=r.accountFrom
  WHERE r.kind='DETAIL_RELATION';
  UPDATE rel SET LinkSourceCode='ERP_DECLARED',SourceEffectiveFrom=r.[from],SourceEffectiveTo=r.[to],
    SourceIsActive=r.active,SourceRevision=@revision
  FROM crm.DetailSubsidiaryLink rel JOIN #relations r ON r.relationDetailId=rel.DetailAccountId AND r.relationMapId=rel.LedgerAccountSourceMapId
  WHERE rel.TenantId=@tenantId;
  INSERT crm.DetailSubsidiaryLink(TenantId,DetailAccountId,LedgerAccountSourceMapId,LinkSourceCode,SourceEffectiveFrom,SourceEffectiveTo,SourceIsActive,SourceRevision)
  SELECT @tenantId,relationDetailId,relationMapId,'ERP_DECLARED',[from],[to],active,@revision FROM #relations WHERE existsAlready=0;
END;`;
