/** Shared ledger request serialization: preserve explicit false and reject invalid pagination. */
export function journalQueryParams(filter = {}, pagination = {}) {
  const query = new URLSearchParams();
  for (const key of ['journalId', 'detailKey', 'subsidiaryCode', 'periodCode', 'fromDate', 'toDate', 'unmapped']) {
    const value = filter?.[key];
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  query.set('page', String(pagination?.page ?? 1));
  query.set('pageSize', String(pagination?.pageSize ?? 25));
  return query.toString();
}
