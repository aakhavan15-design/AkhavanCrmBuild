import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { smartSearch, highlightRanges, SMART_SEARCH_DEBOUNCE_MS } from '../../lib/smartSearch';

function Highlight({ text, query }: { text: string; query: string }) {
  const ranges = highlightRanges(text, query);
  if (!ranges.length) return <>{text}</>;
  const parts: React.ReactNode[] = []; let at = 0;
  ranges.forEach(([a, b], i) => { if (a > at) parts.push(text.slice(at, a)); parts.push(<mark key={i} className="rounded-sm bg-primary-soft px-0 text-primary">{text.slice(a, b)}</mark>); at = b; });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

export interface SelectOption {
  value: string;
  label: string;
  subLabel?: string;
  keywords?: string;
  disabled?: boolean;
}

export type SearchableOption = SelectOption;

export interface SearchableSelectProps {
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  loading?: boolean;
  loadingMore?: boolean;
  error?: string | null;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onSearch?: (query: string) => void;
  minQueryLength?: number;
  debounceMs?: number;
  maxResults?: number;
  ariaLabel?: string;
  className?: string;
  inputId?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options, value, onChange, placeholder = 'انتخاب کنید...', label, required, disabled,
  searchPlaceholder = 'نام، کد یا شناسه را جست‌وجو کنید...', emptyText = 'موردی پیدا نشد',
  loading = false, loadingMore = false, error = null, hasMore = false, onLoadMore, onSearch,
  minQueryLength = 1, debounceMs = SMART_SEARCH_DEBOUNCE_MS, maxResults = 30, ariaLabel = label || 'جست‌وجو و انتخاب', className = '', inputId,
}) => {
  const generatedId = useId();
  const controlId = inputId || `searchable-select-${generatedId}`;
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [visibleLimit, setVisibleLimit] = useState(maxResults);
  const [lastSelected, setLastSelected] = useState<SelectOption | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedOption = options.find(option => option.value === value) || (lastSelected?.value === value ? lastSelected : undefined);

  useEffect(() => {
    if (!isOpen || !onSearch) return;
    const query = search.trim();
    if (query.length < minQueryLength) return;
    const timer = window.setTimeout(() => onSearch(query), Math.max(0, debounceMs));
    return () => window.clearTimeout(timer);
  }, [isOpen, search, onSearch, minQueryLength, debounceMs]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = window.setTimeout(() => setDebounced(search), search ? Math.max(0, debounceMs) : 0); return () => window.clearTimeout(t); }, [search, debounceMs]);
  const matches = useMemo(() => {
    const q = debounced.trim();
    if (q && q.length < minQueryLength) return [];
    const enabled = options.filter(option => !option.disabled);
    if (!q) return enabled;
    return smartSearch(enabled, q, o => [{ text: o.label, weight: 3 }, { text: o.subLabel || '', weight: 2 }, o.keywords, o.value]).map(r => r.item);
  }, [options, debounced, minQueryLength]);
  const filteredOptions = matches.slice(0, visibleLimit);

  const choose = (option: SelectOption) => {
    if (option.disabled) return;
    setLastSelected(option);
    onChange(option.value);
    setSearch('');
    setIsOpen(false);
  };

  const openPicker = () => {
    if (disabled) return;
    setIsOpen(true);
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); setIsOpen(false); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(index => Math.min(index + 1, Math.max(0, filteredOptions.length - 1))); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(index => Math.max(0, index - 1)); return; }
    if (event.key === 'Enter' && filteredOptions[activeIndex]) { event.preventDefault(); choose(filteredOptions[activeIndex]); }
  };

  return (
    <div className={cn('relative min-w-0', className)} ref={wrapperRef} dir="rtl">
      {label && <label htmlFor={controlId} className="mb-1 flex items-center gap-1 text-caption font-semibold text-text-main"><span>{label}</span>{required && <span className="text-danger">*</span>}</label>}
      <div className="flex min-w-0 items-center gap-1">
        <button type="button" disabled={disabled} onClick={openPicker} aria-haspopup="listbox" aria-expanded={isOpen} aria-label={ariaLabel}
          className="flex min-h-(--size-input) min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-right text-compact text-text-main outline-none transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60">
          <span className={cn('min-w-0 flex-1 truncate', !selectedOption && 'text-text-secondary')}>{selectedOption ? selectedOption.label : placeholder}</span>
          {selectedOption?.subLabel && <span className="hidden max-w-(--pct-meta) truncate text-mini text-text-secondary sm:block">{selectedOption.subLabel}</span>}
          <ChevronDown size={15} className="shrink-0 text-text-secondary" aria-hidden="true" />
        </button>
        {selectedOption && <button type="button" disabled={disabled} onClick={() => onChange('')} aria-label="پاک کردن انتخاب" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-secondary hover:bg-canvas hover:text-danger"><X size={14}/></button>}
      </div>
      {isOpen && (
        <div className="absolute inset-x-0 top-[calc(100%+4px)] z-(--z-popover) overflow-hidden rounded-xl border border-border bg-surface shadow-floating" role="dialog" aria-label={ariaLabel}>
          <div className="flex items-center gap-2 px-3 py-2">
            {loading ? <Loader2 size={15} className="animate-spin text-primary"/> : <Search size={15} className="text-text-secondary"/>}
            <input ref={inputRef} id={controlId} value={search} onChange={event => { setSearch(event.target.value); setActiveIndex(0); setVisibleLimit(maxResults); }} onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder} aria-label={ariaLabel} aria-controls={`${controlId}-list`} aria-autocomplete="list" className="min-w-0 flex-1 bg-transparent py-1 text-compact text-text-main outline-none placeholder:text-text-secondary" />
            {search && <button type="button" onClick={() => { setSearch(''); setVisibleLimit(maxResults); }} aria-label="پاک کردن جست‌وجو" className="rounded p-1 text-text-secondary hover:bg-canvas"><X size={13}/></button>}
          </div>
          {debounced.trim() && !loading && <div className="px-3 pb-1 text-micro text-text-secondary" aria-live="polite">{matches.length.toLocaleString('fa-IR')} نتیجه</div>}
          <div id={`${controlId}-list`} role="listbox" className="max-h-56 overflow-y-auto overscroll-contain p-1">
            {error && <div className="px-3 py-2.5 text-center text-xs text-danger" role="alert">{error}</div>}
            {loading && filteredOptions.length === 0 && <div className="px-3 py-3 text-center text-xs text-text-secondary">در حال جست‌وجو...</div>}
            {!loading && !error && filteredOptions.length === 0 && <div className="px-3 py-3 text-center text-xs text-text-secondary">{emptyText}</div>}
            {filteredOptions.map((option, index) => <button key={option.value} type="button" role="option" aria-selected={option.value === value} disabled={option.disabled} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)} className={cn('flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-right transition-colors disabled:opacity-50', index === activeIndex ? 'bg-primary-soft text-primary font-bold' : 'text-text-main hover:bg-canvas')}>
              <span className="min-w-0 flex-1"><span className="block truncate text-compact"><Highlight text={option.label} query={debounced} /></span>{option.subLabel && <span className="mt-0.5 block truncate text-micro text-text-secondary">{option.subLabel}</span>}</span>
              {option.value === value && <Check size={14} className="mt-0.5 shrink-0 text-primary"/>}
            </button>)}
          </div>
        </div>
      )}
    </div>
  );
};
