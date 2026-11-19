import React, { useState } from 'react';
import { Search, X, SlidersHorizontal, Filter } from 'lucide-react';
import { cn } from '../../lib/utils';
import { BottomSheet } from './BottomSheet';

export interface ActiveFilter { key: string; label: string; onRemove: () => void }
export interface PageToolbarProps {
  title?: string; subtitle?: string;
  search?: string; onSearchChange?: (value: string) => void; searchPlaceholder?: string;
  filters?: React.ReactNode; sheetFilters?: React.ReactNode; actions?: React.ReactNode; className?: string;
  resultCount?: number; activeFilters?: ActiveFilter[]; onClearAll?: () => void;
}

/** Responsive shared toolbar. Search, active filters and clear-all actions are controlled by the host page. */
export function PageToolbar({
  title, subtitle, search, onSearchChange, searchPlaceholder = 'جستجو...',
  filters, sheetFilters, actions, className, resultCount, activeFilters = [], onClearAll,
}: PageToolbarProps) {
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const hasSearch = !!(search ?? '').trim();
  const hasActive = activeFilters.length > 0 || hasSearch;
  const clearAll = () => {
    if (onClearAll) onClearAll();
    else onSearchChange?.('');
  };

  return (
    <section dir="rtl" aria-label={title ? `ابزارهای ${title}` : 'ابزارهای صفحه'}
      className={cn('crm-page-toolbar mb-3 border-0 bg-transparent px-0 py-1 shadow-none transition-colors duration-150', className)} data-tour-surface>
      <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
        {(title || subtitle) && <div className="min-w-0 flex-1">
          {title && <h1 data-tour-heading className="truncate text-h2 font-semibold text-text-main sm:text-base">{title}</h1>}
          {subtitle && <p className="mt-0.5 line-clamp-2 text-caption leading-4 text-text-secondary">{subtitle}</p>}
        </div>}
        <div data-tour-actions className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:w-auto xl:justify-end">
          {onSearchChange && <label className="crm-toolbar-search flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-border-light bg-surface px-2.5 transition-colors focus-within:border-primary sm:w-64">
            <Search size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
            <input type="search" value={search ?? ''} onChange={event => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder} aria-label={searchPlaceholder}
              className="w-full min-w-0 bg-transparent text-sm font-medium text-text-main outline-none placeholder:text-text-muted [&::-webkit-search-cancel-button]:hidden" />
            {!!search && <button type="button" onClick={() => onSearchChange('')} aria-label="پاک‌کردن عبارت جستجو"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-text-muted transition-colors hover:bg-border hover:text-text-main focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><X size={14} /></button>}
          </label>}
          {sheetFilters && (
            <>
              <button
                type="button"
                onClick={() => setIsFilterSheetOpen(true)}
                aria-label="فیلترهای پیشرفته"
                className="sm:hidden inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border-light bg-surface text-xs font-semibold text-text-secondary hover:text-text-main transition-colors cursor-pointer"
              >
                <Filter size={14} className="text-primary" />
                <span>فیلترها</span>
                {activeFilters.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-primary text-on-primary text-micro font-bold flex items-center justify-center">
                    {activeFilters.length}
                  </span>
                )}
              </button>
              <BottomSheet
                isOpen={isFilterSheetOpen}
                onClose={() => setIsFilterSheetOpen(false)}
                title="فیلترهای پیشرفته"
                subtitle="تنظیم فیلترها و محدودسازی داده‌های نمایشی"
                footer={
                  <div className="w-full flex items-center justify-between gap-2">
                    {onClearAll && (
                      <button
                        type="button"
                        onClick={() => { onClearAll(); setIsFilterSheetOpen(false); }}
                        className="px-3 py-1.5 text-xs text-text-muted hover:text-text-main cursor-pointer"
                      >
                        پاک‌کردن فیلترها
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsFilterSheetOpen(false)}
                      className="px-4 py-1.5 text-xs font-bold rounded-lg bg-primary text-on-primary shadow-xs cursor-pointer"
                    >
                      اعمال و مشاهده
                    </button>
                  </div>
                }
              >
                <div className="space-y-3 py-1">
                  {sheetFilters}
                </div>
              </BottomSheet>
            </>
          )}
          {filters && <div className="flex min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain pb-0.5 no-scrollbar" aria-label="فیلترها">{filters}</div>}
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
      {(hasActive || resultCount !== undefined) && <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border-light pt-2" aria-live="polite" aria-atomic="true">
        {resultCount !== undefined && <span className="inline-flex min-h-7 items-center gap-1.5 rounded-lg border border-border-light bg-sunken px-2.5 text-xs font-bold text-text-secondary tabular-nums"><SlidersHorizontal size={12} />{resultCount.toLocaleString('fa-IR')} نتیجه</span>}
        {activeFilters.map(filter => <button key={filter.key} type="button" onClick={filter.onRemove}
          className="inline-flex min-h-7 items-center gap-1.5 rounded-lg border border-primary/20 bg-primary-soft px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <span>{filter.label}</span><X size={13} aria-hidden="true" />
        </button>)}
        {hasActive && (onClearAll || onSearchChange) && <button type="button" onClick={clearAll}
          className="min-h-7 rounded-lg px-2 text-xs font-semibold text-text-muted transition-colors hover:bg-canvas hover:text-text-main focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">پاک‌کردن همه</button>}
      </div>}
    </section>
  );
}
