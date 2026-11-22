SET XACT_ABORT ON;
GO
/* Scope existing sales documents by their canonical customer. Quotes additionally
   use the assigned salesperson's live scope. Client-supplied org fields are ignored. */
CREATE OR ALTER FUNCTION security.fn_EntitySalesDocumentScope(
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
  FROM crm.Account AS account
  CROSS APPLY (VALUES (
    NULLIF(JSON_VALUE(@JsonDoc,'$.accountId'),N''),
    NULLIF(JSON_VALUE(@JsonDoc,'$.customerId'),N''),
    NULLIF(JSON_VALUE(@JsonDoc,'$.ownerId'),N'')
  )) AS ref(AccountId,CustomerId,OwnerId)
  LEFT JOIN core.AppUser AS quoteOwner ON @CollectionName=N'quotes' AND quoteOwner.TenantId=account.TenantId
    AND LEN(ref.OwnerId)=36 AND quoteOwner.UserId=TRY_CONVERT(uniqueidentifier,ref.OwnerId)
  CROSS APPLY security.fn_RecordReadScope(
    account.TenantId,N'accounts.view',account.OwnerUserId,account.BranchId,account.TerritoryId,account.TeamId
  ) AS customer_access
  CROSS APPLY security.fn_RecordReadScope(account.TenantId,@PermissionCode,
    CASE WHEN quoteOwner.UserId IS NULL THEN account.OwnerUserId ELSE quoteOwner.UserId END,
    CASE WHEN quoteOwner.UserId IS NULL THEN account.BranchId ELSE quoteOwner.BranchId END,
    CASE WHEN quoteOwner.UserId IS NULL THEN account.TerritoryId ELSE quoteOwner.TerritoryId END,
    CASE WHEN quoteOwner.UserId IS NULL THEN account.TeamId ELSE quoteOwner.TeamId END
  ) AS document_access
  WHERE @CollectionName IN(N'quotes',N'salesorders') AND account.TenantId=@TenantId AND account.DeletedAtUtc IS NULL
    AND LEN(COALESCE(ref.AccountId,ref.CustomerId))=36
    AND account.AccountId=TRY_CONVERT(uniqueidentifier,COALESCE(ref.AccountId,ref.CustomerId))
    AND (ref.AccountId IS NULL OR ref.CustomerId IS NULL OR
      (LEN(ref.CustomerId)=36 AND TRY_CONVERT(uniqueidentifier,ref.AccountId)=TRY_CONVERT(uniqueidentifier,ref.CustomerId)))
    AND (@CollectionName<>N'quotes' OR ref.OwnerId IS NULL OR quoteOwner.UserId IS NOT NULL);
GO
