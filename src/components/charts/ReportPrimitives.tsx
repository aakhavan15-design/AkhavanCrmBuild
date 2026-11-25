import React from 'react';
import { Avatar } from '../ui/Avatar';
import { formatCount, formatNumber } from '../../lib/format';

export type ReportChoice = { id: string; label: string; disabled?: boolean };
export type ReportRank = { id: string; label: string; value: number | null; formattedValue?: string; avatar?: string; description?: string; tone?: 'neutral'|'success'|'danger' };

/** Controlled primitives: consumers supply operational data; no demo values. */
export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <header dir="rtl" className="flex items-start justify-between gap-2"><div><h2 className="text-base font-semibold text-text-main">{title}</h2>{description && <p className="text-xs text-text-muted">{description}</p>}</div>{action}</header>;
}

export function StatusChip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const toneClasses = { neutral: 'border-border text-text-muted', success: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300', warning: 'border-amber-500/40 text-amber-700 dark:text-amber-300', danger: 'border-red-500/40 text-red-700 dark:text-red-300' };
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${toneClasses[tone]}`}>{label}</span>;
}

export function RankList({items,label='رتبه‌بندی',showAvatars=false,allowSigned=false,limit,selectedId,onSelect}:{
  items:readonly ReportRank[]; label?:string; showAvatars?:boolean; allowSigned?:boolean; limit?:number;
  selectedId?:string|null; onSelect?:(id:string|null)=>void;
}) {
  const valid=items.filter(item=>typeof item.value==='number'&&Number.isFinite(item.value)&&(allowSigned||item.value>=0))
    .sort((a,b)=>(b.value as number)-(a.value as number)||a.id.localeCompare(b.id));
  const maximum=Math.max(0,...valid.map(item=>Math.abs(item.value as number)));
  const shown=limit===undefined?valid:valid.slice(0,limit);
  const selected=shown.some(item=>item.id===selectedId)?selectedId:null;
  return <section aria-label={label} dir="rtl">
    {!shown.length?<p role="status" className="py-3 text-center text-xs text-text-muted">داده‌ای برای نمایش وجود ندارد</p>:<ol className="space-y-2">
      {shown.map((item,i)=>{
        const value=item.value as number;
        const danger=item.tone==='danger'||value<0;
        const tone=danger?'text-danger':item.tone==='success'?'text-success':'text-text-main';
        const content=<>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="shrink-0 text-micro tabular-nums text-text-secondary">{formatCount(i+1)}</span>
            {showAvatars&&<Avatar name={item.label} src={item.avatar} size="xs" className="shrink-0"/>}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-1 gap-y-0.5">
                <span className="min-w-0 text-caption font-semibold break-words">{item.label}</span>
                <bdi className={'text-caption tabular-nums font-semibold '+tone}>{item.formattedValue??formatNumber(value)}</bdi>
              </div>
              {item.description&&<p className="text-micro text-text-secondary">{item.description}</p>}
            </div>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-canvas" aria-hidden="true">
            <div className={'h-full rounded-full motion-safe:transition-all '+(danger?'bg-danger':item.tone==='success'?'bg-success':'bg-primary')}
              style={{width:maximum?Math.abs(value)/maximum*100+'%':'0%'}}/>
          </div>
        </>;
        return <li key={item.id} className={selected&&selected!==item.id?'opacity-55 motion-safe:transition-opacity':'motion-safe:transition-opacity'}>
          {onSelect?<button type="button" aria-pressed={selected===item.id} onClick={()=>onSelect(selected===item.id?null:item.id)} className="w-full min-h-11 rounded-lg p-1 text-start focus-visible:outline-2 focus-visible:outline-primary">{content}</button>:content}
        </li>;
      })}
    </ol>}
  </section>;
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
