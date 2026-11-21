/* Opt-in provenance for independent bank reconciliation controls. Existing integration tables hold the evidence. */
SET XACT_ABORT ON;
GO
IF COL_LENGTH(N'analytics.MoneyReportSource',N'BankConnectorId') IS NULL
  ALTER TABLE analytics.MoneyReportSource ADD BankConnectorId uniqueidentifier NULL;
GO
IF OBJECT_ID(N'analytics.FK_MoneyReportSource_BankConnector',N'F') IS NULL
  ALTER TABLE analytics.MoneyReportSource WITH CHECK ADD CONSTRAINT FK_MoneyReportSource_BankConnector
    FOREIGN KEY(BankConnectorId) REFERENCES integration.Connector(ConnectorId);
GO
