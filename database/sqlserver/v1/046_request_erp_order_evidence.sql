/* The ERP invoice import may retain its official order reference. No invoice is created by the CRM review. */
SET XACT_ABORT ON;
GO
IF COL_LENGTH(N'crm.InvoiceMirror', N'ExternalSourceOrderId') IS NULL
 ALTER TABLE crm.InvoiceMirror ADD ExternalSourceOrderId nvarchar(200) NULL;
GO
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'crm.InvoiceMirror') AND name=N'IX_InvoiceMirror_ExternalOrder')
 CREATE INDEX IX_InvoiceMirror_ExternalOrder ON crm.InvoiceMirror(TenantId,SourceSystemCode,ExternalSourceOrderId)
 INCLUDE(AccountId,ExternalInvoiceId,InvoiceNumber,InvoiceDate,StatusCode,IsVoided) WHERE ExternalSourceOrderId IS NOT NULL;
GO
