import { MAX_FEED_BYTES } from './financialFeedContract.mjs';

const extractionError = code => Object.assign(new Error('ERP financial extract failed'),{code});

export async function readFinancialApiFeed({ url, token, checkpoint, request = fetch }) {
  const endpoint = new URL(url);
  if (endpoint.protocol!=='https:' || endpoint.username || endpoint.password || endpoint.hash) {
    throw extractionError('ERP_API_ENDPOINT');
  }
  endpoint.searchParams.set('feed',checkpoint.feed);
  endpoint.searchParams.set('company',checkpoint.company);
  if (checkpoint.cursor) endpoint.searchParams.set('after',checkpoint.cursor);
  else endpoint.searchParams.delete('after');
  const response = await request(endpoint,{
    method:'GET',redirect:'error',signal:AbortSignal.timeout(checkpoint.timeoutMs),
    headers:{ accept:'application/json',...(token ? { authorization:`Bearer ${token}` } : {}) },
  });
  if (response.status===204) return null;
  if (!response.ok || !response.body || !/^application\/(?:[\w.+-]+\+)?json(?:[;\s]|$)/i.test(response.headers.get('content-type') ?? '')) {
    throw extractionError(response.status===429 || response.status>=500 ? 'ERP_API_RETRYABLE' : 'ERP_API_RESPONSE');
  }

  const chunks = [];
  let length = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { value,done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length>MAX_FEED_BYTES) {
        await reader.cancel();
        throw extractionError('ERP_FEED_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks,length).toString('utf8');
}

export async function readFinancialSqlFeed({ sql, pool, view, checkpoint }) {
  const parts = typeof view==='string' ? view.split('.') : [];
  if (parts.length!==2 || !parts.every(part => /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(part))) {
    throw extractionError('ERP_SQL_VIEW');
  }
  // Identifier comes from deployment configuration and is validated above, never from the source payload.
  const target = parts.map(part => `[${part}]`).join('.');
  const result = await pool.request()
    .input('company',sql.NVarChar(120),checkpoint.company)
    .input('feed',sql.NVarChar(80),checkpoint.feed)
    .input('after',sql.NVarChar(200),checkpoint.cursor ?? null)
    .input('maxBytes',sql.Int,MAX_FEED_BYTES*2)
    .query(`SELECT TOP (2) CASE WHEN DATALENGTH(PayloadJson)<=@maxBytes THEN PayloadJson END AS raw
      FROM ${target} WHERE CompanyKey=@company AND FeedCode=@feed
        AND (PreviousCursor=@after OR (PreviousCursor IS NULL AND @after IS NULL));`);
  if (!result.recordset.length) return null;
  const { raw } = result.recordset[0];
  if (result.recordset.length!==1) throw extractionError('ERP_SQL_CURSOR_AMBIGUOUS');
  if (typeof raw!=='string' || Buffer.byteLength(raw)>MAX_FEED_BYTES) throw extractionError('ERP_FEED_TOO_LARGE');
  return raw;
}
