import { fixedUnits } from './financialFeedContract.mjs';

const verifiedInvoiceStatus=`CROSS APPLY (
  SELECT CASE WHEN COUNT_BIG(*)=1 THEN MAX(m.StandardCode) END AS status
  FROM integration.CodeMapping m WHERE m.TenantId=invoice.TenantId AND m.SourceSystemCode=invoice.SourceSystemCode
    AND m.MappingDomain='INVOICE_STATUS' AND m.ExternalCode=invoice.StatusCode AND m.MapStatus='APPROVED'
    AND m.EffectiveFrom<=invoice.InvoiceDate AND (m.EffectiveTo IS NULL OR m.EffectiveTo>=invoice.InvoiceDate)
) invoiceStatus`;

const scale=14;
const factor=10n**BigInt(scale);
const amount=value=>typeof value==='string' && /^\d+(?:\.\d{1,14})?$/.test(value) ? fixedUnits(value,scale) : null;
const decimal=value=>{
  const abs=value<0n ? -value : value;
  return `${value<0n ? '-' : ''}${abs/factor}.${String(abs%factor).padStart(scale,'0')}`;
};

export function projectInvoiceMargin(invoice,rows,hasMore) {
  if (invoice.hasLinkedReturn || rows.some(row=>row.coverage==='RETURN_REVIEW')) return {status:'RETURN_REVIEW'};
  if (!rows.length || hasMore || rows.some(row=>row.coverage!=='MATCHED')) return {status:'INCOMPLETE'};
  let net=0n,cost=0n;
  for (const row of rows) {
    const revenue=amount(row.revenue), consumed=amount(row.cost);
    if (revenue===null || consumed===null) return {status:'INCOMPLETE'};
    net+=revenue;cost+=consumed;
  }
  if (amount(invoice.net)!==net) return {status:'NET_MISMATCH'};
  const profit=net-cost;
  const absolute=profit<0n ? -profit : profit;
  const basisPoints=net>0n ? (absolute*10000n+net/2n)/net : null;
  const percent=basisPoints===null ? null : `${profit<0n && basisPoints>0n ? '-' : ''}${basisPoints/100n}.${String(basisPoints%100n).padStart(2,'0')}`;
  return {status:'AVAILABLE',net:decimal(net),cost:decimal(cost),profit:decimal(profit),percent};
}

export function createInvoiceFifoEvidence({ sql, run }) {
  return (auth, localId) => run(auth, async tx => {
    const request = () => new sql.Request(tx).input('tenantId', sql.UniqueIdentifier, auth.tenantId);
    const { recordset: matches } = await request().input('localId', sql.UniqueIdentifier, localId)
      .query(`SELECT TOP (2) invoice.InvoiceMirrorId AS id, invoice.InvoiceNumber AS number,
          CONVERT(char(10),invoice.InvoiceDate,23) AS date, invoice.CurrencyCode AS currency,
          invoice.SourceSystemCode AS source,CONVERT(varchar(42),invoice.NetAmount) AS net,
          CONVERT(bit,CASE WHEN EXISTS(SELECT 1 FROM crm.SalesReturnMirror r WHERE r.TenantId=invoice.TenantId
            AND r.SourceSystemCode=invoice.SourceSystemCode AND r.InvoiceMirrorId=invoice.InvoiceMirrorId AND r.IsVoided=0) THEN 1 ELSE 0 END) AS hasLinkedReturn
        FROM crm.InvoiceMirror AS invoice
        ${verifiedInvoiceStatus}
        WHERE invoice.TenantId=@tenantId AND invoice.IsVoided=0 AND invoice.DeletedAtUtc IS NULL AND invoiceStatus.status IN ('POSTED','FINAL')
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
        ${verifiedInvoiceStatus}
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
          WHEN line.ExternalProductId IS NULL OR line.UnitCode IS NULL OR line.Quantity<=0 OR line.NetLineAmount<0 THEN 'UNMAPPED_LINE'
          WHEN cost.Runs=0 THEN 'NO_CONSUMPTION'
          WHEN cost.Runs>1 THEN 'OVERLAP'
          WHEN cost.Quantity<>line.Quantity THEN 'QUANTITY_MISMATCH'
          WHEN cost.Returned>0 THEN 'RETURN_REVIEW'
          WHEN TRY_CONVERT(decimal(37,14),cost.OriginalCost) IS NULL THEN 'COST_UNAVAILABLE'
          ELSE 'MATCHED' END)) AS assessment(CoverageCode)
        WHERE line.TenantId=@tenantId AND line.InvoiceMirrorId=@invoiceId AND invoice.IsVoided=0
          AND invoice.DeletedAtUtc IS NULL AND invoiceStatus.status IN ('POSTED','FINAL')
          AND line.SourceSystemCode=invoice.SourceSystemCode
          AND line.ExternalInvoiceId COLLATE Latin1_General_100_BIN2=invoice.ExternalInvoiceId COLLATE Latin1_General_100_BIN2
        ORDER BY line.ExternalInvoiceLineId`);
    const rows = recordset.slice(0, 250);
    const hasMore=recordset.length>rows.length;
    return {status:rows.length ? 'AVAILABLE' : 'EMPTY',invoice,rows,hasMore,margin:projectInvoiceMargin(invoice,rows,hasMore)};
  });
}
