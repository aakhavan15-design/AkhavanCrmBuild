import { createHash } from 'node:crypto';
import { uuid } from './taskRequestContract.mjs';

const text = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) ? value.trim() : null;
const between = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const hash = input => createHash('sha256').update(JSON.stringify(input)).digest('hex');

function resource(value) {
  if (value == null || value === '') return null;
  if (!text(value, 1000)) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

export function learningCourse(body) {
  const { commandId, level, passPercent, timeLimit, maxAttempts } = body ?? {};
  const pathCode = text(body?.pathCode, 40)?.toLowerCase();
  const role = text(body?.role, 120), title = text(body?.title, 160);
  if (!uuid(commandId) || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(pathCode ?? '') || !role || !title
    || !between(level, 1, 40) || !between(passPercent, 1, 100) || !between(timeLimit, 1, 180) || !between(maxAttempts, 1, 12)
    || !Array.isArray(body.lessons) || !between(body.lessons.length, 1, 20)
    || !Array.isArray(body.questions) || !between(body.questions.length, 1, 30)) return null;
  const lessons = body.lessons.map(item => ({
    title: text(item?.title, 160), body: text(item?.body, 4500), resource: resource(item?.resource),
  }));
  if (lessons.some(item => !item.title || !item.body || item.resource === undefined)) return null;
  const questions = body.questions.map(item => ({
    prompt: text(item?.prompt, 500), options: Array.isArray(item?.options) && between(item.options.length, 2, 5)
      ? item.options.map(option => text(option, 250)) : [], correct: item?.correct,
  }));
  if (questions.some(item => !item.prompt || item.options.some(option => !option)
    || new Set(item.options).size !== item.options.length || !between(item.correct, 0, item.options.length - 1))) return null;
  return { commandId: commandId.toLowerCase(), pathCode, role, title, level, passPercent, timeLimit, maxAttempts, lessons, questions };
}

export function learningAction(body) {
  const { action, revision, commandId } = body ?? {};
  if (!uuid(commandId) || !between(revision, 1, 2147483647)) return null;
  const base = { commandId: commandId.toLowerCase(), revision, action };
  if (['COMPLETE_CONTENT', 'START_EXAM'].includes(action)) return base;
  if (action === 'SUBMIT_EXAM') {
    const evidence = text(body.evidence, 1000);
    return uuid(body.attemptId) && evidence && Array.isArray(body.answers) && between(body.answers.length, 1, 30)
      && Array.from(body.answers).every(answer => between(answer, 0, 4))
      ? { ...base, attemptId: body.attemptId.toLowerCase(), evidence, answers: body.answers } : null;
  }
  if (['APPROVE', 'CONDITIONAL', 'COMPLETE_CONDITION', 'RETRY', 'PAUSE', 'RESUME'].includes(action)) {
    const note = text(body.note, 1000);
    return note ? { ...base, note } : null;
  }
  return null;
}

export function gradeLearningExam(questions, answers, passPercent) {
  if (!Array.isArray(questions) || !Array.isArray(answers) || !between(questions.length,1,30) || questions.length !== answers.length || !between(passPercent,1,100)) return null;
  if (!Array.from(questions).every(item => item && Array.isArray(item.options) && between(item.options.length,2,5) && between(item.correct,0,item.options.length-1))
    || !Array.from(answers).every((answer,index) => between(answer,0,questions[index].options.length-1))) return null;
  const correct = questions.reduce((total, item, index) => total + Number(answers[index] === item.correct), 0);
  return { score: Math.round((10000 * correct) / questions.length) / 100, passed: (100 * correct) >= passPercent * questions.length };
}

export const learningFailure = (status, message) => Object.assign(new Error(message), { status, code: 'LEARNING_REJECTED' });
const unavailable = () => learningFailure(404, 'پروندهٔ آموزشی در دسترس نیست.');
const conflict = () => learningFailure(409, 'وضعیت آموزشی تغییر کرده است. پرونده را دوباره باز کنید.');
const invalid = message => learningFailure(422, message);

const enrollmentFields = `
  SELECT n.EnrollmentId AS id,n.StatusCode AS status,n.Revision AS revision,n.AssignedAtUtc AS assignedAt,
    n.ContentCompletedAtUtc AS completedAt,n.DecisionAtUtc AS decisionAt,n.DecisionNote AS decisionNote,reviewer.DisplayName AS reviewer,
    c.Title AS title,c.PathCode AS pathCode,c.RoleName AS role,c.LevelNo AS level,c.VersionNo AS version,
    c.LessonsJson AS lessonsJson,c.PassPercent AS passPercent,c.TimeLimitMinutes AS timeLimit,c.MaxAttempts AS maxAttempts,
    e.EmployeeId AS employeeId,u.DisplayName AS employee,u.UserId AS userId
  FROM hr.LearningEnrollment n JOIN hr.LearningCourse c ON c.TenantId=n.TenantId AND c.CourseId=n.CourseId
  JOIN hr.Employee e ON e.TenantId=n.TenantId AND e.EmployeeId=n.EmployeeId AND e.IsDeleted=0
  JOIN core.AppUser u ON u.TenantId=e.TenantId AND u.UserId=e.UserId AND u.IsActive=1
  LEFT JOIN core.AppUser reviewer ON reviewer.TenantId=n.TenantId AND reviewer.UserId=n.DecisionBy
  WHERE n.TenantId=@tenant AND e.EmploymentStatus IN(N'ONBOARDING',N'PROBATION',N'ACTIVE')
    AND NOT EXISTS(SELECT 1 FROM hr.Employee other WHERE other.TenantId=e.TenantId AND other.UserId=e.UserId
      AND other.EmployeeId<>e.EmployeeId AND other.IsDeleted=0)`;
const own = ' AND u.UserId=@actor';
const supervision = ` AND u.UserId<>@actor AND u.ManagerUserId=@actor
  AND EXISTS(SELECT 1 FROM security.fn_TaskRequestGrant(@tenant,@actor,N'internal.manage',u.UserId,u.BranchId,u.TerritoryId,u.TeamId,1))`;
const organizer = `EXISTS(SELECT 1 FROM security.fn_TaskRequestGrant(@tenant,@actor,N'users.manage',NULL,NULL,NULL,NULL,1))`;
const actionsRequiringReviewer = new Set(['APPROVE', 'CONDITIONAL', 'RETRY', 'PAUSE', 'RESUME']);

export function createPersonnelLearning({ sql, run }) {
  const request = (tx, auth) => new sql.Request(tx).input('tenant', sql.UniqueIdentifier, auth.tenantId)
    .input('actor', sql.UniqueIdentifier, auth.userId);
  const forId = (tx, auth, id) => request(tx, auth).input('id', sql.UniqueIdentifier, id);

  async function audit(tx, auth, id, entity, input, action, details = {}) {
    await forId(tx, auth, id).input('entity', sql.NVarChar(100), entity).input('command', sql.NVarChar(100), input.commandId)
      .input('action', sql.NVarChar(120), action).input('details', sql.NVarChar(sql.MAX), JSON.stringify({ ...details, fingerprint: hash(input) }))
      .query(`INSERT security.AuditEvent(TenantId,ActorUserId,CorrelationId,EventType,EntityType,EntityId,OutcomeCode,DetailsJson)
        VALUES(@tenant,@actor,@command,@action,@entity,LOWER(CONVERT(varchar(36),@id)),'SUCCESS',@details);`);
  }

  async function replay(tx, auth, id, entity, input) {
    const found = (await forId(tx, auth, id).input('entity', sql.NVarChar(100), entity).input('command', sql.NVarChar(100), input.commandId)
      .query(`SELECT TOP(1) ActorUserId AS actor,JSON_VALUE(DetailsJson,'$.fingerprint') AS fingerprint
        FROM security.AuditEvent WHERE TenantId=@tenant AND EntityType=@entity AND EntityId=LOWER(CONVERT(varchar(36),@id))
          AND CorrelationId=@command AND OutcomeCode='SUCCESS';`)).recordset[0];
    if (!found) return false;
    if (found.actor?.toLowerCase() !== auth.userId.toLowerCase() || found.fingerprint !== hash(input)) throw conflict();
    return true;
  }

  async function readItem(tx, auth, id, scope) {
    const fields = enrollmentFields.replace('JOIN core.AppUser u ON', 'JOIN core.AppUser u WITH(HOLDLOCK) ON');
    const row = (await forId(tx, auth, id).query(fields + scope + ' AND n.EnrollmentId=@id;')).recordset[0];
    if (!row) throw unavailable();
    const detail = await forId(tx, auth, id).query(`
      SELECT AttemptId AS id,AttemptNo AS number,StartedAtUtc AS startedAt,DeadlineUtc AS deadline,FinishedAtUtc AS finishedAt,
        CASE WHEN StatusCode='ACTIVE' AND DeadlineUtc<=SYSUTCDATETIME() THEN 'EXPIRED' ELSE StatusCode END AS status,
        ScorePercent AS score,Evidence AS evidence FROM hr.LearningAttempt
      WHERE TenantId=@tenant AND EnrollmentId=@id ORDER BY AttemptNo;
      SELECT TOP(40) CONVERT(varchar(20),a.AuditEventId) AS id,a.OccurredAtUtc AS at,
        COALESCE(JSON_VALUE(a.DetailsJson,'$.action'),a.EventType) AS action,
        JSON_VALUE(a.DetailsJson,'$.note') AS note,u.DisplayName AS actor
      FROM security.AuditEvent a LEFT JOIN core.AppUser u ON u.TenantId=a.TenantId AND u.UserId=a.ActorUserId
      WHERE a.TenantId=@tenant AND a.EntityType=N'LEARNING_ENROLLMENT' AND a.EntityId=LOWER(CONVERT(varchar(36),@id))
      ORDER BY a.OccurredAtUtc DESC,a.AuditEventId DESC;`);
    const [attempts,history] = detail.recordsets;
    let exam = null;
    const active = attempts.find(attempt => attempt.status === 'ACTIVE');
    if (scope === own && active) {
      const course = (await forId(tx, auth, id).query(`SELECT c.QuestionsJson FROM hr.LearningEnrollment n JOIN hr.LearningCourse c
        ON c.TenantId=n.TenantId AND c.CourseId=n.CourseId WHERE n.TenantId=@tenant AND n.EnrollmentId=@id;`)).recordset[0];
      exam = { id: active.id, deadline: active.deadline, questions: JSON.parse(course.QuestionsJson).map(({ prompt, options }) => ({ prompt, options })) };
    }
    const { lessonsJson, userId: _userId, employeeId: _employeeId, ...item } = row;
    return { ...item, lessons: JSON.parse(lessonsJson), attempts, history, exam };
  }

  return {
    list: (auth, review, page) => run(auth, async tx => {
      const rows = (await request(tx, auth).input('offset', sql.Int, (page - 1) * 30).query(enrollmentFields + (review ? supervision : own)
        + ` ORDER BY CASE WHEN n.StatusCode IN('AWAITING_REVIEW','CONDITIONAL') THEN 0 WHEN n.StatusCode='APPROVED' THEN 2 ELSE 1 END,
          c.PathCode,c.LevelNo,n.EnrollmentId OFFSET @offset ROWS FETCH NEXT 31 ROWS ONLY;`)).recordset;
      const summary = !review ? (await request(tx, auth).query(`
        WITH progress AS (
        SELECT n.PathCode AS pathCode,MAX(CASE WHEN n.StatusCode='APPROVED' THEN n.LevelNo ELSE 0 END) AS currentLevel,
          MIN(CASE WHEN n.StatusCode<>'APPROVED' THEN n.LevelNo END) AS assignedLevel
        FROM hr.LearningEnrollment n JOIN hr.Employee e ON e.TenantId=n.TenantId AND e.EmployeeId=n.EmployeeId
        JOIN core.AppUser u ON u.TenantId=e.TenantId AND u.UserId=e.UserId AND u.IsActive=1
        WHERE n.TenantId=@tenant AND e.UserId=@actor AND e.IsDeleted=0 AND e.EmploymentStatus IN(N'ONBOARDING',N'PROBATION',N'ACTIVE')
          AND NOT EXISTS(SELECT 1 FROM hr.Employee other WHERE other.TenantId=e.TenantId AND other.UserId=e.UserId
            AND other.EmployeeId<>e.EmployeeId AND other.IsDeleted=0)
        GROUP BY n.PathCode
        )
        SELECT p.pathCode,p.currentLevel,COALESCE(p.assignedLevel,nextCourse.LevelNo) AS nextLevel,
          CONVERT(bit,CASE WHEN p.assignedLevel IS NULL THEN 0 ELSE 1 END) AS nextAssigned
        FROM progress p OUTER APPLY (
          SELECT TOP(1) c.LevelNo FROM hr.LearningCourse c
          WHERE c.TenantId=@tenant AND c.PathCode=p.pathCode AND c.LevelNo=p.currentLevel+1 ORDER BY c.VersionNo DESC
        ) nextCourse ORDER BY p.pathCode;`)).recordset : [];
      return { items: rows.slice(0, 30).map(({ lessonsJson: _lessons, userId: _user, employeeId: _employee, ...item }) => item),
        paths: summary, hasMore: rows.length > 30 && page < 999 };
    }),

    item: (auth, id, review) => run(auth, tx => readItem(tx, auth, id, review ? supervision : own)),

    directory: (auth, search, employee) => run(auth, async tx => {
      const result = await request(tx, auth).input('search', sql.NVarChar(100), search)
        .input('employee', sql.UniqueIdentifier, employee).query(`
        SELECT TOP(40) e.EmployeeId AS id,u.DisplayName AS name,e.EmployeeCode AS code,
          COALESCE(NULLIF(e.OperationalRole,N''),e.PositionTitle) AS role
        FROM hr.Employee e JOIN core.AppUser u ON u.TenantId=e.TenantId AND u.UserId=e.UserId AND u.IsActive=1
        WHERE e.TenantId=@tenant AND e.IsDeleted=0 AND e.EmploymentStatus IN(N'ONBOARDING',N'PROBATION',N'ACTIVE')
          AND NOT EXISTS(SELECT 1 FROM hr.Employee other WHERE other.TenantId=e.TenantId AND other.UserId=e.UserId
            AND other.EmployeeId<>e.EmployeeId AND other.IsDeleted=0)
          AND ${organizer}
          AND (@search=N'' OR CHARINDEX(@search,u.DisplayName)>0 OR CHARINDEX(@search,e.EmployeeCode)>0 OR e.EmployeeId=@employee)
        ORDER BY CASE WHEN e.EmployeeId=@employee THEN 0 ELSE 1 END,u.DisplayName,e.EmployeeId;
        WITH latest AS (
          SELECT CourseId AS id,PathCode AS pathCode,RoleName AS role,LevelNo AS level,VersionNo AS version,Title AS title,
            ROW_NUMBER() OVER(PARTITION BY PathCode,LevelNo ORDER BY VersionNo DESC) AS seq
          FROM hr.LearningCourse WHERE TenantId=@tenant AND ${organizer}
        )
        SELECT TOP(100) id,pathCode,role,level,version,title FROM latest
        WHERE seq=1 AND (@employee IS NULL OR EXISTS(SELECT 1 FROM hr.Employee e WHERE e.TenantId=@tenant
          AND e.EmployeeId=@employee AND e.IsDeleted=0 AND COALESCE(NULLIF(e.OperationalRole,N''),e.PositionTitle)=latest.role))
        ORDER BY pathCode,level;`);
      return { employees: result.recordsets[0], courses: result.recordsets[1] };
    }),

    publish: (auth, input) => run(auth, async tx => {
      const id = input.commandId;
      const locked = (await forId(tx, auth, id).input('path', sql.VarChar(40), input.pathCode)
        .input('role', sql.NVarChar(120), input.role).input('level', sql.TinyInt, input.level).query(`
        IF NOT ${organizer} BEGIN SELECT 'DENIED' AS outcome; RETURN; END;
        DECLARE @lock int,@resource nvarchar(120)=CONCAT('learning:',@tenant,':',@path);
        EXEC @lock=sys.sp_getapplock @Resource=@resource,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000;
        IF @lock<0 BEGIN SELECT 'BUSY' AS outcome; RETURN; END;
        IF EXISTS(SELECT 1 FROM hr.LearningCourse WITH(UPDLOCK,HOLDLOCK) WHERE TenantId=@tenant AND CourseId=@id)
          BEGIN SELECT 'EXISTS' AS outcome; RETURN; END;
        IF EXISTS(SELECT 1 FROM hr.LearningCourse WHERE TenantId=@tenant AND PathCode=@path AND RoleName<>@role)
          BEGIN SELECT 'ROLE' AS outcome; RETURN; END;
        IF @level>1 AND NOT EXISTS(SELECT 1 FROM hr.LearningCourse WHERE TenantId=@tenant AND PathCode=@path AND LevelNo=@level-1)
          BEGIN SELECT 'LEVEL' AS outcome; RETURN; END;
        SELECT 'READY' AS outcome,ISNULL(MAX(VersionNo),0)+1 AS version FROM hr.LearningCourse WHERE TenantId=@tenant AND PathCode=@path AND LevelNo=@level;`)).recordset[0];
      if (locked.outcome === 'EXISTS' && await replay(tx, auth, id, 'LEARNING_COURSE', input)) return { id };
      if (locked.outcome === 'ROLE') throw invalid('کد مسیر در حال استفاده برای نقش دیگری است.');
      if (locked.outcome === 'LEVEL') throw invalid('ابتدا سطح قبلی همین مسیر را منتشر کنید.');
      if (locked.outcome !== 'READY') throw conflict();
      await forId(tx, auth, id).input('path', sql.VarChar(40), input.pathCode).input('role', sql.NVarChar(120), input.role)
        .input('level', sql.TinyInt, input.level).input('title', sql.NVarChar(160), input.title).input('version', sql.Int, locked.version)
        .input('lessons', sql.NVarChar(sql.MAX), JSON.stringify(input.lessons)).input('questions', sql.NVarChar(sql.MAX), JSON.stringify(input.questions))
        .input('pass', sql.TinyInt, input.passPercent).input('minutes', sql.SmallInt, input.timeLimit).input('attempts', sql.TinyInt, input.maxAttempts)
        .query(`INSERT hr.LearningCourse(TenantId,CourseId,PathCode,RoleName,LevelNo,VersionNo,Title,LessonsJson,QuestionsJson,
          PassPercent,TimeLimitMinutes,MaxAttempts,PublishedBy)
          VALUES(@tenant,@id,@path,@role,@level,@version,@title,@lessons,@questions,@pass,@minutes,@attempts,@actor);`);
      await audit(tx, auth, id, 'LEARNING_COURSE', input, 'HR_LEARNING_PUBLISHED', { version: locked.version, level: input.level });
      return { id };
    }),

    assign: (auth, input) => run(auth, async tx => {
      const id = input.commandId;
      const row = (await forId(tx, auth, id).input('course', sql.UniqueIdentifier, input.courseId)
        .input('employee', sql.UniqueIdentifier, input.employeeId).query(`
        SET NOCOUNT ON;
        IF NOT ${organizer} BEGIN SELECT 'DENIED' AS outcome; RETURN; END;
        IF EXISTS(SELECT 1 FROM hr.LearningEnrollment WITH(UPDLOCK,HOLDLOCK) WHERE TenantId=@tenant AND EnrollmentId=@id)
          BEGIN SELECT 'EXISTS' AS outcome; RETURN; END;
        DECLARE @path varchar(40),@level tinyint;
        SELECT @path=c.PathCode,@level=c.LevelNo
        FROM hr.LearningCourse c WITH(HOLDLOCK)
        JOIN hr.Employee e WITH(UPDLOCK,HOLDLOCK) ON e.TenantId=c.TenantId AND e.EmployeeId=@employee AND e.IsDeleted=0
        JOIN core.AppUser u ON u.TenantId=e.TenantId AND u.UserId=e.UserId AND u.IsActive=1
        WHERE c.TenantId=@tenant AND c.CourseId=@course AND c.RoleName=COALESCE(NULLIF(e.OperationalRole,N''),e.PositionTitle)
          AND e.EmploymentStatus IN(N'ONBOARDING',N'PROBATION',N'ACTIVE')
          AND NOT EXISTS(SELECT 1 FROM hr.Employee other WHERE other.TenantId=e.TenantId AND other.UserId=e.UserId
            AND other.EmployeeId<>e.EmployeeId AND other.IsDeleted=0)
          AND NOT EXISTS(SELECT 1 FROM hr.LearningCourse version WHERE version.TenantId=c.TenantId AND version.PathCode=c.PathCode
            AND version.LevelNo=c.LevelNo AND version.VersionNo>c.VersionNo);
        IF @path IS NULL BEGIN SELECT 'MISMATCH' AS outcome; RETURN; END;
        IF @level>1 AND NOT EXISTS(SELECT 1 FROM hr.LearningEnrollment WITH(UPDLOCK,HOLDLOCK) WHERE TenantId=@tenant
          AND EmployeeId=@employee AND PathCode=@path AND LevelNo=@level-1 AND StatusCode='APPROVED')
          BEGIN SELECT 'LEVEL' AS outcome; RETURN; END;
        IF EXISTS(SELECT 1 FROM hr.LearningEnrollment WITH(UPDLOCK,HOLDLOCK) WHERE TenantId=@tenant
          AND EmployeeId=@employee AND PathCode=@path AND LevelNo=@level)
          BEGIN SELECT 'DUPLICATE' AS outcome; RETURN; END;
        INSERT hr.LearningEnrollment(TenantId,EnrollmentId,EmployeeId,CourseId,PathCode,LevelNo)
          VALUES(@tenant,@id,@employee,@course,@path,@level);
        SELECT 'CREATED' AS outcome;`)).recordset[0];
      if (row.outcome === 'EXISTS' && await replay(tx, auth, id, 'LEARNING_ENROLLMENT', input)) return { id };
      if (row.outcome === 'LEVEL') throw invalid('تخصیص این سطح به تأیید سطح قبلی نیاز دارد.');
      if (row.outcome === 'MISMATCH') throw invalid('نقش شغلی، حساب فعال یا نسخهٔ دوره با تخصیص سازگار نیست.');
      if (row.outcome === 'DUPLICATE') throw invalid('این سطح قبلاً به کارمند تخصیص داده شده است.');
      if (row.outcome !== 'CREATED') throw conflict();
      await audit(tx, auth, id, 'LEARNING_ENROLLMENT', input, 'HR_LEARNING_ASSIGNED', { courseId: input.courseId });
      return { id };
    }),

    change: (auth, id, input) => run(auth, async tx => {
      const review = actionsRequiringReviewer.has(input.action);
      const scope = review ? supervision : own;
      const lockedFields = enrollmentFields.replace('FROM hr.LearningEnrollment n ', 'FROM hr.LearningEnrollment n WITH(UPDLOCK,HOLDLOCK) ')
        .replace('JOIN core.AppUser u ON', 'JOIN core.AppUser u WITH(HOLDLOCK) ON');
      const item = (await forId(tx, auth, id).query(lockedFields + scope + ' AND n.EnrollmentId=@id;')).recordset[0];
      if (!item) throw unavailable();
      if (await replay(tx, auth, id, 'LEARNING_ENROLLMENT', input)) return readItem(tx, auth, id, scope);
      if (item.revision !== input.revision) throw conflict();
      const attempts = (await forId(tx, auth, id).query(`
        UPDATE hr.LearningAttempt SET StatusCode='EXPIRED',FinishedAtUtc=DeadlineUtc
        WHERE TenantId=@tenant AND EnrollmentId=@id AND StatusCode='ACTIVE' AND DeadlineUtc<=SYSUTCDATETIME();
        SELECT AttemptId AS id,StatusCode AS status FROM hr.LearningAttempt WHERE TenantId=@tenant AND EnrollmentId=@id ORDER BY AttemptNo;`)).recordset;
      const latest = attempts.at(-1);
      const available = attempts.length < item.maxAttempts;
      let next = item.status;
      let grade;
      if (input.action === 'COMPLETE_CONTENT' && item.status === 'LEARNING') next = 'EXAM_READY';
      else if (input.action === 'START_EXAM' && ['EXAM_READY', 'RETRY'].includes(item.status)) {
        if (latest?.status === 'ACTIVE') return readItem(tx, auth, id, scope);
        if (available) {
          await forId(tx, auth, id).input('attempt', sql.UniqueIdentifier, input.commandId)
            .input('number', sql.TinyInt, attempts.length + 1).input('minutes', sql.SmallInt, item.timeLimit)
            .query(`DECLARE @now datetime2(3)=SYSUTCDATETIME();
              INSERT hr.LearningAttempt(TenantId,EnrollmentId,AttemptId,AttemptNo,StartedAtUtc,DeadlineUtc)
              VALUES(@tenant,@id,@attempt,@number,@now,DATEADD(minute,@minutes,@now));`);
        } else next = 'EXHAUSTED';
      } else if (input.action === 'SUBMIT_EXAM' && ['EXAM_READY', 'RETRY'].includes(item.status)
        && latest?.id?.toLowerCase() === input.attemptId && ['ACTIVE', 'EXPIRED'].includes(latest.status)) {
        if (latest.status === 'ACTIVE') {
          const result = await forId(tx, auth, id).query(`SELECT c.QuestionsJson FROM hr.LearningEnrollment n JOIN hr.LearningCourse c
            ON c.TenantId=n.TenantId AND c.CourseId=n.CourseId WHERE n.TenantId=@tenant AND n.EnrollmentId=@id;`);
          grade = gradeLearningExam(JSON.parse(result.recordset[0].QuestionsJson), input.answers, item.passPercent);
          if (!grade) throw invalid('پاسخ همهٔ پرسش‌ها باید معتبر باشد.');
          const saved = await forId(tx, auth, id).input('attempt', sql.UniqueIdentifier, input.attemptId)
            .input('score', sql.Decimal(5, 2), grade.score).input('result', sql.VarChar(12), grade.passed ? 'PASSED' : 'FAILED')
            .input('evidence', sql.NVarChar(1000), input.evidence).input('answers', sql.NVarChar(sql.MAX), JSON.stringify(input.answers))
            .query(`DECLARE @now datetime2(3)=SYSUTCDATETIME();
              UPDATE hr.LearningAttempt SET StatusCode=CASE WHEN DeadlineUtc>@now THEN @result ELSE 'EXPIRED' END,
                FinishedAtUtc=CASE WHEN DeadlineUtc>@now THEN @now ELSE DeadlineUtc END,
                ScorePercent=CASE WHEN DeadlineUtc>@now THEN @score END,Evidence=CASE WHEN DeadlineUtc>@now THEN @evidence END,
                AnswersJson=CASE WHEN DeadlineUtc>@now THEN @answers END
              OUTPUT inserted.StatusCode AS status
              WHERE TenantId=@tenant AND EnrollmentId=@id AND AttemptId=@attempt AND StatusCode='ACTIVE';`);
          if (saved.recordset[0]?.status !== 'PASSED' && saved.recordset[0]?.status !== 'FAILED') grade = undefined;
        }
        next = grade?.passed ? 'AWAITING_REVIEW' : available ? 'RETRY' : 'EXHAUSTED';
      } else if (input.action==='COMPLETE_CONDITION' && item.status==='CONDITIONAL' && latest?.status==='PASSED') {
        next = 'AWAITING_REVIEW';
      } else if (['APPROVE', 'CONDITIONAL', 'RETRY'].includes(input.action) && ['AWAITING_REVIEW', 'CONDITIONAL'].includes(item.status)
        && latest?.status === 'PASSED') {
        if (input.action==='CONDITIONAL' && item.status==='CONDITIONAL') throw conflict();
        next = input.action === 'APPROVE' ? 'APPROVED' : input.action === 'CONDITIONAL' ? 'CONDITIONAL' : available ? 'RETRY' : 'EXHAUSTED';
      } else if (input.action === 'PAUSE' && ['LEARNING', 'EXAM_READY', 'RETRY'].includes(item.status)) {
        await forId(tx, auth, id).query(`UPDATE hr.LearningAttempt SET StatusCode='EXPIRED',FinishedAtUtc=SYSUTCDATETIME()
          WHERE TenantId=@tenant AND EnrollmentId=@id AND StatusCode='ACTIVE';`);
        next = 'PAUSED';
      } else if (input.action === 'RESUME' && item.status === 'PAUSED') {
        next = !item.completedAt ? 'LEARNING' : available ? 'EXAM_READY' : 'EXHAUSTED';
      } else throw conflict();

      await forId(tx, auth, id).input('next', sql.VarChar(24), next).input('action', sql.VarChar(24), input.action)
        .input('review', sql.Bit, review).input('note', sql.NVarChar(1000), input.note ?? null).query(`
        UPDATE hr.LearningEnrollment SET StatusCode=@next,Revision=Revision+1,
          ContentCompletedAtUtc=CASE WHEN @action='COMPLETE_CONTENT' THEN SYSUTCDATETIME() ELSE ContentCompletedAtUtc END,
          DecisionBy=CASE WHEN @review=1 THEN @actor ELSE DecisionBy END,
          DecisionAtUtc=CASE WHEN @review=1 THEN SYSUTCDATETIME() ELSE DecisionAtUtc END,
          DecisionNote=CASE WHEN @review=1 THEN @note ELSE DecisionNote END
        WHERE TenantId=@tenant AND EnrollmentId=@id;`);
      await audit(tx, auth, id, 'LEARNING_ENROLLMENT', input, 'HR_LEARNING_ACTION', {
        action: input.action, before: item.status, after: next, note: input.note, version: item.version, grade,
      });
      return readItem(tx, auth, id, scope);
    }),
  };
}
