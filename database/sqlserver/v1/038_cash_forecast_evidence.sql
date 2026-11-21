/* Coverage date for the authoritative, complete IRR cheque mirror. Null keeps it unverified. */
SET XACT_ABORT ON;
GO
IF COL_LENGTH(N'analytics.MoneyReportSource',N'ChequeRialVerifiedThrough') IS NULL
  ALTER TABLE analytics.MoneyReportSource ADD ChequeRialVerifiedThrough date NULL;
GO
