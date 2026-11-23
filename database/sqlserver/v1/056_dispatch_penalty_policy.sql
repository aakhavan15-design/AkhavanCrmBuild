/* 056 — versioned dispatch penalty-review policy, no automatic fines or payroll posting. */
SET XACT_ABORT ON;
GO
IF OBJECT_ID(N'crm.DispatchPenaltyPolicy',N'U') IS NULL
BEGIN
 CREATE TABLE crm.DispatchPenaltyPolicy (
  TenantId uniqueidentifier NOT NULL,
  PolicyCode nvarchar(80) NOT NULL,
  PolicyVersion int NOT NULL,
  MetricCode varchar(40) NOT NULL,
  MaxRate decimal(9,6) NOT NULL,
  SupplierExternalId nvarchar(200) NULL,
  EffectiveFrom date NOT NULL,
  EffectiveTo date NULL,
  IsActive bit NOT NULL CONSTRAINT DF_DispatchPenaltyPolicy_Active DEFAULT 1,
  ApprovedByUserId uniqueidentifier NOT NULL,
  ApprovedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_DispatchPenaltyPolicy_Approved DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_DispatchPenaltyPolicy PRIMARY KEY(TenantId,PolicyCode,PolicyVersion),
  CONSTRAINT FK_DispatchPenaltyPolicy_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
  CONSTRAINT FK_DispatchPenaltyPolicy_Approver FOREIGN KEY(TenantId,ApprovedByUserId) REFERENCES core.AppUser(TenantId,UserId),
  CONSTRAINT CK_DispatchPenaltyPolicy_Version CHECK(PolicyVersion>0),
  CONSTRAINT CK_DispatchPenaltyPolicy_Rate CHECK(MaxRate>=0 AND MaxRate<=1),
  CONSTRAINT CK_DispatchPenaltyPolicy_Dates CHECK(EffectiveTo IS NULL OR EffectiveTo>=EffectiveFrom),
  CONSTRAINT CK_DispatchPenaltyPolicy_Metric CHECK(MetricCode IN ('RETURN_INVOICE_RATE','RETURN_VALUE_RATE','RECEIVABLE_RATE'))
 );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_policies
 WHERE schema_id=SCHEMA_ID(N'security') AND name=N'TenantIsolationPolicy' AND is_enabled=1)
 THROW 51560, N'Penalty policy requires active tenant isolation policy.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates
 WHERE target_object_id=OBJECT_ID(N'crm.DispatchPenaltyPolicy') AND predicate_type_desc=N'FILTER')
 ALTER SECURITY POLICY security.TenantIsolationPolicy
  ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.DispatchPenaltyPolicy,
  ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.DispatchPenaltyPolicy AFTER INSERT,
  ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.DispatchPenaltyPolicy AFTER UPDATE;
GO
/* An effective-time overlap is rejected by the engine/configuration gate.
   Historical policy versions stay immutable and determine task idempotency.
*/
