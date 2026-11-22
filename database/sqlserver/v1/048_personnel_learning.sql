SET XACT_ABORT ON;
GO
IF OBJECT_ID(N'hr.LearningCourse',N'U') IS NULL
BEGIN
  CREATE TABLE hr.LearningCourse (
    TenantId uniqueidentifier NOT NULL, CourseId uniqueidentifier NOT NULL,
    PathCode varchar(40) NOT NULL, RoleName nvarchar(120) NOT NULL,
    LevelNo tinyint NOT NULL, VersionNo int NOT NULL, Title nvarchar(160) NOT NULL,
    LessonsJson nvarchar(max) NOT NULL, QuestionsJson nvarchar(max) NOT NULL,
    PassPercent tinyint NOT NULL, TimeLimitMinutes smallint NOT NULL, MaxAttempts tinyint NOT NULL,
    PublishedBy uniqueidentifier NOT NULL, PublishedAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_LearningCourse PRIMARY KEY(TenantId,CourseId),
    CONSTRAINT UQ_LearningCourse_Version UNIQUE(TenantId,PathCode,LevelNo,VersionNo),
    CONSTRAINT CK_LearningCourse_Rules CHECK(LevelNo BETWEEN 1 AND 40 AND VersionNo>0 AND PassPercent BETWEEN 1 AND 100
      AND TimeLimitMinutes BETWEEN 1 AND 180 AND MaxAttempts BETWEEN 1 AND 12
      AND ISJSON(LessonsJson)=1 AND ISJSON(QuestionsJson)=1)
  );
END;
GO
IF OBJECT_ID(N'hr.LearningEnrollment',N'U') IS NULL
BEGIN
  CREATE TABLE hr.LearningEnrollment (
    TenantId uniqueidentifier NOT NULL, EnrollmentId uniqueidentifier NOT NULL, EmployeeId uniqueidentifier NOT NULL,
    CourseId uniqueidentifier NOT NULL, PathCode varchar(40) NOT NULL, LevelNo tinyint NOT NULL,
    StatusCode varchar(24) NOT NULL DEFAULT 'LEARNING', Revision int NOT NULL DEFAULT 1,
    AssignedAtUtc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(), ContentCompletedAtUtc datetime2(3) NULL,
    DecisionBy uniqueidentifier NULL, DecisionAtUtc datetime2(3) NULL, DecisionNote nvarchar(1000) NULL,
    CONSTRAINT PK_LearningEnrollment PRIMARY KEY(TenantId,EnrollmentId),
    CONSTRAINT UQ_LearningEnrollment_Level UNIQUE(TenantId,EmployeeId,PathCode,LevelNo),
    CONSTRAINT FK_LearningEnrollment_Course FOREIGN KEY(TenantId,CourseId) REFERENCES hr.LearningCourse(TenantId,CourseId),
    CONSTRAINT FK_LearningEnrollment_Employee FOREIGN KEY(EmployeeId) REFERENCES hr.Employee(EmployeeId),
    CONSTRAINT CK_LearningEnrollment_Status CHECK(StatusCode IN ('LEARNING','EXAM_READY','AWAITING_REVIEW','CONDITIONAL','RETRY','EXHAUSTED','APPROVED','PAUSED'))
  );
  CREATE INDEX IX_LearningEnrollment_Review ON hr.LearningEnrollment(TenantId,StatusCode,EmployeeId);
END;
GO
IF OBJECT_ID(N'hr.LearningAttempt',N'U') IS NULL
BEGIN
  CREATE TABLE hr.LearningAttempt (
    TenantId uniqueidentifier NOT NULL, EnrollmentId uniqueidentifier NOT NULL, AttemptId uniqueidentifier NOT NULL,
    AttemptNo tinyint NOT NULL, StartedAtUtc datetime2(3) NOT NULL, DeadlineUtc datetime2(3) NOT NULL, FinishedAtUtc datetime2(3) NULL,
    StatusCode varchar(12) NOT NULL DEFAULT 'ACTIVE', ScorePercent decimal(5,2) NULL, Evidence nvarchar(1000) NULL,
    AnswersJson nvarchar(max) NULL,
    CONSTRAINT PK_LearningAttempt PRIMARY KEY(TenantId,AttemptId),
    CONSTRAINT UQ_LearningAttempt_Sequence UNIQUE(TenantId,EnrollmentId,AttemptNo),
    CONSTRAINT FK_LearningAttempt_Enrollment FOREIGN KEY(TenantId,EnrollmentId) REFERENCES hr.LearningEnrollment(TenantId,EnrollmentId),
    CONSTRAINT CK_LearningAttempt_Status CHECK(StatusCode IN ('ACTIVE','PASSED','FAILED','EXPIRED')),
    CONSTRAINT CK_LearningAttempt_Answer CHECK(AnswersJson IS NULL OR ISJSON(AnswersJson)=1)
  );
  CREATE UNIQUE INDEX UX_LearningAttempt_Active ON hr.LearningAttempt(TenantId,EnrollmentId) WHERE StatusCode='ACTIVE';
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE target_object_id=OBJECT_ID(N'hr.LearningCourse'))
 ALTER SECURITY POLICY security.TenantIsolationPolicy
   ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON hr.LearningCourse,
   ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON hr.LearningCourse AFTER INSERT,
   ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON hr.LearningCourse AFTER UPDATE;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE target_object_id=OBJECT_ID(N'hr.LearningEnrollment'))
 ALTER SECURITY POLICY security.TenantIsolationPolicy
   ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON hr.LearningEnrollment,
   ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON hr.LearningEnrollment AFTER INSERT,
   ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON hr.LearningEnrollment AFTER UPDATE;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE target_object_id=OBJECT_ID(N'hr.LearningAttempt'))
 ALTER SECURITY POLICY security.TenantIsolationPolicy
   ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON hr.LearningAttempt,
   ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON hr.LearningAttempt AFTER INSERT,
   ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON hr.LearningAttempt AFTER UPDATE;
GO
