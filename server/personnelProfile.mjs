import { uuid } from './taskRequestContract.mjs';

const identitySql = `
SELECT u.UserName AS userCode,u.DisplayName AS name,manager.DisplayName AS managerName,branch.Name AS branchName
FROM core.AppUser u
LEFT JOIN core.AppUser manager ON manager.TenantId=u.TenantId AND manager.UserId=u.ManagerUserId AND manager.IsActive=1
LEFT JOIN core.Branch branch ON branch.TenantId=u.TenantId AND branch.BranchId=u.BranchId
WHERE u.TenantId=@tenant AND u.UserId=@user AND u.IsActive=1;

SELECT TOP(2) e.EmployeeCode AS employeeCode,e.CommercialCode AS commercialCode,e.DetailCode AS detailCode,
  e.PositionTitle AS position,e.OperationalRole AS operationalRole,e.EmploymentStatus AS employmentStatus,
  e.Origin AS origin,CONVERT(char(10),e.HireDate,126) AS hireDate,branch.Name AS branchName
FROM hr.Employee e
JOIN core.AppUser u ON u.TenantId=e.TenantId AND u.UserId=e.UserId AND u.IsActive=1
LEFT JOIN core.Branch branch ON branch.TenantId=e.TenantId AND branch.BranchId=e.BranchId
WHERE e.TenantId=@tenant AND e.UserId=@user AND e.IsDeleted=0
ORDER BY e.EmployeeId;`;

const ownPayrollSql = `
SELECT TOP(12) p.PayslipId AS id,p.PeriodMonth AS period,CONVERT(varchar(42),p.GrossPayRials) AS gross,
  CONVERT(varchar(42),p.TotalDeductionsRials) AS deductions,CONVERT(varchar(42),p.NetPayableRials) AS net
FROM hr.Payslip p JOIN core.AppUser u ON u.TenantId=p.TenantId AND u.UserId=p.UserId AND u.IsActive=1
WHERE p.TenantId=@tenant AND p.UserId=@user AND p.StatusCode IN('ISSUED','APPROVED','PAID')
ORDER BY p.PeriodMonth DESC,p.PayslipId;

SELECT TOP(30) r.AdvanceRequestId AS id,r.RequestNumber AS number,CONVERT(varchar(42),r.RequestedAmountRials) AS requested,
  CONVERT(varchar(42),r.ApprovedAmountRials) AS approved,r.StatusCode AS status,r.CreatedAtUtc AS createdAt
FROM hr.AdvanceRequest r JOIN core.AppUser u ON u.TenantId=r.TenantId AND u.UserId=r.UserId AND u.IsActive=1
WHERE r.TenantId=@tenant AND r.UserId=@user ORDER BY r.CreatedAtUtc DESC,r.AdvanceRequestId;`;

export function parseAdvanceRequest(body) {
  const reason=typeof body?.reason==='string' ? body.reason.trim() : '';
  return uuid(body?.id) && typeof body.amount==='string' && /^[1-9]\d{0,14}$/.test(body.amount) && reason.length>0 && reason.length<=500
    ? {id:body.id.toLowerCase(),amount:body.amount,reason} : null;
}

export function createPersonnelService({ sql,run }) {
  const request=(tx,auth,user)=>new sql.Request(tx).input('tenant',sql.UniqueIdentifier,auth.tenantId).input('user',sql.UniqueIdentifier,user);
  async function read(auth,userId,own) {
    return run(auth,async tx=>{
      const result=await request(tx,auth,userId).query(identitySql+(own ? ownPayrollSql : ''));
      const [users,employees,payslips=[],advances=[]]=result.recordsets;
      if (!users.length) return null;
      return {user:users[0],employment:employees.length===1 ? employees[0] : null,
        status:employees.length===1 ? 'LINKED' : employees.length ? 'AMBIGUOUS' : 'UNLINKED',
        ...(own ? {payslips,advances} : {})};
    });
  }

  return {
    self: auth=>read(auth,auth.userId,true),
    linkedUser: (auth,userId)=>read(auth,userId,false),
    requestAdvance: (auth,input,correlation)=>run(auth,async tx=>{
      const result=await request(tx,auth,auth.userId).input('id',sql.UniqueIdentifier,input.id)
        .input('amountText',sql.VarChar(15),input.amount).input('reason',sql.NVarChar(500),input.reason)
        .input('correlation',sql.NVarChar(100),correlation).query(`SET NOCOUNT ON;
          DECLARE @amount decimal(19,4)=CONVERT(decimal(19,4),@amountText),@recordTenant uniqueidentifier,@recordUser uniqueidentifier,
            @previousAmount decimal(19,4),@previousReason nvarchar(500),@number nvarchar(32);
          IF NOT EXISTS(SELECT 1 FROM core.AppUser WHERE TenantId=@tenant AND UserId=@user AND IsActive=1)
            BEGIN SELECT 'NO_EMPLOYMENT' AS outcome; RETURN; END;
          SELECT @recordTenant=TenantId,@recordUser=UserId,@previousAmount=RequestedAmountRials,@previousReason=Reason,@number=RequestNumber
          FROM hr.AdvanceRequest WITH(UPDLOCK,HOLDLOCK) WHERE TenantId=@tenant AND AdvanceRequestId=@id;
          IF @number IS NOT NULL
          BEGIN
            IF @recordTenant=@tenant AND @recordUser=@user AND @previousAmount=@amount AND CONVERT(varbinary(1000),@previousReason)=CONVERT(varbinary(1000),@reason)
              SELECT 'REPLAY' AS outcome,@number AS number;
            ELSE SELECT 'CONFLICT' AS outcome;
            RETURN;
          END;
          IF (SELECT COUNT_BIG(*) FROM hr.Employee WITH(HOLDLOCK) WHERE TenantId=@tenant AND UserId=@user AND IsDeleted=0)<>1
            OR NOT EXISTS(SELECT 1 FROM hr.Employee WHERE TenantId=@tenant AND UserId=@user AND IsDeleted=0 AND EmploymentStatus IN('ACTIVE','PROBATION'))
            BEGIN SELECT 'NO_EMPLOYMENT' AS outcome; RETURN; END;
          SET @number=CONCAT('ADV-',LEFT(REPLACE(CONVERT(varchar(36),@id),'-',''),28));
          INSERT hr.AdvanceRequest(AdvanceRequestId,TenantId,UserId,RequestNumber,RequestedAmountRials,Reason,TargetMonth)
            VALUES(@id,@tenant,@user,@number,@amount,@reason,CONVERT(char(7),DATEADD(minute,210,SYSUTCDATETIME()),126));
          INSERT security.AuditEvent(TenantId,ActorUserId,CorrelationId,EventType,EntityType,EntityId,OutcomeCode)
            VALUES(@tenant,@user,@correlation,N'HR_ADVANCE_REQUESTED',N'ADVANCE',LOWER(CONVERT(nvarchar(36),@id)),'SUCCESS');
          SELECT 'CREATED' AS outcome,@number AS number;`);
      return result.recordset[0];
    }),
  };
}
