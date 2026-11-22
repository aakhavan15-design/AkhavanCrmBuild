/** Validate a ledger journal request without SQL interpolation of user input. */
export function parseJournalQuery(query = {}) {
  const fields = ['detailKey', 'subsidiaryCode', 'periodCode'];
  const filter = {};
  for (const key of fields) {
    if (query[key] === undefined) continue;
    if (typeof query[key] !== 'string' || !query[key].trim() || query[key].length > 120) throw new RangeError(`INVALID_${key}`);
    filter[key] = query[key].trim();
  }
  if (query.journalId !== undefined) {
    if (typeof query.journalId!=='string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(query.journalId)) {
      throw new RangeError('INVALID_JOURNAL');
    }
    filter.journalId = query.journalId;
  }
  for (const key of ['unmapped','withoutDetail','activityOnly','balanceWindow']) {
    if (query[key] === undefined) continue;
    if (typeof query[key]!=='string' || !['true','false','1','0'].includes(query[key])) throw new RangeError(`INVALID_${key}`);
    filter[key] = ['true','1'].includes(query[key]);
  }
  if (query.role !== undefined) {
    if (!['RECEIVABLE','PAYABLE'].includes(query.role)) throw new RangeError('INVALID_ROLE');
    filter.role = query.role;
  }
  for (const key of ['fromDate', 'toDate']) {
    if (query[key] === undefined) continue;
    const v = String(query[key]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0,10) !== v) throw new RangeError(`INVALID_${key}`);
    filter[key] = v;
  }
  if (filter.fromDate && filter.toDate && filter.fromDate > filter.toDate) throw new RangeError('INVALID_DATE_RANGE');
  if (filter.balanceWindow && (!filter.detailKey || filter.activityOnly || filter.fromDate || filter.toDate || filter.withoutDetail)) {
    throw new RangeError('INVALID_BALANCE_WINDOW');
  }
  const integer = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (!/^\d+$/.test(String(value))) throw new RangeError('INVALID_PAGINATION');
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new RangeError('INVALID_PAGINATION');
    return n;
  };
  return { filter, page: integer(query.page, 1, 1000000), pageSize: integer(query.pageSize, 25, 200) };
}
