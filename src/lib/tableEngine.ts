export type CellValue = string | number | boolean | null | undefined;  
export type SortDirection = 'asc' | 'desc';  
export interface SortState { columnId: string; direction: SortDirection }  
  
/** حداقل قرارداد ستون برای موتور؛ ستون رابط کاربری آن را با render گسترش میدهد. */  
export interface ColumnAccessor<T> {  
  id: string;  
  header: string;  
  /** مقدار خام برای مرتبسازی، جستجو و خروجی */  
  value: (row: T) => CellValue;  
  /** مقدار قابلخواندن در خروجی (مثلاً برچسب فارسی وضعیت)؛ پیشفرض: value */  
  exportValue?: (row: T) => CellValue;  
  sortable?: boolean;  
  searchable?: boolean;  
  exportable?: boolean;  
}  
  
export interface FilterOption { value: string; label: string }  
export interface FilterGroup<T> {  
  id: string;  
  label: string;  
  options: FilterOption[];  
  /** آیا ردیف با مقدار انتخابشده مطابقت دارد؟ */  
  predicate: (row: T, value: string) => boolean;  
}  
export type FilterSelection = Record<string, string[]>;  
  
export type Normalizer = (input: string) => string;  
const defaultNormalize: Normalizer = s => s.toLowerCase().trim();  
  
const toText = (v: CellValue): string => (v === null || v === undefined ? '' : String(v));  
  
/** جستجو بین ستونهای searchable و متنهای اضافه؛ همه واژهها باید پیدا شوند (AND). */  
export function searchRows<T>(  
  rows: readonly T[], query: string, columns: readonly ColumnAccessor<T>[],  
  normalize: Normalizer = defaultNormalize, extraText?: (row: T) => readonly (string | undefined | null)[]  
): T[] {  
  const terms = normalize(query || '').split(/\s+/).filter(Boolean);  
  if (!terms.length) return rows.slice();  
  const searchable = columns.filter(c => c.searchable !== false);  
  return rows.filter(row => {  
    const haystack = normalize([  
      ...searchable.map(c => toText(c.value(row))),  
      ...(extraText ? extraText(row).map(t => t || '') : [])  
    ].join(' \u0001 '));  
    return terms.every(term => haystack.includes(term));  
  });  
}  
  
/** درون یک گروه OR، بین گروهها AND. */  
export function applyFilters<T>(rows: readonly T[], groups: readonly FilterGroup<T>[], selection: FilterSelection): T[] {  
  const active = groups.filter(g => (selection[g.id] || []).length > 0);  
  if (!active.length) return rows.slice();  
  return rows.filter(row => active.every(g => (selection[g.id] || []).some(value => g.predicate(row, value))));  
}  
  
/**  
 * شمارش وجهی: تعداد ردیفهای هر گزینه با فرض اعمال سایر گروههای فیلتر (نه گروه خودش).  
 * عددی که روی دکمه فیلتر دیده میشود دقیقاً همان نتیجهای است که پس از انتخاب خواهد آمد.  
 */  
export function facetCounts<T>(rows: readonly T[], groups: readonly FilterGroup<T>[], selection: FilterSelection): Record<string, Record<string, number>> {  
  const out: Record<string, Record<string, number>> = {};  
  for (const group of groups) {  
    const others = { ...selection, [group.id]: [] };  
    const base = applyFilters(rows, groups, others);  
    out[group.id] = {};  
    for (const option of group.options) out[group.id][option.value] = base.filter(r => group.predicate(r, option.value)).length;  
  }  
  return out;  
}  
  
const collator = typeof Intl !== 'undefined' ? new Intl.Collator('fa', { numeric: true, sensitivity: 'base' }) : null;  
  
function compareValues(a: CellValue, b: CellValue): number {  
  if (typeof a === 'number' && typeof b === 'number') return a - b;  
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);  
  const sa = toText(a), sb = toText(b);  
  return collator ? collator.compare(sa, sb) : sa < sb ? -1 : sa > sb ? 1 : 0;  
}  
  
const isEmpty = (v: CellValue) => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));  
  
/** مرتبسازی پایدار؛ مقدار خالی همیشه آخر میآید (در هر دو جهت) تا «—» ها بالای لیست نیایند. */  
export function sortRows<T>(rows: readonly T[], columns: readonly ColumnAccessor<T>[], sort: SortState | null): T[] {  
  if (!sort) return rows.slice();  
  const column = columns.find(c => c.id === sort.columnId);  
  if (!column || column.sortable === false) return rows.slice();  
  const dir = sort.direction === 'desc' ? -1 : 1;  
  return rows  
    .map((row, index) => ({ row, index, key: column.value(row) }))  
    .sort((x, y) => {  
      const ex = isEmpty(x.key), ey = isEmpty(y.key);  
      if (ex || ey) return ex && ey ? x.index - y.index : ex ? 1 : -1;  
      return compareValues(x.key, y.key) * dir || x.index - y.index;  
    })  
    .map(item => item.row);  
}  
  
export interface PageSlice<T> { rows: T[]; page: number; pageCount: number; total: number; from: number; to: number }  
export function paginate<T>(rows: readonly T[], page: number, pageSize: number): PageSlice<T> {  
  const size = Math.max(1, Math.floor(pageSize) || 1);  
  const total = rows.length;  
  const pageCount = Math.max(1, Math.ceil(total / size));  
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);  
  const start = (safePage - 1) * size;  
  const slice = rows.slice(start, start + size);  
  return { rows: slice, page: safePage, pageCount, total, from: total ? start + 1 : 0, to: start + slice.length };  
}  
  
/** جلوگیری از CSV/Formula injection در Excel: سلولهایی که با = + - @ یا tab/CR شروع میشوند با ' خنثی میشوند. */  
export function csvCell(value: CellValue): string {  
  let text = toText(value);  
  if (/^(?:[\t\r\n]|[\u0000-\u0020\uFEFF]*[=+\-@])/.test(text) && !(typeof value === 'number' && Number.isFinite(value))) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;  
}  
  
export function csvRows(rows: readonly (readonly CellValue[])[]): string {
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

/** خروجی CSV با BOM (برای نمایش درست فارسی در Excel) و CRLF. فقط ستونهای قابلخروجی و انتخابشده. */  
export function toCsv<T>(rows: readonly T[], columns: readonly ColumnAccessor<T>[], columnIds?: readonly string[]): string {  
  const cols = columns.filter(c => c.exportable !== false && (!columnIds || columnIds.includes(c.id)));  
  return csvRows([cols.map(c => c.header), ...rows.map(row => cols.map(c => (c.exportValue || c.value)(row)))]);
}  
  
/** وضعیت انتخاب گروهی با پشتیبانی از انتخاب بازهای (Shift+Click). */  
export function rangeIds(orderedIds: readonly string[], anchorId: string | null, targetId: string): string[] {  
  const t = orderedIds.indexOf(targetId);  
  if (t < 0) return [];  
  const a = anchorId ? orderedIds.indexOf(anchorId) : -1;  
  if (a < 0) return [targetId];  
  const [lo, hi] = a < t ? [a, t] : [t, a];  
  return orderedIds.slice(lo, hi + 1);  
}  
  
export type HeaderCheckState = 'none' | 'some' | 'all';  
export function headerCheckState(pageIds: readonly string[], selected: ReadonlySet<string>): HeaderCheckState {  
  if (!pageIds.length) return 'none';  
  const n = pageIds.filter(id => selected.has(id)).length;  
  return n === 0 ? 'none' : n === pageIds.length ? 'all' : 'some';  
}  
