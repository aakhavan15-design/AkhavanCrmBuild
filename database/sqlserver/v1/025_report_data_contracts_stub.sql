-- 025_report_data_contracts_stub.sql
-- قانون ۱ و ۲ گزارش‌ها: گزارش به‌خاطر نبود زیرساخت متوقف نمی‌شود.
-- این اسکلت قرارداد داده برای توسعه تدریجی View/Index است؛ اجرای واقعی روی SQL Server هدف.

-- IF NOT EXISTS metric registry extension for configurable thresholds
-- (مقادیر واقعی از CRM orgConfig هم خوانده می‌شوند)
/*
IF OBJECT_ID(N'dbo.MetricThresholdConfig', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.MetricThresholdConfig (
    Id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    TenantId NVARCHAR(64) NULL,
    MetricKey NVARCHAR(128) NOT NULL,
    ThresholdValue DECIMAL(18,4) NOT NULL,
    Unit NVARCHAR(32) NULL,
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE UNIQUE INDEX IX_MetricThreshold_Tenant_Key ON dbo.MetricThresholdConfig(TenantId, MetricKey);
END
*/

-- Placeholder: analytics fact completeness flag for DEMO vs authoritative
-- گزارش‌ها باید lineage و DEMO را از لایه CRM نیز بخوانند (dataTrust.ts).
