/* Filter financial documents by canonical account scope before returning EntityStore data. */
SET XACT_ABORT ON;
GO
CREATE OR ALTER FUNCTION security.fn_EntityFinancialPartyScope(
  @TenantId uniqueidentifier,
  @PermissionCode nvarchar(120),
  @JsonDoc nvarchar(max)
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
  SELECT 1 AS Allowed
  WHERE EXISTS (
    SELECT 1 FROM security.fn_RecordReadScope(@TenantId,@PermissionCode,NULL,NULL,NULL,NULL)
  ) OR EXISTS (
    SELECT 1
    FROM crm.Account AS account
    CROSS APPLY security.fn_RecordReadScope(
      account.TenantId,@PermissionCode,account.OwnerUserId,account.BranchId,account.TerritoryId,account.TeamId
    ) AS record_access
    CROSS APPLY (VALUES (
      NULLIF(JSON_VALUE(@JsonDoc,'$.accountId'),N''),
      NULLIF(JSON_VALUE(@JsonDoc,'$.customerId'),N'')
    )) AS ref(AccountId,CustomerId)
    WHERE account.TenantId=@TenantId
      AND LEN(COALESCE(ref.AccountId,ref.CustomerId))=36
      AND account.AccountId=TRY_CONVERT(uniqueidentifier,COALESCE(ref.AccountId,ref.CustomerId))
      AND (ref.AccountId IS NULL OR ref.CustomerId IS NULL OR ref.AccountId=ref.CustomerId)
  );
GO
CREATE OR ALTER FUNCTION security.fn_EntityFinancialDocumentScope(
  @TenantId uniqueidentifier,
  @CollectionName nvarchar(80),
  @PermissionCode nvarchar(120),
  @JsonDoc nvarchar(max)
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
  SELECT 1 AS Allowed
  WHERE EXISTS (
    SELECT 1 FROM security.fn_RecordReadScope(@TenantId,@PermissionCode,NULL,NULL,NULL,NULL)
  ) OR (
    @CollectionName<>N'paymentallocations' AND EXISTS (
      SELECT 1 FROM security.fn_EntityFinancialPartyScope(@TenantId,@PermissionCode,@JsonDoc)
    )
  ) OR (
    @CollectionName=N'paymentallocations' AND EXISTS (
      SELECT 1
      FROM sync.EntityStore AS payment
      JOIN sync.EntityStore AS invoice ON invoice.TenantId=payment.TenantId
      CROSS APPLY security.fn_EntityFinancialPartyScope(payment.TenantId,@PermissionCode,payment.JsonDoc) AS payment_access
      CROSS APPLY security.fn_EntityFinancialPartyScope(invoice.TenantId,@PermissionCode,invoice.JsonDoc) AS invoice_access
      WHERE payment.TenantId=@TenantId AND payment.CollectionName=N'payments' AND payment.IsDeleted=0
        AND invoice.CollectionName=N'invoices' AND invoice.IsDeleted=0
        AND payment.EntityId=JSON_VALUE(@JsonDoc,'$.paymentId')
        AND invoice.EntityId=JSON_VALUE(@JsonDoc,'$.invoiceId')
    )
  );
GO
