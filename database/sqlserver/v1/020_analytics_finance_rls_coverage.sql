/*
  AKHAVAN CRM — 020: explicit, statically auditable tenant RLS coverage for the
  canonical finance/analytics and ETL tables introduced in 017.
  Additive and idempotent. Run after 017 and 006. This is a SQL migration
  contract; execution against SQL Server is still required before production.
*/
SET XACT_ABORT ON;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_policies WHERE name=N'TenantIsolationPolicy' AND schema_id=SCHEMA_ID(N'security'))
    THROW 52020, 'TenantIsolationPolicy must be created by migration 006 before 020.', 1;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'integration.SyncBatch'))
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON integration.SyncBatch;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'integration.SyncCheckpoint'))
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON integration.SyncCheckpoint;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'integration.StagingRejection'))
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON integration.StagingRejection;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'integration.CodeMapping'))
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON integration.CodeMapping;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'integration.ReconciliationRun'))
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON integration.ReconciliationRun;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'crm.ProductBrand'))
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.ProductBrand;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'crm.ProductGroup'))
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.ProductGroup;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'analytics.ExpenseCategory'))
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON analytics.ExpenseCategory;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'crm.LedgerAccount'))
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.LedgerAccount;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'crm.LedgerAccountSourceMap'))
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.LedgerAccountSourceMap;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'crm.JournalEntryMirror'))
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.JournalEntryMirror;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'crm.JournalLineMirror'))
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.JournalLineMirror;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'crm.ChequeMirror'))
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.ChequeMirror;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'crm.ProductCostMirror'))
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.ProductCostMirror;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'crm.InventorySnapshotMirror'))
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.InventorySnapshotMirror;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'crm.SalesReturnMirror'))
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.SalesReturnMirror;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'crm.SalesReturnLineMirror'))
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.SalesReturnLineMirror;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'crm.DeliveryEventMirror'))
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.DeliveryEventMirror;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'crm.Visit'))
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.Visit;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'crm.SalesTarget'))
    ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.SalesTarget;
GO
