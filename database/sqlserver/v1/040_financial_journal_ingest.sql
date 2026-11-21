/* Bind inbound finance connectors to one ERP company and extend the existing journal mirrors. */
SET XACT_ABORT ON;
GO
IF COL_LENGTH(N'integration.Connector',N'FinancialCompanyKey') IS NULL
  ALTER TABLE integration.Connector ADD FinancialCompanyKey nvarchar(120) NULL, FinancialBaseCurrency char(3) NULL;
GO
IF OBJECT_ID(N'integration.CK_Connector_FinancialCompany',N'C') IS NULL
  ALTER TABLE integration.Connector WITH CHECK ADD CONSTRAINT CK_Connector_FinancialCompany CHECK (
    (FinancialCompanyKey IS NULL AND FinancialBaseCurrency IS NULL)
    OR (FinancialCompanyKey IS NOT NULL AND LEN(FinancialCompanyKey)>0 AND FinancialBaseCurrency IS NOT NULL));
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'integration.Connector') AND name=N'UX_Connector_FinancialSource')
  CREATE UNIQUE INDEX UX_Connector_FinancialSource ON integration.Connector(TenantId,SystemCode) WHERE FinancialCompanyKey IS NOT NULL;
GO
IF COL_LENGTH(N'integration.SyncBatch',N'ExternalBatchKey') IS NULL
  ALTER TABLE integration.SyncBatch ADD ExternalBatchKey nvarchar(160) NULL, SourceBatchRevision decimal(20,0) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'integration.SyncBatch') AND name=N'UX_SyncBatch_ExternalKey')
  CREATE UNIQUE INDEX UX_SyncBatch_ExternalKey ON integration.SyncBatch(TenantId,ConnectorId,EntityType,ExternalBatchKey)
    WHERE ExternalBatchKey IS NOT NULL;
GO
IF COL_LENGTH(N'crm.JournalEntryMirror',N'ImportedBatchId') IS NULL
  ALTER TABLE crm.JournalEntryMirror ADD ImportedBatchId bigint NULL, SourceRevision decimal(20,0) NULL, SourcePayloadHash binary(32) NULL,
    PostingDate date NULL, SourceCreatedAtUtc datetime2(3) NULL, Description nvarchar(500) NULL,
    ExternalReference nvarchar(200) NULL, TotalDebit decimal(38,4) NULL, TotalCredit decimal(38,4) NULL;
GO
IF OBJECT_ID(N'crm.FK_JournalEntry_ImportedBatch',N'F') IS NULL
  ALTER TABLE crm.JournalEntryMirror ADD CONSTRAINT FK_JournalEntry_ImportedBatch FOREIGN KEY(ImportedBatchId) REFERENCES integration.SyncBatch(SyncBatchId);
GO
IF COL_LENGTH(N'crm.JournalLineMirror',N'ImportedBatchId') IS NULL
  ALTER TABLE crm.JournalLineMirror ADD ImportedBatchId bigint NULL, SourceLineNumber int NULL,
    OriginalCurrencyCode char(3) NULL, OriginalCurrencyAmount decimal(19,4) NULL, SourceExchangeRate decimal(19,8) NULL;
GO
IF OBJECT_ID(N'crm.FK_JournalLine_ImportedBatch',N'F') IS NULL
  ALTER TABLE crm.JournalLineMirror ADD CONSTRAINT FK_JournalLine_ImportedBatch FOREIGN KEY(ImportedBatchId) REFERENCES integration.SyncBatch(SyncBatchId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'crm.JournalLineMirror') AND name=N'IX_JournalLine_Entry')
  CREATE INDEX IX_JournalLine_Entry ON crm.JournalLineMirror(TenantId,JournalEntryMirrorId) INCLUDE(ExternalJournalLineId,DebitAmount,CreditAmount,ImportedBatchId);
GO
IF COL_LENGTH(N'crm.LedgerAccountSourceMap',N'ExternalNativeId') IS NULL
  ALTER TABLE crm.LedgerAccountSourceMap ADD ExternalNativeId nvarchar(200) NULL, ExternalHierarchyKey nvarchar(60) NULL, SourceRevision decimal(20,0) NULL;
IF COL_LENGTH(N'crm.DetailAccount',N'SourceRevision') IS NULL
  ALTER TABLE crm.DetailAccount ADD SourceRevision decimal(20,0) NULL;
IF COL_LENGTH(N'crm.DetailGroup',N'SourceRevision') IS NULL
  ALTER TABLE crm.DetailGroup ADD SourceRevision decimal(20,0) NULL;
IF COL_LENGTH(N'crm.FiscalPeriod',N'SourceRevision') IS NULL
  ALTER TABLE crm.FiscalPeriod ADD SourceRevision decimal(20,0) NULL;
GO
IF COL_LENGTH(N'crm.DetailSubsidiaryLink',N'SourceRevision') IS NULL
  ALTER TABLE crm.DetailSubsidiaryLink ADD SourceRevision decimal(20,0) NULL, SourceEffectiveFrom date NULL, SourceEffectiveTo date NULL,
    SourceIsActive bit NOT NULL CONSTRAINT DF_DSL_Active DEFAULT 1;
GO
