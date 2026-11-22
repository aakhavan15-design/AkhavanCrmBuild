/*
 AKHAVAN CRM 051 — official ERP routes/tours, many-to-many membership, visits and GPS.
 Additive only. ERP owns route/tour/assignment/reason-code data. CRM draws versioned
 analysis boundaries without changing ERP route membership. Run after 001..050.
 Not executed against a live SQL Server in this authoring session.
*/
SET XACT_ABORT ON;
GO
/* Existing customer master: optional verified ERP GPS coordinates, NOT a new customer table. */
IF COL_LENGTH(N'crm.Account',N'Latitude') IS NULL ALTER TABLE crm.Account ADD Latitude decimal(9,6) NULL;
IF COL_LENGTH(N'crm.Account',N'Longitude') IS NULL ALTER TABLE crm.Account ADD Longitude decimal(9,6) NULL;
IF COL_LENGTH(N'crm.Account',N'GeoAccuracyMeters') IS NULL ALTER TABLE crm.Account ADD GeoAccuracyMeters decimal(9,2) NULL;
IF COL_LENGTH(N'crm.Account',N'GeoSourceCode') IS NULL ALTER TABLE crm.Account ADD GeoSourceCode varchar(20) NULL;
IF COL_LENGTH(N'crm.Account',N'GeoUpdatedAtUtc') IS NULL ALTER TABLE crm.Account ADD GeoUpdatedAtUtc datetime2(3) NULL;
GO
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'crm.Account') AND name=N'CK_Account_LocationBounds')
 ALTER TABLE crm.Account ADD CONSTRAINT CK_Account_LocationBounds CHECK (
  (Latitude IS NULL AND Longitude IS NULL) OR
  (Latitude BETWEEN -90 AND 90 AND Longitude BETWEEN -180 AND 180 AND NOT (Latitude=0 AND Longitude=0))
 );
GO
/* Official ERP main route. Local TerritoryId is optional until code mapping is approved. */
IF OBJECT_ID(N'crm.VisitRouteMirror',N'U') IS NULL
CREATE TABLE crm.VisitRouteMirror (
 RouteId uniqueidentifier NOT NULL CONSTRAINT DF_VRoute_Id DEFAULT NEWSEQUENTIALID(),
 TenantId uniqueidentifier NOT NULL, SourceSystemCode varchar(40) NOT NULL,
 ExternalRouteId nvarchar(200) NOT NULL, RouteCode nvarchar(80) NOT NULL,
 RouteName nvarchar(200) NOT NULL, TerritoryId uniqueidentifier NULL,
 SupervisorExternalId nvarchar(200) NULL, StatusCode nvarchar(50) NULL,
 SourceModifiedAtUtc datetime2(3) NULL, SyncedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_VRoute_Synced DEFAULT SYSUTCDATETIME(),
 IsDeleted bit NOT NULL CONSTRAINT DF_VRoute_Deleted DEFAULT 0,
 CONSTRAINT PK_VisitRouteMirror PRIMARY KEY(RouteId),
 CONSTRAINT FK_VRoute_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
 CONSTRAINT FK_VRoute_Territory FOREIGN KEY(TerritoryId) REFERENCES core.Territory(TerritoryId),
 CONSTRAINT UQ_VRoute_Source UNIQUE(TenantId,SourceSystemCode,ExternalRouteId),
 CONSTRAINT UQ_VRoute_Code UNIQUE(TenantId,SourceSystemCode,RouteCode)
);
GO
/* Many customers may belong to many ERP routes; don't force crm.Account.TerritoryId to be the route. */
IF OBJECT_ID(N'crm.VisitRouteCustomerMirror',N'U') IS NULL
CREATE TABLE crm.VisitRouteCustomerMirror (
 TenantId uniqueidentifier NOT NULL, RouteId uniqueidentifier NOT NULL, AccountId uniqueidentifier NOT NULL,
 ExternalCustomerId nvarchar(200) NOT NULL, SubRouteCode nvarchar(100) NULL,
 EffectiveFrom date NOT NULL, EffectiveTo date NULL, SourceModifiedAtUtc datetime2(3) NULL,
 CONSTRAINT PK_VRouteCustomer PRIMARY KEY(TenantId,RouteId,AccountId,EffectiveFrom),
 CONSTRAINT FK_VRC_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
 CONSTRAINT FK_VRC_Route FOREIGN KEY(RouteId) REFERENCES crm.VisitRouteMirror(RouteId),
 CONSTRAINT FK_VRC_Account FOREIGN KEY(AccountId) REFERENCES crm.Account(AccountId),
 CONSTRAINT CK_VRC_Dates CHECK(EffectiveTo IS NULL OR EffectiveTo>=EffectiveFrom)
);
CREATE INDEX IX_VRouteCustomer_Account ON crm.VisitRouteCustomerMirror(TenantId,AccountId,EffectiveFrom DESC) INCLUDE(RouteId,EffectiveTo);
GO
/* Multiple sales reps and supervisor links per route; user mapping is optional until verified. */
IF OBJECT_ID(N'crm.VisitRouteStaffMirror',N'U') IS NULL
CREATE TABLE crm.VisitRouteStaffMirror (
 TenantId uniqueidentifier NOT NULL, RouteId uniqueidentifier NOT NULL, ExternalStaffId nvarchar(200) NOT NULL,
 StaffUserId uniqueidentifier NULL, StaffRoleCode varchar(20) NOT NULL,
 EffectiveFrom date NOT NULL, EffectiveTo date NULL, SourceModifiedAtUtc datetime2(3) NULL,
 CONSTRAINT PK_VRouteStaff PRIMARY KEY(TenantId,RouteId,ExternalStaffId,StaffRoleCode,EffectiveFrom),
 CONSTRAINT FK_VRS_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
 CONSTRAINT FK_VRS_Route FOREIGN KEY(RouteId) REFERENCES crm.VisitRouteMirror(RouteId),
 CONSTRAINT FK_VRS_User FOREIGN KEY(StaffUserId) REFERENCES core.AppUser(UserId),
 CONSTRAINT CK_VRS_Role CHECK(StaffRoleCode IN ('SALES_REP','SUPERVISOR')),
 CONSTRAINT CK_VRS_Dates CHECK(EffectiveTo IS NULL OR EffectiveTo>=EffectiveFrom)
);
CREATE INDEX IX_VRouteStaff_User ON crm.VisitRouteStaffMirror(TenantId,StaffUserId,StaffRoleCode) INCLUDE(RouteId,EffectiveFrom,EffectiveTo);
GO
/* ERP official daily visit schedule. A tour can refer to one route and one seller on that day. */
IF OBJECT_ID(N'crm.VisitTourMirror',N'U') IS NULL
CREATE TABLE crm.VisitTourMirror (
 TourId uniqueidentifier NOT NULL CONSTRAINT DF_VTour_Id DEFAULT NEWSEQUENTIALID(),
 TenantId uniqueidentifier NOT NULL, SourceSystemCode varchar(40) NOT NULL,
 ExternalTourId nvarchar(200) NOT NULL, TourCode nvarchar(80) NULL, TourDate date NOT NULL,
 RouteId uniqueidentifier NOT NULL, ExternalSalesRepId nvarchar(200) NOT NULL,
 SalesRepUserId uniqueidentifier NULL, StatusCode nvarchar(50) NULL, IsDeleted bit NOT NULL CONSTRAINT DF_VTour_Deleted DEFAULT 0,
 SourceModifiedAtUtc datetime2(3) NULL, SyncedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_VTour_Synced DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_VTour PRIMARY KEY(TourId),
 CONSTRAINT FK_VTour_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
 CONSTRAINT FK_VTour_Route FOREIGN KEY(RouteId) REFERENCES crm.VisitRouteMirror(RouteId),
 CONSTRAINT FK_VTour_Rep FOREIGN KEY(SalesRepUserId) REFERENCES core.AppUser(UserId),
 CONSTRAINT UQ_VTour_Source UNIQUE(TenantId,SourceSystemCode,ExternalTourId)
);
CREATE INDEX IX_VTour_DateRoute ON crm.VisitTourMirror(TenantId,TourDate,RouteId) INCLUDE(SalesRepUserId,ExternalSalesRepId);
GO
IF OBJECT_ID(N'crm.VisitTourStopMirror',N'U') IS NULL
CREATE TABLE crm.VisitTourStopMirror (
 TenantId uniqueidentifier NOT NULL,TourId uniqueidentifier NOT NULL,
 StopSequence int NOT NULL,AccountId uniqueidentifier NULL,
 ExternalCustomerId nvarchar(200) NOT NULL, IsDeleted bit NOT NULL CONSTRAINT DF_VTourStop_Deleted DEFAULT 0,
 CONSTRAINT PK_VTourStop PRIMARY KEY(TenantId,TourId,StopSequence),
 CONSTRAINT FK_VTourStop_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
 CONSTRAINT FK_VTourStop_Tour FOREIGN KEY(TourId) REFERENCES crm.VisitTourMirror(TourId),
 CONSTRAINT FK_VTourStop_Account FOREIGN KEY(AccountId) REFERENCES crm.Account(AccountId),
 CONSTRAINT CK_VTourStop_Sequence CHECK(StopSequence>0),
 CONSTRAINT UQ_VTourStop_Customer UNIQUE(TenantId,TourId,ExternalCustomerId)
);
GO
/* No-order reasons are ERP-controlled codes, not unrestricted UI enums. */
IF OBJECT_ID(N'crm.VisitNoOrderReasonMirror',N'U') IS NULL
CREATE TABLE crm.VisitNoOrderReasonMirror (
 TenantId uniqueidentifier NOT NULL,SourceSystemCode varchar(40) NOT NULL,
 ExternalReasonCode nvarchar(100) NOT NULL,ReasonTitleFa nvarchar(200) NOT NULL,
 IsActive bit NOT NULL CONSTRAINT DF_VReason_Active DEFAULT 1,
 SourceModifiedAtUtc datetime2(3) NULL,
 CONSTRAINT PK_VNoOrderReason PRIMARY KEY(TenantId,SourceSystemCode,ExternalReasonCode),
 CONSTRAINT FK_VReason_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId)
);
GO
/* Append-only, ERP-owned location samples. No client location recording without consent/policy. */
IF OBJECT_ID(N'crm.SalesRepGpsMirror',N'U') IS NULL
CREATE TABLE crm.SalesRepGpsMirror (
 TenantId uniqueidentifier NOT NULL,SourceSystemCode varchar(40) NOT NULL,
 ExternalLocationId nvarchar(200) NOT NULL,ExternalSalesRepId nvarchar(200) NOT NULL,
 SalesRepUserId uniqueidentifier NULL,RecordedAtUtc datetime2(3) NOT NULL,
 Latitude decimal(9,6) NOT NULL,Longitude decimal(9,6) NOT NULL,
 AccuracyMeters decimal(9,2) NULL,SourceModifiedAtUtc datetime2(3) NULL,
 CONSTRAINT PK_SalesRepGps PRIMARY KEY(TenantId,SourceSystemCode,ExternalLocationId),
 CONSTRAINT FK_SalesRepGps_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
 CONSTRAINT FK_SalesRepGps_User FOREIGN KEY(SalesRepUserId) REFERENCES core.AppUser(UserId),
 CONSTRAINT CK_SalesRepGps_Lat CHECK(Latitude BETWEEN -90 AND 90),
 CONSTRAINT CK_SalesRepGps_Lon CHECK(Longitude BETWEEN -180 AND 180),
 CONSTRAINT CK_SalesRepGps_Accuracy CHECK(AccuracyMeters IS NULL OR AccuracyMeters>=0)
);
CREATE INDEX IX_SalesRepGps_UserDate ON crm.SalesRepGpsMirror(TenantId,SalesRepUserId,RecordedAtUtc DESC) INCLUDE(Latitude,Longitude,AccuracyMeters);
GO
/* ERP visit facts: separate read-only source mirror, never overwritten by CRM-owned crm.Visit. */
IF OBJECT_ID(N'crm.ErpVisitEventMirror',N'U') IS NULL
CREATE TABLE crm.ErpVisitEventMirror (
 VisitEventId uniqueidentifier NOT NULL CONSTRAINT DF_EV_Id DEFAULT NEWSEQUENTIALID(),
 TenantId uniqueidentifier NOT NULL,SourceSystemCode varchar(40) NOT NULL,
 ExternalVisitId nvarchar(200) NOT NULL,ExternalCustomerId nvarchar(200) NOT NULL,
 ExternalSalesRepId nvarchar(200) NOT NULL,ExternalTourId nvarchar(200) NULL,
 AccountId uniqueidentifier NULL,SalesRepUserId uniqueidentifier NULL,TourId uniqueidentifier NULL,
 VisitedAtUtc datetime2(3) NOT NULL,OutcomeCode nvarchar(80) NULL,
 NoOrderReasonCode nvarchar(100) NULL,ResultingExternalOrderId nvarchar(200) NULL,
 Latitude decimal(9,6) NULL,Longitude decimal(9,6) NULL,AccuracyMeters decimal(9,2) NULL,
 SourceModifiedAtUtc datetime2(3) NULL,IsDeleted bit NOT NULL CONSTRAINT DF_EV_Delete DEFAULT 0,
 CONSTRAINT PK_ErpVisitEvent PRIMARY KEY(VisitEventId),
 CONSTRAINT FK_EV_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
 CONSTRAINT FK_EV_Account FOREIGN KEY(AccountId) REFERENCES crm.Account(AccountId),
 CONSTRAINT FK_EV_User FOREIGN KEY(SalesRepUserId) REFERENCES core.AppUser(UserId),
 CONSTRAINT FK_EV_Tour FOREIGN KEY(TourId) REFERENCES crm.VisitTourMirror(TourId),
 CONSTRAINT UQ_EV_Source UNIQUE(TenantId,SourceSystemCode,ExternalVisitId),
 CONSTRAINT CK_EV_Location CHECK((Latitude IS NULL AND Longitude IS NULL) OR
   (Latitude BETWEEN -90 AND 90 AND Longitude BETWEEN -180 AND 180)),
 CONSTRAINT CK_EV_Accuracy CHECK(AccuracyMeters IS NULL OR AccuracyMeters>=0)
);
CREATE INDEX IX_EV_CustomerDate ON crm.ErpVisitEventMirror(TenantId,AccountId,VisitedAtUtc DESC) INCLUDE(OutcomeCode,NoOrderReasonCode,SalesRepUserId,TourId,Latitude,Longitude);
GO
/* Link visits to source tour if known; existing Visit GPS fields remain authoritative for the recorded visit. */
IF COL_LENGTH(N'crm.Visit',N'TourId') IS NULL ALTER TABLE crm.Visit ADD TourId uniqueidentifier NULL;
IF COL_LENGTH(N'crm.Visit',N'ExternalVisitId') IS NULL ALTER TABLE crm.Visit ADD ExternalVisitId nvarchar(200) NULL;
IF COL_LENGTH(N'crm.Visit',N'SourceSystemCode') IS NULL ALTER TABLE crm.Visit ADD SourceSystemCode varchar(40) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_Visit_Tour')
 ALTER TABLE crm.Visit ADD CONSTRAINT FK_Visit_Tour FOREIGN KEY(TourId) REFERENCES crm.VisitTourMirror(TourId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'crm.Visit') AND name=N'IX_Visit_AccountCheckIn')
 CREATE INDEX IX_Visit_AccountCheckIn ON crm.Visit(TenantId,AccountId,CheckInAtUtc DESC) INCLUDE(VisitorUserId,TourId,OutcomeCode,NoOrderReasonCode,Latitude,Longitude);
GO
/* Versioned CRM-owned analysis-only polygon. Does not change membership or ERP tour sequence. */
IF OBJECT_ID(N'crm.VisitRouteZoneGeometry',N'U') IS NULL
CREATE TABLE crm.VisitRouteZoneGeometry (
 GeometryVersionId uniqueidentifier NOT NULL CONSTRAINT DF_VRouteGeo_Id DEFAULT NEWSEQUENTIALID(),
 TenantId uniqueidentifier NOT NULL, RouteId uniqueidentifier NOT NULL,
 VersionNumber int NOT NULL, GeometryGeoJson nvarchar(max) NOT NULL,
 CoveragePercent decimal(5,2) NULL,DerivedFromCustomerCount int NULL,
 MethodCode varchar(24) NOT NULL,ReviewStatusCode varchar(16) NOT NULL CONSTRAINT DF_VRouteGeo_Review DEFAULT 'DRAFT',
 CreatedByUserId uniqueidentifier NOT NULL,CreatedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_VRouteGeo_Created DEFAULT SYSUTCDATETIME(),
 ApprovedByUserId uniqueidentifier NULL,ApprovedAtUtc datetime2(3) NULL,
 CONSTRAINT PK_VRouteGeo PRIMARY KEY(GeometryVersionId),
 CONSTRAINT FK_VRouteGeo_Tenant FOREIGN KEY(TenantId) REFERENCES core.Tenant(TenantId),
 CONSTRAINT FK_VRouteGeo_Route FOREIGN KEY(RouteId) REFERENCES crm.VisitRouteMirror(RouteId),
 CONSTRAINT FK_VRouteGeo_User FOREIGN KEY(CreatedByUserId) REFERENCES core.AppUser(UserId),
 CONSTRAINT FK_VRouteGeo_Approve FOREIGN KEY(ApprovedByUserId) REFERENCES core.AppUser(UserId),
 CONSTRAINT UQ_VRouteGeo_Version UNIQUE(TenantId,RouteId,VersionNumber),
 CONSTRAINT CK_VRouteGeo_Method CHECK(MethodCode IN ('AUTO_80_PERCENT','MANUAL')),
 CONSTRAINT CK_VRouteGeo_Review CHECK(ReviewStatusCode IN ('DRAFT','APPROVED','REJECTED')),
 CONSTRAINT CK_VRouteGeo_GeoJson CHECK(ISJSON(GeometryGeoJson)=1),
 CONSTRAINT CK_VRouteGeo_Coverage CHECK(CoveragePercent IS NULL OR CoveragePercent BETWEEN 0 AND 100)
);
GO
/* Tenant-level SQL RLS. Route/staff/customer sub-scope still requires authorized query endpoints. */
IF OBJECT_ID(N'security.TenantIsolationPolicy',N'SP') IS NOT NULL
BEGIN
 IF NOT EXISTS(SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'crm.VisitRouteMirror'))
  ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.VisitRouteMirror;
 IF NOT EXISTS(SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'crm.VisitTourMirror'))
  ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.VisitTourMirror;
 IF NOT EXISTS(SELECT 1 FROM sys.security_predicates WHERE object_id=OBJECT_ID(N'security.TenantIsolationPolicy') AND target_object_id=OBJECT_ID(N'crm.ErpVisitEventMirror'))
  ALTER SECURITY POLICY security.TenantIsolationPolicy ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON crm.ErpVisitEventMirror;
END;
GO
