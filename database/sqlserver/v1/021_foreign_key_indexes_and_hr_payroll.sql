-- ============================================================================
-- AKHAVAN CRM — Migration 021: Foreign Key Performance Indexes & HR / Payroll
-- Version: 0.12.42
-- Description: Composite performance indexes for foreign keys + Canonical DDL
--              for Employee Salary Profiles, Payroll Runs, Advances, Commission
--              plans, and Performance Assessments with strict RLS policies.
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'hr')
BEGIN
    EXEC(N'CREATE SCHEMA [hr] AUTHORIZATION [dbo];');
END;
GO

-- 1. ایندکس‌های با کارایی بالا برای کلیدهای خارجی متداول بر اساس ممیزی (Foreign Key Composite Indexes)
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_Task_Tenant_Owner' AND object_id = OBJECT_ID(N'crm.Task'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_Task_Tenant_Owner]
    ON [crm].[Task] ([TenantId], [OwnerUserId], [DueDate])
    INCLUDE ([Status], [Priority]);
END;
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_Quote_Tenant_Account' AND object_id = OBJECT_ID(N'crm.Quote'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_Quote_Tenant_Account]
    ON [crm].[Quote] ([TenantId], [AccountId], [Status])
    INCLUDE ([TotalAmount], [MarginPercent], [CreatedAt]);
END;
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_InvoiceMirror_Tenant_Account' AND object_id = OBJECT_ID(N'crm.InvoiceMirror'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_InvoiceMirror_Tenant_Account]
    ON [crm].[InvoiceMirror] ([TenantId], [AccountId], [DueDate])
    INCLUDE ([GrossAmount], [NetAmount], [StatusCode], [IsVoided]);
END;
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_Activity_Tenant_Account' AND object_id = OBJECT_ID(N'crm.Activity'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_Activity_Tenant_Account]
    ON [crm].[Activity] ([TenantId], [AccountId], [DateTimeUtc])
    INCLUDE ([Type], [OwnerUserId]);
END;
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_GroupMessage_Tenant_Group' AND object_id = OBJECT_ID(N'crm.GroupMessage'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_GroupMessage_Tenant_Group]
    ON [crm].[GroupMessage] ([TenantId], [GroupId], [CreatedAtUtc])
    INCLUDE ([SenderUserId]);
END;
GO

-- 2. جدول پروفایل حقوقی پرسنل (hr.SalaryProfile)
IF OBJECT_ID(N'hr.SalaryProfile', N'U') IS NULL
BEGIN
    CREATE TABLE [hr].[SalaryProfile] (
        [SalaryProfileId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_SalaryProfile_Id] DEFAULT NEWSEQUENTIALID(),
        [TenantId] UNIQUEIDENTIFIER NOT NULL,
        [UserId] UNIQUEIDENTIFIER NOT NULL,
        [MonthlyFixedSalaryRials] DECIMAL(19, 4) NOT NULL CONSTRAINT [CK_SalaryProfile_PositiveSalary] CHECK ([MonthlyFixedSalaryRials] >= 0),
        [DailyBasis] TINYINT NOT NULL CONSTRAINT [DF_SalaryProfile_DailyBasis] DEFAULT 30 CONSTRAINT [CK_SalaryProfile_DailyBasis] CHECK ([DailyBasis] IN (29, 30, 31)),
        [HousingAllowanceRials] DECIMAL(19, 4) NULL CONSTRAINT [DF_SalaryProfile_Housing] DEFAULT 0,
        [LaborVoucherRials] DECIMAL(19, 4) NULL CONSTRAINT [DF_SalaryProfile_Voucher] DEFAULT 0,
        [ChildrenAllowanceRials] DECIMAL(19, 4) NULL CONSTRAINT [DF_SalaryProfile_Children] DEFAULT 0,
        [RouteDifficultyBonusRials] DECIMAL(19, 4) NULL CONSTRAINT [DF_SalaryProfile_Route] DEFAULT 0,
        [EffectiveFrom] DATE NOT NULL,
        [EffectiveTo] DATE NULL,
        [Version] INT NOT NULL CONSTRAINT [DF_SalaryProfile_Version] DEFAULT 1,
        [CreatedAtUtc] DATETIME2(3) NOT NULL CONSTRAINT [DF_SalaryProfile_CreatedAt] DEFAULT SYSUTCDATETIME(),
        [UpdatedAtUtc] DATETIME2(3) NOT NULL CONSTRAINT [DF_SalaryProfile_UpdatedAt] DEFAULT SYSUTCDATETIME(),
        CONSTRAINT [PK_hr_SalaryProfile] PRIMARY KEY CLUSTERED ([SalaryProfileId]),
        CONSTRAINT [FK_SalaryProfile_Tenant] FOREIGN KEY ([TenantId]) REFERENCES [core].[Tenant] ([TenantId]),
        CONSTRAINT [FK_SalaryProfile_User] FOREIGN KEY ([TenantId], [UserId]) REFERENCES [core].[AppUser] ([TenantId], [UserId])
    );
    CREATE UNIQUE NONCLUSTERED INDEX [UX_SalaryProfile_Active] ON [hr].[SalaryProfile] ([TenantId], [UserId], [EffectiveFrom]) WHERE [EffectiveTo] IS NULL;
END;
GO

-- 3. جدول درخواست‌های مساعده پرسنلی (hr.AdvanceRequest)
IF OBJECT_ID(N'hr.AdvanceRequest', N'U') IS NULL
BEGIN
    CREATE TABLE [hr].[AdvanceRequest] (
        [AdvanceRequestId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_AdvanceRequest_Id] DEFAULT NEWSEQUENTIALID(),
        [TenantId] UNIQUEIDENTIFIER NOT NULL,
        [RequestNumber] NVARCHAR(32) NOT NULL,
        [UserId] UNIQUEIDENTIFIER NOT NULL,
        [RequestedAmountRials] DECIMAL(19, 4) NOT NULL CONSTRAINT [CK_AdvanceRequest_Amount] CHECK ([RequestedAmountRials] > 0),
        [ApprovedAmountRials] DECIMAL(19, 4) NULL,
        [Reason] NVARCHAR(500) NOT NULL,
        [TargetMonth] CHAR(7) NOT NULL, -- YYYY-MM
        [StatusCode] NVARCHAR(32) NOT NULL CONSTRAINT [DF_AdvanceRequest_Status] DEFAULT N'REQUESTED' CONSTRAINT [CK_AdvanceRequest_Status] CHECK ([StatusCode] IN (N'REQUESTED', N'APPROVED', N'REJECTED', N'SETTLED', N'CANCELLED')),
        [ManagerNotes] NVARCHAR(1000) NULL,
        [DecidedByUserId] UNIQUEIDENTIFIER NULL,
        [DecidedAtUtc] DATETIME2(3) NULL,
        [CreatedAtUtc] DATETIME2(3) NOT NULL CONSTRAINT [DF_AdvanceRequest_CreatedAt] DEFAULT SYSUTCDATETIME(),
        CONSTRAINT [PK_hr_AdvanceRequest] PRIMARY KEY CLUSTERED ([AdvanceRequestId]),
        CONSTRAINT [FK_AdvanceRequest_Tenant] FOREIGN KEY ([TenantId]) REFERENCES [core].[Tenant] ([TenantId]),
        CONSTRAINT [FK_AdvanceRequest_User] FOREIGN KEY ([TenantId], [UserId]) REFERENCES [core].[AppUser] ([TenantId], [UserId])
    );
    CREATE UNIQUE NONCLUSTERED INDEX [UX_AdvanceRequest_Number] ON [hr].[AdvanceRequest] ([TenantId], [RequestNumber]);
END;
GO

-- 4. جدول اجرای دوره محاسبه حقوق (hr.PayrollRun)
IF OBJECT_ID(N'hr.PayrollRun', N'U') IS NULL
BEGIN
    CREATE TABLE [hr].[PayrollRun] (
        [PayrollRunId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_PayrollRun_Id] DEFAULT NEWSEQUENTIALID(),
        [TenantId] UNIQUEIDENTIFIER NOT NULL,
        [PeriodMonth] CHAR(7) NOT NULL, -- YYYY-MM
        [DailyBasis] TINYINT NOT NULL CONSTRAINT [DF_PayrollRun_Basis] DEFAULT 30,
        [TotalEmployees] INT NOT NULL CONSTRAINT [CK_PayrollRun_Employees] CHECK ([TotalEmployees] >= 0),
        [TotalGrossRials] DECIMAL(19, 4) NOT NULL,
        [TotalDeductionsRials] DECIMAL(19, 4) NOT NULL,
        [TotalNetRials] DECIMAL(19, 4) NOT NULL,
        [StatusCode] NVARCHAR(32) NOT NULL CONSTRAINT [DF_PayrollRun_Status] DEFAULT N'COMPLETED',
        [ExecutedByUserId] UNIQUEIDENTIFIER NOT NULL,
        [ExecutedAtUtc] DATETIME2(3) NOT NULL CONSTRAINT [DF_PayrollRun_ExecutedAt] DEFAULT SYSUTCDATETIME(),
        [IdempotencyKey] NVARCHAR(128) NOT NULL,
        CONSTRAINT [PK_hr_PayrollRun] PRIMARY KEY CLUSTERED ([PayrollRunId]),
        CONSTRAINT [FK_PayrollRun_Tenant] FOREIGN KEY ([TenantId]) REFERENCES [core].[Tenant] ([TenantId])
    );
    CREATE UNIQUE NONCLUSTERED INDEX [UX_PayrollRun_Idempotency] ON [hr].[PayrollRun] ([TenantId], [IdempotencyKey]);
END;
GO

-- 5. جدول فیش‌های حقوقی صادرشده (hr.Payslip)
IF OBJECT_ID(N'hr.Payslip', N'U') IS NULL
BEGIN
    CREATE TABLE [hr].[Payslip] (
        [PayslipId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_Payslip_Id] DEFAULT NEWSEQUENTIALID(),
        [TenantId] UNIQUEIDENTIFIER NOT NULL,
        [PayrollRunId] UNIQUEIDENTIFIER NOT NULL,
        [UserId] UNIQUEIDENTIFIER NOT NULL,
        [PeriodMonth] CHAR(7) NOT NULL,
        [WorkedDays] TINYINT NOT NULL,
        [DailyBasis] TINYINT NOT NULL,
        [BasePayRials] DECIMAL(19, 4) NOT NULL,
        [OvertimeHours] DECIMAL(6, 2) NOT NULL CONSTRAINT [DF_Payslip_OvertimeHours] DEFAULT 0,
        [OvertimePayRials] DECIMAL(19, 4) NOT NULL CONSTRAINT [DF_Payslip_OvertimePay] DEFAULT 0,
        [MissionDays] TINYINT NOT NULL CONSTRAINT [DF_Payslip_MissionDays] DEFAULT 0,
        [MissionPayRials] DECIMAL(19, 4) NOT NULL CONSTRAINT [DF_Payslip_MissionPay] DEFAULT 0,
        [CommissionRials] DECIMAL(19, 4) NOT NULL CONSTRAINT [DF_Payslip_Commission] DEFAULT 0,
        [TotalBenefitsRials] DECIMAL(19, 4) NOT NULL CONSTRAINT [DF_Payslip_Benefits] DEFAULT 0,
        [GrossPayRials] DECIMAL(19, 4) NOT NULL,
        [AdvanceDeductionRials] DECIMAL(19, 4) NOT NULL CONSTRAINT [DF_Payslip_AdvanceDed] DEFAULT 0,
        [AbsenceDeductionRials] DECIMAL(19, 4) NOT NULL CONSTRAINT [DF_Payslip_AbsenceDed] DEFAULT 0,
        [DelayDeductionRials] DECIMAL(19, 4) NOT NULL CONSTRAINT [DF_Payslip_DelayDed] DEFAULT 0,
        [PerformancePenaltyRials] DECIMAL(19, 4) NOT NULL CONSTRAINT [DF_Payslip_Penalty] DEFAULT 0,
        [TotalDeductionsRials] DECIMAL(19, 4) NOT NULL,
        [NetPayableRials] DECIMAL(19, 4) NOT NULL,
        [StatusCode] NVARCHAR(32) NOT NULL CONSTRAINT [DF_Payslip_Status] DEFAULT N'DRAFT',
        [CalculationSnapshotJson] NVARCHAR(MAX) NOT NULL,
        [CalculatedAtUtc] DATETIME2(3) NOT NULL CONSTRAINT [DF_Payslip_CalculatedAt] DEFAULT SYSUTCDATETIME(),
        CONSTRAINT [PK_hr_Payslip] PRIMARY KEY CLUSTERED ([PayslipId]),
        CONSTRAINT [FK_Payslip_Tenant] FOREIGN KEY ([TenantId]) REFERENCES [core].[Tenant] ([TenantId]),
        CONSTRAINT [FK_Payslip_Run] FOREIGN KEY ([PayrollRunId]) REFERENCES [hr].[PayrollRun] ([PayrollRunId]),
        CONSTRAINT [FK_Payslip_User] FOREIGN KEY ([TenantId], [UserId]) REFERENCES [core].[AppUser] ([TenantId], [UserId])
    );
    CREATE UNIQUE NONCLUSTERED INDEX [UX_Payslip_User_Month] ON [hr].[Payslip] ([TenantId], [UserId], [PeriodMonth]);
END;
GO

-- 6. جدول پلن‌های پورسانت فروش و تراکنش‌های پورسانت (crm.CommissionPlan & crm.CommissionTransaction)
IF OBJECT_ID(N'crm.CommissionPlan', N'U') IS NULL
BEGIN
    CREATE TABLE [crm].[CommissionPlan] (
        [CommissionPlanId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_CommissionPlan_Id] DEFAULT NEWSEQUENTIALID(),
        [TenantId] UNIQUEIDENTIFIER NOT NULL,
        [PlanName] NVARCHAR(128) NOT NULL,
        [RouteDifficultyMultiplier] DECIMAL(4, 2) NOT NULL CONSTRAINT [DF_CommissionPlan_Multiplier] DEFAULT 1.0,
        [IsActive] BIT NOT NULL CONSTRAINT [DF_CommissionPlan_IsActive] DEFAULT 1,
        [CreatedAtUtc] DATETIME2(3) NOT NULL CONSTRAINT [DF_CommissionPlan_CreatedAt] DEFAULT SYSUTCDATETIME(),
        CONSTRAINT [PK_crm_CommissionPlan] PRIMARY KEY CLUSTERED ([CommissionPlanId]),
        CONSTRAINT [FK_CommissionPlan_Tenant] FOREIGN KEY ([TenantId]) REFERENCES [core].[Tenant] ([TenantId])
    );
END;
GO

IF OBJECT_ID(N'crm.CommissionTransaction', N'U') IS NULL
BEGIN
    CREATE TABLE [crm].[CommissionTransaction] (
        [CommissionTransactionId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_CommissionTransaction_Id] DEFAULT NEWSEQUENTIALID(),
        [TenantId] UNIQUEIDENTIFIER NOT NULL,
        [UserId] UNIQUEIDENTIFIER NOT NULL,
        [InvoiceMirrorId] UNIQUEIDENTIFIER NOT NULL,
        [RealizedAmountRials] DECIMAL(19, 4) NOT NULL,
        [AchievementPercent] DECIMAL(6, 2) NOT NULL,
        [AppliedRatePercent] DECIMAL(5, 2) NOT NULL,
        [CommissionAmountRials] DECIMAL(19, 4) NOT NULL,
        [StatusCode] NVARCHAR(32) NOT NULL CONSTRAINT [DF_CommissionTransaction_Status] DEFAULT N'ESTIMATED' CONSTRAINT [CK_CommissionTransaction_Status] CHECK ([StatusCode] IN (N'ESTIMATED', N'APPROVED', N'PAID', N'VOID')),
        [CreatedAtUtc] DATETIME2(3) NOT NULL CONSTRAINT [DF_CommissionTransaction_CreatedAt] DEFAULT SYSUTCDATETIME(),
        CONSTRAINT [PK_crm_CommissionTransaction] PRIMARY KEY CLUSTERED ([CommissionTransactionId]),
        CONSTRAINT [FK_CommissionTransaction_Tenant] FOREIGN KEY ([TenantId]) REFERENCES [core].[Tenant] ([TenantId]),
        CONSTRAINT [FK_CommissionTransaction_User] FOREIGN KEY ([TenantId], [UserId]) REFERENCES [core].[AppUser] ([TenantId], [UserId]),
        CONSTRAINT [FK_CommissionTransaction_Invoice] FOREIGN KEY ([InvoiceMirrorId]) REFERENCES [crm].[InvoiceMirror] ([InvoiceMirrorId])
    );
END;
GO

-- 7. جدول ارزیابی عملکرد و ثبت اعتراضات (hr.PerformanceAssessment & hr.PerformanceAppeal)
IF OBJECT_ID(N'hr.PerformanceAssessment', N'U') IS NULL
BEGIN
    CREATE TABLE [hr].[PerformanceAssessment] (
        [AssessmentId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_PerformanceAssessment_Id] DEFAULT NEWSEQUENTIALID(),
        [TenantId] UNIQUEIDENTIFIER NOT NULL,
        [UserId] UNIQUEIDENTIFIER NOT NULL,
        [PeriodMonth] CHAR(7) NOT NULL,
        [TotalScore] DECIMAL(5, 2) NOT NULL,
        [RecommendedPenaltyRials] DECIMAL(19, 4) NOT NULL CONSTRAINT [DF_PerformanceAssessment_Penalty] DEFAULT 0,
        [RecommendedBonusRials] DECIMAL(19, 4) NOT NULL CONSTRAINT [DF_PerformanceAssessment_Bonus] DEFAULT 0,
        [IsSimulated] BIT NOT NULL CONSTRAINT [DF_PerformanceAssessment_Simulated] DEFAULT 0,
        [AppealStatusCode] NVARCHAR(32) NOT NULL CONSTRAINT [DF_PerformanceAssessment_AppealStatus] DEFAULT N'NONE',
        [AppealText] NVARCHAR(MAX) NULL,
        [CreatedAtUtc] DATETIME2(3) NOT NULL CONSTRAINT [DF_PerformanceAssessment_CreatedAt] DEFAULT SYSUTCDATETIME(),
        CONSTRAINT [PK_hr_PerformanceAssessment] PRIMARY KEY CLUSTERED ([AssessmentId]),
        CONSTRAINT [FK_PerformanceAssessment_Tenant] FOREIGN KEY ([TenantId]) REFERENCES [core].[Tenant] ([TenantId]),
        CONSTRAINT [FK_PerformanceAssessment_User] FOREIGN KEY ([TenantId], [UserId]) REFERENCES [core].[AppUser] ([TenantId], [UserId])
    );
END;
GO

-- 8. پوشش صریح Row-Level Security (RLS) برای تمام جداول جدید این مایگریشن
IF EXISTS (SELECT * FROM sys.security_policies WHERE name = N'TenantFilterSecurityPolicy')
BEGIN
    ALTER SECURITY POLICY [security].[TenantFilterSecurityPolicy]
    ADD FILTER PREDICATE [security].[fn_TenantAccessPredicate]([TenantId]) ON [hr].[SalaryProfile],
    ADD BLOCK PREDICATE [security].[fn_TenantAccessPredicate]([TenantId]) ON [hr].[SalaryProfile] AFTER INSERT, UPDATE,
    ADD FILTER PREDICATE [security].[fn_TenantAccessPredicate]([TenantId]) ON [hr].[AdvanceRequest],
    ADD BLOCK PREDICATE [security].[fn_TenantAccessPredicate]([TenantId]) ON [hr].[AdvanceRequest] AFTER INSERT, UPDATE,
    ADD FILTER PREDICATE [security].[fn_TenantAccessPredicate]([TenantId]) ON [hr].[PayrollRun],
    ADD BLOCK PREDICATE [security].[fn_TenantAccessPredicate]([TenantId]) ON [hr].[PayrollRun] AFTER INSERT, UPDATE,
    ADD FILTER PREDICATE [security].[fn_TenantAccessPredicate]([TenantId]) ON [hr].[Payslip],
    ADD BLOCK PREDICATE [security].[fn_TenantAccessPredicate]([TenantId]) ON [hr].[Payslip] AFTER INSERT, UPDATE,
    ADD FILTER PREDICATE [security].[fn_TenantAccessPredicate]([TenantId]) ON [crm].[CommissionPlan],
    ADD BLOCK PREDICATE [security].[fn_TenantAccessPredicate]([TenantId]) ON [crm].[CommissionPlan] AFTER INSERT, UPDATE,
    ADD FILTER PREDICATE [security].[fn_TenantAccessPredicate]([TenantId]) ON [crm].[CommissionTransaction],
    ADD BLOCK PREDICATE [security].[fn_TenantAccessPredicate]([TenantId]) ON [crm].[CommissionTransaction] AFTER INSERT, UPDATE,
    ADD FILTER PREDICATE [security].[fn_TenantAccessPredicate]([TenantId]) ON [hr].[PerformanceAssessment],
    ADD BLOCK PREDICATE [security].[fn_TenantAccessPredicate]([TenantId]) ON [hr].[PerformanceAssessment] AFTER INSERT, UPDATE;
END;
GO
