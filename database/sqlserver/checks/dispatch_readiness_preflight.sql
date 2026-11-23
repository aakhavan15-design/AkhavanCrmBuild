/* READ-ONLY acceptance preflight for ERP/SQL integration of dispatch analytics.
   Run AFTER migrations 055 and 056, under the intended application DB user.
   A PASS here proves schema only, not data coverage or financial correctness.
*/
SET NOCOUNT ON;
DECLARE @Checks table(CheckCode varchar(70),Passed bit,Detail nvarchar(300));
INSERT @Checks VALUES
('PLAN_TABLE',IIF(OBJECT_ID(N'crm.DispatchPlan',N'U') IS NOT NULL,1,0),N'Existing dispatch plan'),
('PLAN_LINES',IIF(OBJECT_ID(N'crm.DispatchPlanLine',N'U') IS NOT NULL,1,0),N'Invoice linkage from plan line'),
('INVOICE_DISPATCH_NO',IIF(COL_LENGTH(N'crm.InvoiceMirror',N'DispatchPlanNumber') IS NOT NULL,1,0),N'ERP invoice dispatch number'),
('RETURN_DISPATCH_NO',IIF(COL_LENGTH(N'crm.CreditNoteMirror',N'DispatchPlanNumber') IS NOT NULL,1,0),N'Explicit unbased return dispatch link'),
('JOURNAL_DISPATCH_NO',IIF(COL_LENGTH(N'crm.JournalEntryMirror',N'DispatchPlanNumber') IS NOT NULL,1,0),N'ERP financial journal dispatch number'),
('DISTRIBUTOR',IIF(COL_LENGTH(N'crm.DispatchPlan',N'DistributorExternalId') IS NOT NULL,1,0),N'Distributor / distribution agent'),
('DRIVER',IIF(COL_LENGTH(N'crm.DispatchPlan',N'DriverExternalId') IS NOT NULL,1,0),N'Driver ID'),
('PRODUCT_SUPPLIER',IIF(COL_LENGTH(N'crm.ExternalProduct',N'SupplierExternalId') IS NOT NULL,1,0),N'ERP supplier code on product mirror'),
('PRODUCT_BRAND',IIF(COL_LENGTH(N'crm.ExternalProduct',N'BrandExternalId') IS NOT NULL,1,0),N'ERP brand code on product mirror'),
('GEO_ACCURACY',IIF(COL_LENGTH(N'crm.Account',N'GeoAccuracyMeters') IS NOT NULL,1,0),N'Meters of GPS uncertainty, nullable'),
('FINANCE_BUCKET_MAPPING',IIF(OBJECT_ID(N'crm.DispatchFinancialBucketMap',N'U') IS NOT NULL,1,0),N'Approved chart-of-accounts buckets'),
('PENALTY_POLICY',IIF(OBJECT_ID(N'crm.DispatchPenaltyPolicy',N'U') IS NOT NULL,1,0),N'Versioned penalty rules'),
('LEDGER_POSTED_VIEW',IIF(OBJECT_ID(N'analytics.vw_FinancialJournalArticle',N'V') IS NOT NULL,1,0),N'Official posted ledger article'),
('MONEY_SOURCE',IIF(OBJECT_ID(N'analytics.MoneyReportSource',N'U') IS NOT NULL,1,0),N'Approved financial source window'),
('JOURNAL_STATUS',IIF(OBJECT_ID(N'crm.JournalStatusMap',N'U') IS NOT NULL,1,0),N'External posted status mapping'),
('RLS_ENABLED',IIF(EXISTS(SELECT 1 FROM sys.security_policies
 WHERE schema_id=SCHEMA_ID(N'security') AND name=N'TenantIsolationPolicy' AND is_enabled=1),1,0),N'Tenant isolation policy enabled'),
('RLS_BUCKET_FILTER',IIF(EXISTS(SELECT 1 FROM sys.security_predicates WHERE
 target_object_id=OBJECT_ID(N'crm.DispatchFinancialBucketMap') AND predicate_type_desc=N'FILTER'),1,0),N'Tenant RLS on financial buckets'),
('RLS_PENALTY_FILTER',IIF(EXISTS(SELECT 1 FROM sys.security_predicates WHERE
 target_object_id=OBJECT_ID(N'crm.DispatchPenaltyPolicy') AND predicate_type_desc=N'FILTER'),1,0),N'Tenant RLS on penalty policy');
SELECT CheckCode, CASE WHEN Passed=1 THEN 'PASS' ELSE 'FAIL' END AS [Result],Detail
FROM @Checks ORDER BY Passed,CheckCode;
SELECT COUNT(*) AS TotalChecks,SUM(CASE WHEN Passed=1 THEN 1 ELSE 0 END) AS Passed,
 SUM(CASE WHEN Passed=0 THEN 1 ELSE 0 END) AS Failed
FROM @Checks;
PRINT N'IMPORTANT: PASS means schema exists only. Still verify source completeness, invoice-to-dispatch joins, status mappings, cost/FIFO, RBAC and posted ledger reconciliation.';
