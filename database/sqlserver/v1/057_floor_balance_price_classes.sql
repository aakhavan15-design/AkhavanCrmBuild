/* 057 — floor-balance pricing: five ERP price classes per product (versioned snapshots), ERP floor price and
   units-per-carton, plus order/line balance snapshots. Additive only: no existing column is changed or dropped.
   Rules: every price comes from the ERP and is stored in IRR (rial) per BASE unit as an exact integer (decimal(19,0)),
   never float. A repeated ERP batch is idempotent (UNIQUE key below). Unknown values stay NULL — never 0 / never 1.
*/
SET XACT_ABORT ON;
GO
IF COL_LENGTH(N'crm.ExternalProduct', N'FloorPriceAmount') IS NULL
 ALTER TABLE crm.ExternalProduct ADD FloorPriceAmount decimal(19,0) NULL;
IF COL_LENGTH(N'crm.ExternalProduct', N'UnitsPerCarton') IS NULL
 ALTER TABLE crm.ExternalProduct ADD UnitsPerCarton int NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_ExternalProduct_FloorPrice' AND parent_object_id=OBJECT_ID(N'crm.ExternalProduct'))
 ALTER TABLE crm.ExternalProduct ADD CONSTRAINT CK_ExternalProduct_FloorPrice CHECK(FloorPriceAmount IS NULL OR FloorPriceAmount>0);
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_ExternalProduct_UnitsPerCarton' AND parent_object_id=OBJECT_ID(N'crm.ExternalProduct'))
 ALTER TABLE crm.ExternalProduct ADD CONSTRAINT CK_ExternalProduct_UnitsPerCarton CHECK(UnitsPerCarton IS NULL OR UnitsPerCarton>0);
GO
IF OBJECT_ID(N'crm.PriceClassDefinition',N'U') IS NULL
BEGIN
 CREATE TABLE crm.PriceClassDefinition (
  TenantId uniqueidentifier NOT NULL,
  PriceClassCode varchar(20) NOT NULL,
  LabelFa nvarchar(100) NULL,
  LabelSource varchar(10) NOT NULL CONSTRAINT DF_PriceClassDefinition_Source DEFAULT 'MANUAL',
  UpdatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_PriceClassDefinition_Updated DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_PriceClassDefinition PRIMARY KEY(TenantId,PriceClassCode),
  CONSTRAINT FK_PriceClassDefinition_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
  CONSTRAINT CK_PriceClassDefinition_Code CHECK(PriceClassCode IN ('PRICE_CLASS_1','PRICE_CLASS_2','PRICE_CLASS_3','PRICE_CLASS_4','PRICE_CLASS_5')),
  CONSTRAINT CK_PriceClassDefinition_Source CHECK(LabelSource IN ('ERP','MANUAL'))
 );
END;
GO
IF OBJECT_ID(N'crm.ProductPriceClass',N'U') IS NULL
BEGIN
 CREATE TABLE crm.ProductPriceClass (
  ProductPriceClassId uniqueidentifier NOT NULL CONSTRAINT DF_ProductPriceClass_Id DEFAULT NEWSEQUENTIALID(),
  TenantId uniqueidentifier NOT NULL,
  ExternalProductKey uniqueidentifier NOT NULL,
  PriceClassCode varchar(20) NOT NULL,
  UnitPriceAmount decimal(19,0) NOT NULL,
  CurrencyCode varchar(10) NOT NULL,
  SourceSystemCode varchar(40) NOT NULL,
  SourceRecordId nvarchar(200) NULL,
  SourceVersion nvarchar(80) NOT NULL,
  SyncBatchId uniqueidentifier NULL,
  ValidFromUtc datetime2(3) NULL,
  ValidToUtc datetime2(3) NULL,
  ReceivedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_ProductPriceClass_Received DEFAULT SYSUTCDATETIME(),
  IsActive bit NOT NULL CONSTRAINT DF_ProductPriceClass_Active DEFAULT 1,
  CONSTRAINT PK_ProductPriceClass PRIMARY KEY(ProductPriceClassId),
  CONSTRAINT FK_ProductPriceClass_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
  CONSTRAINT FK_ProductPriceClass_Product FOREIGN KEY(ExternalProductKey) REFERENCES crm.ExternalProduct(ExternalProductKey),
  CONSTRAINT UQ_ProductPriceClass_Version UNIQUE(TenantId,ExternalProductKey,PriceClassCode,SourceVersion),
  CONSTRAINT CK_ProductPriceClass_Code CHECK(PriceClassCode IN ('PRICE_CLASS_1','PRICE_CLASS_2','PRICE_CLASS_3','PRICE_CLASS_4','PRICE_CLASS_5')),
  CONSTRAINT CK_ProductPriceClass_Price CHECK(UnitPriceAmount>0),
  CONSTRAINT CK_ProductPriceClass_Validity CHECK(ValidToUtc IS NULL OR ValidFromUtc IS NULL OR ValidToUtc>ValidFromUtc)
 );
 CREATE INDEX IX_ProductPriceClass_Current ON crm.ProductPriceClass(TenantId,ExternalProductKey,PriceClassCode,ReceivedAtUtc DESC) WHERE IsActive=1;
END;
GO
/* Current price = newest active, in-validity snapshot per product+class. Expired/invalid rows are kept (never physically deleted). */
CREATE OR ALTER VIEW crm.vw_ProductPriceClassCurrent AS
SELECT TenantId,ExternalProductKey,PriceClassCode,UnitPriceAmount,SourceSystemCode,SourceVersion,ValidFromUtc,ValidToUtc,ReceivedAtUtc
FROM (
 SELECT p.*,ROW_NUMBER() OVER(PARTITION BY p.TenantId,p.ExternalProductKey,p.PriceClassCode ORDER BY p.ReceivedAtUtc DESC,p.ProductPriceClassId DESC) AS rn
 FROM crm.ProductPriceClass p
 WHERE p.IsActive=1
   AND (p.ValidFromUtc IS NULL OR p.ValidFromUtc<=SYSUTCDATETIME())
   AND (p.ValidToUtc IS NULL OR p.ValidToUtc>SYSUTCDATETIME())
) x WHERE x.rn=1;
GO
/* PriceClassCode belongs to the whole Quote/order header, never to an individual QuoteLine. */
IF COL_LENGTH(N'crm.QuoteLine', N'ErpClassUnitPriceAmount') IS NULL ALTER TABLE crm.QuoteLine ADD ErpClassUnitPriceAmount decimal(19,0) NULL;
IF COL_LENGTH(N'crm.QuoteLine', N'FloorUnitPriceAmount') IS NULL ALTER TABLE crm.QuoteLine ADD FloorUnitPriceAmount decimal(19,0) NULL;
IF COL_LENGTH(N'crm.QuoteLine', N'UnitsPerCartonSnapshot') IS NULL ALTER TABLE crm.QuoteLine ADD UnitsPerCartonSnapshot int NULL;
IF COL_LENGTH(N'crm.QuoteLine', N'CartonQuantity') IS NULL ALTER TABLE crm.QuoteLine ADD CartonQuantity decimal(19,4) NULL;
IF COL_LENGTH(N'crm.QuoteLine', N'LineVarianceAmount') IS NULL ALTER TABLE crm.QuoteLine ADD LineVarianceAmount decimal(19,0) NULL;
IF COL_LENGTH(N'crm.QuoteLine', N'BalanceStatus') IS NULL ALTER TABLE crm.QuoteLine ADD BalanceStatus varchar(20) NULL;
IF COL_LENGTH(N'crm.Quote', N'PriceClassCode') IS NULL ALTER TABLE crm.Quote ADD PriceClassCode varchar(20) NULL;
IF COL_LENGTH(N'crm.Quote', N'OrderVarianceAmount') IS NULL ALTER TABLE crm.Quote ADD OrderVarianceAmount decimal(19,0) NULL;
IF COL_LENGTH(N'crm.Quote', N'OrderBalanceState') IS NULL ALTER TABLE crm.Quote ADD OrderBalanceState varchar(10) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.security_policies
 WHERE schema_id=SCHEMA_ID(N'security') AND name=N'TenantIsolationPolicy' AND is_enabled=1)
 THROW 51570, N'Price-class tables require active tenant isolation policy.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE target_object_id=OBJECT_ID(N'crm.PriceClassDefinition') AND predicate_type_desc=N'FILTER')
 ALTER SECURITY POLICY security.TenantIsolationPolicy
  ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.PriceClassDefinition;
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE target_object_id=OBJECT_ID(N'crm.PriceClassDefinition') AND predicate_type_desc=N'BLOCK' AND operation_desc=N'AFTER INSERT')
 ALTER SECURITY POLICY security.TenantIsolationPolicy ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.PriceClassDefinition AFTER INSERT;
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE target_object_id=OBJECT_ID(N'crm.PriceClassDefinition') AND predicate_type_desc=N'BLOCK' AND operation_desc=N'AFTER UPDATE')
 ALTER SECURITY POLICY security.TenantIsolationPolicy ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.PriceClassDefinition AFTER UPDATE;
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE target_object_id=OBJECT_ID(N'crm.ProductPriceClass') AND predicate_type_desc=N'FILTER')
 ALTER SECURITY POLICY security.TenantIsolationPolicy
  ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.ProductPriceClass;
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE target_object_id=OBJECT_ID(N'crm.ProductPriceClass') AND predicate_type_desc=N'BLOCK' AND operation_desc=N'AFTER INSERT')
 ALTER SECURITY POLICY security.TenantIsolationPolicy ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.ProductPriceClass AFTER INSERT;
IF NOT EXISTS (SELECT 1 FROM sys.security_predicates WHERE target_object_id=OBJECT_ID(N'crm.ProductPriceClass') AND predicate_type_desc=N'BLOCK' AND operation_desc=N'AFTER UPDATE')
 ALTER SECURITY POLICY security.TenantIsolationPolicy ADD BLOCK PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.ProductPriceClass AFTER UPDATE;
GO
/* Rollback (manual, only if no quote has used the new columns):
   DROP VIEW crm.vw_ProductPriceClassCurrent; remove both tables from the security policy then DROP TABLE crm.ProductPriceClass, crm.PriceClassDefinition;
   drop the added QuoteLine/Quote/ExternalProduct columns and CK_ExternalProduct_* constraints. */
