import { isMarkedFixture } from '../src/lib/stateModel.mjs';

const sources = ['cheques', 'supplierBills', 'expenses', 'treasuryAccounts', 'treasuryTransactions'];
const tehranDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' });
const evidenceSql = `
SELECT s.SourceSystemCode, s.ChequeRialVerifiedThrough
FROM analytics.MoneyReportSource s
JOIN core.AppUser approver ON approver.TenantId=s.TenantId AND approver.UserId=s.ApprovedBy
WHERE s.TenantId=@tenantId AND s.ChequeRialVerifiedThrough IS NOT NULL
  AND EXISTS (SELECT 1 FROM security.fn_RecordReadScope(@tenantId,N'finance.view',NULL,NULL,NULL,NULL));

SELECT c.ChequeMirrorId AS id,c.ExternalChequeId AS externalId,c.DirectionCode AS direction,c.ChequeNumber AS chequeNumber,
  c.AccountId AS accountId,CONVERT(char(10),c.DueDate,126) AS dueDate,
  c.SourceSystemCode AS source,CONVERT(varchar(42),c.Amount) AS amount,c.SyncedAtUtc AS syncedAt,m.status
FROM analytics.MoneyReportSource s
JOIN core.AppUser approver ON approver.TenantId=s.TenantId AND approver.UserId=s.ApprovedBy
JOIN crm.ChequeMirror c ON c.TenantId=s.TenantId AND c.SourceSystemCode=s.SourceSystemCode
OUTER APPLY (
  SELECT CASE WHEN COUNT_BIG(*)=1 THEN MAX(StandardCode) END AS status
  FROM integration.CodeMapping
  WHERE TenantId=c.TenantId AND SourceSystemCode=c.SourceSystemCode
    AND MappingDomain='CHEQUE_STATUS' AND ExternalCode=c.StatusCode AND MapStatus='APPROVED'
    AND EffectiveFrom<=@asOf AND (EffectiveTo IS NULL OR EffectiveTo>=@asOf)
) AS m
WHERE s.TenantId=@tenantId AND s.ChequeRialVerifiedThrough IS NOT NULL
  AND c.IsVoided=0 AND c.IsGuarantee=0 AND c.IsBounced=0 AND c.DueDate<=DATEADD(day,89,@asOf)
  AND (m.status IS NULL OR m.status<>'CLOSED')
  AND EXISTS (SELECT 1 FROM security.fn_RecordReadScope(@tenantId,N'finance.view',NULL,NULL,NULL,NULL));`;

export function createTreasuryFlowReader({ sql, run }) {
  return auth => run(auth, async tx => {
    const result = await new sql.Request(tx)
      .input('tenantId', sql.UniqueIdentifier, auth.tenantId)
      .query(`SELECT CollectionName,EntityId,JsonDoc,UpdatedAtUtc
        FROM sync.EntityStore
        WHERE TenantId=@tenantId AND IsDeleted=0
          AND CollectionName IN (N'cheques',N'supplierBills',N'expenses',N'treasuryAccounts',N'treasuryTransactions')
        ORDER BY CollectionName,EntityId`);
    const collections = Object.fromEntries(sources.map(key => [key, []]));
    const populated = new Set();
    let updatedAt = null;
    for (const row of result.recordset) {
      const record = JSON.parse(row.JsonDoc);
      if (!Object.hasOwn(collections, row.CollectionName) || isMarkedFixture(record, row.EntityId)) continue;
      populated.add(row.CollectionName);
      collections[row.CollectionName].push(record);
      const timestamp = row.UpdatedAtUtc?.toISOString?.();
      if (timestamp && (!updatedAt || timestamp > updatedAt)) updatedAt = timestamp;
    }
    // A tenant without the new migration keeps readable CRM plans, explicitly as unverified.
    const asOf = tehranDate.format(new Date());
    const schema = await new sql.Request(tx)
      .query(`SELECT COL_LENGTH(N'analytics.MoneyReportSource',N'ChequeRialVerifiedThrough') AS fieldSize`);
    let chequeEvidence = 'CRM_PLAN';
    let unverifiedCheques = 0;
    if (schema.recordset[0]?.fieldSize != null) {
      const evidence = await new sql.Request(tx)
        .input('tenantId', sql.UniqueIdentifier, auth.tenantId)
        .input('asOf', sql.Date, new Date(asOf))
        .query(evidenceSql);
      const coveredSources = evidence.recordsets[0];
      if (coveredSources.length) {
        const eligible = [];
        for (const row of evidence.recordsets[1]) {
          if (row.status !== 'OPEN') { unverifiedCheques++; continue; }
          const amount = Number(row.amount);
          if (!Number.isFinite(amount) || amount <= 0 || amount > Number.MAX_SAFE_INTEGER) { unverifiedCheques++; continue; }
          eligible.push({
            id: row.id, externalId: row.externalId, sourceSystemCode:row.source, direction: row.direction === 'ISSUED' ? 'PAYABLE' : 'RECEIVABLE',
            chequeNumber: row.chequeNumber, accountId: row.accountId, dueDate: row.dueDate,
            amount, currencyCode: 'IRR', status: 'OPEN',
          });
          const timestamp = row.syncedAt?.toISOString?.();
          if (timestamp && (!updatedAt || timestamp > updatedAt)) updatedAt = timestamp;
        }
        collections.cheques = eligible;
        chequeEvidence = 'ERP_MIRROR';
        if (!unverifiedCheques && coveredSources.every(row => row.ChequeRialVerifiedThrough?.toISOString?.().slice(0, 10) >= asOf)) populated.add('cheques');
        else populated.delete('cheques');
      }
    }

    // Issued ERP cheques lack a supplier invoice link in the current mirror.
    // Keep a single amount in the scenario until the outstanding supplier schedule and cheque can be matched.
    const overlappingBills = chequeEvidence === 'ERP_MIRROR' && collections.cheques.some(row => row.direction === 'PAYABLE')
      ? collections.supplierBills.length : 0;
    if (overlappingBills) {
      collections.supplierBills = [];
      populated.delete('supplierBills');
    }
    const missingSources = sources.filter(key => !populated.has(key));
    // The current ERP mirror has no approved cash schedule for non-cheque receivables.
    missingSources.push('receivableSchedule');
    return {
      ...collections, missingSources, updatedAt, asOf, bankVerification: 'NOT_VERIFIED', chequeEvidence, unverifiedCheques, overlappingBills,
      status: !populated.size && Object.values(collections).every(rows => rows.length === 0) ? 'UNAVAILABLE'
        : missingSources.length ? 'PARTIAL' : 'LIVE',
      source: 'SQLSERVER_BACKEND',
    };
  });
}
