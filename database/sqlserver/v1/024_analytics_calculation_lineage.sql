/*
  AKHAVAN CRM — Migration 024: reproducible analytical calculation history.
  Additive only. Reuses analytics.KpiDefinition and analytics.DataQualityRun.
  Adds run-level provenance, per-source coverage/watermarks and versioned metric snapshots.
  This migration is idempotent and must be reviewed/executed on a disposable SQL Server first.
  Static source validation is NOT a substitute for SQL Server runtime/RLS testing.
*/
SET XACT_ABORT ON;
GO

IF OBJECT_ID(N'analytics.CalculationRun',N'U') IS NULL
BEGIN
  CREATE TABLE analytics.CalculationRun (
    CalculationRunId uniqueidentifier NOT NULL CONSTRAINT DF_CalculationRun_Id DEFAULT NEWSEQUENTIALID(),
    TenantId uniqueidentifier NOT NULL,
    EngineCode varchar(100) NOT NULL,
    EngineVersion varchar(40) NOT NULL,
    AlgorithmVersion varchar(40) NOT NULL,
    FormulaVersion varchar(40) NOT NULL,
    StatusCode varchar(20) NOT NULL CONSTRAINT DF_CalculationRun_Status DEFAULT 'RUNNING',
    SourceStatusCode varchar(24) NOT NULL,
    AsOfUtc datetime2(3) NOT NULL,
    PeriodFrom date NULL,
    PeriodTo date NULL,
    StartedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_CalculationRun_Started DEFAULT SYSUTCDATETIME(),
    CompletedAtUtc datetime2(3) NULL,
    InputRecordCount bigint NOT NULL CONSTRAINT DF_CalculationRun_Input DEFAULT 0,
    RejectedRecordCount bigint NOT NULL CONSTRAINT DF_CalculationRun_Rejected DEFAULT 0,
    InputFingerprint binary(32) NULL,
    ParametersJson nvarchar(max) NOT NULL CONSTRAINT DF_CalculationRun_Params DEFAULT N'{}',
    QualitySummaryJson nvarchar(max) NOT NULL CONSTRAINT DF_CalculationRun_Quality DEFAULT N'{}',
    IsDemo bit NOT NULL CONSTRAINT DF_CalculationRun_Demo DEFAULT 0,
    CreatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_CalculationRun_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_CalculationRun PRIMARY KEY(CalculationRunId),
    CONSTRAINT FK_CalculationRun_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
    CONSTRAINT CK_CalculationRun_Status CHECK(StatusCode IN ('RUNNING','SUCCEEDED','PARTIAL','FAILED','CANCELLED')),
    CONSTRAINT CK_CalculationRun_Source CHECK(SourceStatusCode IN ('LIVE','LOCAL','DEMO','PARTIAL','STALE','UNAVAILABLE')),
    CONSTRAINT CK_CalculationRun_Period CHECK(PeriodFrom IS NULL OR PeriodTo IS NULL OR PeriodTo>=PeriodFrom),
    CONSTRAINT CK_CalculationRun_Counts CHECK(InputRecordCount>=0 AND RejectedRecordCount>=0),
    CONSTRAINT CK_CalculationRun_Params CHECK(ISJSON(ParametersJson)=1 AND ISJSON(QualitySummaryJson)=1)
  );
  CREATE INDEX IX_CalculationRun_Latest ON analytics.CalculationRun(TenantId,EngineCode,AsOfUtc DESC) INCLUDE(StatusCode,SourceStatusCode,AlgorithmVersion,FormulaVersion,IsDemo);
END;
GO

IF OBJECT_ID(N'analytics.CalculationRunSource',N'U') IS NULL
BEGIN
  CREATE TABLE analytics.CalculationRunSource (
    CalculationRunSourceId bigint IDENTITY(1,1) NOT NULL,
    TenantId uniqueidentifier NOT NULL,
    CalculationRunId uniqueidentifier NOT NULL,
    SourceObjectCode nvarchar(256) NOT NULL,
    SourceSystemCode varchar(40) NULL,
    SourceStatusCode varchar(24) NOT NULL,
    RowCount bigint NULL,
    MissingCount bigint NOT NULL CONSTRAINT DF_CalcRunSource_Missing DEFAULT 0,
    RejectedCount bigint NOT NULL CONSTRAINT DF_CalcRunSource_Rejected DEFAULT 0,
    WatermarkUtc datetime2(3) NULL,
    SourceFingerprint binary(32) NULL,
    DetailsJson nvarchar(max) NOT NULL CONSTRAINT DF_CalcRunSource_Details DEFAULT N'{}',
    CONSTRAINT PK_CalculationRunSource PRIMARY KEY(CalculationRunSourceId),
    CONSTRAINT FK_CalculationRunSource_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
    CONSTRAINT FK_CalculationRunSource_Run FOREIGN KEY(CalculationRunId) REFERENCES analytics.CalculationRun(CalculationRunId),
    CONSTRAINT UQ_CalculationRunSource UNIQUE(TenantId,CalculationRunId,SourceObjectCode),
    CONSTRAINT CK_CalculationRunSource_Status CHECK(SourceStatusCode IN ('LIVE','LOCAL','DEMO','PARTIAL','STALE','UNAVAILABLE')),
    CONSTRAINT CK_CalculationRunSource_Counts CHECK((RowCount IS NULL OR RowCount>=0) AND MissingCount>=0 AND RejectedCount>=0),
    CONSTRAINT CK_CalculationRunSource_Details CHECK(ISJSON(DetailsJson)=1)
  );
  CREATE INDEX IX_CalculationRunSource_Run ON analytics.CalculationRunSource(TenantId,CalculationRunId);
END;
GO

IF OBJECT_ID(N'analytics.MetricSnapshot',N'U') IS NULL
BEGIN
  CREATE TABLE analytics.MetricSnapshot (
    MetricSnapshotId bigint IDENTITY(1,1) NOT NULL,
    TenantId uniqueidentifier NOT NULL,
    CalculationRunId uniqueidentifier NOT NULL,
    KpiCode varchar(100) NOT NULL,
    KpiVersion int NOT NULL,
    GrainCode varchar(80) NOT NULL,
    DimensionKeyJson nvarchar(max) NOT NULL CONSTRAINT DF_MetricSnapshot_Dimensions DEFAULT N'{}',
    DimensionHash binary(32) NOT NULL,
    ValueDecimal decimal(28,8) NULL,
    DenominatorDecimal decimal(28,8) NULL,
    UnitCode varchar(24) NOT NULL,
    SourceStatusCode varchar(24) NOT NULL,
    CoveragePct decimal(6,2) NULL,
    IsDemo bit NOT NULL CONSTRAINT DF_MetricSnapshot_Demo DEFAULT 0,
    AsOfUtc datetime2(3) NOT NULL,
    PeriodFrom date NULL,
    PeriodTo date NULL,
    CreatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_MetricSnapshot_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_MetricSnapshot PRIMARY KEY(MetricSnapshotId),
    CONSTRAINT FK_MetricSnapshot_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
    CONSTRAINT FK_MetricSnapshot_Run FOREIGN KEY(CalculationRunId) REFERENCES analytics.CalculationRun(CalculationRunId),
    CONSTRAINT FK_MetricSnapshot_Kpi FOREIGN KEY(KpiCode,KpiVersion) REFERENCES analytics.KpiDefinition(KpiCode,KpiVersion),
    CONSTRAINT UQ_MetricSnapshot_RunMetric UNIQUE(TenantId,CalculationRunId,KpiCode,KpiVersion,GrainCode,DimensionHash),
    CONSTRAINT CK_MetricSnapshot_Dimensions CHECK(ISJSON(DimensionKeyJson)=1),
    CONSTRAINT CK_MetricSnapshot_Source CHECK(SourceStatusCode IN ('LIVE','LOCAL','DEMO','PARTIAL','STALE','UNAVAILABLE')),
    CONSTRAINT CK_MetricSnapshot_Coverage CHECK(CoveragePct IS NULL OR (CoveragePct>=0 AND CoveragePct<=100)),
    CONSTRAINT CK_MetricSnapshot_Period CHECK(PeriodFrom IS NULL OR PeriodTo IS NULL OR PeriodTo>=PeriodFrom)
  );
  CREATE INDEX IX_MetricSnapshot_Lookup ON analytics.MetricSnapshot(TenantId,KpiCode,AsOfUtc DESC,GrainCode) INCLUDE(ValueDecimal,UnitCode,SourceStatusCode,CoveragePct,IsDemo,CalculationRunId);
END;
GO

/* KpiDefinition remains the one canonical KPI registry; these optional columns hold governed configuration. */
IF COL_LENGTH(N'analytics.KpiDefinition',N'ConfigurationJson') IS NULL
  ALTER TABLE analytics.KpiDefinition ADD ConfigurationJson nvarchar(max) NOT NULL CONSTRAINT DF_KpiDefinition_Configuration DEFAULT N'{}';
GO
IF COL_LENGTH(N'analytics.KpiDefinition',N'ConfigurationJson') IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_KpiDefinition_Configuration')
  ALTER TABLE analytics.KpiDefinition ADD CONSTRAINT CK_KpiDefinition_Configuration CHECK(ISJSON(ConfigurationJson)=1);
GO

/* Extend the existing tenant policy; no parallel RLS policy is created. */
IF EXISTS (SELECT 1 FROM sys.security_policies WHERE name=N'TenantIsolationPolicy' AND schema_id=SCHEMA_ID(N'security'))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE target_object_id=OBJECT_ID(N'analytics.CalculationRun') AND predicate_type_desc=N'FILTER')
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON analytics.CalculationRun;
  IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE target_object_id=OBJECT_ID(N'analytics.CalculationRunSource') AND predicate_type_desc=N'FILTER')
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON analytics.CalculationRunSource;
  IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE target_object_id=OBJECT_ID(N'analytics.MetricSnapshot') AND predicate_type_desc=N'FILTER')
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON analytics.MetricSnapshot;
END;
GO
