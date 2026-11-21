/* Gate shared ledger readers on ERP status, period, base-currency balance and authoritative coverage. */
SET XACT_ABORT ON;
GO
IF COL_LENGTH(N'analytics.MoneyReportSource',N'JournalLinksVerifiedFrom') IS NULL
  ALTER TABLE analytics.MoneyReportSource ADD JournalLinksVerifiedFrom date NULL, JournalLinksVerifiedThrough date NULL;
GO
IF OBJECT_ID(N'analytics.CK_MoneyReportSource_JournalLinks',N'C') IS NULL
  ALTER TABLE analytics.MoneyReportSource WITH CHECK ADD CONSTRAINT CK_MoneyReportSource_JournalLinks CHECK (
    (JournalLinksVerifiedFrom IS NULL AND JournalLinksVerifiedThrough IS NULL)
    OR (JournalLinksVerifiedFrom IS NOT NULL AND JournalLinksVerifiedThrough IS NOT NULL
      AND JournalLinksVerifiedFrom>=OpeningDate AND JournalLinksVerifiedFrom<=JournalLinksVerifiedThrough
      AND JournalLinksVerifiedThrough<=VerifiedThrough));
GO
CREATE OR ALTER VIEW analytics.vw_FinancialJournalState
AS
SELECT e.TenantId,e.JournalEntryMirrorId,e.SourceSystemCode,e.ExternalJournalId,e.DocumentNumber,
  e.DocumentDate,e.PostingDate,COALESCE(e.PostingDate,e.DocumentDate) AS AccountingDate,e.DocumentTypeCode,
  e.FiscalPeriodId,p.ExternalPeriodCode,e.CurrencyCode,e.StatusCode,e.Description,e.ImportedBatchId,e.SyncedAtUtc,
  totals.lineCount,
  CASE WHEN e.IsVoided=1 OR sm.NormalizedStatusCode='VOID' THEN 'VOID'
       WHEN sm.ExternalStatusCode IS NULL OR sm.ApprovedAtUtc IS NULL THEN 'STATUS'
       WHEN sm.IncludeInBalance=0 THEN 'PENDING'
       WHEN sm.NormalizedStatusCode NOT IN ('POSTED','FINAL') THEN 'STATUS'
       WHEN NULLIF(LTRIM(RTRIM(e.DocumentNumber)),N'') IS NULL THEN 'NUMBER'
       WHEN p.FiscalPeriodId IS NULL OR COALESCE(e.PostingDate,e.DocumentDate) NOT BETWEEN p.StartDate AND p.EndDate THEN 'PERIOD'
       WHEN totals.lineCount=0 THEN 'LINES'
       WHEN totals.debit<>totals.credit OR (e.TotalDebit IS NOT NULL AND e.TotalDebit<>totals.debit)
         OR (e.TotalCredit IS NOT NULL AND e.TotalCredit<>totals.credit) THEN 'UNBALANCED'
       ELSE 'VALID' END AS JournalQuality
FROM crm.JournalEntryMirror e
LEFT JOIN crm.JournalStatusMap sm ON sm.TenantId=e.TenantId AND sm.SourceSystemCode=e.SourceSystemCode AND sm.ExternalStatusCode=e.StatusCode
LEFT JOIN crm.FiscalPeriod p ON p.TenantId=e.TenantId AND p.SourceSystemCode=e.SourceSystemCode AND p.FiscalPeriodId=e.FiscalPeriodId
CROSS APPLY(
  SELECT COUNT_BIG(*) AS lineCount,SUM(l.DebitAmount) AS debit,SUM(l.CreditAmount) AS credit
  FROM crm.JournalLineMirror l WHERE l.TenantId=e.TenantId AND l.SourceSystemCode=e.SourceSystemCode
    AND l.JournalEntryMirrorId=e.JournalEntryMirrorId
) totals;
GO
