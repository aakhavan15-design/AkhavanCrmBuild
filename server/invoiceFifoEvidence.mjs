export function createInvoiceFifoEvidence({ sql, run }) {
  return (auth, localId) => run(auth, async tx => {
    const request = () => new sql.Request(tx).input('tenantId', sql.UniqueIdentifier, auth.tenantId);
    const { recordset: matches } = await request().input('localId', sql.UniqueIdentifier, localId)
      .query(`SELECT TOP (2) invoice.InvoiceMirrorId AS id, invoice.InvoiceNumber AS number,
          CONVERT(char(10),invoice.InvoiceDate,23) AS date, invoice.CurrencyCode AS currency,
          invoice.SourceSystemCode AS source
        FROM crm.InvoiceMirror AS invoice
        WHERE invoice.TenantId=@tenantId AND invoice.IsVoided=0 AND invoice.StatusCode IN ('POSTED','CONFIRMED','CLOSED')
          AND (invoice.InvoiceMirrorId=@localId OR EXISTS (
            SELECT 1 FROM integration.ExternalIdentityMap AS mapping
            WHERE mapping.TenantId=invoice.TenantId AND mapping.SourceSystemCode=invoice.SourceSystemCode
              AND mapping.EntityType=N'INVOICE' AND mapping.LocalEntityId=@localId
              AND mapping.ExternalRecordId COLLATE Latin1_General_100_BIN2=invoice.ExternalInvoiceId COLLATE Latin1_General_100_BIN2
          ))`);
    if (matches.length !== 1) return { status: matches.length ? 'AMBIGUOUS' : 'UNMAPPED', rows: [] };
    const invoice = matches[0];
    const { recordset } = await request().input('invoiceId', sql.UniqueIdentifier, invoice.id)
      .query(`SELECT TOP (251) line.ExternalInvoiceLineId AS lineId,
          line.ExternalProductId AS productId,line.ProductNameSnapshot AS name,line.UnitCode AS unit,
          CONVERT(varchar(42),line.Quantity) AS quantity,CONVERT(varchar(42),line.NetLineAmount) AS revenue,
          assessment.CoverageCode AS coverage,
          CASE WHEN assessment.CoverageCode='MATCHED' THEN CONVERT(varchar(52),cost.OriginalCost) END AS cost,
          CASE WHEN assessment.CoverageCode='MATCHED'
            THEN CONVERT(varchar(52),CONVERT(decimal(37,14),line.NetLineAmount)-TRY_CONVERT(decimal(37,14),cost.OriginalCost))
          END AS grossProfit,
          cost.ThroughUtc AS through
        FROM crm.InvoiceLineMirror AS line
        INNER JOIN crm.InvoiceMirror AS invoice ON invoice.TenantId=line.TenantId AND invoice.InvoiceMirrorId=line.InvoiceMirrorId
        OUTER APPLY (
          SELECT COUNT(DISTINCT run.RunId) AS Runs,SUM(consumption.Quantity) AS Quantity,
            SUM(consumption.ReturnedQuantity) AS Returned,SUM(consumption.TotalCost) AS OriginalCost,MAX(run.ThroughUtc) AS ThroughUtc
          FROM analytics.FifoRun AS run
          INNER JOIN analytics.FifoConsumption AS consumption ON consumption.TenantId=run.TenantId AND consumption.RunId=run.RunId
          WHERE run.TenantId=invoice.TenantId AND run.IsCurrent=1 AND run.SourceSystemCode=invoice.SourceSystemCode
            AND run.CurrencyCode=invoice.CurrencyCode
            AND run.ProductExternalId=line.ExternalProductId COLLATE Latin1_General_100_BIN2
            AND run.UnitCode=line.UnitCode COLLATE Latin1_General_100_BIN2
            AND consumption.KindCode='SALE'
            AND consumption.DocumentId COLLATE Latin1_General_100_BIN2=invoice.ExternalInvoiceId COLLATE Latin1_General_100_BIN2
            AND consumption.LineId COLLATE Latin1_General_100_BIN2=line.ExternalInvoiceLineId COLLATE Latin1_General_100_BIN2
        ) AS cost
        CROSS APPLY (VALUES (CASE
          WHEN line.ExternalProductId IS NULL OR line.UnitCode IS NULL OR line.Quantity<=0 THEN 'UNMAPPED_LINE'
          WHEN cost.Runs=0 THEN 'NO_CONSUMPTION'
          WHEN cost.Runs>1 THEN 'OVERLAP'
          WHEN cost.Quantity<>line.Quantity THEN 'QUANTITY_MISMATCH'
          WHEN cost.Returned>0 THEN 'RETURN_REVIEW'
          WHEN TRY_CONVERT(decimal(37,14),cost.OriginalCost) IS NULL THEN 'COST_UNAVAILABLE'
          ELSE 'MATCHED' END)) AS assessment(CoverageCode)
        WHERE line.TenantId=@tenantId AND line.InvoiceMirrorId=@invoiceId AND invoice.IsVoided=0
          AND invoice.StatusCode IN ('POSTED','CONFIRMED','CLOSED')
          AND line.SourceSystemCode=invoice.SourceSystemCode
          AND line.ExternalInvoiceId COLLATE Latin1_General_100_BIN2=invoice.ExternalInvoiceId COLLATE Latin1_General_100_BIN2
        ORDER BY line.ExternalInvoiceLineId`);
    const rows = recordset.slice(0, 250);
    return { status: rows.length ? 'AVAILABLE' : 'EMPTY', invoice, rows, hasMore: recordset.length > rows.length };
  });
}
