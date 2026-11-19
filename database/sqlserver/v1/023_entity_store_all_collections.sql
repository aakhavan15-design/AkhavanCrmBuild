/* ============================================================================
   AKHAVAN CRM — Migration 023: SQL-first entity store for EVERY application collection.
   Apply after 001-022. Purpose: the whole UI state (all AppState collections + settings singletons) is
   persisted through DataProvider -> /api/v1/state/* -> this table, so no feature is blocked when a typed
   table/column does not exist yet. Typed tables (crm.Account, crm.Task, ...) remain the long-term home;
   sync.vw_EntityFieldProfile + GET /api/v1/state/profile show which columns each collection really needs.
   Tenant isolation: RLS predicate security.fn_TenantAccessPredicate (SESSION_CONTEXT TenantId).
   ============================================================================ */
SET XACT_ABORT ON;
GO
IF SCHEMA_ID(N'sync') IS NULL EXEC(N'CREATE SCHEMA sync');
GO
IF OBJECT_ID(N'sync.EntityStore', N'U') IS NULL
BEGIN
  CREATE TABLE sync.EntityStore (
    TenantId        uniqueidentifier NOT NULL,
    CollectionName  nvarchar(80)     NOT NULL,   -- AppState key (accounts, tasks, invoices ...) or '__singleton__'
    EntityId        nvarchar(200)    NOT NULL,   -- record id (or singleton key)
    JsonDoc         nvarchar(max)    NULL,       -- the full record; NULL only when deleted
    Version         bigint           NOT NULL CONSTRAINT DF_EntityStore_Version DEFAULT 1,
    IsDeleted       bit              NOT NULL CONSTRAINT DF_EntityStore_Deleted DEFAULT 0,
    IsDemo          AS (CONVERT(bit, CASE WHEN EntityId LIKE N'demo-%' THEN 1 ELSE 0 END)) PERSISTED,
    CreatedAtUtc    datetime2(3)     NOT NULL CONSTRAINT DF_EntityStore_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc    datetime2(3)     NOT NULL CONSTRAINT DF_EntityStore_Updated DEFAULT SYSUTCDATETIME(),
    UpdatedByUserId uniqueidentifier NULL,
    CONSTRAINT PK_EntityStore PRIMARY KEY CLUSTERED (TenantId, CollectionName, EntityId),
    CONSTRAINT FK_EntityStore_Tenant FOREIGN KEY (TenantId) REFERENCES core.Tenant(TenantId),
    CONSTRAINT CK_EntityStore_Json CHECK (JsonDoc IS NULL OR ISJSON(JsonDoc)=1),
    CONSTRAINT CK_EntityStore_Name CHECK (CollectionName NOT LIKE N'%[^A-Za-z0-9_]%')
  );
  CREATE INDEX IX_EntityStore_Version ON sync.EntityStore (TenantId, Version) INCLUDE (CollectionName, EntityId, IsDeleted);
  CREATE INDEX IX_EntityStore_Live ON sync.EntityStore (TenantId, CollectionName) WHERE IsDeleted = 0;
END;
GO
IF EXISTS (SELECT 1 FROM sys.security_policies WHERE name=N'TenantIsolationPolicy' AND schema_id=SCHEMA_ID(N'security'))
AND NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE target_object_id=OBJECT_ID(N'sync.EntityStore') AND predicate_type_desc=N'FILTER')
BEGIN
  ALTER SECURITY POLICY security.TenantIsolationPolicy
    ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON sync.EntityStore,
    ADD BLOCK PREDICATE  security.fn_TenantAccessPredicate(TenantId) ON sync.EntityStore AFTER INSERT;
END;
GO
/* Batched, idempotent upsert/soft-delete. @rows = JSON array of {c: collection, i: id, j: json-string|null, d: 0|1}. */
CREATE OR ALTER PROCEDURE sync.usp_ApplyEntityChanges
  @tenantId uniqueidentifier,
  @userId   uniqueidentifier,
  @rows     nvarchar(max)
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  IF TRY_CONVERT(uniqueidentifier, SESSION_CONTEXT(N'TenantId')) IS NULL OR @tenantId <> TRY_CONVERT(uniqueidentifier, SESSION_CONTEXT(N'TenantId'))
    THROW 50403, N'Tenant mismatch: session context does not match request tenant.', 1;
  IF ISJSON(@rows) <> 1 THROW 50400, N'rows must be a JSON array.', 1;

  ;WITH src AS (
    SELECT c AS CollectionName, i AS EntityId, j AS JsonDoc, d AS IsDeleted
    FROM OPENJSON(@rows) WITH (c nvarchar(80) '$.c', i nvarchar(200) '$.i', j nvarchar(max) '$.j', d bit '$.d')
    WHERE c IS NOT NULL AND i IS NOT NULL
  )
  MERGE sync.EntityStore WITH (HOLDLOCK) AS t
  USING src AS s
     ON t.TenantId=@tenantId AND t.CollectionName=s.CollectionName AND t.EntityId=s.EntityId
  WHEN MATCHED THEN UPDATE SET
       JsonDoc         = CASE WHEN s.IsDeleted=1 THEN t.JsonDoc ELSE s.JsonDoc END,
       IsDeleted       = s.IsDeleted,
       Version         = t.Version + 1,
       UpdatedAtUtc    = SYSUTCDATETIME(),
       UpdatedByUserId = @userId
  WHEN NOT MATCHED BY TARGET AND s.IsDeleted=0 THEN INSERT
       (TenantId, CollectionName, EntityId, JsonDoc, UpdatedByUserId)
       VALUES (@tenantId, s.CollectionName, s.EntityId, s.JsonDoc, @userId);
END;
GO
/* Which JSON fields each collection really uses -> the exact column list a typed table needs next. */
CREATE OR ALTER VIEW sync.vw_EntityFieldProfile AS
SELECT e.TenantId, e.CollectionName, k.[key] AS FieldName, MIN(k.[type]) AS JsonTypeCode, COUNT_BIG(*) AS RowsWithField
FROM sync.EntityStore e
CROSS APPLY OPENJSON(e.JsonDoc) k
WHERE e.IsDeleted = 0 AND e.CollectionName <> N'__singleton__' AND e.JsonDoc IS NOT NULL
GROUP BY e.TenantId, e.CollectionName, k.[key];
GO
/* Demo rows are identifiable (IsDemo, id prefix demo-) and removable without touching real data. */
CREATE OR ALTER PROCEDURE sync.usp_PurgeDemoEntities @tenantId uniqueidentifier
AS
BEGIN
  SET NOCOUNT ON;
  IF TRY_CONVERT(uniqueidentifier, SESSION_CONTEXT(N'TenantId')) IS NULL OR @tenantId <> TRY_CONVERT(uniqueidentifier, SESSION_CONTEXT(N'TenantId'))
    THROW 50403, N'Tenant mismatch.', 1;
  UPDATE sync.EntityStore SET IsDeleted=1, Version=Version+1, UpdatedAtUtc=SYSUTCDATETIME()
  WHERE TenantId=@tenantId AND IsDemo=1 AND IsDeleted=0;
  SELECT @@ROWCOUNT AS PurgedRows;
END;
GO
