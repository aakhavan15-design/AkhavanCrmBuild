/* Resolve the task assignee or persistent group membership before applying record scope.
   Records without a verified relationship require an organization-wide grant. */
SET XACT_ABORT ON;
GO
CREATE OR ALTER FUNCTION security.fn_TaskEntityScope(
  @TenantId uniqueidentifier, @JsonDoc nvarchar(max), @Operation varchar(6)
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
  SELECT TOP (1) 1 AS Allowed
  FROM (VALUES
    ('VIEW',N'tasks.view'),('VIEW',N'accounts.view'),('VIEW',N'internal.view'),('VIEW',N'internal.manage'),
    ('EDIT',N'tasks.edit'),('EDIT',N'accounts.edit'),('EDIT',N'leads.edit'),('EDIT',N'internal.manage'),
    ('CREATE',N'tasks.create'),('CREATE',N'tasks.edit'),('CREATE',N'accounts.edit'),('CREATE',N'leads.edit'),('CREATE',N'internal.manage'),
    ('DELETE',N'tasks.soft_delete'),('DELETE',N'internal.manage')
  ) AS permission(Operation,Code)
  CROSS APPLY (VALUES (
    UPPER(ISNULL(JSON_VALUE(@JsonDoc,'$.assigneeType'),N'')),
    COALESCE(NULLIF(JSON_VALUE(@JsonDoc,'$.assigneeId'),N''), JSON_VALUE(@JsonDoc,'$.assignedTo'))
  )) AS assignment(Kind,AssignedId)
  OUTER APPLY (
    SELECT employee.UserId, employee.BranchId, employee.TerritoryId, employee.TeamId
    FROM core.AppUser AS employee
    WHERE employee.TenantId=@TenantId AND employee.IsActive=1 AND LEN(assignment.AssignedId)=36
      AND (
        (assignment.Kind<>N'GROUP' AND employee.UserId=TRY_CONVERT(uniqueidentifier,assignment.AssignedId))
        OR (assignment.Kind=N'GROUP'
          AND employee.UserId=TRY_CONVERT(uniqueidentifier,SESSION_CONTEXT(N'UserId'))
          AND EXISTS (
            SELECT 1 FROM crm.GroupMember AS member
            WHERE member.TenantId=@TenantId AND member.GroupId=TRY_CONVERT(uniqueidentifier,assignment.AssignedId)
              AND member.UserId=employee.UserId
          ))
      )
  ) AS assignee
  CROSS APPLY security.fn_RecordReadScope(
    @TenantId,permission.Code,assignee.UserId,assignee.BranchId,assignee.TerritoryId,assignee.TeamId
  ) AS scope
  WHERE permission.Operation=@Operation;
GO
