/**
 * Aggregated P&L journal projection for /api/v1/ledger/pnl.
 * GROUP BY account code + month; only P&L prefixes; only numbered docs with IncludeInBalance.
 * Parameterized only — no string concatenation of user input.
 */

/** @param {string[]} prefixes e.g. ['41','42','51','52'] */
export function buildLedgerPnlSql(prefixes, { maxRows = 5000 } = {}) {
  if (!Array.isArray(prefixes) || prefixes.length === 0) {
    throw new Error('PNL prefixes required');
  }
  // Prefix match via parameterized OR of LIKE @p0 + '%' etc.
  const prefixConds = prefixes.map((_, i) => `jl.ExternalAccountCode LIKE @pfx${i} + '%'`);
  const whereExtra = prefixConds.length ? `AND (${prefixConds.join(' OR ')})` : '';
  const sqlText = `
SELECT TOP (${Number(maxRows) || 5000})
  jl.ExternalAccountCode AS accountCode,
  CONVERT(char(7), je.DocumentDate, 126) AS periodMonth,
  MIN(je.DocumentDate) AS documentDate,
  SUM(jl.DebitAmount) AS debitAmount,
  SUM(jl.CreditAmount) AS creditAmount,
  COUNT_BIG(1) AS lineCount
FROM crm.JournalLineMirror jl
JOIN crm.JournalEntryMirror je
  ON je.JournalEntryMirrorId = jl.JournalEntryMirrorId AND je.TenantId = jl.TenantId
JOIN crm.JournalStatusMap sm
  ON sm.TenantId = je.TenantId
 AND sm.SourceSystemCode = je.SourceSystemCode
 AND sm.ExternalStatusCode = je.StatusCode
WHERE jl.TenantId = @tenantId
  AND je.TenantId = @tenantId
  AND je.IsVoided = 0
  AND NULLIF(LTRIM(RTRIM(je.DocumentNumber)), '') IS NOT NULL
  AND sm.IncludeInBalance = 1
  AND jl.ExternalAccountCode IS NOT NULL
  AND LTRIM(RTRIM(jl.ExternalAccountCode)) <> ''
  ${whereExtra}
  AND (@fromDate IS NULL OR je.DocumentDate >= @fromDate)
  AND (@toDate IS NULL OR je.DocumentDate <= @toDate)
GROUP BY jl.ExternalAccountCode, CONVERT(char(7), je.DocumentDate, 126)
ORDER BY jl.ExternalAccountCode, periodMonth
`.replace(/\s+/g, ' ').trim();
  return { sqlText, prefixCount: prefixes.length, maxRows: Number(maxRows) || 5000 };
}

export function bindPnlRequest(request, { tenantId, fromDate, toDate, prefixes }) {
  request.input('tenantId', /* sql.UniqueIdentifier */ tenantId);
  request.input('fromDate', fromDate || null);
  request.input('toDate', toDate || null);
  (prefixes || []).forEach((p, i) => {
    request.input(`pfx${i}`, String(p));
  });
  return request;
}
