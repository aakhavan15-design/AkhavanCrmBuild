// F0-08: وضعیت گزارش تحلیلی فقط از نتیجهٔ واقعی Query؛ هیچ READY/isAuthoritative ثابتی وجود ندارد.
export const REPORT_SOURCE_TABLES = ['crm.InvoiceMirror', 'crm.PaymentAllocationMirror', 'crm.JournalLineMirror'];
const COUNT_SQL = Object.fromEntries(REPORT_SOURCE_TABLES.map(t => [t, `SELECT COUNT_BIG(*) AS n FROM ${t}`])); // نام جدول ثابت؛ ورودی کاربر در SQL نیست

/** probe(sqlText) → Promise<number>؛ در حالت غیر mssql باید null باشد. */
export async function buildReportStatus({ reportId, tenantId, asOfDate, driverKind, probe }) {
  const base = { reportId, tenantId, asOfDate, reportDataAvailable: false };
  if (driverKind !== 'mssql' || typeof probe !== 'function') {
    return { ...base, status: 'UNAVAILABLE', reason: 'SQL_NOT_CONNECTED', dataTrust: { isAuthoritative: false, provenance: null, sourceTables: [] } };
  }
  const coverage = {};
  try {
    for (const table of REPORT_SOURCE_TABLES) coverage[table] = Number(await probe(COUNT_SQL[table]));
  } catch (err) {
    return { ...base, status: 'UNAVAILABLE', reason: 'QUERY_FAILED', errorCode: String(err?.code || err?.name || 'ERROR'), dataTrust: { isAuthoritative: false, provenance: null, sourceTables: REPORT_SOURCE_TABLES } };
  }
  const status = Object.values(coverage).some(n => n > 0) ? 'PARTIAL' : 'EMPTY';
  return { ...base, status, coverage, reason:status==='PARTIAL' ? 'SOURCE_ROWS_ONLY' : 'EMPTY_SOURCE',
    dataTrust: { isAuthoritative:false, provenance:'SQLSERVER_CANONICAL_MIRROR', sourceTables:REPORT_SOURCE_TABLES } };
}
