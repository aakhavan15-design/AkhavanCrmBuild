-- ============================================================================
-- AKHAVAN CRM — Migration 022: Complete ERP Mirror, Analytical Views & SPs
-- Version: 0.12.42
-- Description: Readying the production SQL Server for zero-rewrite connection.
--              Analytical Views for 11 canonical reports + Transactional Stored
--              Procedures with Idempotency and Audit generation.
-- ============================================================================

-- ۱. ویوی تحلیلی سودآوری و بهای تمام‌شده (گزارش ۱)
IF OBJECT_ID(N'analytics.vw_Report1_ProfitabilityOverview', N'V') IS NOT NULL
    DROP VIEW [analytics].[vw_Report1_ProfitabilityOverview];
GO
CREATE VIEW [analytics].[vw_Report1_ProfitabilityOverview]
WITH SCHEMABINDING
AS
SELECT 
    i.[TenantId],
    YEAR(i.[InvoiceDate]) AS [FiscalYear],
    MONTH(i.[InvoiceDate]) AS [FiscalMonth],
    COUNT_BIG(*) AS [TotalInvoiceLines],
    SUM(ISNULL(l.[NetLineAmount], 0)) AS [GrossSalesRials],
    SUM(ISNULL(l.[CostAmount], 0)) AS [RecognizedCogsRials],
    SUM(CASE WHEN l.[CostAmount] IS NOT NULL AND l.[CostAmount] > 0 THEN 1 ELSE 0 END) AS [CostKnownLinesCount]
FROM [crm].[InvoiceMirror] i
INNER JOIN [crm].[InvoiceLineMirror] l 
    ON i.[InvoiceMirrorId] = l.[InvoiceMirrorId] AND i.[TenantId] = l.[TenantId]
WHERE i.[IsVoided] = 0 AND i.[StatusCode] IN (N'POSTED', N'CONFIRMED', N'CLOSED')
GROUP BY i.[TenantId], YEAR(i.[InvoiceDate]), MONTH(i.[InvoiceDate]);
GO

-- ۲. ویوی تحلیلی تحقق اهداف فروش (گزارش ۲)
IF OBJECT_ID(N'analytics.vw_Report2_SalesPerformanceAndTarget', N'V') IS NOT NULL
    DROP VIEW [analytics].[vw_Report2_SalesPerformanceAndTarget];
GO
CREATE VIEW [analytics].[vw_Report2_SalesPerformanceAndTarget]
AS
SELECT 
    i.[TenantId],
    i.[SalesRepUserId],
    FORMAT(i.[InvoiceDate], 'yyyy-MM') AS [PeriodMonth],
    SUM(i.[NetAmount]) AS [RealizedSalesRials],
    COUNT(i.[InvoiceMirrorId]) AS [InvoicesCount]
FROM [crm].[InvoiceMirror] i
WHERE i.[IsVoided] = 0 AND i.[StatusCode] IN (N'POSTED', N'CONFIRMED', N'CLOSED')
GROUP BY i.[TenantId], i.[SalesRepUserId], FORMAT(i.[InvoiceDate], 'yyyy-MM');
GO

-- ۳. ویوی پارتو تمرکز درآمد (گزارش ۵)
IF OBJECT_ID(N'analytics.vw_Report5_CustomerParetoConcentration', N'V') IS NOT NULL
    DROP VIEW [analytics].[vw_Report5_CustomerParetoConcentration];
GO
CREATE VIEW [analytics].[vw_Report5_CustomerParetoConcentration]
AS
SELECT 
    i.[TenantId],
    i.[AccountId],
    SUM(i.[NetAmount]) AS [CustomerTotalNetSalesRials],
    COUNT(i.[InvoiceMirrorId]) AS [TotalInvoicesCount],
    MAX(i.[InvoiceDate]) AS [LastInvoiceDate]
FROM [crm].[InvoiceMirror] i
WHERE i.[IsVoided] = 0 AND i.[StatusCode] IN (N'POSTED', N'CONFIRMED', N'CLOSED')
GROUP BY i.[TenantId], i.[AccountId];
GO

-- ۴. رویه ذخیره‌شده ثبت اتمیک فاکتور دستی / سند با قفل تکرارناپذیری (crm.SubmitManualInvoice)
IF OBJECT_ID(N'crm.SubmitManualInvoice', N'P') IS NOT NULL
    DROP PROCEDURE [crm].[SubmitManualInvoice];
GO
CREATE PROCEDURE [crm].[SubmitManualInvoice]
    @TenantId UNIQUEIDENTIFIER,
    @AccountId UNIQUEIDENTIFIER,
    @InvoiceNumber NVARCHAR(64),
    @TotalAmount DECIMAL(19, 4),
    @DueDate DATE,
    @CreatedByUserId UNIQUEIDENTIFIER,
    @IdempotencyKey NVARCHAR(128),
    @OutInvoiceId UNIQUEIDENTIFIER OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- بررسی قفل تکرارناپذیری
    IF EXISTS (SELECT 1 FROM [integration].[ApiIdempotency] WHERE [TenantId] = @TenantId AND [IdempotencyKey] = @IdempotencyKey)
    BEGIN
        SELECT @OutInvoiceId = CAST([ResponsePayloadJson] AS UNIQUEIDENTIFIER)
        FROM [integration].[ApiIdempotency]
        WHERE [TenantId] = @TenantId AND [IdempotencyKey] = @IdempotencyKey;
        RETURN;
    END;

    BEGIN TRANSACTION;
        SET @OutInvoiceId = NEWID();

        INSERT INTO [crm].[InvoiceMirror] (
            [InvoiceMirrorId], [TenantId], [SourceSystemCode], [ExternalInvoiceId],
            [AccountId], [InvoiceNumber], [InvoiceDate], [DueDate],
            [CurrencyCode], [GrossAmount], [NetAmount], [StatusCode], [IsVoided],
            [SourceModifiedAtUtc]
        ) VALUES (
            @OutInvoiceId, @TenantId, N'CRM_MANUAL', CAST(@OutInvoiceId AS NVARCHAR(64)),
            @AccountId, @InvoiceNumber, CAST(SYSUTCDATETIME() AS DATE), @DueDate,
            N'IRR', @TotalAmount, @TotalAmount, N'CONFIRMED', 0, SYSUTCDATETIME()
        );

        -- ثبت لاگ ممیزی سیستمی
        INSERT INTO [crm].[AuditEvent] (
            [AuditEventId], [TenantId], [ActorUserId], [Action], [EntityType], [EntityId], [Details], [CreatedAtUtc]
        ) VALUES (
            NEWID(), @TenantId, @CreatedByUserId, N'INVOICE_CREATED', N'INVOICE', @OutInvoiceId,
            CONCAT(N'فاکتور دستی شماره ', @InvoiceNumber, N' ثبت شد.'), SYSUTCDATETIME()
        );

        -- ثبت شناسه کلید ضدتکرار
        INSERT INTO [integration].[ApiIdempotency] (
            [IdempotencyId], [TenantId], [IdempotencyKey], [RequestMethod], [RequestPath],
            [RequestPayloadHash], [ResponseStatusCode], [ResponsePayloadJson], [CreatedAtUtc], [ExpiresAtUtc]
        ) VALUES (
            NEWID(), @TenantId, @IdempotencyKey, N'POST', N'/api/v1/invoices',
            N'HASH', 201, CAST(@OutInvoiceId AS NVARCHAR(64)), SYSUTCDATETIME(), DATEADD(DAY, 7, SYSUTCDATETIME())
        );

    COMMIT TRANSACTION;
END;
GO

-- ۵. رویه ذخیره‌شده تسویه و تخصیص اتمیک دریافت به فاکتور (finance.AllocatePaymentToInvoice)
IF OBJECT_ID(N'finance.AllocatePaymentToInvoice', N'P') IS NOT NULL
    DROP PROCEDURE [finance].[AllocatePaymentToInvoice];
GO
CREATE PROCEDURE [finance].[AllocatePaymentToInvoice]
    @TenantId UNIQUEIDENTIFIER,
    @PaymentMirrorId UNIQUEIDENTIFIER,
    @InvoiceMirrorId UNIQUEIDENTIFIER,
    @Amount DECIMAL(19, 4),
    @CreatedByUserId UNIQUEIDENTIFIER,
    @OutAllocationId UNIQUEIDENTIFIER OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRANSACTION;
        SET @OutAllocationId = NEWID();

        INSERT INTO [crm].[PaymentAllocationMirror] (
            [PaymentAllocationMirrorId], [TenantId], [SourceSystemCode], [ExternalPaymentAllocationId],
            [PaymentMirrorId], [InvoiceMirrorId], [AllocatedAmount], [AllocationDate],
            [IsReversed], [SourceModifiedAtUtc]
        ) VALUES (
            @OutAllocationId, @TenantId, N'CRM_CORE', CAST(@OutAllocationId AS NVARCHAR(64)),
            @PaymentMirrorId, @InvoiceMirrorId, @Amount, CAST(SYSUTCDATETIME() AS DATE),
            0, SYSUTCDATETIME()
        );

        -- ثبت پیام خروجی برای اعلام به ERP
        INSERT INTO [integration].[OutboxMessage] (
            [OutboxMessageId], [TenantId], [EventType], [AggregateType], [AggregateId],
            [PayloadJson], [StatusCode], [CreatedAtUtc]
        ) VALUES (
            NEWID(), @TenantId, N'PAYMENT_ALLOCATED', N'PAYMENT_ALLOCATION', @OutAllocationId,
            (SELECT @PaymentMirrorId AS paymentId, @InvoiceMirrorId AS invoiceId, @Amount AS amount FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            N'PENDING', SYSUTCDATETIME()
        );

    COMMIT TRANSACTION;
END;
GO
