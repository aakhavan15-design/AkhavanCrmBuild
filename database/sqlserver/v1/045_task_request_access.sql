/* Managed requests use sync.EntityStore.tasks, existing role grants and append-only security.AuditEvent. */
SET XACT_ABORT ON;
GO
INSERT core.Permission (PermissionCode,Description)
SELECT p.code,p.title FROM (VALUES
 (N'tasks.request.watch',N'نظارت بر درخواست کاری مجاز'),
 (N'tasks.request.watch.assign',N'افزودن ناظر مجاز به درخواست'),
 (N'tasks.request.note',N'ثبت یادداشت مدیریتی درخواست'),
 (N'tasks.request.attachments',N'دریافت و ثبت مدارک درخواست'),
 (N'tasks.request.costs',N'مشاهدهٔ هزینه و سود در درخواست فروش'),
 (N'tasks.request.confidential',N'دسترسی به درخواست دارای محرمانگی ویژه')
) p(code,title) WHERE NOT EXISTS(SELECT 1 FROM core.Permission x WHERE x.PermissionCode=p.code);
GO
CREATE OR ALTER FUNCTION security.fn_TaskRequestGrant(
 @TenantId uniqueidentifier,@Viewer uniqueidentifier,@Permission nvarchar(120),
 @Owner uniqueidentifier,@Branch uniqueidentifier,@Territory uniqueidentifier,@Team uniqueidentifier,@Write bit
)
RETURNS TABLE WITH SCHEMABINDING AS RETURN
 SELECT TOP(1) 1 AS allowed
 FROM core.AppUser u JOIN core.UserRole ur ON ur.TenantId=u.TenantId AND ur.UserId=u.UserId
 JOIN core.RolePermission rp ON rp.TenantId=ur.TenantId AND rp.RoleId=ur.RoleId
 WHERE u.TenantId=@TenantId AND u.UserId=@Viewer AND u.IsActive=1
 AND ur.ValidFromUtc<=SYSUTCDATETIME() AND (ur.ValidToUtc IS NULL OR ur.ValidToUtc>SYSUTCDATETIME())
 AND rp.PermissionCode=@Permission AND rp.FieldCode=N'' AND (rp.FieldAccess='DO' OR (@Write=0 AND rp.FieldAccess='SEE'))
 AND (rp.ScopeCode='ORG' OR (rp.ScopeCode='OWNER' AND @Owner=u.UserId)
  OR (rp.ScopeCode='BRANCH' AND @Branch=u.BranchId) OR (rp.ScopeCode='TERRITORY' AND @Territory=u.TerritoryId)
  OR (rp.ScopeCode='TEAM' AND @Team=u.TeamId));
GO
CREATE OR ALTER FUNCTION security.fn_TaskRequestAccess(
 @TenantId uniqueidentifier,@Viewer uniqueidentifier,@Task nvarchar(max)
)
RETURNS TABLE AS RETURN
WITH actors AS (
 SELECT TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Task,'$.createdBy')) AS creator,
  TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Task,'$.assigneeId')) AS assignee,
  TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Task,'$.accountId')) AS accountId,
  JSON_VALUE(@Task,'$.managedRequest.kind') AS kind
), chain AS (
 SELECT u.UserId,u.ManagerUserId,0 AS depth
 FROM core.AppUser u CROSS JOIN actors x WHERE u.TenantId=@TenantId AND u.IsActive=1 AND u.UserId IN(x.creator,x.assignee)
 UNION ALL
 SELECT lead.UserId,lead.ManagerUserId,parent.depth+1 FROM chain parent
 JOIN core.AppUser lead ON lead.TenantId=@TenantId AND lead.UserId=parent.ManagerUserId AND lead.IsActive=1
 WHERE parent.depth<15 AND lead.UserId<>parent.UserId
)
SELECT grants.isCreator,grants.isAssignee,grants.isManager,grants.isWatcher,grants.canAct,grants.canDecide,grants.canWatch,grants.canNote,grants.canFiles,grants.canUpload
FROM actors x JOIN core.AppUser viewer ON viewer.TenantId=@TenantId AND viewer.UserId=@Viewer AND viewer.IsActive=1
LEFT JOIN crm.Account a ON a.TenantId=@TenantId AND a.AccountId=x.accountId
LEFT JOIN core.AppUser assignee ON assignee.TenantId=@TenantId AND assignee.UserId=x.assignee
CROSS APPLY (VALUES (
 CASE WHEN a.AccountId IS NULL THEN x.assignee ELSE a.OwnerUserId END,
 CASE WHEN a.AccountId IS NULL THEN assignee.BranchId ELSE a.BranchId END,
 CASE WHEN a.AccountId IS NULL THEN assignee.TerritoryId ELSE a.TerritoryId END,
 CASE WHEN a.AccountId IS NULL THEN assignee.TeamId ELSE a.TeamId END
)) scope(ownerId,branchId,territoryId,teamId)
CROSS APPLY (SELECT
 CAST(CASE WHEN x.creator=@Viewer THEN 1 ELSE 0 END AS bit) AS isCreator,
 CAST(CASE WHEN x.assignee=@Viewer THEN 1 ELSE 0 END AS bit) AS isAssignee,
 CAST(CASE WHEN EXISTS(SELECT 1 FROM chain c WHERE c.depth>0 AND c.UserId=@Viewer)
  OR EXISTS(SELECT 1 FROM security.fn_TaskRequestGrant(@TenantId,@Viewer,N'tasks.view',NULL,NULL,NULL,NULL,0))
  THEN 1 ELSE 0 END AS bit) AS isManager,
 CAST(CASE WHEN EXISTS(
    SELECT 1 FROM OPENJSON(@Task,'$.managedRequest.watchers') w WHERE TRY_CONVERT(uniqueidentifier,w.value)=@Viewer
  ) AND EXISTS(SELECT 1 FROM security.fn_TaskRequestGrant(@TenantId,@Viewer,N'tasks.request.watch',scope.ownerId,scope.branchId,scope.territoryId,scope.teamId,0))
  THEN 1 ELSE 0 END AS bit) AS isWatcher,
 CAST(CASE WHEN x.assignee=@Viewer AND EXISTS(SELECT 1 FROM (VALUES(N'tasks.edit'),(N'accounts.edit'),(N'internal.manage')) p(code)
  CROSS APPLY security.fn_TaskRequestGrant(@TenantId,@Viewer,p.code,viewer.UserId,viewer.BranchId,viewer.TerritoryId,viewer.TeamId,1))
  THEN 1 ELSE 0 END AS bit) AS canAct,
 CAST(CASE WHEN x.creator<>@Viewer AND EXISTS(
  SELECT 1 FROM security.fn_TaskRequestGrant(@TenantId,@Viewer,
    CASE WHEN x.kind='FINANCE' THEN N'finance.manage' ELSE N'quotes.approve' END,
    scope.ownerId,scope.branchId,scope.territoryId,scope.teamId,1))
  THEN 1 ELSE 0 END AS bit) AS canDecide,
 CAST(CASE WHEN EXISTS(SELECT 1 FROM security.fn_TaskRequestGrant(@TenantId,@Viewer,N'tasks.request.watch.assign',scope.ownerId,scope.branchId,scope.territoryId,scope.teamId,1))
  THEN 1 ELSE 0 END AS bit) AS canWatch,
 CAST(CASE WHEN EXISTS(SELECT 1 FROM security.fn_TaskRequestGrant(@TenantId,@Viewer,N'tasks.request.note',scope.ownerId,scope.branchId,scope.territoryId,scope.teamId,1))
  THEN 1 ELSE 0 END AS bit) AS canNote,
 CAST(CASE WHEN EXISTS(SELECT 1 FROM security.fn_TaskRequestGrant(@TenantId,@Viewer,N'tasks.request.attachments',scope.ownerId,scope.branchId,scope.territoryId,scope.teamId,0))
  THEN 1 ELSE 0 END AS bit) AS canFiles,
 CAST(CASE WHEN EXISTS(SELECT 1 FROM security.fn_TaskRequestGrant(@TenantId,@Viewer,N'tasks.request.attachments',scope.ownerId,scope.branchId,scope.territoryId,scope.teamId,1))
  THEN 1 ELSE 0 END AS bit) AS canUpload
) grants
WHERE x.kind IN('GENERAL','PRICE_INQUIRY','PRICE_PERMISSION','ORDER_APPROVAL','FINANCE','COLLECTION','COMMERCE','HR')
 AND (x.accountId IS NULL OR (a.AccountId IS NOT NULL AND EXISTS(
   SELECT 1 FROM security.fn_TaskRequestGrant(@TenantId,@Viewer,N'accounts.view',a.OwnerUserId,a.BranchId,a.TerritoryId,a.TeamId,0))))
 AND EXISTS(SELECT 1 FROM (VALUES(N'tasks.view'),(N'accounts.view'),(N'internal.view'),(N'internal.manage')) p(code)
   CROSS APPLY security.fn_TaskRequestGrant(@TenantId,@Viewer,p.code,viewer.UserId,viewer.BranchId,viewer.TerritoryId,viewer.TeamId,0))
 AND (x.kind NOT IN('FINANCE','COLLECTION','PRICE_INQUIRY','PRICE_PERMISSION','ORDER_APPROVAL','HR') OR EXISTS(
   SELECT 1 FROM security.fn_TaskRequestGrant(@TenantId,@Viewer,CASE WHEN x.kind IN('FINANCE','COLLECTION') THEN N'finance.view'
     WHEN x.kind='HR' THEN N'internal.manage' ELSE N'quotes.view' END,scope.ownerId,scope.branchId,scope.territoryId,scope.teamId,0)))
 AND (NOT EXISTS(SELECT 1 FROM OPENJSON(@Task,'$.managedRequest.links') WITH(type varchar(20)) l WHERE l.type IN('INVOICE','CHEQUE'))
  OR EXISTS(SELECT 1 FROM security.fn_TaskRequestGrant(@TenantId,@Viewer,N'finance.view',scope.ownerId,scope.branchId,scope.territoryId,scope.teamId,0)))
 AND (ISNULL(JSON_VALUE(@Task,'$.managedRequest.confidential'),N'false')<>N'true' OR EXISTS(
   SELECT 1 FROM security.fn_TaskRequestGrant(@TenantId,@Viewer,N'tasks.request.confidential',scope.ownerId,scope.branchId,scope.territoryId,scope.teamId,0)))
 AND (grants.isCreator=1 OR grants.isAssignee=1 OR grants.isManager=1 OR grants.isWatcher=1 OR
  (grants.canDecide=1 AND EXISTS(SELECT 1 FROM OPENJSON(@Task,'$.managedRequest.activeApprovers') m
    WHERE TRY_CONVERT(uniqueidentifier,m.value)=@Viewer)));
GO
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'security.AuditEvent') AND name=N'IX_TaskRequestCommands')
 CREATE INDEX IX_TaskRequestCommands ON security.AuditEvent(TenantId,EventType,EntityId,CorrelationId);
GO
