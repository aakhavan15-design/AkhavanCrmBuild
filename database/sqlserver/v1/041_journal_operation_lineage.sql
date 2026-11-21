/* Explicit ERP journal references. Existing operation mirrors retain ownership of their documents. */
SET XACT_ABORT ON;
GO
IF COL_LENGTH(N'crm.JournalLineDimension',N'DimensionLevel') IS NULL
  ALTER TABLE crm.JournalLineDimension ADD DimensionLevel smallint NULL;
GO
IF OBJECT_ID(N'crm.JournalSourceLink',N'U') IS NULL
BEGIN
  CREATE TABLE crm.JournalSourceLink (
    JournalSourceLinkId bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_JournalSourceLink PRIMARY KEY,
    TenantId uniqueidentifier NOT NULL, SourceSystemCode varchar(40) NOT NULL,
    JournalEntryMirrorId uniqueidentifier NOT NULL, JournalLineMirrorId uniqueidentifier NULL,
    OperationType varchar(24) NOT NULL, ExternalOperationId nvarchar(200) NOT NULL,
    ExternalOperationNumber nvarchar(120) NULL, ImportedBatchId bigint NOT NULL,
    CONSTRAINT FK_JournalSourceLink_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
    CONSTRAINT FK_JournalSourceLink_Header FOREIGN KEY(JournalEntryMirrorId) REFERENCES crm.JournalEntryMirror(JournalEntryMirrorId),
    CONSTRAINT FK_JournalSourceLink_Line FOREIGN KEY(JournalLineMirrorId) REFERENCES crm.JournalLineMirror(JournalLineMirrorId),
    CONSTRAINT FK_JournalSourceLink_Batch FOREIGN KEY(ImportedBatchId) REFERENCES integration.SyncBatch(SyncBatchId),
    CONSTRAINT CK_JournalSourceLink_Type CHECK(OperationType IN ('SALES_INVOICE','SALES_RETURN','PURCHASE_INVOICE','PURCHASE_RETURN','PAYMENT','CHEQUE','PAYROLL','INVENTORY')),
    CONSTRAINT UQ_JournalSourceLink_Operation UNIQUE(TenantId,SourceSystemCode,OperationType,ExternalOperationId,JournalEntryMirrorId,JournalLineMirrorId)
  );
  CREATE INDEX IX_JournalSourceLink_Header ON crm.JournalSourceLink(TenantId,JournalEntryMirrorId) INCLUDE(JournalLineMirrorId);
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_policies WHERE name=N'TenantIsolationPolicy' AND schema_id=SCHEMA_ID(N'security'))
  THROW 51410, N'Journal links require the existing tenant isolation policy.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates
  WHERE target_object_id=OBJECT_ID(N'crm.JournalSourceLink') AND predicate_type_desc=N'FILTER')
  ALTER SECURITY POLICY security.TenantIsolationPolicy
    ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.JournalSourceLink,
    ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.JournalSourceLink AFTER INSERT,
    ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.JournalSourceLink AFTER UPDATE;
GO
