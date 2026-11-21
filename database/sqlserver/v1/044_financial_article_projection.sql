/* Report classification is resolved once using the approved map effective on the accounting date. */
SET XACT_ABORT ON;
GO
CREATE OR ALTER VIEW analytics.vw_FinancialJournalArticle
AS
SELECT j.TenantId,j.SourceSystemCode,j.CurrencyCode,j.JournalEntryMirrorId,j.AccountingDate,j.DocumentDate,j.PostingDate,
  j.ExternalPeriodCode,j.DocumentTypeCode,j.DocumentNumber,j.SyncedAtUtc,
  l.JournalLineMirrorId,l.ExternalJournalLineId,l.ExternalAccountCode,l.ExternalDetailCode,l.DebitAmount,l.CreditAmount,
  sourceMap.ExternalAccountTitle,sourceMap.ExternalParentCode,sourceMap.ExternalHierarchyKey,sourceMap.ExternalNatureCode,
  a.LedgerAccountId,a.ReportBucketCode,a.MoneyRoleCode,a.NatureCode,
  detail.DetailAccountId,party.AccountId AS LinkedAccountId,party.Name AS LinkedAccountName
FROM analytics.vw_FinancialJournalState j
JOIN crm.JournalLineMirror l ON l.TenantId=j.TenantId AND l.SourceSystemCode=j.SourceSystemCode AND l.JournalEntryMirrorId=j.JournalEntryMirrorId
OUTER APPLY (
  SELECT MIN(m.LedgerAccountSourceMapId) AS mapId FROM crm.LedgerAccountSourceMap m
  WHERE m.TenantId=l.TenantId AND m.SourceSystemCode=l.SourceSystemCode AND m.ExternalAccountCode=l.ExternalAccountCode
    AND m.EffectiveFrom<=j.AccountingDate AND (m.EffectiveTo IS NULL OR m.EffectiveTo>=j.AccountingDate)
  HAVING COUNT_BIG(*)=1
) match
LEFT JOIN crm.LedgerAccountSourceMap sourceMap ON sourceMap.TenantId=l.TenantId AND sourceMap.LedgerAccountSourceMapId=match.mapId
LEFT JOIN crm.LedgerAccount a ON a.TenantId=l.TenantId AND a.LedgerAccountId=sourceMap.LedgerAccountId AND sourceMap.MapStatus='APPROVED'
LEFT JOIN crm.DetailAccount detail ON detail.TenantId=l.TenantId AND detail.SourceSystemCode=l.SourceSystemCode
  AND detail.ExternalDetailCode=l.ExternalDetailCode AND detail.MapStatus='APPROVED'
LEFT JOIN crm.Account party ON party.TenantId=l.TenantId AND party.AccountId=detail.AccountId
WHERE j.JournalQuality='VALID';
GO
