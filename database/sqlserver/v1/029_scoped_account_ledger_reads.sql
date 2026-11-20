/*
  Record access for typed account and ledger projections.
  The existing tenant RLS remains in force for the underlying tables and ERP import.
  These predicates run before API queries count, page, or combine rows.
*/
SET XACT_ABORT ON;
GO
CREATE OR ALTER FUNCTION security.fn_RecordReadScope(
  @TenantId uniqueidentifier,
  @PermissionCode nvarchar(120),
  @OwnerUserId uniqueidentifier,
  @BranchId uniqueidentifier,
  @TerritoryId uniqueidentifier,
  @TeamId uniqueidentifier
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
  SELECT TOP (1) 1 AS Allowed
  FROM core.AppUser AS actor
  JOIN core.Tenant AS tenant ON tenant.TenantId=actor.TenantId AND tenant.IsActive=1
  JOIN core.UserRole AS ur ON ur.TenantId=actor.TenantId AND ur.UserId=actor.UserId
  JOIN core.RolePermission AS rp ON rp.TenantId=ur.TenantId AND rp.RoleId=ur.RoleId
  WHERE @TenantId=TRY_CONVERT(uniqueidentifier, SESSION_CONTEXT(N'TenantId'))
    AND actor.TenantId=@TenantId
    AND actor.UserId=TRY_CONVERT(uniqueidentifier, SESSION_CONTEXT(N'UserId'))
    AND actor.IsActive=1
    AND ur.ValidFromUtc<=SYSUTCDATETIME()
    AND (ur.ValidToUtc IS NULL OR ur.ValidToUtc>SYSUTCDATETIME())
    AND rp.PermissionCode=@PermissionCode AND rp.FieldCode=N'' AND rp.FieldAccess IN ('SEE','DO')
    AND (
      rp.ScopeCode='ORG'
      OR (rp.ScopeCode='BRANCH' AND actor.BranchId=@BranchId)
      OR (rp.ScopeCode='TERRITORY' AND actor.TerritoryId=@TerritoryId)
      OR (rp.ScopeCode='TEAM' AND actor.TeamId=@TeamId)
      OR (rp.ScopeCode='OWNER' AND actor.UserId=@OwnerUserId)
    );
GO
CREATE OR ALTER FUNCTION security.fn_LedgerDetailReadScope(
  @TenantId uniqueidentifier,
  @SourceSystemCode varchar(40),
  @ExternalDetailCode nvarchar(120)
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
  SELECT 1 AS Allowed
  WHERE EXISTS (
    SELECT 1 FROM security.fn_RecordReadScope(@TenantId,N'finance.view',NULL,NULL,NULL,NULL)
  ) OR EXISTS (
    SELECT 1
    FROM crm.DetailAccount AS detail
    JOIN crm.Account AS account ON account.TenantId=detail.TenantId AND account.AccountId=detail.AccountId
    CROSS APPLY security.fn_RecordReadScope(
      account.TenantId,N'finance.view',account.OwnerUserId,account.BranchId,account.TerritoryId,account.TeamId
    ) AS scope
    WHERE detail.TenantId=@TenantId AND detail.SourceSystemCode=@SourceSystemCode
      AND detail.ExternalDetailCode=@ExternalDetailCode AND detail.IsActive=1 AND detail.MapStatus='APPROVED'
  );
GO
