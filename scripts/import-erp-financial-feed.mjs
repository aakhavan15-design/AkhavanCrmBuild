import { open } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import sql from 'mssql';
import { readFinancialApiFeed,readFinancialSqlFeed } from '../server/financialFeedExtract.mjs';
import { createFinancialFeedWorker,readFinancialFeedCheckpoint } from '../server/financialFeedWorker.mjs';
import { MAX_FEED_BYTES } from '../server/financialFeedContract.mjs';

const { values } = parseArgs({ options: { tenant:{type:'string'},connector:{type:'string'},file:{type:'string'},
  pull:{type:'string'},feed:{type:'string'} } });
const fileMode = Boolean(values.file) && !values.pull && !values.feed;
const pullMode = ['api','sql'].includes(values.pull) && Boolean(values.feed) && !values.file;
if (!values.tenant || !values.connector || !(fileMode || pullMode)) {
  process.stderr.write('Usage: node scripts/import-erp-financial-feed.mjs --tenant <id> --connector <id> (--file <normalized.json> | --pull api|sql --feed <feed>)\n');
  process.exit(2);
}

async function readFinancialFile(file) {
  const handle = await open(file,'r');
  try {
    const proof = await handle.stat();
    if (!proof.isFile() || proof.size>MAX_FEED_BYTES) throw Object.assign(new Error('Invalid input file'),{ code:'INPUT_FILE' });
    return await handle.readFile({encoding:'utf8'});
  } finally {
    await handle.close();
  }
}

let pool,erpPool;
try {
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
  const runtime = { sql,run };
  const connection = { tenantId:values.tenant,connectorId:values.connector };
  const worker = createFinancialFeedWorker(runtime);
  let raw;
  if (fileMode) {
    raw = await readFinancialFile(values.file);
  } else {
    const checkpoint = await readFinancialFeedCheckpoint(runtime,{...connection,feed:values.feed});
    if (values.pull==='api') {
      raw = await readFinancialApiFeed({ url:env.ERP_FINANCIAL_API_URL,token:env.ERP_FINANCIAL_API_TOKEN,checkpoint });
    } else {
      if (![env.ERP_FINANCIAL_SQL_HOST,env.ERP_FINANCIAL_SQL_DATABASE,env.ERP_FINANCIAL_SQL_USER,env.ERP_FINANCIAL_SQL_PASSWORD,
        env.ERP_FINANCIAL_SQL_VIEW].every(Boolean)) {
        throw Object.assign(new Error('Incomplete ERP SQL read-only configuration'),{code:'ERP_SQL_CONFIGURATION'});
      }
      erpPool = await new sql.ConnectionPool({
        server:env.ERP_FINANCIAL_SQL_HOST,database:env.ERP_FINANCIAL_SQL_DATABASE,
        user:env.ERP_FINANCIAL_SQL_USER,password:env.ERP_FINANCIAL_SQL_PASSWORD,
        port:Number(env.ERP_FINANCIAL_SQL_PORT || 1433),options:{encrypt:true,trustServerCertificate:false,useUTC:true},
        connectionTimeout:8000,requestTimeout:checkpoint.timeoutMs,pool:{min:0,max:1},
      }).connect();
      raw = await readFinancialSqlFeed({sql,pool:erpPool,view:env.ERP_FINANCIAL_SQL_VIEW,checkpoint});
    }
    if (raw!==null && JSON.parse(raw).feed!==values.feed) {
      throw Object.assign(new Error('Feed does not match the request'),{code:'ERP_FEED_MISMATCH'});
    }
  }
  if (raw===null) {
    process.stdout.write('{"status":"NO_CHANGES"}\n');
  } else {
    const receipt = await worker({...connection,raw});
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    if (receipt.status!=='SUCCEEDED') process.exitCode = 1;
  }
} catch (error) {
  // Keep journal content, connection parameters and database error payload out of logs.
  process.stderr.write(`Financial import failed (${error.code || 'INVALID_INPUT'}).\n`);
  process.exitCode = 1;
} finally {
  await erpPool?.close();
  await pool?.close();
}
