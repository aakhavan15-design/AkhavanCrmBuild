/*
  Complete an existing ERP inbound batch in the same transaction as its mirror writes.
  Grant EXECUTE only to the integration worker. This procedure performs no ERP writes.
*/
SET XACT_ABORT ON;
GO
IF COL_LENGTH(N'integration.SyncBatch',N'FinalizationHash') IS NULL
  ALTER TABLE integration.SyncBatch ADD FinalizationHash binary(32) NULL;
GO
CREATE OR ALTER PROCEDURE integration.usp_FinalizeSyncBatch
  @TenantId uniqueidentifier,
  @SyncBatchId bigint,
  @StatusCode varchar(20),
  @ReceivedCount int,
  @ValidCount int,
  @RejectedCount int,
  @DuplicateCount int,
  @InsertedCount int,
  @UpdatedCount int,
  @SkippedStaleCount int,
  @WatermarkUtc datetime2(3) = NULL,
  @RejectionsJson nvarchar(max) = N'[]'
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF XACT_STATE()<>1
    THROW 50400, N'An active writer transaction is required.', 1;
  DECLARE @ContextTenant uniqueidentifier=TRY_CONVERT(uniqueidentifier,SESSION_CONTEXT(N'TenantId'));
  IF @TenantId IS NULL OR @ContextTenant IS NULL OR @TenantId<>@ContextTenant
    THROW 50403, N'Tenant mismatch.', 1;

  IF @StatusCode IS NULL OR @StatusCode NOT IN ('SUCCEEDED','PARTIAL','FAILED')
    OR EXISTS (SELECT 1 FROM (VALUES (@ReceivedCount),(@ValidCount),(@RejectedCount),(@DuplicateCount),
          (@InsertedCount),(@UpdatedCount),(@SkippedStaleCount)) AS counts(n) WHERE n IS NULL OR n<0)
    OR CONVERT(bigint,@ValidCount)+@RejectedCount+@DuplicateCount<>@ReceivedCount
    OR CONVERT(bigint,@InsertedCount)+@UpdatedCount+@SkippedStaleCount>@ValidCount
    OR (@StatusCode='SUCCEEDED' AND @RejectedCount<>0)
    OR (@StatusCode='FAILED' AND (@InsertedCount<>0 OR @UpdatedCount<>0))
    OR (@StatusCode<>'SUCCEEDED' AND @WatermarkUtc IS NOT NULL)
    THROW 50400, N'Invalid batch totals or checkpoint.', 1;

  IF @RejectionsJson IS NULL OR ISJSON(@RejectionsJson)<>1 OR LEFT(LTRIM(@RejectionsJson),1)<>N'['
    THROW 50400, N'Rejections must be a JSON array.', 1;

  DECLARE @Rejections TABLE (
    ExternalRecordId nvarchar(200) NULL,
    RuleCode varchar(80) NULL,
    SeverityCode varchar(10) NULL,
    MessageFa nvarchar(500) NULL
  );
  INSERT @Rejections (ExternalRecordId,RuleCode,SeverityCode,MessageFa)
  SELECT ExternalRecordId,RuleCode,SeverityCode,MessageFa
  FROM OPENJSON(@RejectionsJson) WITH (
    ExternalRecordId nvarchar(200) '$.externalId',
    RuleCode varchar(80) '$.ruleCode',
    SeverityCode varchar(10) '$.severity',
    MessageFa nvarchar(500) '$.messageFa'
  );
  IF EXISTS (SELECT 1 FROM @Rejections WHERE NULLIF(RuleCode,'') IS NULL
      OR SeverityCode IS NULL OR SeverityCode NOT IN ('ERROR','WARNING') OR NULLIF(MessageFa,N'') IS NULL)
    OR (@StatusCode='SUCCEEDED' AND EXISTS (SELECT 1 FROM @Rejections WHERE SeverityCode='ERROR'))
    OR (@RejectedCount>0 AND NOT EXISTS (SELECT 1 FROM @Rejections WHERE SeverityCode='ERROR'))
    THROW 50400, N'Invalid rejection details.', 1;

  DECLARE @ConnectorId uniqueidentifier, @EntityType nvarchar(80), @ModeCode varchar(20),
    @ExistingStatus varchar(20), @ExistingHash binary(32), @WindowToUtc datetime2(3), @WindowFromUtc datetime2(3);
  SELECT @ConnectorId=b.ConnectorId, @EntityType=b.EntityType, @ModeCode=b.ModeCode, @ExistingStatus=b.StatusCode,
    @ExistingHash=b.FinalizationHash, @WindowToUtc=b.WindowToUtc, @WindowFromUtc=b.WindowFromUtc
  FROM integration.SyncBatch AS b WITH (UPDLOCK,HOLDLOCK)
  JOIN integration.Connector AS connector
    ON connector.TenantId=b.TenantId AND connector.ConnectorId=b.ConnectorId AND connector.SystemCode=b.SourceSystemCode
  WHERE b.TenantId=@TenantId AND b.SyncBatchId=@SyncBatchId
    AND connector.DirectionCode IN ('INBOUND','BIDIRECTIONAL');

  IF @ConnectorId IS NULL
    THROW 50404, N'Inbound batch not found.', 1;
  IF @WatermarkUtc IS NOT NULL AND (@ModeCode='REPLAY'
      OR (@WindowToUtc IS NOT NULL AND @WatermarkUtc>@WindowToUtc)
      OR (@WindowFromUtc IS NOT NULL AND @WatermarkUtc<@WindowFromUtc))
    THROW 50400, N'Invalid checkpoint window or replay.', 1;

  DECLARE @FinalizationJson nvarchar(max);
  SET @FinalizationJson=(
    SELECT @StatusCode AS [status], @ReceivedCount AS received, @ValidCount AS valid,
      @RejectedCount AS rejected, @DuplicateCount AS duplicate, @InsertedCount AS inserted,
      @UpdatedCount AS updated, @SkippedStaleCount AS skipped, @WatermarkUtc AS watermark,
      @RejectionsJson AS rejections
    FOR JSON PATH, INCLUDE_NULL_VALUES, WITHOUT_ARRAY_WRAPPER
  );
  DECLARE @Hash binary(32)=HASHBYTES('SHA2_256',@FinalizationJson);
  IF @ExistingStatus<>'RUNNING'
  BEGIN
    IF @ExistingHash IS NULL OR @ExistingHash<>@Hash
      THROW 50409, N'This batch has a different final result.', 1;
    SELECT @SyncBatchId AS SyncBatchId, @ExistingStatus AS StatusCode, CAST(1 AS bit) AS Replayed;
    RETURN;
  END;

  INSERT integration.StagingRejection (TenantId,SyncBatchId,EntityType,ExternalRecordId,RuleCode,SeverityCode,MessageFa)
  SELECT @TenantId,@SyncBatchId,@EntityType,ExternalRecordId,RuleCode,SeverityCode,MessageFa FROM @Rejections;

  UPDATE integration.SyncBatch SET StatusCode=@StatusCode, ReceivedCount=@ReceivedCount, ValidCount=@ValidCount,
    RejectedCount=@RejectedCount, DuplicateCount=@DuplicateCount, InsertedCount=@InsertedCount,
    UpdatedCount=@UpdatedCount, SkippedStaleCount=@SkippedStaleCount, FinishedAtUtc=SYSUTCDATETIME(), FinalizationHash=@Hash
  WHERE TenantId=@TenantId AND SyncBatchId=@SyncBatchId;

  IF @StatusCode='SUCCEEDED' AND @ModeCode<>'REPLAY' AND @WatermarkUtc IS NOT NULL
  BEGIN
    UPDATE integration.SyncCheckpoint WITH (UPDLOCK,HOLDLOCK)
    SET WatermarkUtc=@WatermarkUtc, LastExternalId=NULL, LastSuccessfulBatchId=@SyncBatchId, UpdatedAtUtc=SYSUTCDATETIME()
    WHERE TenantId=@TenantId AND ConnectorId=@ConnectorId AND EntityType=@EntityType
      AND (WatermarkUtc IS NULL OR WatermarkUtc<@WatermarkUtc);

    IF NOT EXISTS (
      SELECT 1 FROM integration.SyncCheckpoint WITH (UPDLOCK,HOLDLOCK)
      WHERE TenantId=@TenantId AND ConnectorId=@ConnectorId AND EntityType=@EntityType
    )
      INSERT integration.SyncCheckpoint (TenantId,ConnectorId,EntityType,WatermarkUtc,LastSuccessfulBatchId)
      VALUES (@TenantId,@ConnectorId,@EntityType,@WatermarkUtc,@SyncBatchId);
  END;
  SELECT @SyncBatchId AS SyncBatchId, @StatusCode AS StatusCode, CAST(0 AS bit) AS Replayed;
END;
GO
