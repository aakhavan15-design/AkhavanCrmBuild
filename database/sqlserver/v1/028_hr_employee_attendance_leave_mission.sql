-- ============================================================================
-- AKHAVAN CRM — Migration 028: HR Employee, Attendance, Leave, Overtime, Mission
-- Version: 0.12.63
-- Description: Incremental canonical tables for F8-03 (Employee profile, Attendance,
--              LeaveRequest, OvertimeRequest, MissionRequest, ApprovalHistory).
--              Idempotent, tenant-scoped, RLS-ready. No data mutation of existing rows.
-- Owner rule: Person → Employee → UserAccount model; ERP reference data is read-only.
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'hr')
BEGIN
    EXEC(N'CREATE SCHEMA [hr] AUTHORIZATION [dbo];');
END;
GO

IF OBJECT_ID(N'hr.Employee', N'U') IS NULL
BEGIN
    CREATE TABLE [hr].[Employee] (
        [EmployeeId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_Employee_Id] DEFAULT NEWSEQUENTIALID(),
        [TenantId] UNIQUEIDENTIFIER NOT NULL,
        [UserId] UNIQUEIDENTIFIER NULL,
        [PersonId] UNIQUEIDENTIFIER NULL,
        [EmployeeCode] NVARCHAR(32) NOT NULL,
        [CommercialCode] NVARCHAR(32) NULL,
        [DetailCode] NVARCHAR(32) NULL,
        [DisplayName] NVARCHAR(200) NOT NULL,
        [NationalId] NVARCHAR(20) NULL,
        [BranchId] UNIQUEIDENTIFIER NULL,
        [UnitId] UNIQUEIDENTIFIER NULL,
        [PositionTitle] NVARCHAR(120) NULL,
        [OperationalRole] NVARCHAR(64) NULL,
        [ManagerEmployeeId] UNIQUEIDENTIFIER NULL,
        [EmploymentStatus] NVARCHAR(32) NOT NULL CONSTRAINT [DF_Employee_Status] DEFAULT N'ACTIVE',
        [HireDate] DATE NULL,
        [TerminationDate] DATE NULL,
        [Origin] NVARCHAR(16) NOT NULL CONSTRAINT [DF_Employee_Origin] DEFAULT N'LOCAL',
        [EffectiveFromUtc] DATETIME2(3) NOT NULL CONSTRAINT [DF_Employee_EffectiveFrom] DEFAULT SYSUTCDATETIME(),
        [CreatedAtUtc] DATETIME2(3) NOT NULL CONSTRAINT [DF_Employee_CreatedAt] DEFAULT SYSUTCDATETIME(),
        [CreatedByUserId] UNIQUEIDENTIFIER NULL,
        [UpdatedAtUtc] DATETIME2(3) NULL,
        [UpdatedByUserId] UNIQUEIDENTIFIER NULL,
        [IsDeleted] BIT NOT NULL CONSTRAINT [DF_Employee_IsDeleted] DEFAULT 0,
        CONSTRAINT [PK_hr_Employee] PRIMARY KEY CLUSTERED ([EmployeeId]),
        CONSTRAINT [FK_Employee_Tenant] FOREIGN KEY ([TenantId]) REFERENCES [core].[Tenant] ([TenantId]),
        CONSTRAINT [CK_Employee_Origin] CHECK ([Origin] IN (N'LOCAL', N'ERP_MIRROR')),
        CONSTRAINT [CK_Employee_Status] CHECK ([EmploymentStatus] IN (N'ACTIVE', N'SUSPENDED', N'TERMINATED', N'PROBATION', N'ONBOARDING'))
    );
    CREATE UNIQUE NONCLUSTERED INDEX [UX_Employee_Tenant_Code] ON [hr].[Employee] ([TenantId], [EmployeeCode]) WHERE [IsDeleted] = 0;
    CREATE NONCLUSTERED INDEX [IX_Employee_Tenant_User] ON [hr].[Employee] ([TenantId], [UserId]) WHERE [UserId] IS NOT NULL AND [IsDeleted] = 0;
    CREATE NONCLUSTERED INDEX [IX_Employee_Manager] ON [hr].[Employee] ([TenantId], [ManagerEmployeeId]) WHERE [ManagerEmployeeId] IS NOT NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Employee_Manager')
BEGIN
    ALTER TABLE [hr].[Employee] WITH CHECK
    ADD CONSTRAINT [FK_Employee_Manager] FOREIGN KEY ([ManagerEmployeeId]) REFERENCES [hr].[Employee] ([EmployeeId]);
END;
GO

IF OBJECT_ID(N'hr.Attendance', N'U') IS NULL
BEGIN
    CREATE TABLE [hr].[Attendance] (
        [AttendanceId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_Attendance_Id] DEFAULT NEWSEQUENTIALID(),
        [TenantId] UNIQUEIDENTIFIER NOT NULL,
        [EmployeeId] UNIQUEIDENTIFIER NOT NULL,
        [WorkDate] DATE NOT NULL,
        [CheckInAtUtc] DATETIME2(3) NULL,
        [CheckOutAtUtc] DATETIME2(3) NULL,
        [Source] NVARCHAR(32) NOT NULL CONSTRAINT [DF_Attendance_Source] DEFAULT N'MANUAL',
        [StatusCode] NVARCHAR(32) NOT NULL CONSTRAINT [DF_Attendance_Status] DEFAULT N'PRESENT',
        [Notes] NVARCHAR(500) NULL,
        [CreatedAtUtc] DATETIME2(3) NOT NULL CONSTRAINT [DF_Attendance_CreatedAt] DEFAULT SYSUTCDATETIME(),
        [CreatedByUserId] UNIQUEIDENTIFIER NULL,
        CONSTRAINT [PK_hr_Attendance] PRIMARY KEY CLUSTERED ([AttendanceId]),
        CONSTRAINT [FK_Attendance_Tenant] FOREIGN KEY ([TenantId]) REFERENCES [core].[Tenant] ([TenantId]),
        CONSTRAINT [FK_Attendance_Employee] FOREIGN KEY ([EmployeeId]) REFERENCES [hr].[Employee] ([EmployeeId])
    );
    CREATE UNIQUE NONCLUSTERED INDEX [UX_Attendance_Employee_Date] ON [hr].[Attendance] ([TenantId], [EmployeeId], [WorkDate]);
END;
GO

IF OBJECT_ID(N'hr.LeaveRequest', N'U') IS NULL
BEGIN
    CREATE TABLE [hr].[LeaveRequest] (
        [LeaveRequestId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_LeaveRequest_Id] DEFAULT NEWSEQUENTIALID(),
        [TenantId] UNIQUEIDENTIFIER NOT NULL,
        [EmployeeId] UNIQUEIDENTIFIER NOT NULL,
        [LeaveType] NVARCHAR(32) NOT NULL,
        [StartDate] DATE NOT NULL,
        [EndDate] DATE NOT NULL,
        [DaysCount] DECIMAL(5, 2) NOT NULL,
        [Reason] NVARCHAR(500) NULL,
        [StatusCode] NVARCHAR(32) NOT NULL CONSTRAINT [DF_LeaveRequest_Status] DEFAULT N'DRAFT',
        [SubmittedAtUtc] DATETIME2(3) NULL,
        [DecidedAtUtc] DATETIME2(3) NULL,
        [DecidedByUserId] UNIQUEIDENTIFIER NULL,
        [DecisionNote] NVARCHAR(500) NULL,
        [CreatedAtUtc] DATETIME2(3) NOT NULL CONSTRAINT [DF_LeaveRequest_CreatedAt] DEFAULT SYSUTCDATETIME(),
        [CreatedByUserId] UNIQUEIDENTIFIER NULL,
        [IdempotencyKey] NVARCHAR(64) NULL,
        CONSTRAINT [PK_hr_LeaveRequest] PRIMARY KEY CLUSTERED ([LeaveRequestId]),
        CONSTRAINT [FK_LeaveRequest_Tenant] FOREIGN KEY ([TenantId]) REFERENCES [core].[Tenant] ([TenantId]),
        CONSTRAINT [FK_LeaveRequest_Employee] FOREIGN KEY ([EmployeeId]) REFERENCES [hr].[Employee] ([EmployeeId]),
        CONSTRAINT [CK_LeaveRequest_Dates] CHECK ([EndDate] >= [StartDate])
    );
    CREATE UNIQUE NONCLUSTERED INDEX [UX_LeaveRequest_Idempotency] ON [hr].[LeaveRequest] ([TenantId], [IdempotencyKey]) WHERE [IdempotencyKey] IS NOT NULL;
    CREATE NONCLUSTERED INDEX [IX_LeaveRequest_Employee_Status] ON [hr].[LeaveRequest] ([TenantId], [EmployeeId], [StatusCode]);
END;
GO

IF OBJECT_ID(N'hr.OvertimeRequest', N'U') IS NULL
BEGIN
    CREATE TABLE [hr].[OvertimeRequest] (
        [OvertimeRequestId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_OvertimeRequest_Id] DEFAULT NEWSEQUENTIALID(),
        [TenantId] UNIQUEIDENTIFIER NOT NULL,
        [EmployeeId] UNIQUEIDENTIFIER NOT NULL,
        [WorkDate] DATE NOT NULL,
        [Hours] DECIMAL(5, 2) NOT NULL,
        [Reason] NVARCHAR(500) NULL,
        [StatusCode] NVARCHAR(32) NOT NULL CONSTRAINT [DF_OvertimeRequest_Status] DEFAULT N'DRAFT',
        [SubmittedAtUtc] DATETIME2(3) NULL,
        [DecidedAtUtc] DATETIME2(3) NULL,
        [DecidedByUserId] UNIQUEIDENTIFIER NULL,
        [DecisionNote] NVARCHAR(500) NULL,
        [CreatedAtUtc] DATETIME2(3) NOT NULL CONSTRAINT [DF_OvertimeRequest_CreatedAt] DEFAULT SYSUTCDATETIME(),
        [CreatedByUserId] UNIQUEIDENTIFIER NULL,
        [IdempotencyKey] NVARCHAR(64) NULL,
        CONSTRAINT [PK_hr_OvertimeRequest] PRIMARY KEY CLUSTERED ([OvertimeRequestId]),
        CONSTRAINT [FK_OvertimeRequest_Tenant] FOREIGN KEY ([TenantId]) REFERENCES [core].[Tenant] ([TenantId]),
        CONSTRAINT [FK_OvertimeRequest_Employee] FOREIGN KEY ([EmployeeId]) REFERENCES [hr].[Employee] ([EmployeeId]),
        CONSTRAINT [CK_Overtime_Hours] CHECK ([Hours] > 0)
    );
    CREATE UNIQUE NONCLUSTERED INDEX [UX_OvertimeRequest_Idempotency] ON [hr].[OvertimeRequest] ([TenantId], [IdempotencyKey]) WHERE [IdempotencyKey] IS NOT NULL;
END;
GO

IF OBJECT_ID(N'hr.MissionRequest', N'U') IS NULL
BEGIN
    CREATE TABLE [hr].[MissionRequest] (
        [MissionRequestId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_MissionRequest_Id] DEFAULT NEWSEQUENTIALID(),
        [TenantId] UNIQUEIDENTIFIER NOT NULL,
        [EmployeeId] UNIQUEIDENTIFIER NOT NULL,
        [StartDate] DATE NOT NULL,
        [EndDate] DATE NOT NULL,
        [Destination] NVARCHAR(200) NULL,
        [Purpose] NVARCHAR(500) NULL,
        [DaysCount] DECIMAL(5, 2) NOT NULL,
        [StatusCode] NVARCHAR(32) NOT NULL CONSTRAINT [DF_MissionRequest_Status] DEFAULT N'DRAFT',
        [SubmittedAtUtc] DATETIME2(3) NULL,
        [DecidedAtUtc] DATETIME2(3) NULL,
        [DecidedByUserId] UNIQUEIDENTIFIER NULL,
        [DecisionNote] NVARCHAR(500) NULL,
        [CreatedAtUtc] DATETIME2(3) NOT NULL CONSTRAINT [DF_MissionRequest_CreatedAt] DEFAULT SYSUTCDATETIME(),
        [CreatedByUserId] UNIQUEIDENTIFIER NULL,
        [IdempotencyKey] NVARCHAR(64) NULL,
        CONSTRAINT [PK_hr_MissionRequest] PRIMARY KEY CLUSTERED ([MissionRequestId]),
        CONSTRAINT [FK_MissionRequest_Tenant] FOREIGN KEY ([TenantId]) REFERENCES [core].[Tenant] ([TenantId]),
        CONSTRAINT [FK_MissionRequest_Employee] FOREIGN KEY ([EmployeeId]) REFERENCES [hr].[Employee] ([EmployeeId]),
        CONSTRAINT [CK_Mission_Dates] CHECK ([EndDate] >= [StartDate])
    );
    CREATE UNIQUE NONCLUSTERED INDEX [UX_MissionRequest_Idempotency] ON [hr].[MissionRequest] ([TenantId], [IdempotencyKey]) WHERE [IdempotencyKey] IS NOT NULL;
END;
GO

IF OBJECT_ID(N'hr.ApprovalHistory', N'U') IS NULL
BEGIN
    CREATE TABLE [hr].[ApprovalHistory] (
        [ApprovalHistoryId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_ApprovalHistory_Id] DEFAULT NEWSEQUENTIALID(),
        [TenantId] UNIQUEIDENTIFIER NOT NULL,
        [EntityType] NVARCHAR(64) NOT NULL,
        [EntityId] UNIQUEIDENTIFIER NOT NULL,
        [FromStatus] NVARCHAR(32) NULL,
        [ToStatus] NVARCHAR(32) NOT NULL,
        [ActorUserId] UNIQUEIDENTIFIER NULL,
        [ActorEmployeeId] UNIQUEIDENTIFIER NULL,
        [ActionCode] NVARCHAR(32) NOT NULL,
        [Note] NVARCHAR(1000) NULL,
        [OccurredAtUtc] DATETIME2(3) NOT NULL CONSTRAINT [DF_ApprovalHistory_At] DEFAULT SYSUTCDATETIME(),
        CONSTRAINT [PK_hr_ApprovalHistory] PRIMARY KEY CLUSTERED ([ApprovalHistoryId]),
        CONSTRAINT [FK_ApprovalHistory_Tenant] FOREIGN KEY ([TenantId]) REFERENCES [core].[Tenant] ([TenantId])
    );
    CREATE NONCLUSTERED INDEX [IX_ApprovalHistory_Entity] ON [hr].[ApprovalHistory] ([TenantId], [EntityType], [EntityId], [OccurredAtUtc]);
END;
GO

IF OBJECT_ID(N'hr.TargetAssignment', N'U') IS NULL
BEGIN
    CREATE TABLE [hr].[TargetAssignment] (
        [TargetAssignmentId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_TargetAssignment_Id] DEFAULT NEWSEQUENTIALID(),
        [TenantId] UNIQUEIDENTIFIER NOT NULL,
        [EmployeeId] UNIQUEIDENTIFIER NOT NULL,
        [TargetModel] NVARCHAR(32) NOT NULL,
        [PeriodStart] DATE NOT NULL,
        [PeriodEnd] DATE NOT NULL,
        [TargetValue] DECIMAL(19, 4) NOT NULL,
        [Unit] NVARCHAR(16) NOT NULL CONSTRAINT [DF_TargetAssignment_Unit] DEFAULT N'IRR',
        [StatusCode] NVARCHAR(32) NOT NULL CONSTRAINT [DF_TargetAssignment_Status] DEFAULT N'ACTIVE',
        [CreatedAtUtc] DATETIME2(3) NOT NULL CONSTRAINT [DF_TargetAssignment_CreatedAt] DEFAULT SYSUTCDATETIME(),
        [CreatedByUserId] UNIQUEIDENTIFIER NULL,
        CONSTRAINT [PK_hr_TargetAssignment] PRIMARY KEY CLUSTERED ([TargetAssignmentId]),
        CONSTRAINT [FK_TargetAssignment_Tenant] FOREIGN KEY ([TenantId]) REFERENCES [core].[Tenant] ([TenantId]),
        CONSTRAINT [FK_TargetAssignment_Employee] FOREIGN KEY ([EmployeeId]) REFERENCES [hr].[Employee] ([EmployeeId])
    );
    CREATE NONCLUSTERED INDEX [IX_TargetAssignment_Employee_Period] ON [hr].[TargetAssignment] ([TenantId], [EmployeeId], [PeriodStart], [PeriodEnd]);
END;
GO

PRINT N'Migration 028 completed: hr.Employee, Attendance, LeaveRequest, OvertimeRequest, MissionRequest, ApprovalHistory, TargetAssignment';
GO
