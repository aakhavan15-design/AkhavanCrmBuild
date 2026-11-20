/*
  Protect customer partitions served by the existing JSON entity store.
  Canonical scope is read from crm.Account. For a CRM-only draft, the authenticated
  writer and claimed owner must agree. Unmapped records require an organization grant.
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
    AND rp.PermissionCode=@PermissionCode AND rp.FieldCode=N''
    AND (rp.FieldAccess='DO' OR (@PermissionCode LIKE N'%.view' AND rp.FieldAccess='SEE'))
    AND (
      rp.ScopeCode='ORG'
      OR (rp.ScopeCode='BRANCH' AND actor.BranchId=@BranchId)
      OR (rp.ScopeCode='TERRITORY' AND actor.TerritoryId=@TerritoryId)
      OR (rp.ScopeCode='TEAM' AND actor.TeamId=@TeamId)
      OR (rp.ScopeCode='OWNER' AND actor.UserId=@OwnerUserId)
    );
GO
CREATE OR ALTER FUNCTION security.fn_EntityAccountScope(
  @TenantId uniqueidentifier,
  @PermissionCode nvarchar(120),
  @EntityId nvarchar(200),
  @JsonDoc nvarchar(max),
  @WriterId uniqueidentifier
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
    WHERE account.TenantId=@TenantId AND LEN(@EntityId)=36
      AND account.AccountId=TRY_CONVERT(uniqueidentifier,@EntityId)
  ) OR EXISTS (
    SELECT 1
    FROM core.AppUser AS author
    CROSS APPLY security.fn_RecordReadScope(
      author.TenantId,@PermissionCode,author.UserId,author.BranchId,author.TerritoryId,author.TeamId
    ) AS draft_access
    WHERE author.TenantId=@TenantId AND author.UserId=@WriterId
      AND author.UserId=TRY_CONVERT(uniqueidentifier,SESSION_CONTEXT(N'UserId'))
      AND JSON_VALUE(@JsonDoc,'$.origin')=N'CRM_LOCAL'
      AND JSON_VALUE(@JsonDoc,'$.isLocalDraft')=N'true'
      AND TRY_CONVERT(uniqueidentifier,JSON_VALUE(@JsonDoc,'$.ownerId'))=author.UserId
      AND NOT EXISTS (
        SELECT 1 FROM crm.Account AS existing
        WHERE existing.TenantId=@TenantId AND LEN(@EntityId)=36
          AND existing.AccountId=TRY_CONVERT(uniqueidentifier,@EntityId)
      )
  );
GO
