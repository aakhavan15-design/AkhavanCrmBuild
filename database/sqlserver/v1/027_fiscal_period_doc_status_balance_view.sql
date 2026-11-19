/*
  027 — دوره مالی، نگاشت وضعیت سند، ابعاد تکمیلی ردیف گردش و View مانده به‌ازای (تفصیلی × معین × دوره)
  افزایشی و idempotent؛ ادامهٔ 017/026؛ هیچ جدول/ستون موجودی حذف یا تغییر معنا نمی‌دهد. بدون Seed.
  اصول (قانون اساسی §C/§D):
  - مانده هر ترکیب (تفصیلی، معین، دوره) مستقل = Σبدهکار − Σبستانکار؛ مثبت = بدهکار، منفی = بستانکار.
  - جمع تفصیلی (vw_DetailBalanceTotal) فقط تجمیع همان مانده‌های تفکیکی است و جایگزین آن‌ها نیست.
  - وضعیت سند حدس زده نمی‌شود: فقط وضعیت‌هایی که در crm.JournalStatusMap صراحتاً IncludeInBalance=1 دارند
    در مانده می‌آیند؛ وضعیت بدون نگاشت از مانده کنار می‌ماند و شمارش جداگانه (UnmappedStatusLineCount) می‌شود.
  - ردیف بدون دوره مالی نگاشت‌شده ⇒ FiscalPeriodId = NULL (نامشخص)، نه دورهٔ حدسی.
  - مقدار دوره/وضعیت/ابعاد عیناً از ERP می‌آید؛ نام ستون/جدول منبع ERP در اینجا حدس زده نشده است.
  اجرای واقعی روی SQL Server: NOT VERIFIED.
*/
SET XACT_ABORT ON;
GO
/* ---------- A. دوره مالی (آینهٔ ERP) ---------- */
IF OBJECT_ID(N'crm.FiscalPeriod',N'U') IS NULL
CREATE TABLE crm.FiscalPeriod (
 FiscalPeriodId uniqueidentifier NOT NULL CONSTRAINT DF_FiscalPeriod_Id DEFAULT NEWSEQUENTIALID(), TenantId uniqueidentifier NOT NULL,
 SourceSystemCode varchar(40) NOT NULL, ExternalPeriodCode nvarchar(120) NOT NULL, FiscalYearCode nvarchar(40) NULL, TitleFa nvarchar(250) NULL,
 StartDate date NOT NULL, EndDate date NOT NULL,
 StatusCode varchar(12) NOT NULL CONSTRAINT DF_FiscalPeriod_Status DEFAULT 'UNKNOWN',
 SourceModifiedAtUtc datetime2(3) NULL, SyncedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_FiscalPeriod_Sync DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_FiscalPeriod PRIMARY KEY(FiscalPeriodId), CONSTRAINT FK_FiscalPeriod_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
 CONSTRAINT UQ_FiscalPeriod_Source UNIQUE(TenantId,SourceSystemCode,ExternalPeriodCode),
 CONSTRAINT CK_FiscalPeriod_Dates CHECK(EndDate>=StartDate),
 CONSTRAINT CK_FiscalPeriod_Status CHECK(StatusCode IN ('OPEN','CLOSED','LOCKED','UNKNOWN'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_FiscalPeriod_Dates' AND object_id=OBJECT_ID(N'crm.FiscalPeriod'))
  CREATE INDEX IX_FiscalPeriod_Dates ON crm.FiscalPeriod(TenantId,StartDate,EndDate) INCLUDE(StatusCode,FiscalYearCode);
GO
/* ---------- B. نگاشت وضعیت سند ERP ← وضعیت نرمال + شمول در مانده (صریح؛ بدون حدس) ---------- */
IF OBJECT_ID(N'crm.JournalStatusMap',N'U') IS NULL
CREATE TABLE crm.JournalStatusMap (
 TenantId uniqueidentifier NOT NULL, SourceSystemCode varchar(40) NOT NULL, ExternalStatusCode varchar(30) NOT NULL,
 NormalizedStatusCode varchar(12) NOT NULL, IncludeInBalance bit NOT NULL,
 ApprovedBy nvarchar(120) NULL, ApprovedAtUtc datetime2(3) NULL,
 CONSTRAINT PK_JournalStatusMap PRIMARY KEY(TenantId,SourceSystemCode,ExternalStatusCode),
 CONSTRAINT FK_JSM_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
 CONSTRAINT CK_JSM_Status CHECK(NormalizedStatusCode IN ('DRAFT','TEMPORARY','POSTED','FINAL','VOID','OTHER'))
);
GO
/* ---------- C. دوره مالی و وضعیت ERP روی سند (ستون‌های اختیاری؛ StatusCode/IsVoided موجود حفظ می‌شود) ---------- */
IF COL_LENGTH(N'crm.JournalEntryMirror',N'FiscalPeriodId') IS NULL
  ALTER TABLE crm.JournalEntryMirror ADD FiscalPeriodId uniqueidentifier NULL;
GO
IF COL_LENGTH(N'crm.JournalEntryMirror',N'ExternalPeriodCode') IS NULL
  ALTER TABLE crm.JournalEntryMirror ADD ExternalPeriodCode nvarchar(120) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_JE_FiscalPeriod')
  ALTER TABLE crm.JournalEntryMirror ADD CONSTRAINT FK_JE_FiscalPeriod FOREIGN KEY(FiscalPeriodId) REFERENCES crm.FiscalPeriod(FiscalPeriodId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_JE_Period' AND object_id=OBJECT_ID(N'crm.JournalEntryMirror'))
  CREATE INDEX IX_JE_Period ON crm.JournalEntryMirror(TenantId,FiscalPeriodId) INCLUDE(StatusCode,IsVoided,DocumentDate);
GO
/* ---------- D. ابعاد تکمیلی ردیف گردش (مرکز هزینه، پروژه، شعبه، …) ---------- */
IF OBJECT_ID(N'crm.JournalLineDimension',N'U') IS NULL
CREATE TABLE crm.JournalLineDimension (
 TenantId uniqueidentifier NOT NULL, JournalLineMirrorId uniqueidentifier NOT NULL,
 DimensionCode varchar(40) NOT NULL, ExternalDimensionValueCode nvarchar(120) NOT NULL, DimensionValueTitleFa nvarchar(250) NULL,
 SyncedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_JLD_Sync DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_JournalLineDimension PRIMARY KEY(TenantId,JournalLineMirrorId,DimensionCode),
 CONSTRAINT FK_JLD_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
 CONSTRAINT FK_JLD_Line FOREIGN KEY(JournalLineMirrorId) REFERENCES crm.JournalLineMirror(JournalLineMirrorId)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_JLD_Value' AND object_id=OBJECT_ID(N'crm.JournalLineDimension'))
  CREATE INDEX IX_JLD_Value ON crm.JournalLineDimension(TenantId,DimensionCode,ExternalDimensionValueCode) INCLUDE(JournalLineMirrorId);
GO
/* ---------- E. View مانده تفکیکی: (تفصیلی × معین × دوره) ---------- */
CREATE OR ALTER VIEW analytics.vw_DetailSubsidiaryBalance AS
SELECT
 jl.TenantId, jl.SourceSystemCode, jl.ExternalDetailCode, jl.ExternalAccountCode,
 je.FiscalPeriodId,
 SUM(CASE WHEN sm.IncludeInBalance=1 AND je.IsVoided=0 THEN jl.DebitAmount ELSE 0 END)  AS TotalDebit,
 SUM(CASE WHEN sm.IncludeInBalance=1 AND je.IsVoided=0 THEN jl.CreditAmount ELSE 0 END) AS TotalCredit,
 SUM(CASE WHEN sm.IncludeInBalance=1 AND je.IsVoided=0 THEN jl.DebitAmount-jl.CreditAmount ELSE 0 END) AS Balance, /* >0 بدهکار، <0 بستانکار، 0 تسویه */
 SUM(CASE WHEN sm.IncludeInBalance=1 AND je.IsVoided=0 THEN 1 ELSE 0 END) AS CountedLineCount,
 SUM(CASE WHEN sm.ExternalStatusCode IS NULL AND je.IsVoided=0 THEN 1 ELSE 0 END) AS UnmappedStatusLineCount
FROM crm.JournalLineMirror jl
JOIN crm.JournalEntryMirror je ON je.JournalEntryMirrorId=jl.JournalEntryMirrorId AND je.TenantId=jl.TenantId
LEFT JOIN crm.JournalStatusMap sm ON sm.TenantId=je.TenantId AND sm.SourceSystemCode=je.SourceSystemCode AND sm.ExternalStatusCode=je.StatusCode
WHERE jl.ExternalDetailCode IS NOT NULL
GROUP BY jl.TenantId, jl.SourceSystemCode, jl.ExternalDetailCode, jl.ExternalAccountCode, je.FiscalPeriodId;
GO
/* جمع تفصیلی: فقط تجمیع همان مانده‌های تفکیکی؛ جایگزین آن‌ها نیست و SubsidiaryCount کنارش می‌آید */
CREATE OR ALTER VIEW analytics.vw_DetailBalanceTotal AS
SELECT
 TenantId, SourceSystemCode, ExternalDetailCode, FiscalPeriodId,
 SUM(TotalDebit) AS TotalDebit, SUM(TotalCredit) AS TotalCredit, SUM(Balance) AS Balance,
 COUNT(DISTINCT ExternalAccountCode) AS SubsidiaryCount, SUM(UnmappedStatusLineCount) AS UnmappedStatusLineCount
FROM analytics.vw_DetailSubsidiaryBalance
GROUP BY TenantId, SourceSystemCode, ExternalDetailCode, FiscalPeriodId;
GO
/* ---------- F. RLS: همان سیاست TenantIsolationPolicy موجود ---------- */
BEGIN
 DECLARE @t TABLE(n sysname); INSERT @t VALUES (N'crm.FiscalPeriod'),(N'crm.JournalStatusMap'),(N'crm.JournalLineDimension');
 DECLARE @n sysname, @sql nvarchar(max);
 DECLARE c CURSOR LOCAL FAST_FORWARD FOR SELECT n FROM @t;
 OPEN c; FETCH NEXT FROM c INTO @n;
 WHILE @@FETCH_STATUS=0
 BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.security_predicates sp JOIN sys.security_policies pol ON pol.object_id=sp.object_id WHERE pol.name=N'TenantIsolationPolicy' AND sp.target_object_id=OBJECT_ID(@n))
  BEGIN SET @sql=N'ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON '+@n+N';'; EXEC sp_executesql @sql; END;
  FETCH NEXT FROM c INTO @n;
 END; CLOSE c; DEALLOCATE c;
END;
GO
