/**
 * Deterministic local-only adapter for list filters/pagination.
 * Mirrors the string-filter contract sent by HttpDataProvider to the API.
 * This is for OFFLINE/TEST lists; production security stays in server RBAC.
 */
export interface LocalPagination { page?: number; pageSize?: number; sortBy?: string; sortDirection?: 'asc'|'desc' }
export function queryLocalRecords<T extends object>(
  rows: T[], filter: Record<string, unknown> | null | undefined,
  pagination: LocalPagination | undefined, defaultSize: number
): { items: T[]; total: number; page: number; pageSize: number; totalPages: number } {
  const predicates = Object.entries(filter || {}).filter(([,value])=>
    typeof value === 'string' && value.trim().length > 0);
  let filtered = rows.filter(row => predicates.every(([key,v]) => {
    const rec = row as Record<string, unknown>;
    const want = String(v).trim().toLocaleLowerCase();
    if (key === 'search' || key === 'name') {
      const searchable=['name','title','invoiceNumber','quoteNumber','chequeNumber','reference','id'];
      return searchable.some(field=>String(rec[field]??'').toLocaleLowerCase().includes(want));
    }
    if (key === 'fromDate') return String(row.date || row.createdAt || '').slice(0,10) >= want;
    if (key === 'toDate') return String(row.date || row.createdAt || '').slice(0,10) <= want;
    if (key === 'accountId' || key === 'customerId')
      return String(row.accountId || row.customerId || '').toLocaleLowerCase()===want;
    // Unknown filters fail closed instead of incorrectly returning every row.
    if (!(key in rec)) return false;
    return String(rec[key]??'').toLocaleLowerCase()===want;
  }));
  const sortBy = pagination?.sortBy;
  if (sortBy) {
    filtered = [...filtered].sort((a,b)=>{
      const av=String((a as Record<string,unknown>)[sortBy]??''), bv=String((b as Record<string,unknown>)[sortBy]??'');
      return (pagination?.sortDirection==='desc'?-1:1)*av.localeCompare(bv,'fa',{numeric:true});
    });
  }
  const page = Math.max(1,Math.floor(Number(pagination?.page)||1));
  const pageSize = Math.max(1,Math.min(1000,Math.floor(Number(pagination?.pageSize)||defaultSize)));
  const total = filtered.length;
  return { items: filtered.slice((page-1)*pageSize,page*pageSize),total,page,pageSize,totalPages:Math.max(1,Math.ceil(total/pageSize)) };
}
