import React, { useMemo, useState } from 'react';
import { AppState } from '../types';
import { Select } from './ui';
import { Activity, PhoneCall, CalendarDays, MessageSquare, Search, FileText, Filter } from 'lucide-react';
import { formatAppDate, matchesSearch } from '../lib/utils';
import { PageToolbar } from './ui/PageToolbar';
import { EmptyState } from './ui/EmptyState';
import { Button } from './ui/Button';

export function ActivitiesWorkspace({ state, setActiveTab }: { state: AppState; updateState: unknown; setActiveTab: (tab: string) => void }) {
  // Only persisted timeline records are shown. Never substitute illustrative/sample events for missing source data.
  const events = state.timelineEvents || [];
  const [query, setQuery] = useState('');
  const [type, setType] = useState('ALL');
  const types = useMemo(() => [...new Set(events.map((event: Record<string, unknown>) => String(event.type || 'OTHER').toUpperCase()))].sort(), [events]);
  const visibleEvents = useMemo(() => events
    .filter((event: Record<string, unknown>) => type === 'ALL' || String(event.type || 'OTHER').toUpperCase() === type)
    .filter((event: Record<string, unknown>) => !query.trim() || matchesSearch(`${event.title || ''} ${event.description || ''} ${event.entityName || ''} ${event.actorName || ''}`, query))
    .sort((a: unknown, b: unknown) => Date.parse(b.dateTime || b.createdAt || '') - Date.parse(a.dateTime || a.createdAt || '')),
  [events, type, query]);
  const iconFor = (kind: string) => kind === 'CALL' ? PhoneCall : kind === 'MEETING' ? CalendarDays : kind === 'MESSAGE' ? MessageSquare : kind === 'QUOTE' || kind === 'ORDER' ? FileText : Activity;
  return (
    <div className="crm-page crm-page-activities w-full min-h-0 space-y-4 px-3 py-3 sm:px-5 pb-24" dir="rtl">
      <div id="activities-toolbar" data-tour-actions><PageToolbar title="گاه‌شمار فعالیت‌ها و تعاملات" subtitle="سوابق ثبت‌شده تماس، جلسه، پیام و تغییرات پرونده‌ها" search={query} onSearchChange={setQuery} searchPlaceholder="جستجوی عنوان، شرح یا مرتبط..." resultCount={visibleEvents.length} actions={<Button variant="primary" size="sm" type="button" onClick={() => setActiveTab('accounts')} ><Activity size={15}/> ثبت تعامل در پرونده مشتری</Button>} /></div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2" aria-label="نوع فعالیت">
        <label className="inline-flex items-center gap-2 text-xs text-text-secondary"><Filter size={14}/> نوع فعالیت</label>
        <Select density="compact" aria-label="نوع فعالیت" value={type} onChange={event => setType(event.target.value)} className="min-w-40">
          <option value="ALL">همه انواع</option>{types.map(kind => <option key={kind} value={kind}>{kind === 'CALL' ? 'تماس' : kind === 'MEETING' ? 'جلسه' : kind === 'MESSAGE' ? 'پیام' : kind === 'QUOTE' ? 'پیشنهاد / پیش‌فاکتور' : kind === 'ORDER' ? 'سفارش' : kind}</option>)}
        </Select>
      </div>
      {visibleEvents.length ? <ol id="activities-timeline" data-tour-primary className="relative space-y-2 before:absolute before:inset-y-3 before:right-(--size-17) before:w-px before:bg-border">
        {visibleEvents.map((event: Record<string, unknown>) => { const Icon = iconFor(String(event.type || '').toUpperCase()); return <li key={event.id} className="relative flex gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-border-strong">
          <span className="relative z-(--z-raised) grid h-9 w-9 shrink-0 place-items-center rounded-full border border-primary/15 bg-primary-soft text-primary"><Icon size={16}/></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1"><h3 className="text-sm font-semibold text-text-main">{event.title || 'فعالیت بدون عنوان'}</h3><time className="shrink-0 text-micro text-text-secondary">{formatAppDate(event.dateTime || event.createdAt, state.settings?.locale, 'full')}</time></div>
            {event.description && <p className="mt-1 whitespace-pre-wrap text-xs leading-6 text-text-secondary">{event.description}</p>}
            {(event.entityName || event.actorName) && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-micro text-text-muted">{event.entityName && <span>مرتبط: {event.entityName}</span>}{event.actorName && <span>ثبت‌کننده: {event.actorName}</span>}</div>}
          </div>
        </li>; })}
      </ol> : <EmptyState surface="activities_workspace" icon={<Activity className="h-7 w-7"/>} title={events.length ? 'فعالیتی با این فیلتر پیدا نشد' : 'هنوز فعالیتی ثبت نشده است'} description={events.length ? 'عبارت جستجو یا نوع فعالیت را تغییر دهید.' : 'تعاملات واقعی پس از ثبت در پرونده مشتری یا گردش کار مربوط، در این گاه‌شمار نمایش داده می‌شوند.'} />}
    </div>
  );
}
