import { createHash, randomUUID } from 'node:crypto';
import { getOnboardingConfig, isValidNationalCode, normalizeMobile, toLatinDigits, transitionApplication } from '../src/lib/onboarding.ts';
import { date, uuid } from './taskRequestContract.mjs';

const statuses = ['SUBMITTED','UNDER_REVIEW','NEEDS_INFORMATION','ACCEPTED','REJECTED'];
const commands = ['REVIEW','NEEDS_INFORMATION','SCHEDULE','INTERVIEW_RESULT','ACCEPT','REJECT','CREATE_EMPLOYEE','LINK_USER'];
const bounded = (value,max) => typeof value==='string' && value.length<=max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) ? value.trim() : null;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function recruitmentFilters(query) {
  const status=query.status ?? '', search=bounded(query.search ?? '',100), page=String(query.page ?? '1');
  return (!status || statuses.includes(status)) && search!==null && /^\d{1,3}$/.test(page) && Number(page)>=1
    ? {status,search,page:Number(page)} : null;
}

export function recruitmentCommand(body) {
  const note=bounded(body?.note ?? '',750);
  if (!uuid(body?.commandId) || typeof body.version!=='string' || !/^[1-9]\d{0,18}$/.test(body.version) ||
      !commands.includes(body.action) || note===null || (!['REVIEW','SCHEDULE'].includes(body.action) && !note)) return null;
  const base={commandId:body.commandId.toLowerCase(),version:body.version,action:body.action,note};
  if (body.action==='SCHEDULE') {
    const address=bounded(body.address,450);
    return date(body.date) && typeof body.time==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.time) &&
      uuid(body.interviewerId) && address ? {...base,date:body.date,time:body.time,interviewerId:body.interviewerId.toLowerCase(),address} : null;
  }
  if (body.action==='INTERVIEW_RESULT') return ['ACCEPT','REJECT','FOLLOW_UP'].includes(body.result) ? {...base,result:body.result} : null;
  if (body.action==='CREATE_EMPLOYEE') {
    const code=bounded(body.employeeCode,32);
    return code && date(body.hireDate) ? {...base,employeeCode:code,hireDate:body.hireDate} : null;
  }
  if (body.action==='LINK_USER') {
    const username=bounded(body.username,100);
    return username && body.identityConfirmed===true ? {...base,username,identityConfirmed:true} : null;
  }
  return base;
}

function view(row) {
  const a=JSON.parse(row.JsonDoc);
  return {id:row.id,version:row.version,firstName:a.firstName,lastName:a.lastName,mobile:a.mobile,desiredRole:a.desiredRole,
    status:a.status,createdAt:a.createdAt,notes:a.notes,history:a.history ?? [],documents:a.documents ?? [],
    interview:a.interview ?? null,employmentId:a.employmentId ?? null,userLinked:uuid(a.employmentUserId)};
}

export function createRecruitmentReview({sql,run,createTask}) {
  const request=(tx,auth)=>new sql.Request(tx).input('tenant',sql.UniqueIdentifier,auth.tenantId).input('actor',sql.UniqueIdentifier,auth.userId);
  const scoped=`TenantId=@tenant AND CollectionName=N'onboardingApplications' AND IsDeleted=0
    AND JSON_VALUE(JsonDoc,'$.transport')=N'SQLSERVER'
    AND EXISTS(SELECT 1 FROM security.fn_TaskRequestGrant(@tenant,@actor,N'users.manage',NULL,NULL,NULL,NULL,1))`;

  return {
    list: (auth,filter)=>run(auth,async tx=>{
      const result=await request(tx,auth).input('status',sql.VarChar(24),filter.status)
        .input('search',sql.NVarChar(100),filter.search).input('offset',sql.Int,(filter.page-1)*25).query(`
          SELECT EntityId AS id,CONVERT(varchar(20),Version) AS version,JsonDoc FROM sync.EntityStore
          WHERE ${scoped} AND (@status='' OR JSON_VALUE(JsonDoc,'$.status')=@status)
            AND (@search=N'' OR CHARINDEX(@search,CONCAT(JSON_VALUE(JsonDoc,'$.firstName'),N' ',JSON_VALUE(JsonDoc,'$.lastName'),N' ',
              JSON_VALUE(JsonDoc,'$.mobile'),N' ',JSON_VALUE(JsonDoc,'$.desiredRole')))>0)
          ORDER BY CreatedAtUtc DESC,EntityId OFFSET @offset ROWS FETCH NEXT 26 ROWS ONLY;`);
      return {items:result.recordset.slice(0,25).map(view),hasMore:filter.page<999 && result.recordset.length>25};
    }),

    change: (auth,id,input)=>run(auth,async tx=>{
      const forId=()=>request(tx,auth).input('id',sql.NVarChar(120),id);
      const row=(await forId().query(`SELECT EntityId AS id,CONVERT(varchar(20),Version) AS version,JsonDoc
        FROM sync.EntityStore WITH(UPDLOCK,HOLDLOCK) WHERE ${scoped} AND EntityId=@id;`)).recordset[0];
      if (!row) return {status:404,message:'درخواست همکاری در دسترس نیست.'};
      const fingerprint=digest(input);
      const replay=(await forId().input('command',sql.NVarChar(100),input.commandId).query(`
        SELECT CONVERT(varchar(36),ActorUserId) AS actor,JSON_VALUE(DetailsJson,'$.fingerprint') AS fingerprint
        FROM security.AuditEvent WHERE TenantId=@tenant AND EntityType=N'APPLICATION' AND EntityId=@id
          AND EventType=N'RECRUITMENT_REVIEW' AND CorrelationId=@command;`)).recordset[0];
      if (replay) return replay.actor?.toLowerCase()===auth.userId.toLowerCase() && replay.fingerprint===fingerprint
        ? {status:200,application:view(row),replayed:true} : {status:409,message:'شناسهٔ عملیات پیش‌تر استفاده شده است.'};
      if (row.version!==input.version) return {status:409,message:'نسخهٔ درخواست تغییر کرده است. پرونده را دوباره بخوانید.'};

      const application=JSON.parse(row.JsonDoc);
      if (!statuses.includes(application.status)) return {status:422,message:'وضعیت پرونده قابل تشخیص نیست.'};
      application.history=Array.isArray(application.history) ? application.history : [];
      const before=application.status;
      const now=new Date();
      const mark=(note)=>application.history.push({at:now.toISOString(),by:auth.userId,status:application.status,note});
      const fail=message=>({status:422,message});

      if (input.action==='CREATE_EMPLOYEE') {
        if (before!=='ACCEPTED' || application.employmentId) return fail('پرونده باید پذیرفته و فاقد پروندهٔ استخدامی باشد.');
        if (!isValidNationalCode(application.nationalId)) return fail('برای جلوگیری از ثبت شخص تکراری، کد ملی معتبر در پرونده لازم است.');
        const employeeId=randomUUID();
        const name=`${application.firstName ?? ''} ${application.lastName ?? ''}`.trim().slice(0,200);
        if (!name) return fail('نام متقاضی در پرونده تکمیل نشده است.');
        const added=(await request(tx,auth).input('employee',sql.UniqueIdentifier,employeeId)
          .input('code',sql.NVarChar(32),input.employeeCode).input('nationalId',sql.NVarChar(20),application.nationalId)
          .input('name',sql.NVarChar(200),name).input('position',sql.NVarChar(120),String(application.desiredRole ?? '').slice(0,120))
          .input('hireDate',sql.Date,new Date(input.hireDate)).query(`
            DECLARE @lock int,@resource nvarchar(100)=CONCAT('employee-create:',@tenant);
            EXEC @lock=sys.sp_getapplock @Resource=@resource,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000;
            IF @lock<0 BEGIN SELECT 'BUSY' AS outcome; RETURN; END;
            IF EXISTS(SELECT 1 FROM hr.Employee WITH(UPDLOCK,HOLDLOCK) WHERE TenantId=@tenant AND IsDeleted=0
              AND (EmployeeCode=@code OR NationalId=@nationalId)) BEGIN SELECT 'DUPLICATE' AS outcome; RETURN; END;
            INSERT hr.Employee(EmployeeId,TenantId,EmployeeCode,DisplayName,NationalId,PositionTitle,EmploymentStatus,HireDate,Origin,CreatedByUserId)
              VALUES(@employee,@tenant,@code,@name,@nationalId,NULLIF(@position,N''),N'ONBOARDING',@hireDate,N'LOCAL',@actor);
            SELECT 'CREATED' AS outcome;`)).recordset[0]?.outcome;
        if (added!=='CREATED') return {status:409,message:added==='DUPLICATE' ? 'برای این کد ملی یا کد پرسنلی، پروندهٔ موجود باید بررسی شود.' : 'پرونده هم‌زمان در حال ثبت است.'};
        application.employmentId=employeeId;
        mark(input.note);
      } else if (input.action==='LINK_USER') {
        if (before!=='ACCEPTED' || !uuid(application.employmentId) || application.employmentUserId) return fail('برای اتصال، پروندهٔ استخدامی بدون حساب لازم است.');
        const nationalId=toLatinDigits(String(application.nationalId ?? '')).trim();
        const mobile=normalizeMobile(application.mobile);
        if (!isValidNationalCode(nationalId) || !mobile) return fail('کد ملی و شماره همراه معتبر در پروندهٔ پذیرش لازم است.');

        const settingsRow=(await request(tx,auth).query(`SELECT JsonDoc FROM sync.EntityStore WITH(HOLDLOCK)
          WHERE TenantId=@tenant AND IsDeleted=0 AND CollectionName=N'__singleton__' AND EntityId=N'settings';`)).recordset[0];
        const policy=getOnboardingConfig({settings:settingsRow ? JSON.parse(settingsRow.JsonDoc) : {}}).usernamePolicy;
        const expected=policy==='NATIONAL_ID' ? nationalId : policy==='MOBILE' ? mobile : null;
        const normalized=policy==='MOBILE' ? normalizeMobile(input.username) : toLatinDigits(input.username);
        if (!expected || normalized!==expected) return fail('نام کاربری مطابق سیاست سازمان با شناسهٔ پرونده مطابقت ندارد.');

        const target=(await request(tx,auth).input('supplied',sql.NVarChar(100),input.username).input('expected',sql.NVarChar(100),expected).query(`
          SELECT UserId AS id,Phone AS phone FROM core.AppUser WITH(UPDLOCK,HOLDLOCK)
          WHERE TenantId=@tenant AND IsActive=1 AND UserId<>@actor AND UserName IN(@supplied,@expected);`)).recordset;
        if (target.length!==1 || normalizeMobile(target[0].phone)!==mobile) return fail('حساب فعال یکتا با نام کاربری و شماره همراه مطابق پرونده یافت نشد.');

        const linked=(await request(tx,auth).input('employee',sql.UniqueIdentifier,application.employmentId)
          .input('account',sql.UniqueIdentifier,target[0].id).input('nationalId',sql.NVarChar(20),nationalId).query(`
            IF EXISTS(SELECT 1 FROM hr.Employee WITH(UPDLOCK,HOLDLOCK) WHERE TenantId=@tenant AND UserId=@account AND IsDeleted=0)
              BEGIN SELECT 'USED' AS outcome; RETURN; END;
            UPDATE hr.Employee SET UserId=@account,UpdatedAtUtc=SYSUTCDATETIME(),UpdatedByUserId=@actor
            WHERE TenantId=@tenant AND EmployeeId=@employee AND UserId IS NULL AND IsDeleted=0
              AND NationalId=@nationalId AND EmploymentStatus=N'ONBOARDING' AND Origin=N'LOCAL';
            SELECT CASE WHEN @@ROWCOUNT=1 THEN 'LINKED' ELSE 'UNAVAILABLE' END AS outcome;`)).recordset[0]?.outcome;
        if (linked!=='LINKED') return {status:409,message:linked==='USED' ? 'این حساب قبلاً به پروندهٔ پرسنلی متصل است.' : 'وضعیت یا هویت پروندهٔ پرسنلی تغییر کرده است.'};
        application.employmentUserId=target[0].id;
        mark(input.note);
      } else if (input.action==='SCHEDULE') {
        if (['ACCEPTED','REJECTED'].includes(before) || (application.interview && application.interview.result!=='FOLLOW_UP')) return fail('برای این پرونده امکان ارجاع جدید وجود ندارد.');
        if (Date.parse(`${input.date}T${input.time}:00+03:30`)<=now.getTime()) return fail('زمان مصاحبه باید در آینده باشد.');
        const task=await createTask(tx,auth,{requestId:input.commandId,kind:'HR',title:'بررسی مصاحبهٔ استخدامی',
          description:`زمان مصاحبه ${input.time} است. برای جزئیات پرونده به کارتابل جذب مراجعه کنید.`,priority:'NORMAL',
          assigneeId:input.interviewerId,dueDate:input.date,confidential:false,watchers:[],links:[],priceItems:[]});
        if (application.interview) (application.previousInterviews ??= []).push(application.interview);
        application.interview={date:input.date,time:input.time,address:input.address,interviewerId:input.interviewerId,taskId:task.task.id};
        application.status='UNDER_REVIEW'; mark('مصاحبه تعیین و به کارتابل ارجاع شد.');
      } else if (input.action==='INTERVIEW_RESULT') {
        if (before!=='UNDER_REVIEW' || !application.interview?.taskId || application.interview.result) return fail('مصاحبهٔ منتظر نتیجه یافت نشد.');
        if (Date.parse(`${application.interview.date}T${application.interview.time}:00+03:30`)>now.getTime()) return fail('نتیجه پیش از زمان مصاحبه ثبت نمی‌شود.');
        application.interview={...application.interview,result:input.result,resultNote:input.note,resultAt:now.toISOString(),reviewedBy:auth.userId};
        mark(input.note);
      } else {
        if (input.action==='ACCEPT' && application.interview?.result!=='ACCEPT') return fail('پذیرش به نتیجهٔ مثبت ثبت‌شدهٔ مصاحبه نیاز دارد.');
        const target={REVIEW:'UNDER_REVIEW',NEEDS_INFORMATION:'NEEDS_INFORMATION',ACCEPT:'ACCEPTED',REJECT:'REJECTED'}[input.action];
        const changed=transitionApplication({onboardingApplications:[application]},application.id,target,input.note,auth.userId,now);
        if (!changed.ok) return fail(changed.reason);
      }

      const updated=(await forId().input('json',sql.NVarChar(sql.MAX),JSON.stringify(application))
        .input('version',sql.VarChar(20),row.version).query(`UPDATE sync.EntityStore SET JsonDoc=@json,Version=Version+1,
          UpdatedAtUtc=SYSUTCDATETIME(),UpdatedByUserId=@actor OUTPUT inserted.EntityId AS id,CONVERT(varchar(20),inserted.Version) AS version,inserted.JsonDoc
          WHERE TenantId=@tenant AND CollectionName=N'onboardingApplications' AND EntityId=@id AND Version=TRY_CONVERT(bigint,@version);`)).recordset[0];
      if (!updated) throw new Error('Recruitment row was not updated under its write lock');
      await forId().input('command',sql.NVarChar(100),input.commandId)
        .input('details',sql.NVarChar(sql.MAX),JSON.stringify({action:input.action,before,after:application.status,fingerprint,
          employmentId:application.employmentId,linkedUserId:input.action==='LINK_USER' ? application.employmentUserId : undefined}))
        .query(`INSERT security.AuditEvent(TenantId,ActorUserId,CorrelationId,EventType,EntityType,EntityId,OutcomeCode,DetailsJson)
          VALUES(@tenant,@actor,@command,N'RECRUITMENT_REVIEW',N'APPLICATION',@id,'SUCCESS',@details);`);
      return {status:200,application:view(updated),replayed:false};
    }),
  };
}
