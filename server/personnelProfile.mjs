import { uuid } from './taskRequestContract.mjs';
import { createHash } from 'node:crypto';

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
  CONVERT(varchar(42),r.ApprovedAmountRials) AS approved,r.StatusCode AS status,r.ManagerNotes AS managerNotes,r.CreatedAtUtc AS createdAt,
  r.AccountingStage AS accountingStage
FROM hr.AdvanceRequest r JOIN core.AppUser u ON u.TenantId=r.TenantId AND u.UserId=r.UserId AND u.IsActive=1
WHERE r.TenantId=@tenant AND r.UserId=@user ORDER BY r.CreatedAtUtc DESC,r.AdvanceRequestId;

SELECT TOP(30) r.AdvanceRequestId AS id,r.RequestNumber AS number,employee.DisplayName AS employee,
  CONVERT(varchar(42),r.RequestedAmountRials) AS requested,r.Reason AS reason,r.CreatedAtUtc AS createdAt
FROM hr.AdvanceRequest r
JOIN core.AppUser employee ON employee.TenantId=r.TenantId AND employee.UserId=r.UserId AND employee.IsActive=1
CROSS APPLY security.fn_TaskRequestGrant(@tenant,@user,N'internal.manage',employee.UserId,employee.BranchId,employee.TerritoryId,employee.TeamId,1)
WHERE r.TenantId=@tenant AND employee.ManagerUserId=@user AND employee.UserId<>@user AND r.StatusCode='REQUESTED'
ORDER BY r.CreatedAtUtc,r.AdvanceRequestId;`;

const advanceNotice = `
IF @recipient IS NOT NULL
  INSERT sync.EntityStore(TenantId,CollectionName,EntityId,JsonDoc,UpdatedByUserId)
  SELECT @tenant,N'notifications',@noticeId,
    (SELECT @noticeId AS id,@noticeTitle AS title,N'برای مشاهدهٔ جزئیات به پروندهٔ پرسنلی مراجعه کنید.' AS message,
      N'INFO' AS type,CONVERT(bit,0) AS [read],CONVERT(varchar(33),SYSUTCDATETIME(),126)+'Z' AS createdAt,
      N'personnel-file' AS linkTab,@subject AS entityId,CONVERT(varchar(36),@recipient) AS recipientId
      FOR JSON PATH,WITHOUT_ARRAY_WRAPPER),@user;`;

const asAmount=value=>typeof value==='string' && /^[1-9]\d{0,14}$/.test(value);

export function parseAdvanceRequest(body) {
  const reason=typeof body?.reason==='string' ? body.reason.trim() : '';
  return uuid(body?.id) && asAmount(body.amount) && reason.length>0 && reason.length<=500
    ? {id:body.id.toLowerCase(),amount:body.amount,reason} : null;
}

export function parseAdvanceDecision(body) {
  const reason=typeof body?.reason==='string' ? body.reason.trim() : '';
  if (!uuid(body?.commandId) || !['APPROVED','REJECTED'].includes(body.status) || !reason || reason.length>1000 ||
      (body.status==='APPROVED' ? !asAmount(body.amount) : body.amount!=null)) return null;
  return {commandId:body.commandId.toLowerCase(),status:body.status,amount:body.amount ?? null,reason};
}

export function parseAdvanceAccounting(body) {
  const note=typeof body?.note==='string' ? body.note.trim() : '';
  return uuid(body?.commandId) && ['AWAITING_REVIEW','ON_HOLD'].includes(body.expectedStage) &&
    ['ON_HOLD','READY_FOR_ERP'].includes(body.stage) && body.expectedStage!==body.stage && note && note.length<=1000
    ? {commandId:body.commandId.toLowerCase(),expectedStage:body.expectedStage,stage:body.stage,note} : null;
}

export function createPersonnelService({ sql,run }) {
  const request=(tx,auth,user)=>new sql.Request(tx).input('tenant',sql.UniqueIdentifier,auth.tenantId).input('user',sql.UniqueIdentifier,user);
  async function read(auth,userId,own) {
    return run(auth,async tx=>{
      const result=await request(tx,auth,userId).query(identitySql+(own ? ownPayrollSql : ''));
      const [users,employees,payslips=[],advances=[],advanceReview=[]]=result.recordsets;
      if (!users.length) return null;
      return {user:users[0],employment:employees.length===1 ? employees[0] : null,
        status:employees.length===1 ? 'LINKED' : employees.length ? 'AMBIGUOUS' : 'UNLINKED',
        ...(own ? {payslips,advances,advanceReview} : {})};
    });
  }

  return {
    self: auth=>read(auth,auth.userId,true),
    linkedUser: (auth,userId)=>read(auth,userId,false),
    decideAdvance: (auth,id,input)=>run(auth,async tx=>{
      const fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex');
      const result=await request(tx,auth,auth.userId).input('id',sql.UniqueIdentifier,id)
        .input('status',sql.VarChar(10),input.status).input('amountText',sql.VarChar(15),input.amount)
        .input('reason',sql.NVarChar(1000),input.reason).input('command',sql.NVarChar(100),input.commandId)
        .input('fingerprint',sql.VarChar(64),fingerprint).query(`SET NOCOUNT ON;
        DECLARE @current nvarchar(32),@requested decimal(19,4),@approved decimal(19,4)=TRY_CONVERT(decimal(19,4),@amountText),@recipient uniqueidentifier,
          @subject nvarchar(36)=LOWER(CONVERT(nvarchar(36),@id));
        SELECT @current=r.StatusCode,@requested=r.RequestedAmountRials,@recipient=r.UserId
        FROM hr.AdvanceRequest r WITH(UPDLOCK,HOLDLOCK)
        JOIN core.AppUser employee WITH(HOLDLOCK) ON employee.TenantId=r.TenantId AND employee.UserId=r.UserId AND employee.IsActive=1
        CROSS APPLY security.fn_TaskRequestGrant(@tenant,@user,N'internal.manage',employee.UserId,employee.BranchId,employee.TerritoryId,employee.TeamId,1)
        WHERE r.TenantId=@tenant AND r.AdvanceRequestId=@id AND employee.ManagerUserId=@user AND employee.UserId<>@user;
        IF @current IS NULL BEGIN SELECT 'UNAVAILABLE' AS outcome; RETURN; END;
        IF EXISTS(SELECT 1 FROM security.AuditEvent WHERE TenantId=@tenant AND EntityId=@subject AND EntityType=N'ADVANCE'
          AND EventType=N'HR_ADVANCE_DECIDED' AND ActorUserId=@user AND CorrelationId=@command AND JSON_VALUE(DetailsJson,'$.fingerprint')=@fingerprint)
          BEGIN SELECT 'REPLAY' AS outcome; RETURN; END;
        IF @current<>'REQUESTED' BEGIN SELECT 'CONFLICT' AS outcome; RETURN; END;
        IF @status='APPROVED' AND (@approved IS NULL OR @approved<=0 OR @approved>@requested)
          BEGIN SELECT 'AMOUNT' AS outcome; RETURN; END;
        UPDATE hr.AdvanceRequest SET StatusCode=@status,ApprovedAmountRials=@approved,DecidedByUserId=@user,
          AccountingStage=CASE WHEN @status='APPROVED' THEN 'AWAITING_REVIEW' END,
          DecidedAtUtc=SYSUTCDATETIME(),ManagerNotes=@reason WHERE TenantId=@tenant AND AdvanceRequestId=@id;
        DECLARE @details nvarchar(max)=(SELECT @current AS previousStatus,@status AS status,@fingerprint AS fingerprint FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
        INSERT security.AuditEvent(TenantId,ActorUserId,CorrelationId,EventType,EntityType,EntityId,OutcomeCode,DetailsJson)
          VALUES(@tenant,@user,@command,N'HR_ADVANCE_DECIDED',N'ADVANCE',@subject,'SUCCESS',@details);
        DECLARE @noticeId nvarchar(120)=CONCAT(N'hr-advance-decided-',@subject),@noticeTitle nvarchar(120)=N'نتیجهٔ بررسی مساعده ثبت شد';
        ${advanceNotice}
        IF @status='APPROVED'
          INSERT sync.EntityStore(TenantId,CollectionName,EntityId,JsonDoc,UpdatedByUserId)
          SELECT @tenant,N'notifications',notice.id,
            (SELECT notice.id AS id,N'مساعدهٔ مصوب نیازمند بررسی حسابداری' AS title,N'درخواست را در کارتابل مالی باز کنید.' AS message,
              N'INFO' AS type,CONVERT(bit,0) AS [read],CONVERT(varchar(33),SYSUTCDATETIME(),126)+'Z' AS createdAt,
              N'finance-advance' AS linkTab,@subject AS entityId,CONVERT(varchar(36),reviewer.UserId) AS recipientId
              FOR JSON PATH,WITHOUT_ARRAY_WRAPPER),@user
          FROM core.AppUser reviewer CROSS APPLY security.fn_TaskRequestGrant(@tenant,reviewer.UserId,N'finance.manage',NULL,NULL,NULL,NULL,1)
          CROSS APPLY(SELECT CONCAT(N'hr-advance-accounting-',@subject,N'-',LOWER(CONVERT(nvarchar(36),reviewer.UserId))) AS id) notice
          WHERE reviewer.TenantId=@tenant AND reviewer.IsActive=1 AND reviewer.UserId NOT IN(@user,@recipient);
        SELECT 'DECIDED' AS outcome;`);
      return result.recordset[0].outcome;
    }),
    accountingQueue: (auth,stage,page,focus)=>run(auth,async tx=>{
      const result=await request(tx,auth,auth.userId).input('stage',sql.VarChar(24),stage).input('focus',sql.UniqueIdentifier,focus)
        .input('offset',sql.Int,(page-1)*25).query(`SELECT r.AdvanceRequestId AS id,r.RequestNumber AS number,employee.DisplayName AS employee,
          CONVERT(varchar(42),r.ApprovedAmountRials) AS amount,r.DecidedAtUtc AS approvedAt,r.AccountingStage AS stage,
          r.AccountingNote AS accountingNote,reviewer.DisplayName AS reviewer,r.AccountingReviewedAtUtc AS reviewedAt
        FROM hr.AdvanceRequest r JOIN core.AppUser employee ON employee.TenantId=r.TenantId AND employee.UserId=r.UserId
        LEFT JOIN core.AppUser reviewer ON reviewer.TenantId=r.TenantId AND reviewer.UserId=r.AccountingReviewedBy
        WHERE r.TenantId=@tenant AND r.StatusCode=N'APPROVED' AND r.ApprovedAmountRials>0 AND r.AccountingStage IS NOT NULL
          AND r.UserId<>@user AND r.DecidedByUserId<>@user AND (@stage='' OR r.AccountingStage=@stage OR r.AdvanceRequestId=@focus)
          AND EXISTS(SELECT 1 FROM security.fn_TaskRequestGrant(@tenant,@user,N'finance.manage',NULL,NULL,NULL,NULL,1))
        ORDER BY CASE WHEN r.AdvanceRequestId=@focus THEN 0 ELSE 1 END,r.DecidedAtUtc,r.AdvanceRequestId
        OFFSET @offset ROWS FETCH NEXT 26 ROWS ONLY;`);
      return {items:result.recordset.slice(0,25),hasMore:page<999 && result.recordset.length>25};
    }),
    reviewAccounting: (auth,id,input)=>run(auth,async tx=>{
      const fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex');
      const result=await request(tx,auth,auth.userId).input('id',sql.UniqueIdentifier,id).input('stage',sql.VarChar(24),input.stage)
        .input('expected',sql.VarChar(24),input.expectedStage)
        .input('note',sql.NVarChar(1000),input.note).input('command',sql.NVarChar(100),input.commandId)
        .input('fingerprint',sql.VarChar(64),fingerprint).query(`SET NOCOUNT ON;
          DECLARE @current varchar(24),@recipient uniqueidentifier,@subject nvarchar(36)=LOWER(CONVERT(nvarchar(36),@id));
          SELECT @current=AccountingStage,@recipient=UserId FROM hr.AdvanceRequest WITH(UPDLOCK,HOLDLOCK)
          WHERE TenantId=@tenant AND AdvanceRequestId=@id AND StatusCode=N'APPROVED' AND ApprovedAmountRials>0
            AND UserId<>@user AND DecidedByUserId<>@user
            AND EXISTS(SELECT 1 FROM security.fn_TaskRequestGrant(@tenant,@user,N'finance.manage',NULL,NULL,NULL,NULL,1));
          IF @current IS NULL BEGIN SELECT 'UNAVAILABLE' AS outcome; RETURN; END;
          IF EXISTS(SELECT 1 FROM security.AuditEvent WHERE TenantId=@tenant AND EntityId=@subject AND EntityType=N'ADVANCE'
            AND EventType=N'HR_ADVANCE_ACCOUNTING_REVIEW' AND ActorUserId=@user AND CorrelationId=@command AND JSON_VALUE(DetailsJson,'$.fingerprint')=@fingerprint)
            BEGIN SELECT 'REPLAY' AS outcome; RETURN; END;
          IF @current<>@expected OR EXISTS(SELECT 1 FROM security.AuditEvent
            WHERE TenantId=@tenant AND EntityId=@subject AND EntityType=N'ADVANCE' AND EventType=N'HR_ADVANCE_ACCOUNTING_REVIEW' AND CorrelationId=@command)
            BEGIN SELECT 'CONFLICT' AS outcome; RETURN; END;
          UPDATE hr.AdvanceRequest SET AccountingStage=@stage,AccountingReviewedBy=@user,AccountingReviewedAtUtc=SYSUTCDATETIME(),AccountingNote=@note
          WHERE TenantId=@tenant AND AdvanceRequestId=@id;
          DECLARE @details nvarchar(max)=(SELECT @current AS previousStage,@stage AS stage,@fingerprint AS fingerprint FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
          INSERT security.AuditEvent(TenantId,ActorUserId,CorrelationId,EventType,EntityType,EntityId,OutcomeCode,DetailsJson)
            VALUES(@tenant,@user,@command,N'HR_ADVANCE_ACCOUNTING_REVIEW',N'ADVANCE',@subject,'SUCCESS',@details);
          DECLARE @noticeId nvarchar(120)=CONCAT(N'hr-advance-review-',@subject,N'-',@command),@noticeTitle nvarchar(120)=N'وضعیت بررسی حسابداری مساعده تغییر کرد';
          ${advanceNotice}
          SELECT 'REVIEWED' AS outcome;`);
      return result.recordset[0]?.outcome;
    }),
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
          DECLARE @recipient uniqueidentifier,@subject nvarchar(36)=LOWER(CONVERT(nvarchar(36),@id));
          SELECT @recipient=employee.ManagerUserId FROM core.AppUser employee
          CROSS APPLY security.fn_TaskRequestGrant(@tenant,employee.ManagerUserId,N'internal.manage',employee.UserId,employee.BranchId,employee.TerritoryId,employee.TeamId,1)
          WHERE employee.TenantId=@tenant AND employee.UserId=@user AND employee.ManagerUserId<>@user;
          DECLARE @noticeId nvarchar(120)=CONCAT(N'hr-advance-requested-',@subject),@noticeTitle nvarchar(120)=N'درخواست مساعده در انتظار بررسی است';
          ${advanceNotice}
          SELECT 'CREATED' AS outcome,@number AS number;`);
      return result.recordset[0];
    }),
  };
}
