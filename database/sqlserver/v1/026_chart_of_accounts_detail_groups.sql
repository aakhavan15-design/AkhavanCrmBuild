/*
  026 — آینهٔ کدینگ حسابداری ERP (گروه حساب / کل / معین) + تفصیلی + گروه تفصیلی + ارتباط تفصیلی↔معین
  افزایشی و idempotent؛ هیچ جدول/ستون موجودی حذف یا تغییر معنا نمی‌دهد.
  اصول: CRM کد معین/گردش موازی اختراع نمی‌کند؛ کدها عیناً از ERP می‌آیند (SourceSystemCode + کد خارجی).
  - گروه حساب / کل / معین: در همان جدول موجود crm.LedgerAccountSourceMap (آینهٔ کدینگ ERP) با ستون‌های سطح و والد.
  - تفصیلی: جدول مستقل crm.DetailAccount (نه فرزند یک معین؛ هر تفصیلی می‌تواند در چند معین گردش داشته باشد).
  - گروه تفصیلی: crm.DetailGroup فقط «دسته‌بندی» است (مشتریان، پرسنل، مراکز هزینه، جاری شرکا، بانک‌ها، …)
    و هیچ ربطی به اسناد حسابداری ندارد: هیچ FK از ردیف سند/گردش به گروه تفصیلی وجود ندارد و مانده‌ای حمل نمی‌کند.
  - ارتباط تفصیلی↔معین: crm.DetailSubsidiaryLink (چندبه‌چند)؛ مانده‌ها ادغام نمی‌شوند.
  بدون Seed و بدون داده نمونه.
*/
SET XACT_ABORT ON;
GO
/* ---------- A. تکمیل آینهٔ کدینگ: سطح (گروه حساب/کل/معین) و والد خارجی ---------- */
IF COL_LENGTH(N'crm.LedgerAccountSourceMap',N'ExternalLevelCode') IS NULL
  ALTER TABLE crm.LedgerAccountSourceMap ADD ExternalLevelCode varchar(12) NULL;
GO
IF COL_LENGTH(N'crm.LedgerAccountSourceMap',N'ExternalParentCode') IS NULL
  ALTER TABLE crm.LedgerAccountSourceMap ADD ExternalParentCode nvarchar(120) NULL;
GO
IF COL_LENGTH(N'crm.LedgerAccountSourceMap',N'ExternalNatureCode') IS NULL
  ALTER TABLE crm.LedgerAccountSourceMap ADD ExternalNatureCode varchar(6) NULL;
GO
IF COL_LENGTH(N'crm.LedgerAccountSourceMap',N'IsActive') IS NULL
  ALTER TABLE crm.LedgerAccountSourceMap ADD IsActive bit NOT NULL CONSTRAINT DF_LSM_Active DEFAULT 1;
GO
IF COL_LENGTH(N'crm.LedgerAccountSourceMap',N'SyncedAtUtc') IS NULL
  ALTER TABLE crm.LedgerAccountSourceMap ADD SyncedAtUtc datetime2(3) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_LSM_ExtLevel')
  ALTER TABLE crm.LedgerAccountSourceMap ADD CONSTRAINT CK_LSM_ExtLevel CHECK(ExternalLevelCode IS NULL OR ExternalLevelCode IN ('GROUP','GENERAL','SUBSIDIARY'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_LSM_ExtNature')
  ALTER TABLE crm.LedgerAccountSourceMap ADD CONSTRAINT CK_LSM_ExtNature CHECK(ExternalNatureCode IS NULL OR ExternalNatureCode IN ('DEBIT','CREDIT'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_LSM_Level_Parent' AND object_id=OBJECT_ID(N'crm.LedgerAccountSourceMap'))
  CREATE INDEX IX_LSM_Level_Parent ON crm.LedgerAccountSourceMap(TenantId,SourceSystemCode,ExternalLevelCode,ExternalParentCode);
GO
/* ---------- B. گروه تفصیلی (فقط دسته‌بندی؛ بدون ارتباط با اسناد حسابداری) ---------- */
IF OBJECT_ID(N'crm.DetailGroup',N'U') IS NULL
CREATE TABLE crm.DetailGroup (
 DetailGroupId uniqueidentifier NOT NULL CONSTRAINT DF_DetailGroup_Id DEFAULT NEWSEQUENTIALID(), TenantId uniqueidentifier NOT NULL,
 GroupCode nvarchar(60) NOT NULL, TitleFa nvarchar(250) NOT NULL,
 KindCode varchar(24) NOT NULL CONSTRAINT DF_DetailGroup_Kind DEFAULT 'OTHER',
 SourceSystemCode varchar(40) NULL, ExternalGroupCode nvarchar(120) NULL,
 IsActive bit NOT NULL CONSTRAINT DF_DetailGroup_Active DEFAULT 1, SyncedAtUtc datetime2(3) NULL,
 CreatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_DetailGroup_Created DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_DetailGroup PRIMARY KEY(DetailGroupId), CONSTRAINT FK_DetailGroup_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
 CONSTRAINT UQ_DetailGroup_Code UNIQUE(TenantId,GroupCode),
 CONSTRAINT CK_DetailGroup_Kind CHECK(KindCode IN ('CUSTOMER','SUPPLIER','PERSONNEL','COST_CENTER','PARTNER_CURRENT','BANK','OTHER'))
);
GO
/* ---------- C. تفصیلی (آینهٔ کد تفصیلی ERP) ---------- */
IF OBJECT_ID(N'crm.DetailAccount',N'U') IS NULL
CREATE TABLE crm.DetailAccount (
 DetailAccountId uniqueidentifier NOT NULL CONSTRAINT DF_DetailAcc_Id DEFAULT NEWSEQUENTIALID(), TenantId uniqueidentifier NOT NULL,
 SourceSystemCode varchar(40) NOT NULL, ExternalDetailCode nvarchar(120) NOT NULL, TitleFa nvarchar(250) NOT NULL,
 DetailGroupId uniqueidentifier NULL, AccountId uniqueidentifier NULL,
 MapStatus varchar(20) NOT NULL CONSTRAINT DF_DetailAcc_Map DEFAULT 'UNMAPPED',
 IsActive bit NOT NULL CONSTRAINT DF_DetailAcc_Active DEFAULT 1,
 SourceModifiedAtUtc datetime2(3) NULL, SyncedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_DetailAcc_Sync DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_DetailAccount PRIMARY KEY(DetailAccountId), CONSTRAINT FK_DetailAcc_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
 CONSTRAINT FK_DetailAcc_Group FOREIGN KEY(DetailGroupId) REFERENCES crm.DetailGroup(DetailGroupId),
 CONSTRAINT FK_DetailAcc_Account FOREIGN KEY(AccountId) REFERENCES crm.Account(AccountId),
 CONSTRAINT UQ_DetailAcc_Source UNIQUE(TenantId,SourceSystemCode,ExternalDetailCode),
 CONSTRAINT CK_DetailAcc_Map CHECK(MapStatus IN ('UNMAPPED','MAPPED','APPROVED','REJECTED')),
 CONSTRAINT CK_DetailAcc_Target CHECK(MapStatus='UNMAPPED' OR AccountId IS NOT NULL OR DetailGroupId IS NOT NULL)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_DetailAcc_Group' AND object_id=OBJECT_ID(N'crm.DetailAccount'))
  CREATE INDEX IX_DetailAcc_Group ON crm.DetailAccount(TenantId,DetailGroupId) INCLUDE(ExternalDetailCode,TitleFa);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_DetailAcc_Account' AND object_id=OBJECT_ID(N'crm.DetailAccount'))
  CREATE INDEX IX_DetailAcc_Account ON crm.DetailAccount(TenantId,AccountId) WHERE AccountId IS NOT NULL;
GO
/* ---------- D. ارتباط تفصیلی↔معین (چندبه‌چند؛ مانده‌ها ادغام نمی‌شوند) ---------- */
IF OBJECT_ID(N'crm.DetailSubsidiaryLink',N'U') IS NULL
CREATE TABLE crm.DetailSubsidiaryLink (
 TenantId uniqueidentifier NOT NULL, DetailAccountId uniqueidentifier NOT NULL, LedgerAccountSourceMapId bigint NOT NULL,
 LinkSourceCode varchar(24) NOT NULL CONSTRAINT DF_DSL_Src DEFAULT 'OBSERVED_IN_JOURNAL',
 FirstSeenAtUtc datetime2(3) NOT NULL CONSTRAINT DF_DSL_First DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_DetailSubsidiaryLink PRIMARY KEY(TenantId,DetailAccountId,LedgerAccountSourceMapId),
 CONSTRAINT FK_DSL_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
 CONSTRAINT FK_DSL_Detail FOREIGN KEY(DetailAccountId) REFERENCES crm.DetailAccount(DetailAccountId),
 CONSTRAINT FK_DSL_Subsidiary FOREIGN KEY(LedgerAccountSourceMapId) REFERENCES crm.LedgerAccountSourceMap(LedgerAccountSourceMapId),
 CONSTRAINT CK_DSL_Source CHECK(LinkSourceCode IN ('ERP_DECLARED','OBSERVED_IN_JOURNAL'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_DSL_Subsidiary' AND object_id=OBJECT_ID(N'crm.DetailSubsidiaryLink'))
  CREATE INDEX IX_DSL_Subsidiary ON crm.DetailSubsidiaryLink(LedgerAccountSourceMapId,DetailAccountId);
GO
/* ---------- E. اتصال ردیف گردش به تفصیلیِ آینه (ستون اختیاری؛ ExternalDetailCode همچنان حفظ می‌شود) ---------- */
IF COL_LENGTH(N'crm.JournalLineMirror',N'DetailAccountId') IS NULL
  ALTER TABLE crm.JournalLineMirror ADD DetailAccountId uniqueidentifier NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_JL_DetailAccount')
  ALTER TABLE crm.JournalLineMirror ADD CONSTRAINT FK_JL_DetailAccount FOREIGN KEY(DetailAccountId) REFERENCES crm.DetailAccount(DetailAccountId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_JL_DetailAccount' AND object_id=OBJECT_ID(N'crm.JournalLineMirror'))
  CREATE INDEX IX_JL_DetailAccount ON crm.JournalLineMirror(TenantId,DetailAccountId,ExternalAccountCode) INCLUDE(DebitAmount,CreditAmount);
GO
/* ---------- F. RLS: همان سیاست TenantIsolationPolicy موجود ---------- */
BEGIN
 DECLARE @t TABLE(n sysname); INSERT @t VALUES (N'crm.DetailGroup'),(N'crm.DetailAccount'),(N'crm.DetailSubsidiaryLink');
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
