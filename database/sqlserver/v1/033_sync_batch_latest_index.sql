/* Cover the latest inbound batch for each tenant and connector shown in the data center. */
SET XACT_ABORT ON;
GO
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id=OBJECT_ID(N'integration.SyncBatch') AND name=N'IX_SyncBatch_ConnectorLatest'
)
  CREATE INDEX IX_SyncBatch_ConnectorLatest
    ON integration.SyncBatch (TenantId,ConnectorId,SourceSystemCode,StartedAtUtc DESC,SyncBatchId DESC)
    INCLUDE (EntityType,StatusCode,FinishedAtUtc,ReceivedCount,RejectedCount,InsertedCount,UpdatedCount);
GO
