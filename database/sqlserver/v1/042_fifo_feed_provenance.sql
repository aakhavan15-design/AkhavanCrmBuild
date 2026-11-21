/* Link published FIFO analyses to the independently reconciled operational import. */
SET XACT_ABORT ON;
GO
IF COL_LENGTH(N'analytics.FifoRun',N'ImportedBatchId') IS NULL
  ALTER TABLE analytics.FifoRun ADD ImportedBatchId bigint NULL;
GO
IF OBJECT_ID(N'analytics.FK_FifoRun_ImportedBatch',N'F') IS NULL
  ALTER TABLE analytics.FifoRun ADD CONSTRAINT FK_FifoRun_ImportedBatch
    FOREIGN KEY(ImportedBatchId) REFERENCES integration.SyncBatch(SyncBatchId);
GO
