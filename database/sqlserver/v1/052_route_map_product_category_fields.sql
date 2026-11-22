/*
 AKHAVAN CRM 052 — official ERP dimensions used by route map multi-select filters.
 Additive to canonical Account and ExternalProduct; no duplicate master tables.
 The ERP connector must populate these columns via approved source mappings.
 Neither NULL nor missing feed constitutes "unknown" customer category populated as OTHER.
 */
SET XACT_ABORT ON;
GO
IF COL_LENGTH(N'crm.Account',N'BusinessCategoryCode') IS NULL
 ALTER TABLE crm.Account ADD BusinessCategoryCode nvarchar(100) NULL;
IF COL_LENGTH(N'crm.Account',N'BusinessCategorySourceModifiedAtUtc') IS NULL
 ALTER TABLE crm.Account ADD BusinessCategorySourceModifiedAtUtc datetime2(3) NULL;
IF COL_LENGTH(N'crm.ExternalProduct',N'SupplierExternalId') IS NULL
 ALTER TABLE crm.ExternalProduct ADD SupplierExternalId nvarchar(200) NULL;
IF COL_LENGTH(N'crm.ExternalProduct',N'BrandExternalId') IS NULL
 ALTER TABLE crm.ExternalProduct ADD BrandExternalId nvarchar(200) NULL;
IF COL_LENGTH(N'crm.ExternalProduct',N'RouteFilterSourceModifiedAtUtc') IS NULL
 ALTER TABLE crm.ExternalProduct ADD RouteFilterSourceModifiedAtUtc datetime2(3) NULL;
GO
IF NOT EXISTS(SELECT 1 FROM sys.indexes
 WHERE object_id=OBJECT_ID(N'crm.ExternalProduct') AND name=N'IX_ExternalProduct_RouteFilters')
 CREATE INDEX IX_ExternalProduct_RouteFilters
 ON crm.ExternalProduct(TenantId,SourceSystemCode,ExternalProductId)
 INCLUDE(SupplierExternalId,BrandExternalId,ProductName,IsActive);
GO
IF NOT EXISTS(SELECT 1 FROM sys.indexes
 WHERE object_id=OBJECT_ID(N'crm.Account') AND name=N'IX_Account_RouteBusinessCategory')
 CREATE INDEX IX_Account_RouteBusinessCategory
 ON crm.Account(TenantId,BusinessCategoryCode,AccountId);
GO

/* Idempotent ERP-only master updates; no fuzzy customer name matching. */
CREATE OR ALTER PROCEDURE integration.ApplyErpRouteProductDimensions
 @TenantId uniqueidentifier,
 @SourceSystemCode varchar(40),
 @ExternalProductId nvarchar(200),
 @SupplierExternalId nvarchar(200)=NULL,
 @BrandExternalId nvarchar(200)=NULL,
 @SourceModifiedAtUtc datetime2(3)
AS BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 IF @SourceModifiedAtUtc IS NULL OR NULLIF(LTRIM(RTRIM(@ExternalProductId)),N'') IS NULL
   THROW 51061,N'ERP source product identity and timestamp are required.',1;
 UPDATE crm.ExternalProduct WITH (UPDLOCK)
 SET SupplierExternalId=@SupplierExternalId,BrandExternalId=@BrandExternalId,
     RouteFilterSourceModifiedAtUtc=@SourceModifiedAtUtc
 WHERE TenantId=@TenantId AND SourceSystemCode=@SourceSystemCode AND ExternalProductId=@ExternalProductId
   AND (RouteFilterSourceModifiedAtUtc IS NULL OR RouteFilterSourceModifiedAtUtc<=@SourceModifiedAtUtc);
 SELECT CASE WHEN @@ROWCOUNT=1 THEN N'APPLIED' ELSE N'SKIPPED_OR_UNMAPPED' END AS OutcomeCode;
END;
GO

CREATE OR ALTER PROCEDURE integration.ApplyErpCustomerBusinessCategory
 @TenantId uniqueidentifier,
 @SourceSystemCode varchar(40),
 @ExternalCustomerId nvarchar(200),
 @BusinessCategoryCode nvarchar(100),
 @SourceModifiedAtUtc datetime2(3)
AS BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 IF @SourceModifiedAtUtc IS NULL OR NULLIF(LTRIM(RTRIM(@ExternalCustomerId)),N'') IS NULL
   THROW 51062,N'ERP source customer identity and timestamp are required.',1;
 DECLARE @AccountId uniqueidentifier,@Total int;
 SELECT @Total=COUNT(DISTINCT LocalEntityId)
 FROM integration.ExternalIdentityMap
 WHERE TenantId=@TenantId AND SourceSystemCode=@SourceSystemCode
  AND EntityType IN (N'CUSTOMER',N'ACCOUNT') AND ExternalRecordId=@ExternalCustomerId;
 IF @Total<>1 THROW 51063,N'ERP customer ID is missing or ambiguous; quarantine the row.',1;
 SELECT TOP(1) @AccountId=LocalEntityId FROM integration.ExternalIdentityMap
 WHERE TenantId=@TenantId AND SourceSystemCode=@SourceSystemCode
  AND EntityType IN (N'CUSTOMER',N'ACCOUNT') AND ExternalRecordId=@ExternalCustomerId;
 UPDATE crm.Account WITH (UPDLOCK)
 SET BusinessCategoryCode=@BusinessCategoryCode,BusinessCategorySourceModifiedAtUtc=@SourceModifiedAtUtc,
  UpdatedAtUtc=SYSUTCDATETIME()
 WHERE TenantId=@TenantId AND AccountId=@AccountId
  AND (BusinessCategorySourceModifiedAtUtc IS NULL OR BusinessCategorySourceModifiedAtUtc<=@SourceModifiedAtUtc);
 SELECT CASE WHEN @@ROWCOUNT=1 THEN N'APPLIED' ELSE N'SKIPPED_STALE' END AS OutcomeCode;
END;
GO
