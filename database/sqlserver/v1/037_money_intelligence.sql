/* Read-only CRM reporting metadata. No ERP writes, balance seeding or account-code guesses. */
SET XACT_ABORT ON;
GO
IF COL_LENGTH(N'crm.LedgerAccount',N'MoneyRoleCode') IS NULL
  ALTER TABLE crm.LedgerAccount ADD MoneyRoleCode varchar(32) NULL;
GO
IF OBJECT_ID(N'crm.CK_Ledger_MoneyRole',N'C') IS NULL
  ALTER TABLE crm.LedgerAccount WITH CHECK ADD CONSTRAINT CK_Ledger_MoneyRole CHECK (MoneyRoleCode IN (
    'CASH','RECEIVABLE','CHEQUES_RECEIVABLE','INVENTORY','PREPAYMENT','PAYABLE',
    'FIXED_ASSET','ASSET_ADJUSTMENT','FINANCING','EQUITY','OTHER_ASSET','OTHER_LIABILITY',
    'PNL_INCOME','PNL_EXPENSE','PNL_NONCASH'
  ));
GO
IF OBJECT_ID(N'analytics.MoneyReportSource',N'U') IS NULL
  CREATE TABLE analytics.MoneyReportSource (
    TenantId uniqueidentifier NOT NULL CONSTRAINT PK_MoneyReportSource PRIMARY KEY,
    SourceSystemCode varchar(40) NOT NULL,
    OpeningDate date NOT NULL,
    OpeningDocumentTypeCode varchar(40) NOT NULL,
    ClosingDocumentTypes nvarchar(1000) NULL,
    VerifiedThrough date NOT NULL,
    CoverageProof nvarchar(200) NOT NULL,
    FifoSnapshotUnitsVerified bit NOT NULL CONSTRAINT DF_MoneyReportSource_Fifo DEFAULT 0,
    ApprovedBy uniqueidentifier NOT NULL,
    ApprovedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_MoneyReportSource_ApprovedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_MoneyReportSource_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
    CONSTRAINT FK_MoneyReportSource_Approver FOREIGN KEY(ApprovedBy) REFERENCES core.AppUser(UserId),
    CONSTRAINT CK_MoneyReportSource_Closing CHECK(ClosingDocumentTypes IS NULL OR ISJSON(ClosingDocumentTypes)=1),
    CONSTRAINT CK_MoneyReportSource_Coverage CHECK(VerifiedThrough>=OpeningDate AND
      LEN(LTRIM(RTRIM(CoverageProof)))>0 AND LEN(LTRIM(RTRIM(OpeningDocumentTypeCode)))>0)
  );
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_policies WHERE name=N'TenantIsolationPolicy' AND schema_id=SCHEMA_ID(N'security'))
  THROW 51370, N'Money intelligence requires the existing tenant security policy.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates
  WHERE target_object_id=OBJECT_ID(N'analytics.MoneyReportSource') AND predicate_type_desc=N'FILTER')
  ALTER SECURITY POLICY security.TenantIsolationPolicy
    ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON analytics.MoneyReportSource,
    ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON analytics.MoneyReportSource AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON analytics.MoneyReportSource AFTER UPDATE;
GO
