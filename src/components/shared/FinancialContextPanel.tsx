/**
 * FinancialContextPanel — پنل مشترک «نمای ۳۶۰ درجه سابقه» و «مرکز تصمیم‌گیری و تأیید».
 * کنار هر عدد: منبع، زمان به‌روزرسانی، کیفیت داده و اسناد تشکیل‌دهنده (Drill-down).
 * داده ناموجود هرگز صفر نشان داده نمی‌شود («اطلاعات در دسترس نیست»).
 */
import React, { useMemo, useState } from 'react';
import { getPersianStatusLabel } from '../../lib/labels';
import { ShieldAlert, ChevronLeft, Info } from 'lucide-react';
import { useApprovalContext, useFinancial360 } from '../../hooks/useFinancialContext';
import type { ApprovalRef, ContextSection, Fact, FactQuality, SubjectRef } from '../../lib/financialIntelligence';
import { DrilldownSheet, type DrilldownRow } from './DrilldownSheet';
import { cn } from '../../lib/utils';

const Q: Record<FactQuality, { label: string; cls: string; hint: string }> = {
  ERP_MIRROR: { label: 'سامانه مالی', cls: 'bg-success-soft text-success border-success-border', hint: 'آینه داده سامانه مالی' },
  CRM_LOCAL: { label: 'سامانه', cls: 'bg-warning-soft text-warning border-warning-border', hint: 'داده عملیاتی سامانه؛ سند رسمی سامانه مالی نیست' },
  DEMO: { label: 'آزمایشی', cls: 'bg-info-soft text-info border-info/30', hint: 'داده آزمایشی؛ برای تصمیم قطعی استفاده نشود' },
  PARTIAL: { label: 'ناقص', cls: 'bg-warning-soft text-warning border-warning-border', hint: 'بخشی از اطلاعات لازم موجود نیست' },
  UNAVAILABLE: { label: 'نامشخص', cls: 'bg-canvas text-text-secondary border-border', hint: 'اطلاعات در دسترس نیست' },
  RESTRICTED: { label: 'محدود', cls: 'bg-danger-soft text-danger border-danger/30', hint: 'دسترسی شما مجاز نیست' },
};
const fa = (n: number) => n.toLocaleString('fa-IR', { maximumFractionDigits: 1 });
export function formatFact(f: Fact): string {
  if (f.quality === 'RESTRICTED') return 'دسترسی ندارید';
  if (f.value === null) return 'اطلاعات در دسترس نیست';
  if (typeof f.value === 'string') return f.value;
  switch (f.unit) { case 'IRR': return `${fa(f.value)} ریال`; case 'DAYS': return `${fa(f.value)} روز`; case 'PERCENT': return `${fa(f.value)}٪`; default: return fa(f.value); }
}

function FactRow({ f, onDrill }: { f: Fact; onDrill: (f: Fact) => void }) {
  const q = Q[f.quality]; const drillable = f.docRefs.length > 0;
  const title = [q.hint, `منبع: ${getPersianStatusLabel(f.source)}`, f.asOf ? `به‌روزرسانی: ${new Date(f.asOf).toLocaleString('fa-IR')}` : 'زمان به‌روزرسانی: نامشخص', f.basis ? `مبنا: ${f.basis}` : ''].filter(Boolean).join(' · ');
  return (
    <div className="py-2 border-b border-border last:border-0">
      <button type="button" disabled={!drillable} onClick={() => onDrill(f)} className={cn('w-full flex items-center justify-between gap-2 text-start', drillable ? 'cursor-pointer hover:bg-canvas rounded-lg px-1' : 'cursor-default px-1')} aria-label={`${f.label}: ${formatFact(f)}`}>
        <span className="text-label text-text-secondary">{f.label}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          <strong className={cn('text-body font-bold', f.value === null ? 'text-text-muted' : 'text-text-main')}>{formatFact(f)}</strong>
          <span title={title} className={cn('rounded-full border px-1.5 py-0.5 text-tiny font-bold', q.cls)}>{q.label}</span>
          {drillable && <ChevronLeft size={12} className="text-text-muted" />}
        </span>
      </button>
      {(f.note || f.basis) && <p className="mt-0.5 px-1 text-micro leading-5 text-text-muted">{f.note || f.basis}</p>}
    </div>
  );
}

export function SectionsView({ sections, compact }: { sections: ContextSection[]; compact?: boolean }) {
  const [drill, setDrill] = useState<Fact | null>(null);
  const rows: DrilldownRow[] = useMemo(() => (drill?.docRefs || []).map(d => ({ id: `${d.type}:${d.id}`, number: d.label, date: d.date, title: d.type, status: d.status, amount: d.amount ?? 0 })), [drill]);
  return (
    <div className="space-y-2.5">
      {sections.map(s => (
        <section key={s.id} className="rounded-xl border border-border bg-surface p-3" aria-label={s.title}>
          <h4 className="mb-1 text-small font-extrabold text-text-main">{s.title}</h4>
          {s.facts.map(f => <FactRow key={f.key} f={f} onDrill={setDrill} />)}
          {!compact && (s.notes || []).map((n, i) => <p key={i} className="mt-1.5 flex gap-1 text-mini leading-5 text-text-secondary"><Info size={11} className="mt-1 shrink-0" />{n}</p>)}
        </section>
      ))}
      <DrilldownSheet isOpen={!!drill} onClose={() => setDrill(null)} title={drill?.label || ''} subtitle={drill ? `منبع: ${drill.source}` : undefined} metricLabel="مقدار" metricValue={drill ? formatFact(drill) : undefined} rows={rows} />
    </div>
  );
}

export function FinancialContextPanel({ approval, subject, refreshKey, compact, className }: { approval?: ApprovalRef; subject?: SubjectRef; refreshKey?: unknown; compact?: boolean; className?: string }) {
  const a = useApprovalContext(approval || null, refreshKey);
  const s = useFinancial360(approval ? null : subject || null, refreshKey);
  const loading = approval ? a.loading : s.loading; const error = approval ? a.error : s.error;
  const data = approval ? a.data : s.data;
  return (
    <div className={cn('space-y-2', className)} dir="rtl">
      {loading && <p className="text-caption text-text-secondary">در حال دریافت سابقه…</p>}
      {error && <p className="flex items-center gap-1 text-caption text-danger"><ShieldAlert size={13} />دریافت اطلاعات انجام نشد؛ عددی نمایش داده نمی‌شود.</p>}
      {!loading && !error && !data && <p className="text-caption text-text-secondary">زمینه‌ای برای نمایش یافت نشد.</p>}
      {data && (
        <>
          {'policyNotes' in data && data.policyNotes.length > 0 && <div className="rounded-lg bg-canvas p-2 text-mini leading-5 text-text-secondary">{data.policyNotes.join(' ')}</div>}
          <SectionsView sections={data.sections} compact={compact} />
          <p className="text-micro text-text-muted">محاسبه ({data.calcVersion}) · {new Date(data.generatedAt).toLocaleString('fa-IR')} · اعداد عملیاتی‌اند و صورت مالی رسمی نیستند.</p>
        </>
      )}
    </div>
  );
}

/** بخش جمع‌شونده: پنل فقط پس از باز شدن mount و محاسبه می‌شود (کارتابل سنگین نشود). */
export function ContextToggle({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className} dir="rtl">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="text-caption font-bold text-primary cursor-pointer hover:underline">
        {open ? 'بستن' : label}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}
