/* Derived CRM-only FIFO results. ERP mirror rows and legal stock remain read-only. */
SET XACT_ABORT ON;
GO
IF OBJECT_ID(N'analytics.FifoRun',N'U') IS NULL
BEGIN
  CREATE TABLE analytics.FifoRun (
    TenantId uniqueidentifier NOT NULL, RunId uniqueidentifier NOT NULL,
    SourceSystemCode varchar(40) COLLATE Latin1_General_100_BIN2 NOT NULL,
    ProductExternalId nvarchar(200) COLLATE Latin1_General_100_BIN2 NOT NULL,
    UnitCode nvarchar(40) COLLATE Latin1_General_100_BIN2 NOT NULL,
    CurrencyCode char(3) COLLATE Latin1_General_100_BIN2 NOT NULL,
    PeriodStartUtc datetime2(3) NOT NULL, ThroughUtc datetime2(3) NOT NULL,
    SourceRevision decimal(20,0) NOT NULL, SourceProof nvarchar(200) NOT NULL,
    MethodCode varchar(25) NOT NULL, Checksum char(64) NOT NULL, IsCurrent bit NOT NULL,
    PublishedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_FifoRun_PublishedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_FifoRun PRIMARY KEY(TenantId,RunId),
    CONSTRAINT FK_FifoRun_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
    CONSTRAINT UQ_FifoRun_Revision UNIQUE(TenantId,SourceSystemCode,ProductExternalId,UnitCode,CurrencyCode,PeriodStartUtc,SourceRevision),
    CONSTRAINT CK_FifoRun_Period CHECK(ThroughUtc>=PeriodStartUtc AND SourceRevision>0)
  );
  CREATE UNIQUE INDEX UX_FifoRun_Current ON analytics.FifoRun
    (TenantId,SourceSystemCode,ProductExternalId,UnitCode,CurrencyCode,PeriodStartUtc) WHERE IsCurrent=1;
END;
GO
IF OBJECT_ID(N'analytics.FifoLayer',N'U') IS NULL
BEGIN
  CREATE TABLE analytics.FifoLayer (
    TenantId uniqueidentifier NOT NULL, RunId uniqueidentifier NOT NULL, LayerNo int NOT NULL,
    WarehouseExternalId nvarchar(200) COLLATE Latin1_General_100_BIN2 NOT NULL,
    MovementId nvarchar(200) NOT NULL, DocumentId nvarchar(200) NOT NULL, LineId nvarchar(200) NOT NULL,
    EffectiveAtUtc datetime2(3) NOT NULL, KindCode varchar(24) NOT NULL,
    InitialQuantity decimal(28,6) NOT NULL, RemainingQuantity decimal(28,6) NOT NULL, UnitCost decimal(28,8) NOT NULL,
    OriginConsumptionNo int NULL,
    CONSTRAINT PK_FifoLayer PRIMARY KEY(TenantId,RunId,LayerNo),
    CONSTRAINT FK_FifoLayer_Run FOREIGN KEY(TenantId,RunId) REFERENCES analytics.FifoRun(TenantId,RunId),
    CONSTRAINT CK_FifoLayer_Quantity CHECK(InitialQuantity>0 AND RemainingQuantity>=0 AND RemainingQuantity<=InitialQuantity AND UnitCost>=0)
  );
  CREATE INDEX IX_FifoLayer_Warehouse ON analytics.FifoLayer(TenantId,RunId,WarehouseExternalId,EffectiveAtUtc,LayerNo);
END;
GO
IF OBJECT_ID(N'analytics.FifoConsumption',N'U') IS NULL
BEGIN
  CREATE TABLE analytics.FifoConsumption (
    TenantId uniqueidentifier NOT NULL, RunId uniqueidentifier NOT NULL, ConsumptionNo int NOT NULL, LayerNo int NOT NULL,
    MovementId nvarchar(200) NOT NULL, DocumentId nvarchar(200) NOT NULL, LineId nvarchar(200) NOT NULL,
    EffectiveAtUtc datetime2(3) NOT NULL, KindCode varchar(24) NOT NULL,
    Quantity decimal(28,6) NOT NULL, ReturnedQuantity decimal(28,6) NOT NULL, TotalCost decimal(38,14) NOT NULL,
    CONSTRAINT PK_FifoConsumption PRIMARY KEY(TenantId,RunId,ConsumptionNo),
    CONSTRAINT FK_FifoConsumption_Layer FOREIGN KEY(TenantId,RunId,LayerNo) REFERENCES analytics.FifoLayer(TenantId,RunId,LayerNo),
    CONSTRAINT CK_FifoConsumption_Quantity CHECK(Quantity>0 AND ReturnedQuantity>=0 AND ReturnedQuantity<=Quantity AND TotalCost>=0)
  );
  CREATE INDEX IX_FifoConsumption_Document ON analytics.FifoConsumption(TenantId,RunId,DocumentId,LineId);
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'analytics.FifoLayer') AND name=N'FK_FifoLayer_Origin')
  ALTER TABLE analytics.FifoLayer ADD CONSTRAINT FK_FifoLayer_Origin FOREIGN KEY(TenantId,RunId,OriginConsumptionNo)
    REFERENCES analytics.FifoConsumption(TenantId,RunId,ConsumptionNo);
GO
IF OBJECT_ID(N'analytics.FifoValuation',N'U') IS NULL
BEGIN
  CREATE TABLE analytics.FifoValuation (
    TenantId uniqueidentifier NOT NULL, RunId uniqueidentifier NOT NULL,
    WarehouseExternalId nvarchar(200) COLLATE Latin1_General_100_BIN2 NOT NULL,
    Quantity decimal(28,6) NOT NULL, Amount decimal(38,14) NOT NULL,
    CONSTRAINT PK_FifoValuation PRIMARY KEY(TenantId,RunId,WarehouseExternalId),
    CONSTRAINT FK_FifoValuation_Run FOREIGN KEY(TenantId,RunId) REFERENCES analytics.FifoRun(TenantId,RunId),
    CONSTRAINT CK_FifoValuation_Amount CHECK(Quantity>=0 AND Amount>=0)
  );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_policies WHERE name=N'TenantIsolationPolicy' AND schema_id=SCHEMA_ID(N'security'))
  THROW 51360, N'FIFO requires the existing tenant security policy.', 1;
DECLARE @table sysname;
DECLARE @tables TABLE(Name sysname PRIMARY KEY);
INSERT INTO @tables VALUES (N'FifoRun'),(N'FifoLayer'),(N'FifoConsumption'),(N'FifoValuation');
WHILE EXISTS (SELECT 1 FROM @tables)
BEGIN
  SELECT TOP (1) @table=Name FROM @tables ORDER BY Name;
  IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE target_object_id=OBJECT_ID(N'analytics.'+@table) AND predicate_type_desc=N'FILTER')
  BEGIN
    DECLARE @sql nvarchar(max)=N'ALTER SECURITY POLICY security.TenantIsolationPolicy '
      +N'ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON analytics.'+QUOTENAME(@table)
      +N', ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON analytics.'+QUOTENAME(@table)+N' AFTER INSERT;';
    EXEC sys.sp_executesql @sql;
  END;
  DELETE FROM @tables WHERE Name=@table;
END;
GO
CREATE OR ALTER PROCEDURE analytics.usp_PublishFifoRun
  @tenantId uniqueidentifier, @source varchar(40), @product nvarchar(200), @unit nvarchar(40), @currency char(3),
  @periodStart datetime2(3), @through datetime2(3), @revisionText varchar(20), @proof nvarchar(200),
  @method varchar(25), @checksum char(64), @layers nvarchar(max), @consumptions nvarchar(max), @valuations nvarchar(max)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF @@TRANCOUNT=0 OR @tenantId IS NULL OR TRY_CONVERT(uniqueidentifier,SESSION_CONTEXT(N'TenantId')) IS NULL
    OR @tenantId<>TRY_CONVERT(uniqueidentifier,SESSION_CONTEXT(N'TenantId'))
    THROW 51361, N'FIFO publication requires a transaction in the active tenant.', 1;
  DECLARE @revision decimal(20,0)=TRY_CONVERT(decimal(20,0),@revisionText);
  IF @revision IS NULL OR @revision<=0 OR @periodStart IS NULL OR @through IS NULL OR @through<@periodStart
    OR @checksum IS NULL OR @proof IS NULL OR @method IS NULL OR @source IS NULL OR @product IS NULL OR @unit IS NULL OR @currency IS NULL
    OR ISJSON(ISNULL(@layers,N''))<>1 OR ISJSON(ISNULL(@consumptions,N''))<>1 OR ISJSON(ISNULL(@valuations,N''))<>1
    THROW 51362, N'Missing normalized FIFO source or publication data.', 1;

  DECLARE @lock nvarchar(255)=N'fifo:'+CONVERT(varchar(64),HASHBYTES('SHA2_256',
    CONCAT(CONVERT(varchar(36),@tenantId),N'#',LEN(@source),N':',@source,N'#',LEN(@product),N':',@product,
           N'#',LEN(@unit),N':',@unit,N'#',@currency,N'#',CONVERT(nvarchar(30),@periodStart,126))),2);
  DECLARE @lockResult int;
  EXEC @lockResult=sys.sp_getapplock @Resource=@lock,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000;
  IF @lockResult<0 THROW 51363, N'FIFO publication lock could not be acquired.', 1;

  DECLARE @existing uniqueidentifier, @existingChecksum char(64), @current uniqueidentifier;
  DECLARE @lastRevision decimal(20,0), @lastThrough datetime2(3);
  SELECT @existing=RunId,@existingChecksum=Checksum
    FROM analytics.FifoRun
    WHERE TenantId=@tenantId AND SourceSystemCode=@source AND ProductExternalId=@product AND UnitCode=@unit
      AND CurrencyCode=@currency AND PeriodStartUtc=@periodStart AND SourceRevision=@revision;
  IF @existing IS NOT NULL
  BEGIN
    IF @existingChecksum<>@checksum THROW 51364, N'Conflicting FIFO data for the same source revision.', 1;
    SELECT @existing AS RunId, CONVERT(bit,1) AS Replayed;
    RETURN;
  END;

  SELECT @current=RunId,@lastRevision=SourceRevision,@lastThrough=ThroughUtc
    FROM analytics.FifoRun
    WHERE TenantId=@tenantId AND SourceSystemCode=@source AND ProductExternalId=@product AND UnitCode=@unit
      AND CurrencyCode=@currency AND PeriodStartUtc=@periodStart AND IsCurrent=1;
  IF @current IS NOT NULL AND (@revision<=@lastRevision OR @through<@lastThrough)
    THROW 51365, N'A stale FIFO source cannot replace the current publication.', 1;

  DECLARE @run uniqueidentifier=NEWID();
  INSERT INTO analytics.FifoRun(TenantId,RunId,SourceSystemCode,ProductExternalId,UnitCode,CurrencyCode,PeriodStartUtc,ThroughUtc,
    SourceRevision,SourceProof,MethodCode,Checksum,IsCurrent)
  VALUES (@tenantId,@run,@source,@product,@unit,@currency,@periodStart,@through,@revision,@proof,@method,@checksum,0);

  INSERT INTO analytics.FifoLayer(TenantId,RunId,LayerNo,WarehouseExternalId,MovementId,DocumentId,LineId,EffectiveAtUtc,KindCode,
    InitialQuantity,RemainingQuantity,UnitCost)
  SELECT @tenantId,@run,LayerNo,Warehouse,Movement,Document,Line,CONVERT(datetime2(3),LEFT(EffectiveAt,23),126),Kind,Quantity,Remaining,Cost
  FROM OPENJSON(@layers) WITH (LayerNo int '$.layerNo',Warehouse nvarchar(200) '$.warehouseId',Movement nvarchar(200) '$.movementId',
    Document nvarchar(200) '$.documentId',Line nvarchar(200) '$.lineId',EffectiveAt varchar(24) '$.at',Kind varchar(24) '$.kind',
    Quantity decimal(28,6) '$.quantity',Remaining decimal(28,6) '$.remaining',Cost decimal(28,8) '$.unitCost');

  INSERT INTO analytics.FifoConsumption(TenantId,RunId,ConsumptionNo,LayerNo,MovementId,DocumentId,LineId,EffectiveAtUtc,KindCode,
    Quantity,ReturnedQuantity,TotalCost)
  SELECT @tenantId,@run,ConsumptionNo,LayerNo,Movement,Document,Line,CONVERT(datetime2(3),LEFT(EffectiveAt,23),126),Kind,Quantity,Returned,Cost
  FROM OPENJSON(@consumptions) WITH (ConsumptionNo int '$.consumptionNo',LayerNo int '$.layerNo',Movement nvarchar(200) '$.movementId',
    Document nvarchar(200) '$.documentId',Line nvarchar(200) '$.lineId',EffectiveAt varchar(24) '$.at',Kind varchar(24) '$.kind',
    Quantity decimal(28,6) '$.quantity',Returned decimal(28,6) '$.returned',Cost decimal(38,14) '$.totalCost');

  UPDATE l SET OriginConsumptionNo=source.Origin
    FROM analytics.FifoLayer AS l
    JOIN OPENJSON(@layers) WITH (LayerNo int '$.layerNo',Origin int '$.originConsumptionNo') AS source ON source.LayerNo=l.LayerNo
    WHERE l.TenantId=@tenantId AND l.RunId=@run AND source.Origin IS NOT NULL;

  INSERT INTO analytics.FifoValuation(TenantId,RunId,WarehouseExternalId,Quantity,Amount)
  SELECT @tenantId,@run,Warehouse,Quantity,Amount
  FROM OPENJSON(@valuations) WITH (Warehouse nvarchar(200) '$.warehouseId',Quantity decimal(28,6) '$.quantity',Amount decimal(38,14) '$.value');
  IF @@ROWCOUNT=0 THROW 51366, N'FIFO must publish an explicit warehouse scope.', 1;

  UPDATE analytics.FifoRun SET IsCurrent=0 WHERE TenantId=@tenantId AND RunId=@current;
  UPDATE analytics.FifoRun SET IsCurrent=1 WHERE TenantId=@tenantId AND RunId=@run;
  SELECT @run AS RunId,CONVERT(bit,0) AS Replayed;
END;
GO
