/*
  AKHAVAN CRM — 018: analytics semantic layer for the 11 approved reports (views/functions only; no persisted KPI tables).
  Extends 003/004 (reuses analytics.vw_InvoiceBalance, vw_FactSalesLine). Apply after 017. NOT executed in the authoring environment.
  Rules: unknown cost/mapping stays unknown (NULL / coverage columns); voided/guarantee/draft rows are excluded by definition, not by UI.
*/
SET XACT_ABORT ON;
GO
IF COL_LENGTH(N'crm.Account',N'Latitude') IS NULL ALTER TABLE crm.Account ADD Latitude decimal(9,6) NULL, Longitude decimal(9,6) NULL, LocationSourceCode varchar(12) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_Account_Geo') ALTER TABLE crm.Account ADD CONSTRAINT CK_Account_Geo CHECK((Latitude IS NULL OR Latitude BETWEEN -90 AND 90) AND (Longitude IS NULL OR Longitude BETWEEN -180 AND 180) AND (LocationSourceCode IS NULL OR LocationSourceCode IN ('GPS','MANUAL','APPROX','ERP')));
GO
/* Receivables as of an arbitrary base date (report 7). Allocations/credits dated after @AsOf are ignored. Bucket bounds are applied by the app from settings. */
CREATE OR ALTER FUNCTION analytics.fn_InvoiceBalanceAsOf (@AsOf date)
RETURNS TABLE AS RETURN
SELECT i.TenantId, i.InvoiceMirrorId, i.AccountId, i.InvoiceNumber, i.InvoiceDate, i.DueDate, i.CurrencyCode, i.SalesRepUserId, i.TerritoryId,
       i.GrossAmount AS InvoiceGrossAmount, COALESCE(a.Amt,0) AS ValidAllocatedAmount, COALESCE(c.Amt,0) AS ValidCreditAmount,
       i.GrossAmount-COALESCE(a.Amt,0)-COALESCE(c.Amt,0) AS OutstandingAmount,
       DATEDIFF(day,i.DueDate,@AsOf) AS DaysPastDue,           -- basis = due date
       DATEDIFF(day,i.InvoiceDate,@AsOf) AS DaysSinceInvoice   -- basis = document date
FROM crm.InvoiceMirror i
OUTER APPLY (SELECT SUM(pa.AllocatedAmount) Amt FROM crm.PaymentAllocationMirror pa JOIN crm.PaymentMirror p ON p.PaymentMirrorId=pa.PaymentMirrorId AND p.TenantId=pa.TenantId
             WHERE pa.TenantId=i.TenantId AND pa.InvoiceMirrorId=i.InvoiceMirrorId AND pa.IsReversed=0 AND p.IsVoided=0 AND p.StatusCode IN ('POSTED','CONFIRMED','CLEARED') AND pa.AllocationDate<=@AsOf) a
OUTER APPLY (SELECT SUM(cn.Amount) Amt FROM crm.CreditNoteMirror cn WHERE cn.TenantId=i.TenantId AND cn.InvoiceMirrorId=i.InvoiceMirrorId AND cn.IsVoided=0 AND cn.StatusCode IN ('POSTED','APPROVED') AND cn.CreditDate<=@AsOf) c
WHERE i.IsVoided=0 AND i.StatusCode NOT IN ('VOID','CANCELLED','DRAFT') AND i.InvoiceDate<=@AsOf;
GO
/* Operational cheques: guarantee and voided cheques are excluded from operational totals but remain queryable in crm.ChequeMirror (spec §8.4). */
CREATE OR ALTER VIEW analytics.vw_ChequeOperational AS
SELECT TenantId, ChequeMirrorId, DirectionCode, ChequeNumber, BankName, AccountId, Amount, DueDate, StatusCode, IsBounced, SyncedAtUtc
FROM crm.ChequeMirror WHERE IsGuarantee=0 AND IsVoided=0;
GO
CREATE OR ALTER VIEW analytics.vw_FactPayments AS
SELECT p.TenantId, p.PaymentDate AS DateKey, p.PaymentMirrorId, p.AccountId, p.MethodCode, p.Amount,
       CASE WHEN p.IsVoided=0 AND p.StatusCode IN ('POSTED','CONFIRMED','CLEARED') THEN 1 ELSE 0 END AS IsRealizedCash, p.CurrencyCode, p.SyncedAtUtc
FROM crm.PaymentMirror p;
GO
CREATE OR ALTER VIEW analytics.vw_FactReturns AS
SELECT r.TenantId, r.ReturnDate AS DateKey, r.SalesReturnMirrorId, l.SalesReturnLineMirrorId, r.InvoiceMirrorId, r.AccountId, r.SalesRepUserId, r.DriverExternalId,
       l.ExternalProductId, l.Quantity AS ReturnedQuantity, l.LineAmount AS ReturnedAmount, r.ReasonCode, r.ReasonSourceCode,
       CASE WHEN r.IsVoided=0 AND r.StatusCode IN ('POSTED','CONFIRMED','APPROVED') THEN 1 ELSE 0 END AS IsEffective, r.SyncedAtUtc
FROM crm.SalesReturnMirror r JOIN crm.SalesReturnLineMirror l ON l.SalesReturnMirrorId=r.SalesReturnMirrorId AND l.TenantId=r.TenantId;
GO
CREATE OR ALTER VIEW analytics.vw_FactDeliveries AS
SELECT d.TenantId, CONVERT(date,COALESCE(d.DeliveredAtUtc,d.ShippedAtUtc,d.LoadedAtUtc)) AS DateKey, d.DeliveryEventMirrorId, d.InvoiceMirrorId, i.AccountId, i.TerritoryId, d.VehicleExternalId, d.DriverExternalId,
       d.DeliveryStatusCode, d.ExceptionReasonCode, d.PromisedAtUtc, d.LoadedAtUtc, d.ShippedAtUtc, d.DeliveredAtUtc,
       CASE WHEN d.DeliveredAtUtc IS NULL OR d.PromisedAtUtc IS NULL THEN NULL WHEN d.DeliveredAtUtc<=d.PromisedAtUtc THEN 1 ELSE 0 END AS IsOnTime,
       d.Latitude, d.Longitude, d.LocationSourceCode, d.SyncedAtUtc
FROM crm.DeliveryEventMirror d JOIN crm.InvoiceMirror i ON i.InvoiceMirrorId=d.InvoiceMirrorId AND i.TenantId=d.TenantId;
GO
CREATE OR ALTER VIEW analytics.vw_FactVisits AS
SELECT v.TenantId, CONVERT(date,COALESCE(v.CheckInAtUtc,v.PlannedAtUtc)) AS DateKey, v.VisitId, v.AccountId, v.VisitorUserId, v.PlannedAtUtc, v.CheckInAtUtc, v.CheckOutAtUtc,
       DATEDIFF(minute,v.CheckInAtUtc,v.CheckOutAtUtc) AS DwellMinutes, v.OutcomeCode, v.NoOrderReasonCode, v.IsUnplanned, v.ResultingSalesOrderId,
       CASE WHEN v.CheckInAtUtc IS NOT NULL THEN 1 ELSE 0 END AS IsActual, CASE WHEN v.ResultingSalesOrderId IS NOT NULL THEN 1 ELSE 0 END AS HasOrder,
       v.Latitude, v.Longitude, v.AccuracyMeters, v.LocationSourceCode
FROM crm.Visit v;
GO
CREATE OR ALTER VIEW analytics.vw_FactOrders AS
SELECT o.TenantId, o.OrderDate AS DateKey, o.SalesOrderId, o.AccountId, o.OwnerUserId, o.StatusCode, o.NegotiationStatusCode, o.Subtotal, o.DiscountTotal, o.NetAmount, o.ExternalOrderId, o.SyncStatusCode, o.SourceSystemCode
FROM crm.SalesOrder o;
GO
/* Expenses are never a CRM-invented list: they are journal lines whose ledger account maps to an expense category. */
CREATE OR ALTER VIEW analytics.vw_FactExpenses AS
SELECT j.TenantId, e.DocumentDate AS DateKey, j.JournalLineMirrorId, e.JournalEntryMirrorId, la.LedgerAccountId, la.AccountCode, la.ExpenseCategoryCode, ec.IsFixedCost,
       j.DebitAmount-j.CreditAmount AS NetExpenseAmount, j.RefDocumentTypeCode, j.RefExternalDocumentId, e.CurrencyCode, j.SyncedAtUtc
FROM crm.JournalLineMirror j
JOIN crm.JournalEntryMirror e ON e.JournalEntryMirrorId=j.JournalEntryMirrorId AND e.TenantId=j.TenantId
JOIN crm.LedgerAccount la ON la.LedgerAccountId=j.LedgerAccountId AND la.TenantId=j.TenantId
LEFT JOIN analytics.ExpenseCategory ec ON ec.TenantId=la.TenantId AND ec.CategoryCode=la.ExpenseCategoryCode
WHERE e.IsVoided=0 AND e.StatusCode IN ('POSTED','CONFIRMED','FINAL') AND la.ExpenseCategoryCode IS NOT NULL;
GO
/* P&L by report bucket and month, with explicit mapping coverage so unmapped postings are visible instead of silently ignored. */
CREATE OR ALTER VIEW analytics.vw_PnlBucketMonth AS
SELECT j.TenantId, DATEFROMPARTS(YEAR(e.DocumentDate),MONTH(e.DocumentDate),1) AS MonthStart, la.ReportBucketCode, e.CurrencyCode,
       SUM(CASE WHEN la.NatureCode='CREDIT' THEN j.CreditAmount-j.DebitAmount ELSE j.DebitAmount-j.CreditAmount END) AS BucketAmount, COUNT(*) AS LineCount
FROM crm.JournalLineMirror j JOIN crm.JournalEntryMirror e ON e.JournalEntryMirrorId=j.JournalEntryMirrorId AND e.TenantId=j.TenantId
JOIN crm.LedgerAccount la ON la.LedgerAccountId=j.LedgerAccountId AND la.TenantId=j.TenantId
WHERE e.IsVoided=0 AND e.StatusCode IN ('POSTED','CONFIRMED','FINAL') AND la.ReportBucketCode IS NOT NULL
GROUP BY j.TenantId, DATEFROMPARTS(YEAR(e.DocumentDate),MONTH(e.DocumentDate),1), la.ReportBucketCode, e.CurrencyCode;
GO
CREATE OR ALTER VIEW analytics.vw_LedgerMappingCoverage AS
SELECT j.TenantId, COUNT(*) AS TotalLines, SUM(CASE WHEN j.LedgerAccountId IS NOT NULL THEN 1 ELSE 0 END) AS MappedLines,
       CAST(100.0*SUM(CASE WHEN j.LedgerAccountId IS NOT NULL THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0) AS decimal(6,2)) AS MappedPct,
       SUM(CASE WHEN j.LedgerAccountId IS NULL THEN j.DebitAmount+j.CreditAmount ELSE 0 END) AS UnmappedAmount
FROM crm.JournalLineMirror j GROUP BY j.TenantId;
GO
/* Cost coverage by product-group and brand for report 3 (never fills missing cost). */
CREATE OR ALTER VIEW analytics.vw_FactSalesLineEnriched AS
SELECT f.*, p.ProductName, p.BrandId, b.BrandName, p.ProductGroupId, g.GroupName
FROM analytics.vw_FactSalesLine f
LEFT JOIN crm.ExternalProduct p ON p.TenantId=f.TenantId AND p.ExternalProductId=f.ExternalProductId
LEFT JOIN crm.ProductBrand b ON b.BrandId=p.BrandId LEFT JOIN crm.ProductGroup g ON g.ProductGroupId=p.ProductGroupId;
GO
/* Dimensions (views over canonical masters; customer name has exactly one home: crm.Account). */
CREATE OR ALTER VIEW analytics.vw_DimCustomer AS SELECT TenantId, AccountId, AccountCode, Name, StatusCode, OwnerUserId, BranchId, TerritoryId, TeamId, City, Province, Latitude, Longitude, LocationSourceCode, CreditLimit FROM crm.Account WHERE AccountType='CUSTOMER';
GO
CREATE OR ALTER VIEW analytics.vw_DimProduct AS SELECT p.TenantId, p.ExternalProductKey, p.SourceSystemCode, p.ExternalProductId, p.SKU, p.ProductName, p.BrandId, b.BrandName, p.ProductGroupId, g.GroupName, p.IsActive FROM crm.ExternalProduct p LEFT JOIN crm.ProductBrand b ON b.BrandId=p.BrandId LEFT JOIN crm.ProductGroup g ON g.ProductGroupId=p.ProductGroupId;
GO
CREATE OR ALTER VIEW analytics.vw_DimEmployee AS SELECT TenantId, UserId, DisplayName, BranchId, TerritoryId, TeamId, IsActive FROM core.AppUser;
GO
CREATE OR ALTER VIEW analytics.vw_DimGeography AS SELECT t.TenantId, t.TerritoryId, t.TerritoryCode, t.Name AS TerritoryName, t.BranchId, b.Name AS BranchName FROM core.Territory t LEFT JOIN core.Branch b ON b.BranchId=t.BranchId;
GO
