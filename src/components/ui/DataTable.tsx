import React, { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronLeft, ChevronRight, Columns3, Download,
  Minus, Rows3, X
} from 'lucide-react';
import { cn, normalizePersianText, toLocalDateISO } from '../../lib/utils';
import {
  ColumnAccessor, FilterGroup, FilterSelection, SortState, applyFilters, facetCounts, headerCheckState,
  paginate, rangeIds, searchRows, sortRows, toCsv
} from '../../lib/tableEngine';
import { PageToolbar, ActiveFilter } from './PageToolbar';
import { EmptyState } from './EmptyState';
import { ErrorState } from './Skeleton';

/* ───────────────────────────── types ───────────────────────────── */

export interface DataTableColumn<T> extends ColumnAccessor<T> {
  render?: (row: T) => React.ReactNode;
  align?: 'start' | 'end' | 'center';
  /** عرض کمینه به px */
  minWidth?: number;
  /** ستون اصلی: چسبیده به ابتدای جدول، دکمهٔ بازکردن جزئیات و تیتر کارت موبایل */
  primary?: boolean;
  hideable?: boolean;
  defaultHidden?: boolean;
  /** در کارت موبایل: 'hide' پنهان؛ پیشفرض نمایش سه ستون اول غیر اصلی */
  mobile?: 'show' | 'hide';
}

export interface BulkAction<T> {
  id: string;
  label: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'danger';
  /** اگر false برگردد دکمه غیرفعال میشود و disabledReason دلیل را نشان میدهد */
  enabled?: (rows: T[]) => boolean;
  disabledReason?: string;
  run: (rows: T[]) => void;
}

export interface DataTableProps<T> {
  /** شناسهٔ پایدار برای ذخیرهٔ ترجیحات نما (چگالی، ستونها، اندازهٔ صفحه، مرتبسازی) */
  tableId: string;
  rows: readonly T[];
  columns: readonly DataTableColumn<T>[];
  getRowId: (row: T) => string;
  title: string;
  subtitle?: string;
  searchPlaceholder?: string;
  filterGroups?: readonly FilterGroup<T>[];
  /** متنهای اضافه برای جستجو (مثلاً نام مخاطبین) */
  extraSearchText?: (row: T) => readonly (string | undefined | null)[];
  defaultSort?: SortState | null;
  pageSizes?: readonly number[];
  toolbarActions?: React.ReactNode;
  /** Render a shared record-level task action in the toolbar; selected rows are passed as context. */
  renderTaskAction?: (selectedRows: readonly T[]) => React.ReactNode;
  /** کارتهای خلاصه/میانبر بالای جدول؛ فقط از دادههای واقعی */
  summary?: React.ReactNode;
  bulkActions?: readonly BulkAction<T>[];
  /** ستون انتخاب و نوار گروهی؛ پیشفرض با وجود bulkActions فعال است */
  selectable?: boolean;
  /** محتوای پنل جزئیات ردیف؛ اگر ندهید ردیف قابل بازشدن نیست */
  renderDetail?: (row: T) => React.ReactNode;
  detailTitle?: (row: T) => string;
  detailFooter?: (row: T) => React.ReactNode;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: { label: string; onClick: () => void };
  exportFileName?: string;
  /** خارجی: کنترل فیلتر از بیرون (مثلاً کارت خلاصه) */
  selection?: FilterSelection;
  onSelectionChange?: (next: FilterSelection) => void;
  /** تعداد کل پیش از اعمال دسترسی/فیلتر؛ فقط برای پیام «از N مورد» اگر لازم باشد */
  className?: string;
}

/* ─────────────────────────── view preference ─────────────────────────── */

type Density = 'compact' | 'comfortable';
interface ViewPrefs { density: Density; pageSize: number; hidden: string[]; sort: SortState | null }

const readPrefs = (key: string): Partial<ViewPrefs> => {
  try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
};
const writePrefs = (key: string, prefs: ViewPrefs) => {
  try { window.localStorage.setItem(key, JSON.stringify(prefs)); } catch { /* ذخیرهسازی در دسترس نیست؛ فقط نشست جاری */ }
};

const fa = (n: number) => n.toLocaleString('fa-IR');

/* ─────────────────────────── small primitives ─────────────────────────── */

function useDismiss(open: boolean, onClose: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, onClose, ref]);
}

function Popover({ label, icon, badge, children, align = 'start' }: {
  label: string; icon?: React.ReactNode; badge?: number; children: React.ReactNode; align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref);
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(o => !o)}
        className={cn('inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-[background-color,border-color,transform] duration-150 active:scale-(--scale-press) focus-visible:outline-2 focus-visible:outline-primary',
          badge ? 'border-primary/30 bg-primary-soft text-primary' : 'border-border bg-surface text-text-main hover:bg-sunken')}>
        {icon}<span>{label}</span>
        {!!badge && <span className="grid min-w-5 place-items-center rounded-md bg-primary px-1 text-micro font-black tabular-nums text-on-primary">{fa(badge)}</span>}
      </button>
      {open && <div id={panelId} role="group" aria-label={label}
        className={cn('se-pop-in absolute top-full z-40 mt-2 max-h-80 w-64 overflow-auto rounded-2xl border border-border bg-surface p-1.5 shadow-floating', align === 'end' ? 'end-0' : 'start-0')}>{children}</div>}
    </div>
  );
}

function CheckMark({ state }: { state: 'none' | 'some' | 'all' }) {
  return (
    <span aria-hidden="true" className={cn('grid h-(--size-check) w-(--size-check) place-items-center rounded-md border transition-[background-color,border-color,transform] duration-150',
      state === 'none' ? 'border-border-strong bg-surface' : 'border-primary bg-primary text-on-primary se-check-pop')}>
      {state === 'all' && <Check size={13} strokeWidth={3} />}{state === 'some' && <Minus size={13} strokeWidth={3} />}
    </span>
  );
}

function CheckButton({ state, label, onToggle, onShiftToggle }: {
  state: 'none' | 'some' | 'all'; label: string; onToggle: () => void; onShiftToggle?: () => void;
}) {
  return (
    <button type="button" role="checkbox" aria-checked={state === 'some' ? 'mixed' : state === 'all'} aria-label={label}
      onClick={e => (e.shiftKey && onShiftToggle ? onShiftToggle() : onToggle())}
      className="grid h-10 w-10 place-items-center rounded-lg transition-colors hover:bg-sunken focus-visible:outline-2 focus-visible:outline-primary">
      <CheckMark state={state} />
    </button>
  );
}

/** بخشبندی محتوای پنل جزئیات؛ برای یکدستی صفحات */
export function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-b border-border-light px-5 py-4 last:border-b-0"><h3 className="mb-3 text-xs font-extrabold text-text-secondary">{title}</h3><dl className="space-y-3">{children}</dl></section>;
}
export function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[7rem_1fr] items-baseline gap-3 text-sm"><dt className="text-xs text-text-secondary">{label}</dt><dd className="min-w-0 break-words font-semibold text-text-main">{children}</dd></div>;
}

/* ───────────────────────────── DataTable ───────────────────────────── */

export function DataTable<T>(props: DataTableProps<T>) {
  const {
    tableId, rows, columns, getRowId, title, subtitle, searchPlaceholder = 'جستجو...', filterGroups = [],
    extraSearchText, defaultSort = null, pageSizes = [25, 50, 100], toolbarActions, summary, bulkActions = [],
    renderDetail, detailTitle, detailFooter, loading, error, onRetry, emptyTitle = 'موردی برای نمایش نیست',
    emptyDescription = 'هنوز رکوردی ثبت نشده است.', emptyAction, exportFileName = 'export', className
  } = props;

  const selectable = props.selectable ?? bulkActions.length > 0;
  const prefsKey = `akhavan_table_view:${tableId}`;
  const saved = useMemo(() => (typeof window === 'undefined' ? {} : readPrefs(prefsKey)), [prefsKey]);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [internalSelection, setInternalSelection] = useState<FilterSelection>({});
  const filterSelection = props.selection ?? internalSelection;
  const setFilterSelection = (next: FilterSelection) => { (props.onSelectionChange ?? setInternalSelection)(next); setPage(1); };
  const [sort, setSort] = useState<SortState | null>(saved.sort === undefined ? defaultSort : saved.sort);
  const [density, setDensity] = useState<Density>(saved.density === 'comfortable' ? 'comfortable' : 'compact');
  const [pageSize, setPageSize] = useState<number>(pageSizes.includes(Number(saved.pageSize)) ? Number(saved.pageSize) : pageSizes[0]);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(saved.hidden ?? columns.filter(c => c.defaultHidden).map(c => c.id)));
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const anchor = useRef<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { writePrefs(prefsKey, { density, pageSize, hidden: [...hidden], sort }); }, [prefsKey, density, pageSize, hidden, sort]);
  useEffect(() => { if (!notice) return; const t = window.setTimeout(() => setNotice(null), 4500); return () => window.clearTimeout(t); }, [notice]);

  const visibleColumns = useMemo(() => columns.filter(c => !hidden.has(c.id)), [columns, hidden]);

  const searched = useMemo(() => searchRows(rows, deferredQuery, columns, normalizePersianText, extraSearchText), [rows, deferredQuery, columns, extraSearchText]);
  const counts = useMemo(() => facetCounts(searched, filterGroups, filterSelection), [searched, filterGroups, filterSelection]);
  const filtered = useMemo(() => applyFilters(searched, filterGroups, filterSelection), [searched, filterGroups, filterSelection]);
  const sorted = useMemo(() => sortRows(filtered, columns, sort), [filtered, columns, sort]);
  const slice = useMemo(() => paginate(sorted, page, pageSize), [sorted, page, pageSize]);
  useEffect(() => { if (slice.page !== page) setPage(slice.page); }, [slice.page, page]);

  const idOf = getRowId;
  const orderedIds = useMemo(() => sorted.map(idOf), [sorted, idOf]);
  const pageIds = useMemo(() => slice.rows.map(idOf), [slice.rows, idOf]);

  // انتخابهای ردیفهایی که دیگر در داده نیستند (حذف/خارج از دسترسی) پاک میشوند
  useEffect(() => {
    setSelected(prev => {
      const live = new Set(rows.map(idOf));
      const next = new Set([...prev].filter(id => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows, idOf]);

  const selectedRows = useMemo(() => rows.filter(r => selected.has(idOf(r))), [rows, selected, idOf]);
  const composedToolbarActions = (props.renderTaskAction || toolbarActions) ? <>
    {props.renderTaskAction?.(selectedRows)}
    {toolbarActions}
  </> : undefined;
  const headState = headerCheckState(pageIds, selected);
  const allFilteredSelected = orderedIds.length > 0 && orderedIds.every(id => selected.has(id));

  const toggleOne = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // Compute the range before scheduling the state updater; the anchor may change before React runs it.
  const shiftSelect = (id: string) => { const range = rangeIds(orderedIds, anchor.current, id); setSelected(prev => { const n = new Set(prev); range.forEach(x => n.add(x)); return n; }); };
  const onRowCheck = (id: string, shift: boolean) => { if (shift && anchor.current) shiftSelect(id); else toggleOne(id); anchor.current = id; };
  const togglePage = () => setSelected(prev => { const n = new Set(prev); if (headState === 'all') pageIds.forEach(id => n.delete(id)); else pageIds.forEach(id => n.add(id)); return n; });

  /* ── detail panel ── */
  const openIndex = openId ? orderedIds.indexOf(openId) : -1;
  const openRow = openIndex >= 0 ? sorted[openIndex] : null;
  useEffect(() => { if (openId && openIndex < 0) setOpenId(null); }, [openId, openIndex]);
  useEffect(() => { if (openRow) panelRef.current?.focus(); }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps
  const openDetail = (id: string, el: HTMLElement | null) => { triggerRef.current = el; setOpenId(id); };
  const closeDetail = useCallback(() => { setOpenId(null); window.setTimeout(() => triggerRef.current?.focus(), 0); }, []);
  useEffect(() => {
    if (!openRow) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDetail(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openRow, closeDetail]);
  const stepDetail = (delta: number) => {
    const next = orderedIds[openIndex + delta];
    if (!next) return;
    setOpenId(next);
    const nextPage = Math.floor((openIndex + delta) / pageSize) + 1;
    if (nextPage !== slice.page) setPage(nextPage);
  };

  /* ── sort / export ── */
  const toggleSort = (id: string) => setSort(prev => {
    if (!prev || prev.columnId !== id) return { columnId: id, direction: 'asc' };
    if (prev.direction === 'asc') return { columnId: id, direction: 'desc' };
    return null;
  });
  const exportRows = (list: readonly T[], label: string) => {
    const csv = toCsv(list, columns, visibleColumns.map(c => c.id));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${exportFileName}_${toLocalDateISO()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`خروجی ${fa(list.length)} ردیف (${label}) با ستونهای نمایان آماده شد.`);
  };

  /* ── toolbar chips ── */
  const activeFilters: ActiveFilter[] = filterGroups.flatMap(group => (filterSelection[group.id] || []).map(value => ({
    key: `${group.id}:${value}`,
    label: `${group.label}: ${group.options.find(o => o.value === value)?.label ?? value}`,
    onRemove: () => setFilterSelection({ ...filterSelection, [group.id]: (filterSelection[group.id] || []).filter(v => v !== value) })
  })));
  const clearAll = () => { setQuery(''); setFilterSelection({}); };

  const filtersNode = <>
    {filterGroups.map(group => {
      const chosen = filterSelection[group.id] || [];
      return <Popover key={group.id} label={group.label} badge={chosen.length}>
        {group.options.map(option => {
          const on = chosen.includes(option.value);
          const n = counts[group.id]?.[option.value] ?? 0;
          return <label key={option.value} className={cn('flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-2.5 text-sm transition-colors hover:bg-sunken', !on && n === 0 && 'opacity-50')}>
            <input type="checkbox" className="sr-only peer" checked={on}
              onChange={() => setFilterSelection({ ...filterSelection, [group.id]: on ? chosen.filter(v => v !== option.value) : [...chosen, option.value] })} />
            <span className="peer-focus-visible:outline-2 peer-focus-visible:outline-primary rounded-md"><CheckMark state={on ? 'all' : 'none'} /></span>
            <span className="flex-1 font-semibold text-text-main">{option.label}</span>
            <span className="text-xs tabular-nums text-text-secondary">{fa(n)}</span>
          </label>;
        })}
      </Popover>;
    })}
    <Popover label="ستونها" icon={<Columns3 size={15} />} align="end">
      {columns.map(c => {
        const locked = c.hideable === false || c.primary;
        return <label key={c.id} className={cn('flex min-h-10 items-center gap-3 rounded-xl px-2.5 text-sm', locked ? 'opacity-60' : 'cursor-pointer hover:bg-sunken')}>
          <input type="checkbox" className="sr-only peer" disabled={locked} checked={!hidden.has(c.id)}
            onChange={() => setHidden(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} />
          <span className="rounded-md peer-focus-visible:outline-2 peer-focus-visible:outline-primary"><CheckMark state={hidden.has(c.id) ? 'none' : 'all'} /></span>
          <span className="font-semibold text-text-main">{c.header}</span>
        </label>;
      })}
    </Popover>
    <button type="button" onClick={() => setDensity(d => (d === 'compact' ? 'comfortable' : 'compact'))}
      aria-label={density === 'compact' ? 'تغییر به چگالی راحت' : 'تغییر به چگالی فشرده'} title="چگالی ردیفها"
      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-bold text-text-main transition duration-150 hover:bg-sunken active:scale-(--scale-press) focus-visible:outline-2 focus-visible:outline-primary">
      <Rows3 size={15} />{density === 'compact' ? 'فشرده' : 'راحت'}
    </button>
    <button type="button" onClick={() => exportRows(sorted, 'نتیجهٔ فعلی')} disabled={!sorted.length}
      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-bold text-text-main transition duration-150 hover:bg-sunken active:scale-(--scale-press) disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-primary">
      <Download size={15} />خروجی CSV
    </button>
  </>;

  /* ── cells ── */
  const cellPad = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3.5';
  const alignClass = (a?: 'start' | 'end' | 'center') => (a === 'end' ? 'text-end' : a === 'center' ? 'text-center' : 'text-start');
  const SELECT_W = 44;
  const animKey = `${slice.page}|${pageSize}|${sort?.columnId}|${sort?.direction}|${JSON.stringify(filterSelection)}`;
  const hasData = rows.length > 0;
  const mobileColumns = visibleColumns.filter(c => !c.primary && c.mobile !== 'hide').slice(0, 4);
  const primary = columns.find(c => c.primary) ?? columns[0];

  return (
    <div className={cn('space-y-4', className)} dir="rtl">
      {summary}
      <PageToolbar title={title} subtitle={subtitle} search={query} onSearchChange={setQuery} searchPlaceholder={searchPlaceholder}
        resultCount={sorted.length} activeFilters={activeFilters} onClearAll={clearAll} filters={filtersNode} actions={composedToolbarActions} className="mb-0" />

      <div role="status" aria-live="polite" className="sr-only">{notice ?? ''}</div>
      {notice && <div className="se-rise-in flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary-soft px-4 py-2.5 text-sm font-semibold text-text-main"><Check size={16} className="text-primary" aria-hidden="true" />{notice}</div>}

      {error ? <ErrorState surface="data_table" title="دریافت فهرست انجام نشد" description={error} onRetry={onRetry} /> : (
        <section aria-label={title} className="relative overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
          {loading ? (
            <div role="status" aria-busy="true" aria-label="در حال بارگذاری فهرست" className="divide-y divide-border-light">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="flex items-center gap-4 px-4 py-3.5"><div className="se-skeleton h-9 w-9 rounded-xl" /><div className="se-skeleton h-4 w-1/3" /><div className="se-skeleton ms-auto h-4 w-24" /></div>)}
            </div>
          ) : !sorted.length ? (
            <div className="p-6 sm:p-10">
              {!hasData
                ? <EmptyState surface="data_table_1" title={emptyTitle} description={emptyDescription} actionLabel={emptyAction?.label} onAction={emptyAction?.onClick} />
                : <EmptyState surface="data_table_2" title="نتیجهای با این شرایط پیدا نشد" description="عبارت جستجو یا فیلترهای فعال را تغییر دهید." actionLabel="پاککردن جستجو و فیلترها" onAction={clearAll} />}
            </div>
          ) : (<>
            {/* موبایل: کارت */}
            <ul className="divide-y divide-border-light sm:hidden" key={`m-${animKey}`}>
              {slice.rows.map((row, i) => {
                const id = idOf(row);
                return <li key={id} style={{ animationDelay: `${Math.min(i, 8) * 20}ms` }} className={cn('se-row-in p-4', selected.has(id) && 'bg-primary-soft')}>
                  <div className="flex items-start gap-2">
                    {selectable && <CheckButton state={selected.has(id) ? 'all' : 'none'} label={`انتخاب ${String(primary.value(row) ?? '')}`} onToggle={() => onRowCheck(id, false)} />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-extrabold text-text-main">{primary.render ? primary.render(row) : String(primary.value(row) ?? '—')}</div>
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                        {mobileColumns.map(c => <div key={c.id} className="min-w-0"><dt className="text-caption text-text-secondary">{c.header}</dt><dd className="truncate text-xs font-semibold text-text-main">{c.render ? c.render(row) : (c.value(row) ?? '—') as React.ReactNode}</dd></div>)}
                      </dl>
                    </div>
                  </div>
                  {renderDetail && <button type="button" onClick={e => openDetail(id, e.currentTarget)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-canvas text-xs font-extrabold text-primary transition active:scale-(--scale-press-soft) focus-visible:outline-2 focus-visible:outline-primary">مشاهدهٔ جزئیات<ChevronLeft size={14} aria-hidden="true" /></button>}
                </li>;
              })}
            </ul>

            {/* دسکتاپ: جدول */}
            <div className="hidden max-h-[calc(100dvh-20rem)] min-h-72 overflow-auto sm:block">
              <table className="w-full border-separate border-spacing-0 text-start text-xs">
                <caption className="sr-only">{title}؛ {fa(sorted.length)} مورد، صفحهٔ {fa(slice.page)} از {fa(slice.pageCount)}</caption>
                <thead>
                  <tr>
                    {selectable && <th scope="col" style={{ width: SELECT_W, minWidth: SELECT_W, insetInlineStart: 0 }} className="sticky top-0 z-30 border-b border-border bg-canvas px-0 text-center">
                      <CheckButton state={headState} label="انتخاب همهٔ ردیفهای این صفحه" onToggle={togglePage} /></th>}
                    {visibleColumns.map(c => {
                      const active = sort?.columnId === c.id ? sort.direction : null;
                      const sortable = c.sortable !== false;
                      return <th key={c.id} scope="col" aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : sortable ? 'none' : undefined}
                        style={{ minWidth: c.minWidth, ...(c.primary ? { insetInlineStart: selectable ? SELECT_W : 0 } : {}) }}
                        className={cn('sticky top-0 border-b border-border bg-canvas text-caption font-extrabold text-text-secondary', c.primary ? 'z-30 shadow-[inset_-1px_0_0_var(--c-border-light)]' : 'z-20', alignClass(c.align), cellPad)}>
                        {sortable
                          ? <button type="button" onClick={() => toggleSort(c.id)} className="group -mx-1.5 inline-flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 transition-colors hover:bg-border-light hover:text-text-main focus-visible:outline-2 focus-visible:outline-primary">
                              {c.header}
                              <span aria-hidden="true" className={cn('transition-[transform,opacity] duration-200', active ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60')}>
                                {active === 'asc' ? <ArrowUp size={13} /> : active === 'desc' ? <ArrowDown size={13} /> : <ArrowUpDown size={13} />}</span>
                            </button>
                          : c.header}
                      </th>;
                    })}
                    {renderDetail && <th scope="col" style={{ insetInlineEnd: 0 }} className="sticky top-0 z-30 w-14 border-b border-border bg-canvas px-2"><span className="sr-only">جزئیات</span></th>}
                  </tr>
                </thead>
                <tbody key={animKey}>
                  {slice.rows.map((row, i) => {
                    const id = idOf(row);
                    const isSel = selected.has(id);
                    const isOpen = openId === id;
                    const stateBg = isOpen ? 'bg-primary-soft' : isSel ? 'bg-primary-soft' : 'bg-surface group-hover:bg-sunken';
                    return <tr key={id} data-selected={isSel || undefined} aria-selected={isSel || undefined} style={{ animationDelay: `${Math.min(i, 10) * 16}ms` }} className="se-row-in group">
                      {selectable && <td style={{ insetInlineStart: 0 }} className={cn('sticky z-10 border-b border-border-light px-0 text-center transition-colors', stateBg)}>
                        <CheckButton state={isSel ? 'all' : 'none'} label={`انتخاب ${String(primary.value(row) ?? '')}`} onToggle={() => onRowCheck(id, false)} onShiftToggle={() => onRowCheck(id, true)} /></td>}
                      {visibleColumns.map(c => <td key={c.id} style={c.primary ? { insetInlineStart: selectable ? SELECT_W : 0 } : undefined}
                        className={cn('border-b border-border-light align-middle transition-colors', cellPad, alignClass(c.align), c.primary ? cn('sticky z-10 shadow-[inset_-1px_0_0_var(--c-border-light)]', stateBg) : cn(isOpen || isSel ? 'bg-primary-soft' : 'group-hover:bg-sunken'), c.align === 'end' && 'tabular-nums')}>
                        {c.primary && renderDetail
                          ? <button type="button" onClick={e => openDetail(id, e.currentTarget)} aria-haspopup="dialog" aria-expanded={isOpen} className="-mx-1.5 block max-w-full rounded-lg px-1.5 text-start font-extrabold text-text-main transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">{c.render ? c.render(row) : String(c.value(row) ?? '—')}</button>
                          : c.render ? c.render(row) : (c.value(row) ?? '—') as React.ReactNode}
                      </td>)}
                      {renderDetail && <td style={{ insetInlineEnd: 0 }} className={cn('sticky z-10 border-b border-border-light px-2 text-center transition-colors', stateBg)}>
                        <button type="button" onClick={e => openDetail(id, e.currentTarget)} aria-label={`جزئیات ${String(primary.value(row) ?? '')}`} className="grid h-9 w-9 place-items-center rounded-lg text-text-secondary transition duration-150 hover:bg-border-light hover:text-primary active:scale-90 focus-visible:outline-2 focus-visible:outline-primary"><ChevronLeft size={16} aria-hidden="true" /></button></td>}
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>

            {/* صفحهبندی */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-canvas/60 px-4 py-2.5 text-xs text-text-secondary">
              <span className="tabular-nums">{fa(slice.from)}–{fa(slice.to)} از {fa(slice.total)}</span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2">ردیف در صفحه
                  <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="h-9 rounded-lg border border-border bg-surface px-2 font-bold text-text-main focus-visible:outline-2 focus-visible:outline-primary">
                    {pageSizes.map(n => <option key={n} value={n}>{fa(n)}</option>)}
                  </select></label>
                <nav aria-label="صفحهبندی" className="flex items-center gap-1">
                  <button type="button" onClick={() => setPage(slice.page - 1)} disabled={slice.page <= 1} aria-label="صفحهٔ قبل" className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface transition active:scale-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-primary"><ChevronRight size={16} aria-hidden="true" /></button>
                  <span className="min-w-16 text-center font-bold tabular-nums text-text-main">{fa(slice.page)} / {fa(slice.pageCount)}</span>
                  <button type="button" onClick={() => setPage(slice.page + 1)} disabled={slice.page >= slice.pageCount} aria-label="صفحهٔ بعد" className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface transition active:scale-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-primary"><ChevronLeft size={16} aria-hidden="true" /></button>
                </nav>
              </div>
            </div>
          </>)}
        </section>
      )}

      {/* نوار عملیات گروهی */}
      {selectedRows.length > 0 && (
        <div role="region" aria-label="عملیات گروهی" className="se-rise-in sticky bottom-[calc(var(--bottom-nav-h,0px)+0.75rem)] z-40 mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-border bg-navy px-3 py-2.5 text-white shadow-floating sm:bottom-5">
          <span className="px-2 text-sm font-extrabold tabular-nums">{fa(selectedRows.length)} مورد انتخابشده</span>
          {!allFilteredSelected && orderedIds.length > selectedRows.length && headState === 'all' &&
            <button type="button" onClick={() => setSelected(new Set(orderedIds))} className="rounded-lg px-2 py-1.5 text-xs font-bold text-white/85 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-white">انتخاب همهٔ {fa(orderedIds.length)} نتیجه</button>}
          <span className="ms-auto flex flex-wrap items-center gap-2">
            {bulkActions.map(action => {
              const ok = action.enabled ? action.enabled(selectedRows) : true;
              return <button key={action.id} type="button" disabled={!ok} title={!ok ? action.disabledReason : undefined} onClick={() => action.run(selectedRows)}
                className={cn('inline-flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-extrabold transition duration-150 active:scale-(--scale-press) disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-white', action.tone === 'danger' ? 'bg-danger text-on-danger' : 'bg-white/12 hover:bg-white/20')}>{action.icon}{action.label}</button>;
            })}
            <button type="button" onClick={() => exportRows(selectedRows, 'انتخابشده')} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/12 px-3 text-xs font-extrabold transition duration-150 hover:bg-white/20 active:scale-(--scale-press) focus-visible:outline-2 focus-visible:outline-white"><Download size={14} aria-hidden="true" />خروجی اکسل</button>
            <button type="button" onClick={() => setSelected(new Set())} aria-label="لغو انتخاب" className="grid h-10 w-10 place-items-center rounded-xl text-white/80 transition hover:bg-white/12 active:scale-90 focus-visible:outline-2 focus-visible:outline-white"><X size={16} aria-hidden="true" /></button>
          </span>
        </div>
      )}

      {/* پنل جزئیات ردیف */}
      {renderDetail && openRow && (
        <div className="fixed inset-0 z-(--z-sticky)" dir="rtl">
          <div className="se-backdrop-enter absolute inset-0 bg-ink-main/30 backdrop-blur-(--blur-scrim) sm:bg-transparent sm:backdrop-blur-none" onClick={closeDetail} aria-hidden="true" />
          <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="false" aria-label={detailTitle ? detailTitle(openRow) : 'جزئیات'}
            className="se-drawer-start absolute inset-y-0 left-0 flex w-full flex-col border-s border-border bg-surface shadow-modal outline-none sm:max-w-md sm:rounded-s-3xl">
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <h2 className="min-w-0 flex-1 truncate text-base font-extrabold text-text-main">{detailTitle ? detailTitle(openRow) : 'جزئیات'}</h2>
              <span className="text-caption tabular-nums text-text-secondary">{fa(openIndex + 1)} از {fa(orderedIds.length)}</span>
              <button type="button" onClick={() => stepDetail(-1)} disabled={openIndex <= 0} aria-label="مورد قبلی" className="grid h-10 w-10 place-items-center rounded-xl text-text-secondary transition hover:bg-sunken active:scale-90 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-primary"><ChevronRight size={18} aria-hidden="true" /></button>
              <button type="button" onClick={() => stepDetail(1)} disabled={openIndex >= orderedIds.length - 1} aria-label="مورد بعدی" className="grid h-10 w-10 place-items-center rounded-xl text-text-secondary transition hover:bg-sunken active:scale-90 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-primary"><ChevronLeft size={18} aria-hidden="true" /></button>
              <button type="button" onClick={closeDetail} aria-label="بستن جزئیات" className="grid h-10 w-10 place-items-center rounded-xl text-text-secondary transition hover:bg-sunken active:scale-90 focus-visible:outline-2 focus-visible:outline-primary"><X size={18} aria-hidden="true" /></button>
            </header>
            <div key={openId} className="se-fade-swap min-h-0 flex-1 overflow-y-auto">{renderDetail(openRow)}</div>
            {detailFooter && <footer className="border-t border-border bg-canvas/60 p-4">{detailFooter(openRow)}</footer>}
          </div>
        </div>
      )}
    </div>
  );
}
