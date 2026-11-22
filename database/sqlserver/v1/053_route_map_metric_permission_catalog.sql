/*
 AKHAVAN CRM 053 — per-KPI permission catalogue for Route Intelligence.
 Definitions only: grant through existing role administration.
 No automatic access to sales, receivables, profit or targets.
*/
SET XACT_ABORT ON;
GO
DECLARE @Metrics TABLE (Code nvarchar(120) PRIMARY KEY, Description nvarchar(300));
INSERT @Metrics (Code,Description) VALUES
 (N'route_map.sales.view',N'مشاهده تعداد فاکتور، مشتری خریدار و مبلغ فروش روی نقشه مسیر'),
 (N'route_map.returns.view',N'مشاهده مبالغ مرجوعی مشتریان و مسیرها'),
 (N'route_map.receivables.view',N'مشاهده مطالبات مشتریان و مسیرها'),
 (N'route_map.profit.view',N'مشاهده سود واقعی مسیرها با شواهد بهای تمام‌شده'),
 (N'route_map.targets.view',N'مشاهده هدف و درصد تحقق مسیرها');
INSERT core.Permission(PermissionCode,Description)
SELECT m.Code,m.Description FROM @Metrics m
WHERE NOT EXISTS (SELECT 1 FROM core.Permission p WHERE p.PermissionCode=m.Code);
GO
