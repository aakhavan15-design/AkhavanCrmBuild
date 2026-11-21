import { financialPayloadDigest, hashFinancialPayload, isFinancialUuid, JOURNAL_FEED, MAX_FEED_BYTES, normalizeJournalFeed, normalizeReferenceFeed, REFERENCE_FEED } from './financialFeedContract.mjs';
import { publishJournals, stageJournals } from './journalFeedSql.mjs';
import { publishFinancialReference } from './financialReferenceSql.mjs';

const connectorSql = `
SELECT c.SystemCode AS source,c.FinancialCompanyKey AS company,c.FinancialBaseCurrency AS currency
FROM integration.Connector c WITH (UPDLOCK,HOLDLOCK)
WHERE c.TenantId=@tenantId AND c.ConnectorId=@connectorId AND c.IsEnabled=1
  AND c.DirectionCode IN ('INBOUND','BIDIRECTIONAL') AND c.FinancialCompanyKey IS NOT NULL;`;

const pickBatchSql = `
SELECT CONVERT(varchar(22),b.SyncBatchId) AS batchId,b.StatusCode AS status,
  b.ReceivedCount AS received,b.RejectedCount AS rejected,b.DuplicateCount AS duplicate,
  b.InsertedCount AS inserted,b.UpdatedCount AS updated,b.SkippedStaleCount AS stale,
  CONVERT(varchar(64),raw.PayloadHash,2) AS digest
FROM integration.SyncBatch b LEFT JOIN integration.RawRecord raw ON raw.TenantId=b.TenantId AND raw.SyncBatchId=b.SyncBatchId
  AND raw.EntityType=N'FINANCIAL_FEED_BATCH'
WHERE b.TenantId=@tenantId AND b.ConnectorId=@connectorId AND b.EntityType=@feed AND b.ExternalBatchKey=@batchKey;

SELECT cp.LastExternalId AS cursor,CONVERT(varchar(22),b.SourceBatchRevision) AS revision,cp.WatermarkUtc AS watermark
FROM integration.SyncCheckpoint cp
LEFT JOIN integration.SyncBatch b ON b.TenantId=cp.TenantId AND b.SyncBatchId=cp.LastSuccessfulBatchId
WHERE cp.TenantId=@tenantId AND cp.ConnectorId=@connectorId AND cp.EntityType=@feed;`;

const createBatchSql = `
SET NOCOUNT ON;
INSERT integration.SyncBatch(TenantId,ConnectorId,SourceSystemCode,EntityType,ModeCode,WindowFromUtc,WindowToUtc,ExternalBatchKey,SourceBatchRevision)
VALUES(@tenantId,@connectorId,@source,@feed,@mode,@windowFrom,@windowTo,@batchKey,CONVERT(decimal(20,0),@batchRevision));
SELECT CONVERT(varchar(22),SCOPE_IDENTITY()) AS batchId;`;

const saveRawAndControlSql = `
INSERT integration.RawRecord(TenantId,SourceSystemCode,EntityType,ExternalRecordId,PayloadJson,PayloadHash,TransformStatus,SyncBatchId)
VALUES(@tenantId,@source,N'FINANCIAL_FEED_BATCH',@rawKey,@raw,@digest,@rawStatus,@batchId);

INSERT integration.ReconciliationRun(TenantId,SourceSystemCode,MetricCode,AsOfDate,CrmValue,SourceValue,ToleranceValue,StatusCode,SyncBatchId)
SELECT @tenantId,@source,metric,@asOf,actual,expected,0,result,@batchId
FROM OPENJSON(@controls) WITH(metric varchar(100),actual decimal(19,4),expected decimal(19,4),result varchar(20));`;

const saveCheckpointSql = `
UPDATE integration.SyncCheckpoint SET LastExternalId=@cursor,LastSuccessfulBatchId=@batchId,
  WatermarkUtc=COALESCE(@watermark,WatermarkUtc),UpdatedAtUtc=SYSUTCDATETIME()
WHERE TenantId=@tenantId AND ConnectorId=@connectorId AND EntityType=@feed;
IF @@ROWCOUNT=0
  INSERT integration.SyncCheckpoint(TenantId,ConnectorId,EntityType,LastExternalId,LastSuccessfulBatchId,WatermarkUtc)
  VALUES(@tenantId,@connectorId,@feed,@cursor,@batchId,@watermark);
UPDATE integration.Connector SET LastAttemptAtUtc=SYSUTCDATETIME(),LastSuccessAtUtc=SYSUTCDATETIME(),UpdatedAtUtc=SYSUTCDATETIME()
WHERE TenantId=@tenantId AND ConnectorId=@connectorId;`;

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

function journalControls(control, received, known) {
  if (!control) return [];
  return [
    { metric: 'FINANCIAL_JOURNAL_DOCUMENTS', actual: received, expected: control.documents,
      result: received === control.documents ? 'MATCHED' : 'MISMATCH' },
    ...[['FINANCIAL_JOURNAL_LINES', control.lines], ['FINANCIAL_JOURNAL_DEBIT', control.debit], ['FINANCIAL_JOURNAL_CREDIT', control.credit]]
      // Exact high-value control amounts remain in RawRecord; their 38-digit counterpart cannot be represented in ReconciliationRun.
      .filter(([,value]) => String(value).split('.')[0].length <= 15)
      .map(([metric,expected]) => ({ metric, expected, actual: known ? expected : null, result: known ? 'MATCHED' : 'NOT_COMPARABLE' })),
  ];
}

const journalHandler = {
  normalize: normalizeJournalFeed,
  sql: stageJournals + publishJournals,
  rows: result => result.documents,
  controls: journalControls,
};

function dateParameter(value) {
  return value ? new Date(value) : null;
}

/** A private, company-bound worker. Publishers use the CRM database and the existing integration transaction. */
export function createFinancialFeedWorker({ sql, run }, additionalHandlers = {}) {
  const handlers = {
    [JOURNAL_FEED]: journalHandler,
    [REFERENCE_FEED]: { normalize: normalizeReferenceFeed, sql: publishFinancialReference, rows: result => result.records,
      controls: (control, received) => [{ metric: 'FINANCIAL_REFERENCE_RECORDS', actual: received, expected: control.records,
        result: received===control.records ? 'MATCHED' : 'MISMATCH' }] },
    ...additionalHandlers,
  };
  return async ({ tenantId, connectorId, raw }) => {
    if (!isFinancialUuid(tenantId) || !isFinancialUuid(connectorId) || typeof raw !== 'string' || Buffer.byteLength(raw)>MAX_FEED_BYTES) {
      throw failure('INVALID_ARGUMENTS','شناسهٔ مستأجر، اتصال یا اندازهٔ دسته معتبر نیست.');
    }
    const input = JSON.parse(raw);
    const handler = Object.hasOwn(handlers,input?.feed) ? handlers[input.feed] : null;
    if (!handler) throw failure('INVALID_FEED','نوع دستهٔ مالی برای این ورودی پشتیبانی نمی‌شود.');
    const normalized = handler.normalize(input);
    const digest = financialPayloadDigest(input);
    const rawKey = hashFinancialPayload(JSON.stringify([connectorId.toLowerCase(),input.feed,input.batchKey])).toString('hex');

    return run({ tenantId }, async transaction => {
      const request = () => new sql.Request(transaction)
        .input('tenantId',sql.UniqueIdentifier,tenantId);
      const scoped = () => request().input('connectorId',sql.UniqueIdentifier,connectorId);
      const bound = await scoped().query(connectorSql);
      const connector = bound.recordset[0];
      if (!connector || connector.company!==input.companyKey || connector.currency!==input.currencyCode) {
        throw failure('COMPANY_SCOPE_MISMATCH','شرکت یا ارز پایهٔ دسته با قرارداد اتصال ورودی سازگار نیست.');
      }
      const batchRequest = () => scoped().input('feed',sql.NVarChar(80),input.feed)
        .input('batchKey',sql.NVarChar(160),input.batchKey);
      const result = await batchRequest().query(pickBatchSql);
      const existing = result.recordsets[0][0];
      const checkpoint = result.recordsets[1][0];
      if (existing) {
        if (existing.digest?.toLowerCase()!==digest.toString('hex')) {
          throw failure('BATCH_KEY_CONFLICT','این شناسهٔ دسته با محتوای دیگری ثبت شده است.');
        }
        const { digest: _digest, ...receipt } = existing;
        return { ...receipt, replayed: true };
      }
      if (input.mode!=='REPLAY' && (checkpoint?.revision && BigInt(input.batchRevision)<=BigInt(checkpoint.revision)
        || input.mode==='INCREMENTAL' && (!checkpoint || input.previousCursor!==checkpoint.cursor)
        || input.watermarkUtc && checkpoint?.watermark && Date.parse(input.watermarkUtc)<checkpoint.watermark.getTime())) {
        throw failure('STALE_CHECKPOINT','نسخه یا نقطهٔ ادامه با آخرین دستهٔ موفق همخوان نیست.');
      }
      const start = await batchRequest().input('source',sql.VarChar(40),connector.source)
        .input('mode',sql.VarChar(20),input.mode)
        .input('windowFrom',sql.DateTime2(3),dateParameter(input.windowFrom))
        .input('windowTo',sql.DateTime2(3),dateParameter(input.windowTo))
        .input('batchRevision',sql.VarChar(20),input.batchRevision).query(createBatchSql);
      const { batchId } = start.recordset[0];
      const errors = [...normalized.errors];
      let stats = { inserted: 0, updated: 0, stale: 0, identical: 0 };
      const batchScope = () => scoped().input('batchId',sql.BigInt,batchId);
      const rows = handler.rows(normalized);
      if (!errors.length && rows.length) {
        const applied = await batchScope().input('source',sql.VarChar(40),connector.source)
          .input('currency',sql.Char(3),connector.currency)
          .input('revisionText',sql.VarChar(20),input.batchRevision)
          .input('normalized',sql.NVarChar(sql.MAX),JSON.stringify(rows)).query(handler.sql);
        errors.push(...applied.recordsets[0]);
        if (!errors.length) stats = applied.recordsets[1][0];
      }

      const status = errors.length ? 'FAILED' : 'SUCCEEDED';
      const controls = handler.controls?.(normalized.control,normalized.received,!errors.length) ?? [];
      await batchScope().input('source',sql.VarChar(40),connector.source)
        .input('rawKey',sql.NVarChar(200),rawKey)
        .input('raw',sql.NVarChar(sql.MAX),raw)
        .input('digest',sql.VarBinary(32),digest)
        .input('rawStatus',sql.VarChar(20),errors.length ? 'REJECTED' : 'MAPPED')
        .input('asOf',sql.Date,dateParameter(input.windowTo) ?? new Date())
        .input('controls',sql.NVarChar(sql.MAX),JSON.stringify(controls))
        .query(saveRawAndControlSql);

      const duplicate = Number(stats.identical);
      const rejected = errors.length ? normalized.received : 0;
      await request()
        .input('SyncBatchId',sql.BigInt,batchId)
        .input('StatusCode',sql.VarChar(20),status)
        .input('ReceivedCount',sql.Int,normalized.received)
        .input('ValidCount',sql.Int,normalized.received-rejected-duplicate)
        .input('RejectedCount',sql.Int,rejected)
        .input('DuplicateCount',sql.Int,duplicate)
        .input('InsertedCount',sql.Int,stats.inserted)
        .input('UpdatedCount',sql.Int,stats.updated)
        .input('SkippedStaleCount',sql.Int,stats.stale)
        .input('RejectionsJson',sql.NVarChar(sql.MAX),JSON.stringify(errors))
        .execute('integration.usp_FinalizeSyncBatch');

      if (status==='SUCCEEDED' && input.mode!=='REPLAY') {
        await batchScope().input('feed',sql.NVarChar(80),input.feed)
          .input('cursor',sql.NVarChar(200),input.nextCursor)
          .input('watermark',sql.DateTime2(3),dateParameter(input.watermarkUtc))
          .query(saveCheckpointSql);
      }
      return { batchId, status, received: normalized.received, rejected, duplicate, inserted: stats.inserted,
        updated: stats.updated, stale: stats.stale, replayed: false };
    });
  };
}
