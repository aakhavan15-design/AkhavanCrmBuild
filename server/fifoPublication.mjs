import { rebuildFifo } from './fifoInventory.mjs';

/** Called by the official ingestion worker with its tenant-bound SQL transaction. */
export async function publishFifoInventory({ sql, run }, claims, input) {
  const result = rebuildFifo(input);
  if (result.status !== 'CALCULATED') return result;

  return run(claims, tx => publishCalculatedFifo(sql, tx, claims.tenantId, result));
}

export async function publishCalculatedFifo(sql, tx, tenantId, result, batchId) {
  const publication = await new sql.Request(tx)
    .input('tenantId', sql.UniqueIdentifier, tenantId)
    .input('source', sql.VarChar(40), result.sourceSystemCode)
    .input('product', sql.NVarChar(200), result.productExternalId)
    .input('unit', sql.NVarChar(40), result.unitCode)
    .input('currency', sql.Char(3), result.currencyCode)
    .input('periodStart', sql.DateTime2(3), new Date(result.periodStartUtc))
    .input('through', sql.DateTime2(3), new Date(result.throughUtc))
    .input('revisionText', sql.VarChar(20), result.sourceRevision)
    .input('proof', sql.NVarChar(200), result.sourceProof)
    .input('method', sql.VarChar(25), result.method)
    .input('checksum', sql.Char(64), result.checksum)
    .input('layers', sql.NVarChar(sql.MAX), JSON.stringify(result.layers))
    .input('consumptions', sql.NVarChar(sql.MAX), JSON.stringify(result.consumptions))
    .input('valuations', sql.NVarChar(sql.MAX), JSON.stringify(result.valuations))
    .execute('analytics.usp_PublishFifoRun');

  const receipt = publication.recordset[0];
  if (!receipt?.RunId) {
    throw new Error('FIFO publication returned no run identifier.');
  }
  if (batchId && !receipt.Replayed) {
    await new sql.Request(tx).input('tenantId',sql.UniqueIdentifier,tenantId)
      .input('runId',sql.UniqueIdentifier,receipt.RunId).input('batchId',sql.BigInt,batchId)
      .query('UPDATE analytics.FifoRun SET ImportedBatchId=@batchId WHERE TenantId=@tenantId AND RunId=@runId');
  }
  return { status: 'PUBLISHED', runId: receipt.RunId, replayed: receipt.Replayed, checksum: result.checksum };
}
