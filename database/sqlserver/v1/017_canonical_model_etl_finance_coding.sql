/*
  AKHAVAN CRM — 017: canonical reference model, ETL control plane, accounting coding, GL mirror,
  cheque / cost / inventory-snapshot / returns / delivery / visit / target records.
  ADDITIVE ONLY: extends 001..016 (reuses integration.RawRecord, ExternalIdentityMap, FieldOwnership,
  crm.*Mirror, crm.DispatchPlan). No parallel engine, no duplicate balance table.
  Run after 001..016 on a disposable database first. NOT executed in the authoring environment (no SQL Server).
  Principle: CRM stores only what an approved report/feature needs (see docs/16_DATA_ARCHITECTURE_ETL_FA.md §3).
*/
SET XACT_ABORT ON;
GO
/* ---------- A. ETL control plane (extends integration.*) ---------- */
IF OBJECT_ID(N'integration.SyncBatch',N'U') IS NULL
CREATE TABLE integration.SyncBatch (
 SyncBatchId bigint IDENTITY(1,1) NOT NULL, TenantId uniqueidentifier NOT NULL, ConnectorId uniqueidentifier NOT NULL, ConnectorRunId bigint NULL,
 SourceSystemCode varchar(40) NOT NULL, EntityType nvarchar(80) NOT NULL, ModeCode varchar(20) NOT NULL, WindowFromUtc datetime2(3) NULL, WindowToUtc datetime2(3) NULL,
 StatusCode varchar(20) NOT NULL CONSTRAINT DF_SyncBatch_Status DEFAULT 'RUNNING',
 ReceivedCount int NOT NULL CONSTRAINT DF_SyncBatch_R DEFAULT 0, ValidCount int NOT NULL CONSTRAINT DF_SyncBatch_V DEFAULT 0, RejectedCount int NOT NULL CONSTRAINT DF_SyncBatch_Rj DEFAULT 0,
 DuplicateCount int NOT NULL CONSTRAINT DF_SyncBatch_D DEFAULT 0, InsertedCount int NOT NULL CONSTRAINT DF_SyncBatch_I DEFAULT 0, UpdatedCount int NOT NULL CONSTRAINT DF_SyncBatch_U DEFAULT 0, SkippedStaleCount int NOT NULL CONSTRAINT DF_SyncBatch_S DEFAULT 0,
 StartedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_SyncBatch_Start DEFAULT SYSUTCDATETIME(), FinishedAtUtc datetime2(3) NULL,
 CONSTRAINT PK_SyncBatch PRIMARY KEY(SyncBatchId), CONSTRAINT FK_SyncBatch_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
 CONSTRAINT FK_SyncBatch_Connector FOREIGN KEY(ConnectorId) REFERENCES integration.Connector(ConnectorId), CONSTRAINT FK_SyncBatch_Run FOREIGN KEY(ConnectorRunId) REFERENCES integration.ConnectorRun(ConnectorRunId),
 CONSTRAINT CK_SyncBatch_Mode CHECK(ModeCode IN ('FULL','INCREMENTAL','ONLINE','REPLAY')), CONSTRAINT CK_SyncBatch_Status CHECK(StatusCode IN ('RUNNING','SUCCEEDED','PARTIAL','FAILED','CANCELLED')),
 CONSTRAINT CK_SyncBatch_Window CHECK(WindowToUtc IS NULL OR WindowFromUtc IS NULL OR WindowToUtc>=WindowFromUtc)
);
GO
IF OBJECT_ID(N'integration.SyncCheckpoint',N'U') IS NULL
CREATE TABLE integration.SyncCheckpoint (
 TenantId uniqueidentifier NOT NULL, ConnectorId uniqueidentifier NOT NULL, EntityType nvarchar(80) NOT NULL, WatermarkUtc datetime2(3) NULL, LastExternalId nvarchar(200) NULL,
 LastSuccessfulBatchId bigint NULL, UpdatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_SyncCheckpoint_Upd DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_SyncCheckpoint PRIMARY KEY(TenantId,ConnectorId,EntityType), CONSTRAINT FK_SyncCheckpoint_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
 CONSTRAINT FK_SyncCheckpoint_Connector FOREIGN KEY(ConnectorId) REFERENCES integration.Connector(ConnectorId), CONSTRAINT FK_SyncCheckpoint_Batch FOREIGN KEY(LastSuccessfulBatchId) REFERENCES integration.SyncBatch(SyncBatchId)
);
GO
/* RawRecord gains batch lineage + replay-safe dedupe: re-running the same payload cannot create a second raw row. */
IF COL_LENGTH(N'integration.RawRecord',N'SyncBatchId') IS NULL ALTER TABLE integration.RawRecord ADD SyncBatchId bigint NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_RawRecord_Batch') ALTER TABLE integration.RawRecord ADD CONSTRAINT FK_RawRecord_Batch FOREIGN KEY(SyncBatchId) REFERENCES integration.SyncBatch(SyncBatchId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'integration.RawRecord') AND name=N'UX_RawRecord_Replay')
 CREATE UNIQUE INDEX UX_RawRecord_Replay ON integration.RawRecord(TenantId,SourceSystemCode,EntityType,ExternalRecordId,PayloadHash) WHERE PayloadHash IS NOT NULL;
GO
IF OBJECT_ID(N'integration.StagingRejection',N'U') IS NULL
CREATE TABLE integration.StagingRejection (
 StagingRejectionId bigint IDENTITY(1,1) NOT NULL, TenantId uniqueidentifier NOT NULL, SyncBatchId bigint NOT NULL, RawRecordId bigint NULL, EntityType nvarchar(80) NOT NULL, ExternalRecordId nvarchar(200) NULL,
 RuleCode varchar(80) NOT NULL, SeverityCode varchar(10) NOT NULL, MessageFa nvarchar(500) NOT NULL, IsResolved bit NOT NULL CONSTRAINT DF_Rej_Res DEFAULT 0,
 CreatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_Rej_Created DEFAULT SYSUTCDATETIME(), ResolvedAtUtc datetime2(3) NULL,
 CONSTRAINT PK_StagingRejection PRIMARY KEY(StagingRejectionId), CONSTRAINT FK_Rej_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId), CONSTRAINT FK_Rej_Batch FOREIGN KEY(SyncBatchId) REFERENCES integration.SyncBatch(SyncBatchId),
 CONSTRAINT FK_Rej_Raw FOREIGN KEY(RawRecordId) REFERENCES integration.RawRecord(RawRecordId), CONSTRAINT CK_Rej_Severity CHECK(SeverityCode IN ('ERROR','WARNING'))
);
CREATE INDEX IX_Rej_Open ON integration.StagingRejection(TenantId,IsResolved,RuleCode);
GO
/* Generic mapping of source codes (customer class, product group, brand, payment method, status...) to CRM standard codes. */
IF OBJECT_ID(N'integration.CodeMapping',N'U') IS NULL
CREATE TABLE integration.CodeMapping (
 CodeMappingId bigint IDENTITY(1,1) NOT NULL, TenantId uniqueidentifier NOT NULL, SourceSystemCode varchar(40) NOT NULL, MappingDomain varchar(40) NOT NULL, ExternalCode nvarchar(200) NOT NULL,
 StandardCode nvarchar(120) NULL, MapStatus varchar(20) NOT NULL CONSTRAINT DF_CodeMap_Status DEFAULT 'UNMAPPED', EffectiveFrom date NOT NULL CONSTRAINT DF_CodeMap_From DEFAULT CONVERT(date,SYSUTCDATETIME()), EffectiveTo date NULL,
 ApprovedByUserId uniqueidentifier NULL, UpdatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_CodeMap_Upd DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_CodeMapping PRIMARY KEY(CodeMappingId), CONSTRAINT FK_CodeMap_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId), CONSTRAINT FK_CodeMap_User FOREIGN KEY(ApprovedByUserId) REFERENCES core.AppUser(UserId),
 CONSTRAINT UQ_CodeMapping UNIQUE(TenantId,SourceSystemCode,MappingDomain,ExternalCode,EffectiveFrom), CONSTRAINT CK_CodeMap_Status CHECK(MapStatus IN ('UNMAPPED','MAPPED','APPROVED','REJECTED')),
 CONSTRAINT CK_CodeMap_Std CHECK(MapStatus='UNMAPPED' OR StandardCode IS NOT NULL), CONSTRAINT CK_CodeMap_Dates CHECK(EffectiveTo IS NULL OR EffectiveTo>=EffectiveFrom)
);
GO
/* Control-total reconciliation: CRM-side value vs value reported by the source for the same grain/date. */
IF OBJECT_ID(N'integration.ReconciliationRun',N'U') IS NULL
CREATE TABLE integration.ReconciliationRun (
 ReconciliationRunId bigint IDENTITY(1,1) NOT NULL, TenantId uniqueidentifier NOT NULL, SourceSystemCode varchar(40) NOT NULL, MetricCode varchar(100) NOT NULL, AsOfDate date NOT NULL,
 CrmValue decimal(19,4) NULL, SourceValue decimal(19,4) NULL, DeltaValue AS (CrmValue-SourceValue) PERSISTED, ToleranceValue decimal(19,4) NOT NULL CONSTRAINT DF_Recon_Tol DEFAULT 0,
 StatusCode varchar(20) NOT NULL, SyncBatchId bigint NULL, CreatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_Recon_Created DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_ReconciliationRun PRIMARY KEY(ReconciliationRunId), CONSTRAINT FK_Recon_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId), CONSTRAINT FK_Recon_Batch FOREIGN KEY(SyncBatchId) REFERENCES integration.SyncBatch(SyncBatchId),
 CONSTRAINT CK_Recon_Status CHECK(StatusCode IN ('MATCHED','MISMATCH','SOURCE_UNAVAILABLE','NOT_COMPARABLE')), CONSTRAINT CK_Recon_Tol CHECK(ToleranceValue>=0)
);
CREATE INDEX IX_Recon_Latest ON integration.ReconciliationRun(TenantId,SourceSystemCode,MetricCode,AsOfDate DESC);
GO
/* ---------- B. Reference dimensions (single master; documents keep snapshots) ---------- */
IF OBJECT_ID(N'crm.ProductBrand',N'U') IS NULL
CREATE TABLE crm.ProductBrand (BrandId uniqueidentifier NOT NULL CONSTRAINT DF_Brand_Id DEFAULT NEWSEQUENTIALID(), TenantId uniqueidentifier NOT NULL, BrandCode nvarchar(80) NOT NULL, BrandName nvarchar(200) NOT NULL, IsActive bit NOT NULL CONSTRAINT DF_Brand_Active DEFAULT 1,
 CONSTRAINT PK_ProductBrand PRIMARY KEY(BrandId), CONSTRAINT FK_Brand_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId), CONSTRAINT UQ_Brand_Code UNIQUE(TenantId,BrandCode));
IF OBJECT_ID(N'crm.ProductGroup',N'U') IS NULL
CREATE TABLE crm.ProductGroup (ProductGroupId uniqueidentifier NOT NULL CONSTRAINT DF_PGroup_Id DEFAULT NEWSEQUENTIALID(), TenantId uniqueidentifier NOT NULL, GroupCode nvarchar(80) NOT NULL, GroupName nvarchar(200) NOT NULL, ParentGroupId uniqueidentifier NULL, IsActive bit NOT NULL CONSTRAINT DF_PGroup_Active DEFAULT 1,
 CONSTRAINT PK_ProductGroup PRIMARY KEY(ProductGroupId), CONSTRAINT FK_PGroup_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId), CONSTRAINT FK_PGroup_Parent FOREIGN KEY(ParentGroupId) REFERENCES crm.ProductGroup(ProductGroupId), CONSTRAINT UQ_PGroup_Code UNIQUE(TenantId,GroupCode));
GO
IF COL_LENGTH(N'crm.ExternalProduct',N'BrandId') IS NULL ALTER TABLE crm.ExternalProduct ADD BrandId uniqueidentifier NULL, ProductGroupId uniqueidentifier NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_ExternalProduct_Brand') ALTER TABLE crm.ExternalProduct ADD CONSTRAINT FK_ExternalProduct_Brand FOREIGN KEY(BrandId) REFERENCES crm.ProductBrand(BrandId);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_ExternalProduct_Group') ALTER TABLE crm.ExternalProduct ADD CONSTRAINT FK_ExternalProduct_Group FOREIGN KEY(ProductGroupId) REFERENCES crm.ProductGroup(ProductGroupId);
GO
/* ---------- C. Accounting coding: CRM-standard hierarchy + per-source mapping ---------- */
IF OBJECT_ID(N'analytics.ExpenseCategory',N'U') IS NULL
CREATE TABLE analytics.ExpenseCategory (TenantId uniqueidentifier NOT NULL, CategoryCode varchar(40) NOT NULL, TitleFa nvarchar(120) NOT NULL, SortOrder smallint NOT NULL CONSTRAINT DF_ExpCat_Sort DEFAULT 0, IsFixedCost bit NULL,
 CONSTRAINT PK_ExpenseCategory PRIMARY KEY(TenantId,CategoryCode), CONSTRAINT FK_ExpCat_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId));
GO
IF OBJECT_ID(N'crm.LedgerAccount',N'U') IS NULL
CREATE TABLE crm.LedgerAccount (
 LedgerAccountId uniqueidentifier NOT NULL CONSTRAINT DF_Ledger_Id DEFAULT NEWSEQUENTIALID(), TenantId uniqueidentifier NOT NULL, AccountCode nvarchar(60) NOT NULL, TitleFa nvarchar(250) NOT NULL,
 ParentLedgerAccountId uniqueidentifier NULL, LevelCode varchar(12) NOT NULL, LevelNo tinyint NOT NULL, NatureCode varchar(6) NOT NULL, ReportBucketCode varchar(40) NULL, ExpenseCategoryCode varchar(40) NULL,
 IsPostable bit NOT NULL CONSTRAINT DF_Ledger_Post DEFAULT 0, IsActive bit NOT NULL CONSTRAINT DF_Ledger_Active DEFAULT 1,
 CONSTRAINT PK_LedgerAccount PRIMARY KEY(LedgerAccountId), CONSTRAINT FK_Ledger_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId), CONSTRAINT FK_Ledger_Parent FOREIGN KEY(ParentLedgerAccountId) REFERENCES crm.LedgerAccount(LedgerAccountId),
 CONSTRAINT FK_Ledger_ExpCat FOREIGN KEY(TenantId,ExpenseCategoryCode) REFERENCES analytics.ExpenseCategory(TenantId,CategoryCode), CONSTRAINT UQ_Ledger_Code UNIQUE(TenantId,AccountCode),
 CONSTRAINT CK_Ledger_Level CHECK(LevelCode IN ('GROUP','GENERAL','SUBSIDIARY','DETAIL','EXTRA')), CONSTRAINT CK_Ledger_LevelNo CHECK(LevelNo BETWEEN 1 AND 9), CONSTRAINT CK_Ledger_Nature CHECK(NatureCode IN ('DEBIT','CREDIT'))
);
GO
IF OBJECT_ID(N'crm.LedgerAccountSourceMap',N'U') IS NULL
CREATE TABLE crm.LedgerAccountSourceMap (
 LedgerAccountSourceMapId bigint IDENTITY(1,1) NOT NULL, TenantId uniqueidentifier NOT NULL, SourceSystemCode varchar(40) NOT NULL, ExternalAccountCode nvarchar(120) NOT NULL, ExternalAccountTitle nvarchar(250) NULL,
 ExternalLevelNo tinyint NULL, LedgerAccountId uniqueidentifier NULL, MapStatus varchar(20) NOT NULL CONSTRAINT DF_LSM_Status DEFAULT 'UNMAPPED', EffectiveFrom date NOT NULL CONSTRAINT DF_LSM_From DEFAULT CONVERT(date,SYSUTCDATETIME()), EffectiveTo date NULL,
 CONSTRAINT PK_LedgerAccountSourceMap PRIMARY KEY(LedgerAccountSourceMapId), CONSTRAINT FK_LSM_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId), CONSTRAINT FK_LSM_Ledger FOREIGN KEY(LedgerAccountId) REFERENCES crm.LedgerAccount(LedgerAccountId),
 CONSTRAINT UQ_LSM UNIQUE(TenantId,SourceSystemCode,ExternalAccountCode,EffectiveFrom), CONSTRAINT CK_LSM_Status CHECK(MapStatus IN ('UNMAPPED','MAPPED','APPROVED','REJECTED')), CONSTRAINT CK_LSM_Target CHECK(MapStatus='UNMAPPED' OR LedgerAccountId IS NOT NULL)
);
GO
/* ---------- D. Accounting documents (read-only mirrors of the official ledger; CRM never creates them) ---------- */
IF OBJECT_ID(N'crm.JournalEntryMirror',N'U') IS NULL
CREATE TABLE crm.JournalEntryMirror (
 JournalEntryMirrorId uniqueidentifier NOT NULL CONSTRAINT DF_JE_Id DEFAULT NEWSEQUENTIALID(), TenantId uniqueidentifier NOT NULL, SourceSystemCode varchar(40) NOT NULL, ExternalJournalId nvarchar(200) NOT NULL,
 DocumentNumber nvarchar(100) NOT NULL, DocumentDate date NOT NULL, DocumentTypeCode varchar(40) NOT NULL, StatusCode varchar(30) NOT NULL, IsVoided bit NOT NULL CONSTRAINT DF_JE_Void DEFAULT 0, CurrencyCode char(3) NOT NULL CONSTRAINT DF_JE_Cur DEFAULT 'IRR',
 SourceModifiedAtUtc datetime2(3) NULL, SyncedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_JE_Sync DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_JournalEntryMirror PRIMARY KEY(JournalEntryMirrorId), CONSTRAINT FK_JE_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId), CONSTRAINT UQ_JE_Source UNIQUE(TenantId,SourceSystemCode,ExternalJournalId)
);
CREATE INDEX IX_JE_Date ON crm.JournalEntryMirror(TenantId,DocumentDate) INCLUDE(StatusCode,IsVoided);
IF OBJECT_ID(N'crm.JournalLineMirror',N'U') IS NULL
CREATE TABLE crm.JournalLineMirror (
 JournalLineMirrorId uniqueidentifier NOT NULL CONSTRAINT DF_JL_Id DEFAULT NEWSEQUENTIALID(), TenantId uniqueidentifier NOT NULL, SourceSystemCode varchar(40) NOT NULL, ExternalJournalLineId nvarchar(200) NOT NULL,
 JournalEntryMirrorId uniqueidentifier NOT NULL, ExternalAccountCode nvarchar(120) NOT NULL, LedgerAccountId uniqueidentifier NULL, AccountId uniqueidentifier NULL, ExternalDetailCode nvarchar(120) NULL,
 DebitAmount decimal(19,4) NOT NULL CONSTRAINT DF_JL_Dr DEFAULT 0, CreditAmount decimal(19,4) NOT NULL CONSTRAINT DF_JL_Cr DEFAULT 0, Description nvarchar(500) NULL,
 RefDocumentTypeCode varchar(40) NULL, RefExternalDocumentId nvarchar(200) NULL, SourceModifiedAtUtc datetime2(3) NULL, SyncedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_JL_Sync DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_JournalLineMirror PRIMARY KEY(JournalLineMirrorId), CONSTRAINT FK_JL_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId), CONSTRAINT FK_JL_Entry FOREIGN KEY(JournalEntryMirrorId) REFERENCES crm.JournalEntryMirror(JournalEntryMirrorId),
 CONSTRAINT FK_JL_Ledger FOREIGN KEY(LedgerAccountId) REFERENCES crm.LedgerAccount(LedgerAccountId), CONSTRAINT FK_JL_Account FOREIGN KEY(AccountId) REFERENCES crm.Account(AccountId), CONSTRAINT UQ_JL_Source UNIQUE(TenantId,SourceSystemCode,ExternalJournalLineId),
 CONSTRAINT CK_JL_Amounts CHECK(DebitAmount>=0 AND CreditAmount>=0 AND NOT(DebitAmount>0 AND CreditAmount>0))
);
CREATE INDEX IX_JL_Ledger ON crm.JournalLineMirror(TenantId,LedgerAccountId) INCLUDE(DebitAmount,CreditAmount,JournalEntryMirrorId);
GO
IF OBJECT_ID(N'crm.ChequeMirror',N'U') IS NULL
CREATE TABLE crm.ChequeMirror (
 ChequeMirrorId uniqueidentifier NOT NULL CONSTRAINT DF_Chq_Id DEFAULT NEWSEQUENTIALID(), TenantId uniqueidentifier NOT NULL, SourceSystemCode varchar(40) NOT NULL, ExternalChequeId nvarchar(200) NOT NULL,
 DirectionCode varchar(12) NOT NULL, ChequeNumber nvarchar(80) NOT NULL, BankName nvarchar(120) NULL, ExternalAccountId nvarchar(200) NULL, AccountId uniqueidentifier NULL, PaymentMirrorId uniqueidentifier NULL,
 Amount decimal(19,4) NOT NULL, DueDate date NOT NULL, StatusCode varchar(30) NOT NULL, IsGuarantee bit NOT NULL CONSTRAINT DF_Chq_Guar DEFAULT 0, IsVoided bit NOT NULL CONSTRAINT DF_Chq_Void DEFAULT 0, IsBounced bit NOT NULL CONSTRAINT DF_Chq_Bounce DEFAULT 0,
 SourceModifiedAtUtc datetime2(3) NULL, SyncedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_Chq_Sync DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_ChequeMirror PRIMARY KEY(ChequeMirrorId), CONSTRAINT FK_Chq_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId), CONSTRAINT FK_Chq_Account FOREIGN KEY(AccountId) REFERENCES crm.Account(AccountId), CONSTRAINT FK_Chq_Payment FOREIGN KEY(PaymentMirrorId) REFERENCES crm.PaymentMirror(PaymentMirrorId),
 CONSTRAINT UQ_Chq_Source UNIQUE(TenantId,SourceSystemCode,ExternalChequeId), CONSTRAINT CK_Chq_Dir CHECK(DirectionCode IN ('RECEIVED','ISSUED')), CONSTRAINT CK_Chq_Amount CHECK(Amount>0)
);
CREATE INDEX IX_Chq_Due ON crm.ChequeMirror(TenantId,DirectionCode,DueDate) INCLUDE(Amount,StatusCode,IsGuarantee,IsVoided);
GO
/* Cost of goods comes only from the cost/accounting source. Unknown cost stays NULL/absent — never estimated. */
IF OBJECT_ID(N'crm.ProductCostMirror',N'U') IS NULL
CREATE TABLE crm.ProductCostMirror (
 ProductCostMirrorId bigint IDENTITY(1,1) NOT NULL, TenantId uniqueidentifier NOT NULL, SourceSystemCode varchar(40) NOT NULL, ExternalProductId nvarchar(200) NOT NULL, EffectiveFrom date NOT NULL, EffectiveTo date NULL,
 UnitCost decimal(19,4) NOT NULL, CostMethodCode varchar(30) NOT NULL, SourceModifiedAtUtc datetime2(3) NULL, SyncedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_PCost_Sync DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_ProductCostMirror PRIMARY KEY(ProductCostMirrorId), CONSTRAINT FK_PCost_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId), CONSTRAINT UQ_PCost UNIQUE(TenantId,SourceSystemCode,ExternalProductId,EffectiveFrom),
 CONSTRAINT CK_PCost_Method CHECK(CostMethodCode IN ('WEIGHTED_AVERAGE','FIFO','STANDARD','LAST_PURCHASE','OTHER')), CONSTRAINT CK_PCost_Val CHECK(UnitCost>=0), CONSTRAINT CK_PCost_Dates CHECK(EffectiveTo IS NULL OR EffectiveTo>=EffectiveFrom)
);
IF OBJECT_ID(N'crm.InventorySnapshotMirror',N'U') IS NULL
CREATE TABLE crm.InventorySnapshotMirror (
 InventorySnapshotMirrorId bigint IDENTITY(1,1) NOT NULL, TenantId uniqueidentifier NOT NULL, SourceSystemCode varchar(40) NOT NULL, ExternalProductId nvarchar(200) NOT NULL, WarehouseExternalId nvarchar(200) NOT NULL, AsOfDate date NOT NULL,
 QuantityOnHand decimal(19,4) NOT NULL, QuantityReserved decimal(19,4) NOT NULL CONSTRAINT DF_Inv_Res DEFAULT 0, SyncedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_Inv_Sync DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_InventorySnapshotMirror PRIMARY KEY(InventorySnapshotMirrorId), CONSTRAINT FK_Inv_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId), CONSTRAINT UQ_Inv UNIQUE(TenantId,SourceSystemCode,ExternalProductId,WarehouseExternalId,AsOfDate)
);
GO
/* ---------- E. Returns, delivery, visits, targets ---------- */
IF OBJECT_ID(N'crm.SalesReturnMirror',N'U') IS NULL
CREATE TABLE crm.SalesReturnMirror (
 SalesReturnMirrorId uniqueidentifier NOT NULL CONSTRAINT DF_SR_Id DEFAULT NEWSEQUENTIALID(), TenantId uniqueidentifier NOT NULL, SourceSystemCode varchar(40) NOT NULL, ExternalReturnId nvarchar(200) NOT NULL,
 InvoiceMirrorId uniqueidentifier NULL, AccountId uniqueidentifier NULL, ReturnDate date NOT NULL, ReasonCode varchar(60) NULL, ReasonSourceCode nvarchar(120) NULL, DriverExternalId nvarchar(200) NULL, SalesRepUserId uniqueidentifier NULL,
 TotalAmount decimal(19,4) NOT NULL, StatusCode varchar(30) NOT NULL, IsVoided bit NOT NULL CONSTRAINT DF_SR_Void DEFAULT 0, SourceModifiedAtUtc datetime2(3) NULL, SyncedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_SR_Sync DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_SalesReturnMirror PRIMARY KEY(SalesReturnMirrorId), CONSTRAINT FK_SR_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId), CONSTRAINT FK_SR_Invoice FOREIGN KEY(InvoiceMirrorId) REFERENCES crm.InvoiceMirror(InvoiceMirrorId),
 CONSTRAINT FK_SR_Account FOREIGN KEY(AccountId) REFERENCES crm.Account(AccountId), CONSTRAINT FK_SR_Rep FOREIGN KEY(SalesRepUserId) REFERENCES core.AppUser(UserId), CONSTRAINT UQ_SR_Source UNIQUE(TenantId,SourceSystemCode,ExternalReturnId), CONSTRAINT CK_SR_Total CHECK(TotalAmount>=0)
);
IF OBJECT_ID(N'crm.SalesReturnLineMirror',N'U') IS NULL
CREATE TABLE crm.SalesReturnLineMirror (
 SalesReturnLineMirrorId uniqueidentifier NOT NULL CONSTRAINT DF_SRL_Id DEFAULT NEWSEQUENTIALID(), TenantId uniqueidentifier NOT NULL, SourceSystemCode varchar(40) NOT NULL, ExternalReturnLineId nvarchar(200) NOT NULL,
 SalesReturnMirrorId uniqueidentifier NOT NULL, ExternalProductId nvarchar(200) NULL, ProductNameSnapshot nvarchar(250) NOT NULL, Quantity decimal(19,4) NOT NULL, LineAmount decimal(19,4) NOT NULL,
 CONSTRAINT PK_SalesReturnLineMirror PRIMARY KEY(SalesReturnLineMirrorId), CONSTRAINT FK_SRL_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId), CONSTRAINT FK_SRL_Return FOREIGN KEY(SalesReturnMirrorId) REFERENCES crm.SalesReturnMirror(SalesReturnMirrorId), CONSTRAINT UQ_SRL_Source UNIQUE(TenantId,SourceSystemCode,ExternalReturnLineId)
);
GO
IF OBJECT_ID(N'crm.DeliveryEventMirror',N'U') IS NULL
CREATE TABLE crm.DeliveryEventMirror (
 DeliveryEventMirrorId uniqueidentifier NOT NULL CONSTRAINT DF_DE_Id DEFAULT NEWSEQUENTIALID(), TenantId uniqueidentifier NOT NULL, SourceSystemCode varchar(40) NOT NULL, ExternalDeliveryId nvarchar(200) NOT NULL,
 InvoiceMirrorId uniqueidentifier NOT NULL, DispatchPlanId uniqueidentifier NULL, VehicleExternalId nvarchar(200) NULL, DriverExternalId nvarchar(200) NULL, PromisedAtUtc datetime2(3) NULL,
 LoadedAtUtc datetime2(3) NULL, ShippedAtUtc datetime2(3) NULL, DeliveredAtUtc datetime2(3) NULL, DeliveryStatusCode varchar(20) NOT NULL, ExceptionReasonCode varchar(60) NULL,
 Latitude decimal(9,6) NULL, Longitude decimal(9,6) NULL, LocationSourceCode varchar(12) NULL, SourceModifiedAtUtc datetime2(3) NULL, SyncedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_DE_Sync DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_DeliveryEventMirror PRIMARY KEY(DeliveryEventMirrorId), CONSTRAINT FK_DE_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId), CONSTRAINT FK_DE_Invoice FOREIGN KEY(InvoiceMirrorId) REFERENCES crm.InvoiceMirror(InvoiceMirrorId), CONSTRAINT FK_DE_Plan FOREIGN KEY(DispatchPlanId) REFERENCES crm.DispatchPlan(DispatchPlanId),
 CONSTRAINT UQ_DE_Source UNIQUE(TenantId,SourceSystemCode,ExternalDeliveryId), CONSTRAINT CK_DE_Status CHECK(DeliveryStatusCode IN ('READY','LOADED','SHIPPED','DELIVERED_FULL','DELIVERED_PARTIAL','FAILED','RETURNED')),
 CONSTRAINT CK_DE_Loc CHECK(LocationSourceCode IS NULL OR LocationSourceCode IN ('GPS','MANUAL','APPROX')), CONSTRAINT CK_DE_Lat CHECK(Latitude IS NULL OR Latitude BETWEEN -90 AND 90), CONSTRAINT CK_DE_Lng CHECK(Longitude IS NULL OR Longitude BETWEEN -180 AND 180)
);
GO
/* Field visit: CRM/app-owned. GPS vs manual vs approximate location are distinguishable (spec §23.3). */
IF OBJECT_ID(N'crm.Visit',N'U') IS NULL
CREATE TABLE crm.Visit (
 VisitId uniqueidentifier NOT NULL CONSTRAINT DF_Visit_Id DEFAULT NEWSEQUENTIALID(), TenantId uniqueidentifier NOT NULL, AccountId uniqueidentifier NOT NULL, VisitorUserId uniqueidentifier NOT NULL,
 PlannedAtUtc datetime2(3) NULL, CheckInAtUtc datetime2(3) NULL, CheckOutAtUtc datetime2(3) NULL, Latitude decimal(9,6) NULL, Longitude decimal(9,6) NULL, AccuracyMeters decimal(8,2) NULL, LocationSourceCode varchar(12) NULL,
 OutcomeCode varchar(40) NULL, NoOrderReasonCode varchar(60) NULL, IsUnplanned bit NOT NULL CONSTRAINT DF_Visit_Unpl DEFAULT 0, ResultingSalesOrderId uniqueidentifier NULL, ActivityId uniqueidentifier NULL,
 CreatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_Visit_Created DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_Visit PRIMARY KEY(VisitId), CONSTRAINT FK_Visit_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId), CONSTRAINT FK_Visit_Account FOREIGN KEY(AccountId) REFERENCES crm.Account(AccountId), CONSTRAINT FK_Visit_User FOREIGN KEY(VisitorUserId) REFERENCES core.AppUser(UserId),
 CONSTRAINT FK_Visit_Order FOREIGN KEY(ResultingSalesOrderId) REFERENCES crm.SalesOrder(SalesOrderId), CONSTRAINT FK_Visit_Activity FOREIGN KEY(ActivityId) REFERENCES crm.Activity(ActivityId),
 CONSTRAINT CK_Visit_Loc CHECK(LocationSourceCode IS NULL OR LocationSourceCode IN ('GPS','MANUAL','APPROX')), CONSTRAINT CK_Visit_Times CHECK(CheckOutAtUtc IS NULL OR CheckInAtUtc IS NULL OR CheckOutAtUtc>=CheckInAtUtc),
 CONSTRAINT CK_Visit_Lat CHECK(Latitude IS NULL OR Latitude BETWEEN -90 AND 90), CONSTRAINT CK_Visit_Lng CHECK(Longitude IS NULL OR Longitude BETWEEN -180 AND 180)
);
CREATE INDEX IX_Visit_User_Day ON crm.Visit(TenantId,VisitorUserId,PlannedAtUtc) INCLUDE(AccountId,CheckInAtUtc,OutcomeCode);
GO
/* Configurable targets (spec §33: targets are settings, never constants). */
IF OBJECT_ID(N'crm.SalesTarget',N'U') IS NULL
CREATE TABLE crm.SalesTarget (
 SalesTargetId uniqueidentifier NOT NULL CONSTRAINT DF_Target_Id DEFAULT NEWSEQUENTIALID(), TenantId uniqueidentifier NOT NULL, PeriodStart date NOT NULL, PeriodEnd date NOT NULL, ScopeTypeCode varchar(20) NOT NULL,
 ScopeId uniqueidentifier NULL, KpiCode varchar(100) NOT NULL, TargetValue decimal(19,4) NOT NULL, CreatedByUserId uniqueidentifier NULL, CreatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_Target_Created DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_SalesTarget PRIMARY KEY(SalesTargetId), CONSTRAINT FK_Target_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId), CONSTRAINT FK_Target_User FOREIGN KEY(CreatedByUserId) REFERENCES core.AppUser(UserId),
 CONSTRAINT UQ_Target UNIQUE(TenantId,ScopeTypeCode,ScopeId,KpiCode,PeriodStart), CONSTRAINT CK_Target_Scope CHECK(ScopeTypeCode IN ('COMPANY','BRANCH','TEAM','USER','BRAND','PRODUCT_GROUP')),
 CONSTRAINT CK_Target_Period CHECK(PeriodEnd>=PeriodStart), CONSTRAINT CK_Target_Val CHECK(TargetValue>=0)
);
GO
/* ---------- F. Time dimension (Gregorian populated; Jalali columns filled by the app-side calendar, never guessed in SQL) ---------- */
IF OBJECT_ID(N'analytics.DimDate',N'U') IS NULL
BEGIN
 CREATE TABLE analytics.DimDate (DateKey date NOT NULL, YearNo smallint NOT NULL, MonthNo tinyint NOT NULL, DayNo tinyint NOT NULL, IsoWeekNo tinyint NOT NULL, WeekdayNo tinyint NOT NULL,
  JalaliYear smallint NULL, JalaliMonth tinyint NULL, JalaliDay tinyint NULL, IsHoliday bit NULL, CONSTRAINT PK_DimDate PRIMARY KEY(DateKey));
 ;WITH d AS (SELECT CAST('2018-01-01' AS date) AS dt UNION ALL SELECT DATEADD(day,1,dt) FROM d WHERE dt<'2040-12-31')
 INSERT analytics.DimDate(DateKey,YearNo,MonthNo,DayNo,IsoWeekNo,WeekdayNo) SELECT dt,YEAR(dt),MONTH(dt),DAY(dt),DATEPART(iso_week,dt),DATEPART(weekday,dt) FROM d OPTION (MAXRECURSION 0);
END;
GO
/* ---------- G. Tenant isolation for every new tenant-scoped table (same predicate as 006/010/014) ---------- */
IF EXISTS (SELECT 1 FROM sys.security_policies WHERE name=N'TenantIsolationPolicy' AND schema_id=SCHEMA_ID(N'security'))
BEGIN
 DECLARE @t TABLE(n sysname); INSERT @t VALUES (N'integration.SyncBatch'),(N'integration.SyncCheckpoint'),(N'integration.StagingRejection'),(N'integration.CodeMapping'),(N'integration.ReconciliationRun'),
  (N'crm.ProductBrand'),(N'crm.ProductGroup'),(N'analytics.ExpenseCategory'),(N'crm.LedgerAccount'),(N'crm.LedgerAccountSourceMap'),(N'crm.JournalEntryMirror'),(N'crm.JournalLineMirror'),(N'crm.ChequeMirror'),
  (N'crm.ProductCostMirror'),(N'crm.InventorySnapshotMirror'),(N'crm.SalesReturnMirror'),(N'crm.SalesReturnLineMirror'),(N'crm.DeliveryEventMirror'),(N'crm.Visit'),(N'crm.SalesTarget');
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
