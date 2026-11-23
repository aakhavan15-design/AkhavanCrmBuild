/* AKHAVAN CRM / 055 — enrich EXISTING dispatch plan + ERP mirrors, no parallel transport table.
   This is schema-only: ERP mapping, RLS/permission and real accounting validation
   are required before the new report can be called LIVE.
*/
SET XACT_ABORT ON;
GO
IF COL_LENGTH(N'crm.DispatchPlan',N'DistributorExternalId') IS NULL
 ALTER TABLE crm.DispatchPlan ADD DistributorExternalId nvarchar(200) NULL;
IF COL_LENGTH(N'crm.InvoiceMirror',N'DispatchPlanNumber') IS NULL
 ALTER TABLE crm.InvoiceMirror ADD DispatchPlanNumber nvarchar(80) NULL;
IF COL_LENGTH(N'crm.CreditNoteMirror',N'DispatchPlanNumber') IS NULL
 ALTER TABLE crm.CreditNoteMirror ADD DispatchPlanNumber nvarchar(80) NULL;
IF COL_LENGTH(N'crm.JournalEntryMirror',N'DispatchPlanNumber') IS NULL
 ALTER TABLE crm.JournalEntryMirror ADD DispatchPlanNumber nvarchar(80) NULL;
/* Product master mirrors must expose explicit ERP supplier/brand dimensions;
   never infer a supplier from a product name. Values remain NULL until source mapping. */
IF COL_LENGTH(N'crm.ExternalProduct',N'SupplierExternalId') IS NULL
 ALTER TABLE crm.ExternalProduct ADD SupplierExternalId nvarchar(200) NULL;
IF COL_LENGTH(N'crm.ExternalProduct',N'BrandExternalId') IS NULL
 ALTER TABLE crm.ExternalProduct ADD BrandExternalId nvarchar(200) NULL;
GO
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'crm.InvoiceMirror') AND name=N'IX_Invoice_DispatchNumber')
 CREATE INDEX IX_Invoice_DispatchNumber ON crm.InvoiceMirror(TenantId,DispatchPlanNumber,InvoiceDate) INCLUDE(InvoiceMirrorId,AccountId,SalesRepExternalId);
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'crm.JournalEntryMirror') AND name=N'IX_Journal_DispatchNumber')
 CREATE INDEX IX_Journal_DispatchNumber ON crm.JournalEntryMirror(TenantId,DispatchPlanNumber,DocumentDate) INCLUDE(JournalEntryMirrorId,StatusCode,IsVoided);
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'crm.CreditNoteMirror') AND name=N'IX_CreditNote_DispatchNumber')
 CREATE INDEX IX_CreditNote_DispatchNumber ON crm.CreditNoteMirror(TenantId,DispatchPlanNumber,CreditDate) INCLUDE(InvoiceMirrorId,AccountId,Amount);
GO
/* Classification is tenant+source+COA controlled. No guessed account prefixes.
   finance administration supplies mappings; unmapped lines remain UNAVAILABLE. */
IF OBJECT_ID(N'crm.DispatchFinancialBucketMap',N'U') IS NULL
BEGIN
 CREATE TABLE crm.DispatchFinancialBucketMap(
  TenantId uniqueidentifier NOT NULL,
  SourceSystemCode varchar(40) NOT NULL,
  ExternalAccountCode nvarchar(200) NOT NULL,
  BalanceSide varchar(6) NOT NULL,
  BucketCode varchar(30) NOT NULL,
  EffectiveFrom date NOT NULL,
  EffectiveTo date NULL,
  IsActive bit NOT NULL CONSTRAINT DF_DFBM_Active DEFAULT 1,
  CreatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_DFBM_Created DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_DispatchFinancialBucketMap PRIMARY KEY(TenantId,SourceSystemCode,ExternalAccountCode,BalanceSide,EffectiveFrom),
  CONSTRAINT FK_DFBM_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
  CONSTRAINT CK_DFBM_Side CHECK(BalanceSide IN ('DEBIT','CREDIT')),
  CONSTRAINT CK_DFBM_Bucket CHECK(BucketCode IN ('CASH','CASH_DISCOUNT','INVOICE_SURCHARGE','CHEQUE','TRANSFER','CASH_REFUND')),
  CONSTRAINT CK_DFBM_Dates CHECK(EffectiveTo IS NULL OR EffectiveTo>=EffectiveFrom)
 );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_policies
 WHERE schema_id=SCHEMA_ID(N'security') AND name=N'TenantIsolationPolicy' AND is_enabled=1)
 THROW 51550, N'Dispatch financial coding requires active tenant isolation policy.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates
 WHERE target_object_id=OBJECT_ID(N'crm.DispatchFinancialBucketMap') AND predicate_type_desc=N'FILTER')
 ALTER SECURITY POLICY security.TenantIsolationPolicy
  ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.DispatchFinancialBucketMap,
  ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.DispatchFinancialBucketMap AFTER INSERT,
  ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.DispatchFinancialBucketMap AFTER UPDATE;
GO
/* Keep the existing DispatchPlanLine authoritative when present.
   Explicit invoice number remains a secondary ERP link; disagreement is a
   DATA_QUALITY_ERROR in the adapter, never a silent double count.
*/
