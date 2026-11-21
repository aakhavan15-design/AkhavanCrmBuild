import { open } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import sql from 'mssql';
import { createFinancialFeedWorker } from '../server/financialFeedWorker.mjs';
import { MAX_FEED_BYTES } from '../server/financialFeedContract.mjs';

const { values } = parseArgs({ options: { tenant: { type: 'string' }, connector: { type: 'string' }, file: { type: 'string' } } });
if (!values.tenant || !values.connector || !values.file) {
  process.stderr.write('Usage: node scripts/import-erp-financial-feed.mjs --tenant <id> --connector <id> --file <normalized.json>\n');
  process.exit(2);
}

let pool;
try {
  const handle = await open(values.file,'r');
  let raw;
  try {
    const proof = await handle.stat();
    if (!proof.isFile() || proof.size>MAX_FEED_BYTES) throw Object.assign(new Error('Invalid input file'),{ code: 'INPUT_FILE' });
    raw = await handle.readFile({ encoding: 'utf8' });
  } finally {
    await handle.close();
  }

  const env = process.env;
  if (![env.SQLSERVER_HOST,env.SQLSERVER_DATABASE,env.SQLSERVER_INGEST_USER,env.SQLSERVER_INGEST_PASSWORD].every(Boolean)) {
    throw Object.assign(new Error('Incomplete worker configuration'),{ code: 'WORKER_CONFIGURATION' });
  }
  if (env.SQLSERVER_ENCRYPT==='false' || env.SQLSERVER_TRUST_CERT==='true') {
    throw Object.assign(new Error('Bank and journal ingestion requires verified SQL transport'),{ code: 'WORKER_SQL_TLS' });
  }
  pool = await new sql.ConnectionPool({
    server: env.SQLSERVER_HOST, database: env.SQLSERVER_DATABASE,
    user: env.SQLSERVER_INGEST_USER, password: env.SQLSERVER_INGEST_PASSWORD,
    port: Number(env.SQLSERVER_PORT || 1433), options: { encrypt: true, trustServerCertificate: false },
    connectionTimeout: 8000, requestTimeout: 90000, pool: { min: 0, max: 1 },
  }).connect();
  const run = async ({ tenantId }, work) => {
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    try {
      await new sql.Request(transaction).input('tenantId',sql.UniqueIdentifier,tenantId)
        .query("EXEC sys.sp_set_session_context @key=N'TenantId', @value=@tenantId;");
      const result = await work(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      try { await transaction.rollback(); } catch { /* transaction may have rolled back in SQL Server */ }
      throw error;
    }
  };
  const worker = createFinancialFeedWorker({ sql, run });
  const receipt = await worker({ tenantId: values.tenant, connectorId: values.connector, raw });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  if (receipt.status!=='SUCCEEDED') process.exitCode = 1;
} catch (error) {
  // Keep journal content, connection parameters and database error payload out of logs.
  process.stderr.write(`Financial import failed (${error.code || 'INVALID_INPUT'}).\n`);
  process.exitCode = 1;
} finally {
  await pool?.close();
}
