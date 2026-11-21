import { isMarkedFixture } from '../src/lib/stateModel.mjs';

const sources = ['cheques', 'supplierBills', 'expenses', 'treasuryAccounts', 'treasuryTransactions'];

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
    const missingSources = sources.filter(key => !populated.has(key));
    return {
      ...collections, missingSources, updatedAt, bankVerification: 'NOT_VERIFIED',
      status: missingSources.length === sources.length ? 'UNAVAILABLE' : missingSources.length ? 'PARTIAL' : 'LIVE',
      source: 'SQLSERVER_BACKEND',
    };
  });
}
