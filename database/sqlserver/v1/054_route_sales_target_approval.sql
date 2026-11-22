/*
 054 — Add ROUTE scope to existing SalesTarget.
 Goals are CRM policy; only APPROVED targets matching the report date range
 and KPI NET_SALES_IRR may be used for route achievement.
*/
SET XACT_ABORT ON;
GO
IF COL_LENGTH(N'crm.SalesTarget',N'ApprovalStatusCode') IS NULL
 ALTER TABLE crm.SalesTarget ADD ApprovalStatusCode varchar(20) NOT NULL
    CONSTRAINT DF_RouteTarget_Approval DEFAULT 'DRAFT';
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'crm.SalesTarget')
  AND name=N'CK_Target_Scope')
 ALTER TABLE crm.SalesTarget DROP CONSTRAINT CK_Target_Scope;
GO
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'crm.SalesTarget')
  AND name=N'CK_Target_Scope')
 ALTER TABLE crm.SalesTarget ADD CONSTRAINT CK_Target_Scope
  CHECK (ScopeTypeCode IN ('COMPANY','BRANCH','TEAM','USER','BRAND','PRODUCT_GROUP','ROUTE'));
GO
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'crm.SalesTarget')
  AND name=N'CK_RouteTarget_Status')
 ALTER TABLE crm.SalesTarget ADD CONSTRAINT CK_RouteTarget_Status
  CHECK (ApprovalStatusCode IN ('DRAFT','APPROVED','REJECTED'));
GO
