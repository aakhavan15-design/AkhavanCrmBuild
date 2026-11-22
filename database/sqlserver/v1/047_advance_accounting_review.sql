SET XACT_ABORT ON;
GO
IF COL_LENGTH(N'hr.AdvanceRequest',N'AccountingStage') IS NULL
  ALTER TABLE hr.AdvanceRequest ADD AccountingStage varchar(24) NULL,
    AccountingReviewedBy uniqueidentifier NULL, AccountingReviewedAtUtc datetime2(3) NULL,
    AccountingNote nvarchar(1000) NULL;
GO
IF OBJECT_ID(N'hr.CK_AdvanceRequest_AccountingStage',N'C') IS NULL
  ALTER TABLE hr.AdvanceRequest WITH CHECK ADD CONSTRAINT CK_AdvanceRequest_AccountingStage
  CHECK (AccountingStage IN ('AWAITING_REVIEW','ON_HOLD','READY_FOR_ERP'));
GO
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'hr.AdvanceRequest') AND name=N'IX_AdvanceRequest_AccountingQueue')
  CREATE INDEX IX_AdvanceRequest_AccountingQueue ON hr.AdvanceRequest(TenantId,AccountingStage,DecidedAtUtc)
    INCLUDE(UserId,DecidedByUserId,ApprovedAmountRials) WHERE StatusCode=N'APPROVED';
GO
UPDATE hr.AdvanceRequest SET AccountingStage='AWAITING_REVIEW'
  WHERE AccountingStage IS NULL AND StatusCode=N'APPROVED' AND DecidedByUserId IS NOT NULL AND ApprovedAmountRials>0;
GO
