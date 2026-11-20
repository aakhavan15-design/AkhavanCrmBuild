/* Cover the tenant-scoped latest ERP credit-note evidence lookup. */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id=OBJECT_ID(N'crm.CreditNoteMirror') AND name=N'IX_CreditNoteMirror_Evidence'
)
BEGIN
  CREATE INDEX IX_CreditNoteMirror_Evidence ON crm.CreditNoteMirror(TenantId,CreditDate DESC,CreditNoteMirrorId DESC)
    INCLUDE (InvoiceMirrorId,AccountId,SourceSystemCode,ExternalCreditNoteId,StatusCode,IsVoided);
END;
GO
