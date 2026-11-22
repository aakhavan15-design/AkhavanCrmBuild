SET XACT_ABORT ON;
GO
INSERT core.Permission(PermissionCode,Description)
SELECT p.Code,p.Title FROM (VALUES
  (N'payroll.view',N'مشاهدهٔ داده‌های حقوق و فیش'),
  (N'payroll.manage',N'مدیریت داده‌های حقوق و فیش')
) p(Code,Title)
WHERE NOT EXISTS(SELECT 1 FROM core.Permission existing WHERE existing.PermissionCode=p.Code);
GO
/* Shared snapshot records remain in EntityStore. Only the subject and an authorized
   organization reviewer can read HR documents; payroll has its own role grants. */
CREATE OR ALTER FUNCTION security.fn_EntityPersonnelReadScope(
  @TenantId uniqueidentifier,
  @CollectionName nvarchar(80),
  @Subject nvarchar(200)
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
  SELECT 1 AS Allowed
  FROM core.AppUser actor JOIN core.Tenant tenant ON tenant.TenantId=actor.TenantId AND tenant.IsActive=1
  WHERE actor.TenantId=@TenantId AND actor.TenantId=TRY_CONVERT(uniqueidentifier,SESSION_CONTEXT(N'TenantId'))
    AND actor.UserId=TRY_CONVERT(uniqueidentifier,SESSION_CONTEXT(N'UserId')) AND actor.IsActive=1
    AND (
      (@CollectionName IN(N'personnelfiles',N'onboardingapplications') AND EXISTS(
        SELECT 1 FROM security.fn_RecordReadScope(@TenantId,N'users.manage',NULL,NULL,NULL,NULL)
      ))
      OR (@CollectionName IN(N'payslips',N'salaryprofiles',N'advancerequests',N'payrollruns',N'commissiontransactions')
        AND (EXISTS(SELECT 1 FROM security.fn_RecordReadScope(@TenantId,N'payroll.view',NULL,NULL,NULL,NULL))
          OR EXISTS(SELECT 1 FROM security.fn_RecordReadScope(@TenantId,N'payroll.manage',NULL,NULL,NULL,NULL))))
      OR (@CollectionName IN(N'personnelfiles',N'payslips',N'advancerequests',N'commissiontransactions')
        AND LEN(@Subject)=36 AND actor.UserId=TRY_CONVERT(uniqueidentifier,@Subject))
    );
GO
