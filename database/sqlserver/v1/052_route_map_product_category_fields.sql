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
IF COL_LENGTH(N'crm.ExternalProduct',N'SupplierExternalId') IS NULL
 ALTER TABLE crm.ExternalProduct ADD SupplierExternalId nvarchar(200) NULL;
IF COL_LENGTH(N'crm.ExternalProduct',N'BrandExternalId') IS NULL
 ALTER TABLE crm.ExternalProduct ADD BrandExternalId nvarchar(200) NULL;
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
