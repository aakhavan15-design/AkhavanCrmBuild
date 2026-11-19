import React from 'react';

export type ReportChoice = { id: string; label: string; disabled?: boolean };
export type ReportRank = { id: string; label: string; value: number | null; formattedValue?: string };

/** Controlled primitives: consumers supply operational data; no demo values. */
export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <header dir="rtl" className="flex items-start justify-between gap-2"><div><h2 className="text-base font-semibold text-text-main">{title}</h2>{description && <p className="text-xs text-text-muted">{description}</p>}</div>{action}</header>;
}

export function StatusChip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const toneClasses = { neutral: 'border-border text-text-muted', success: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300', warning: 'border-amber-500/40 text-amber-700 dark:text-amber-300', danger: 'border-red-500/40 text-red-700 dark:text-red-300' };
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${toneClasses[tone]}`}>{label}</span>;
}

export function RankList({ items, label = 'رتبه‌بندی' }: { items: readonly ReportRank[]; label?: string }) {
  const valid = items.filter(item => item.value !== null && Number.isFinite(item.value) && item.value >= 0).sort((a,b) => (b.value ?? 0) - (a.value ?? 0));
  const maximum = Math.max(0, ...valid.map(item => item.value ?? 0));
  return <section aria-label={label} dir="rtl">{!valid.length ? <p role="status" className="p-3 text-center text-xs text-text-muted">داده‌ای برای نمایش وجود ندارد</p> : <ol className="space-y-2">{valid.map((item, i) => <li key={item.id}><div className="flex justify-between gap-3 text-xs"><span className="truncate">{(i + 1).toLocaleString('fa-IR')}. {item.label}</span><span className="tabular-nums">{item.formattedValue ?? item.value?.toLocaleString('fa-IR')}</span></div><div role="meter" aria-label={item.label} aria-valuemin={0} aria-valuemax={maximum || 1} aria-valuenow={item.value ?? 0} className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${maximum ? (item.value ?? 0) / maximum * 100 : 0}%` }} /></div></li>)}</ol>}</section>;
}

export function FilterChips({ options, selected, onChange, label = 'فیلتر گزارش' }: { options: readonly ReportChoice[]; selected: readonly string[]; onChange: (ids: string[]) => void; label?: string }) {
  return <div dir="rtl" role="group" aria-label={label} className="flex flex-wrap gap-1.5">{options.map(option => <button key={option.id} type="button" disabled={option.disabled} aria-pressed={selected.includes(option.id)} onClick={() => onChange(selected.includes(option.id) ? selected.filter(id => id !== option.id) : [...selected, option.id])} className={`rounded-full border px-3 py-1.5 text-xs focus-visible:outline-2 disabled:opacity-40 ${selected.includes(option.id) ? 'border-emerald-600 bg-emerald-700 text-white' : 'border-border text-text-main'}`}>{option.label}</button>)}</div>;
}

export function SegmentedTabs({ options, value, onChange, label = 'نمای گزارش' }: { options: readonly ReportChoice[]; value: string; onChange: (id: string) => void; label?: string }) {
  const enabled = options.filter(option => !option.disabled);
  return <div dir="rtl" role="tablist" aria-label={label} className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800" onKeyDown={event => { if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key) || !enabled.length) return; const index = enabled.findIndex(option => option.id === value); const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : (index + (event.key === 'ArrowLeft' ? 1 : -1) + enabled.length) % enabled.length; event.preventDefault(); onChange(enabled[next].id); event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')[next]?.focus(); }}>{options.map(option => <button key={option.id} role="tab" type="button" disabled={option.disabled} aria-selected={value === option.id} tabIndex={value === option.id ? 0 : -1} onClick={() => onChange(option.id)} className={`shrink-0 rounded-lg px-3 py-1.5 text-xs focus-visible:outline-2 disabled:opacity-40 ${value === option.id ? 'bg-white font-semibold text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-text-muted'}`}>{option.label}</button>)}</div>;
}

export function ReportTimeline({ items, label = 'تاریخچه رویدادها' }: { items: readonly { id: string; title: string; dateLabel: string; description?: string }[]; label?: string }) {
  return <section dir="rtl" aria-label={label}>{items.length ? <ol className="space-y-3 border-r border-border pr-4">{items.map(item => <li key={item.id} className="space-y-1"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{item.title}</strong><span className="text-xs text-text-muted">{item.dateLabel}</span></div>{item.description && <p className="text-xs text-text-muted">{item.description}</p>}</li>)}</ol> : <p role="status" className="text-center text-xs text-text-muted">رویدادی ثبت نشده است</p>}</section>;
}

export function ReportSkeleton({ rows = 3 }: { rows?: number }) {
  return <div role="status" aria-busy="true" aria-label="در حال دریافت گزارش" className="space-y-2"><span className="sr-only">در حال دریافت گزارش</span>{Array.from({ length: Math.max(1, Math.min(12, rows)) }, (_, index) => <div key={index} aria-hidden="true" className="h-9 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />)}</div>;
}

export function ReportEmptyState({ title = 'داده‌ای در دسترس نیست', onRetry }: { title?: string; onRetry?: () => void }) {
  return <div role="status" dir="rtl" className="rounded-xl border border-dashed border-border p-4 text-center"><p className="text-sm text-text-muted">{title}</p>{onRetry && <button type="button" onClick={onRetry} className="mt-2 rounded-lg border border-border px-3 py-1.5 text-xs focus-visible:outline-2">تلاش مجدد</button>}</div>;
}
