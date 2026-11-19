import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, ArrowDownLeft, ArrowUpRight, ShieldAlert } from 'lucide-react';
import { AppState } from '../types';
import { RBACService } from '../lib/rbac';
import { computeInsights } from '../lib/insights';
import { useCountUp } from '../hooks/useCountUp';
import { cn, formatAppDate } from '../lib/utils';
import { PageToolbar } from './ui/PageToolbar';
import { Avatar } from './ui/Avatar';
import { DonutChart, LineChart, FunnelChart, AllocationBar, CashFlowChart } from './charts';
import { fCompact, fNum } from './charts/fmt';
import { IntentSurface } from './shared/IntentSurface';
import { DemoTrustBanner } from './shared/DemoTrustBanner';
import { DecisionBriefPanel } from './shared/DecisionBriefPanel';
import { MyWorkPanel } from './shared/MyWorkPanel';

interface Props { state: AppState; updateState: (u: (d: AppState) => AppState | void) => void }
const money = (n: number) => `${fCompact(Math.abs(n))} ریال`;

const Panel = ({ i = 0, title, aside, className, children }: { i?: number; title: string; aside?: React.ReactNode; className?: string; children: React.ReactNode }) => (
  <section className={cn('bg-surface border border-border rounded-3xl p-6 shadow-sm', className)} style={{ ['--i' as Record<string, unknown>]: i }}>
    <div className="mb-5 flex items-center justify-between gap-4 border-b border-border/60 pb-3">
      <h2 className="text-base font-extrabold text-text-main">{title}</h2>
      {aside}
    </div>
    {children}
  </section>
);

const Pill = ({ tone, children }: { tone: 'good' | 'bad' | 'warn' | 'mute'; children: React.ReactNode }) => (
  <span className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-caption font-bold border',
    tone === 'good' && 'bg-success-soft text-success border-success-border', 
    tone === 'bad' && 'bg-danger-soft text-danger border-danger-border', 
    tone === 'warn' && 'bg-warning-soft text-warning border-warning-border', 
    tone === 'mute' && 'bg-canvas text-text-secondary border-border'
  )}>
    {children}
  </span>
);

function Kpi({ i, label, value, delta, hot, good }: { i: number; label: string; value: number; delta?: number | null; hot?: boolean; good?: boolean }) {
  const v = useCountUp(Math.abs(value));
  return (
    <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm transition-all hover:shadow-card hover:border-primary/30" style={{ ['--i' as Record<string, unknown>]: i }}>
      <div className="text-xs font-bold text-text-secondary">{label}</div>
      <div className={cn('mt-2 text-2xl font-black leading-tight tabular-nums', hot ? 'text-danger' : good ? 'text-primary' : 'text-text-main')}>
        {value < 0 ? '−' : ''}{fCompact(v)}<span className="ms-1 text-caption font-medium text-text-secondary">ریال</span>
      </div>
      {delta != null && isFinite(delta) && (
        <div className={cn('mt-3 flex items-center gap-1 text-xs font-bold', delta >= 0 ? 'text-success' : 'text-danger')}>
          {delta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          <span className="tabular-nums">{fNum(Math.abs(Math.round(delta)))}٪</span> 
          <span className="text-text-secondary font-medium text-micro">نسبت به ۳۰ روز قبل</span>
        </div>
      )}
    </div>
  );
}

export function CommandCenterWorkspace({ state, updateState }: Props) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const rbac = useMemo(() => new RBACService(state), [state]);
  const showFinance = rbac.hasPermission('finance.view');
  const allowed = showFinance || rbac.hasPermission('accounts.view') || rbac.hasPermission('internal.view') || rbac.hasPermission('leads.view');
  const visibleAccounts = (state.accounts || []).filter(account => rbac.canActOnRecord('accounts', 'VIEW', {
    ownerId: account.ownerId, branchId: account.branchId, territoryId: account.territoryId,
    teamId: account.teamId, tenantId: account.tenantId, deletedAt: account.deletedAt, isDeleted: account.isDeleted,
  }));
  const visibleAccountIds = new Set(visibleAccounts.map(account => account.id));
  const inScopeByOwner = (record: Record<string, unknown>) => rbac.canSeeRecord(record.ownerId || record.createdBy || record.assigneeId || record.assignedTo || record.repId, record.branchId, record.territoryId, record.teamId);
  const belongsToVisibleAccount = (record: Record<string, unknown>) => {
    const accountId = record.accountId || record.customerId;
    if (!accountId) return inScopeByOwner(record);
    if (visibleAccountIds.has(accountId)) return true;
    const linkedAccount = (state.accounts || []).find(account => account.id === accountId);
    return showFinance && !!linkedAccount && rbac.canSeeRecord(linkedAccount.ownerId, linkedAccount.branchId, linkedAccount.territoryId, linkedAccount.teamId);
  };
  const scopedState = useMemo(() => ({
    ...state,
    accounts: visibleAccounts,
    users: (state.users || []).filter(user => rbac.canSeeRecord(user.id, user.branchId, user.territoryId, user.teamId)),
    tasks: (state.tasks || []).filter(task => rbac.canActOnRecord('tasks', 'VIEW', {
      ownerId: task.assigneeId || task.assignedTo || task.ownerId, branchId: task.branchId,
      territoryId: task.territoryId, teamId: task.teamId, tenantId: task.tenantId,
      deletedAt: task.deletedAt, isDeleted: task.isDeleted,
    })),
    activities: (state.activities || []).filter(activity => rbac.canActOnRecord('activities', 'VIEW', {
      ownerId: activity.ownerId, branchId: activity.branchId, territoryId: activity.territoryId,
      teamId: activity.teamId, tenantId: activity.tenantId, deletedAt: activity.deletedAt, isDeleted: activity.isDeleted,
    }) && belongsToVisibleAccount(activity)),
    visits: (state.visits || []).filter(visit => belongsToVisibleAccount({ ...visit, ownerId: visit.repId || visit.ownerId })),
    opportunities: (state.opportunities || []).filter(opportunity => rbac.canActOnRecord('opportunities', 'VIEW', {
      ownerId: opportunity.ownerId, branchId: opportunity.branchId, territoryId: opportunity.territoryId,
      teamId: opportunity.teamId, tenantId: opportunity.tenantId, deletedAt: opportunity.deletedAt, isDeleted: opportunity.isDeleted,
    })),
    leads: (((state as Record<string, unknown>).leads || []) as Record<string, unknown>[]).filter(lead => rbac.canActOnRecord('leads', 'VIEW', {
      ownerId: lead.ownerId, branchId: lead.branchId, territoryId: lead.territoryId, teamId: lead.teamId,
      tenantId: lead.tenantId, deletedAt: lead.deletedAt, isDeleted: lead.isDeleted,
    })),
    quotes: showFinance ? (state.quotes || []).filter(quote => belongsToVisibleAccount(quote)) : [],
    invoices: showFinance ? (state.invoices || []).filter(invoice => belongsToVisibleAccount(invoice) && !['CANCELLED', 'CANCELED', 'VOID', 'VOIDED', 'DRAFT'].includes(String(invoice.status || '').toUpperCase())) : [],
    payments: showFinance ? (state.payments || []).filter(payment => belongsToVisibleAccount(payment)) : [],
    cheques: showFinance ? (state.cheques || []).filter(cheque => belongsToVisibleAccount(cheque)) : [],
    expenses: showFinance ? (((state as Record<string, unknown>).expenses || []) as Record<string, unknown>[]).filter(expense => inScopeByOwner(expense)) : [],
    supplierBills: showFinance ? (((state as Record<string, unknown>).supplierBills || []) as Record<string, unknown>[]).filter((bill: Record<string, unknown>) => inScopeByOwner(bill)) : [],
    externalProducts: [],
    suppliers: [],
  }), [state, showFinance, visibleAccounts.length]);
  const ins = useMemo(() => computeInsights(scopedState as AppState), [scopedState]);
  const locale = state.settings?.locale;
  const avatarOf = (id?: string) => scopedState.users?.find(u => u.id === id)?.avatar;
  const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null);
  const query = searchQuery.trim().toLocaleLowerCase('fa-IR');
  const searchResults = query ? [
    ...(scopedState.tasks || []).filter(task => `${task.title || ''} ${task.description || ''}`.toLocaleLowerCase('fa-IR').includes(query)).map(task => ({ id: `task:${task.id}`, title: task.title, kind: 'وظیفه', route: '/tasks' })),
    ...(scopedState.opportunities || []).filter(opportunity => `${opportunity.title || ''} ${opportunity.description || ''}`.toLocaleLowerCase('fa-IR').includes(query)).map(opportunity => ({ id: `opp:${opportunity.id}`, title: opportunity.title, kind: 'فرصت فروش', route: '/opportunities' })),
    ...visibleAccounts.filter(account => `${account.name || ''} ${account.phone || ''} ${account.code || ''}`.toLocaleLowerCase('fa-IR').includes(query)).map(account => ({ id: `account:${account.id}`, title: account.name, kind: 'مشتری', route: `/accounts/${account.id}` })),
  ].slice(0, 12) : [];

  if (!allowed) {
    return (
      <div className="p-6" dir="rtl">
        <div className="bg-surface border border-border mx-auto max-w-md rounded-3xl p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-4 text-danger" size={32} />
          <h2 className="text-base font-extrabold text-text-main">دسترسی محدود</h2>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">برای مشاهده این صفحه باید حداقل مجوز مشاهده مشتریان، فروش، امور داخلی یا اطلاعات مالی را داشته باشید.</p>
        </div>
      </div>
    );
  }

  const net = ins.net30, plMax = Math.max(ins.sales30, ins.cogs30, ins.exp30, Math.abs(net), 1);
  const plRows = [
    { l: 'ارزش پیش‌فاکتورهای تأیید/پذیرفته', v: ins.sales30, c: 'var(--c-primary)' }, 
    { l: 'بهای تمام‌شده ثبت‌شده در پیشنهادها', v: ins.cogs30, c: 'var(--c-navy)' },
    { l: 'حاشیه برآوردی پیش از هزینه‌ها', v: ins.gross30, c: 'var(--c-accent)' }, 
    { l: 'هزینه‌ها (حقوق، اجاره، حمل...)', v: ins.exp30, c: 'var(--c-text-muted)' },
    { l: net >= 0 ? 'مازاد برآوردی' : 'کسری برآوردی', v: Math.abs(net), c: net >= 0 ? 'var(--c-primary)' : 'var(--c-danger)' },
  ];
  
  const needs: { l: string; v: number; route: string; hint: string }[] = [
    { l: 'وظایف معوق', v: ins.needs.overdueTasks, route: '/tasks', hint: 'موعد گذشته و تکمیل نشده' },
    ...(rbac.hasPermission('accounts.view') ? [{ l: 'مشتریان بدون ارتباط ۳۰ روزه', v: ins.needs.untouchedCustomers, route: '/accounts', hint: 'نیاز به ویزیت یا تماس' }] : []),
    ...(showFinance && rbac.hasPermission('accounts.view') ? [{ l: 'عبور از سقف اعتبار ثبت‌شده', v: ins.needs.overCredit, route: '/accounts', hint: 'مانده ثبت‌شده بیش از سقف اعتبار' }] : []),
    { l: 'فرصت‌های گذشته از موعد', v: ins.needs.staleOpps, route: '/opportunities', hint: 'تاریخ بستن گذشته است' },
  ];
  const g3 = ins.cash.h3, g7 = ins.cash.h7;
  const hasCashInputs = showFinance && ((scopedState.cheques || []).length > 0 || (((scopedState as Record<string, unknown>).supplierBills || []) as Record<string, unknown>[]).length > 0 || (((scopedState as Record<string, unknown>).expenses || []) as Record<string, unknown>[]).length > 0);
  const danger = g3.gap > 0;

  return (
    <div className="space-y-5 p-2 sm:p-4 pb-24 animate-in fade-in slide-in-from-bottom-1 duration-300" dir="rtl">
      <PageToolbar
        title="مرکز فرماندهی مدیریتی"
        subtitle="اولویت‌های عملیاتی و شاخص‌های قابل مشاهده؛ ارقام مالی سامانه تا زمان تطبیق با سامانه مالی رسمی محسوب نمی‌شوند."
        search={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="جستجو در وظایف، فرصت‌ها و مشتریان..."
        resultCount={query ? searchResults.length : undefined}
        onClearAll={() => setSearchQuery('')}
      />

      {/* Intent-Based UI 2026 */}
      <IntentSurface state={state} maxItems={3} />
      <DemoTrustBanner state={state} surface="decision" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <DecisionBriefPanel state={state} maxItems={4} />
        <MyWorkPanel state={state} maxItems={6} />
      </div>

      {query && (
        <Panel title="نتایج جستجو">
          {searchResults.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{searchResults.map(result => (
            <button key={result.id} type="button" onClick={() => navigate(result.route)} className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border bg-canvas px-3 py-2 text-start transition-colors hover:border-primary/35 hover:bg-surface">
              <span className="min-w-0"><b className="block truncate text-sm text-text-main">{result.title}</b><small className="mt-1 block text-caption text-text-secondary">{result.kind}</small></span><ArrowUpRight size={15} className="shrink-0 text-text-muted" />
            </button>
          ))}</div> : <p className="py-5 text-center text-sm text-text-secondary">نتیجه‌ای در محدوده دسترسی شما پیدا نشد.</p>}
        </Panel>
      )}

      {!ins.hasData && (
        <div className="bg-surface border border-border rounded-3xl p-10 text-center text-sm leading-relaxed text-text-secondary shadow-sm">
          هنوز داده‌ای برای تحلیل ثبت نشده است. پس از ثبت پیش‌فاکتور، فاکتور، پرداخت و وظیفه، اینجا تصویر کامل شرکت را می‌بینید.
        </div>
      )}

      {showFinance && (
        <Panel i={0} title="برآورد جریان نقدی کوتاه‌مدت" aside={<Pill tone="warn">غیررسمی · نیازمند تطبیق سامانه مالی</Pill>}>
          {hasCashInputs ? (
            <div id="command-cash" className={cn('rounded-2xl border p-4 sm:p-5', danger ? 'border-danger-border bg-danger-soft' : 'border-border bg-canvas')}>
              <div className="flex items-start gap-3">
                <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', danger ? 'bg-danger text-white' : 'bg-primary-soft text-primary')}>
                  {danger ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
                </span>
                <div className="min-w-0 text-sm leading-relaxed text-text-main">
                  <strong className="block text-base font-black">{danger ? `کسری برنامه‌ریزی‌شده سه‌روزه: ${money(g3.gap)}` : 'در اسناد سررسید ثبت‌شده، کسری سه‌روزه محاسبه نشد'}</strong>
                  <p className="mt-1 text-text-secondary">ورودی برنامه‌ریزی‌شده <b className="tabular-nums">{money(g3.inflow)}</b> در برابر خروجی ثبت‌شده <b className="tabular-nums">{money(g3.outflow)}</b>.</p>
                  {g7.gap > 0 && <p className="mt-1 text-danger">کسری محاسباتی هفت‌روزه: <b className="tabular-nums">{money(g7.gap)}</b></p>}
                  <p className="mt-2 text-caption text-text-secondary">این برآورد از چک‌ها، بدهی‌ها و هزینه‌های ثبت‌شده در سامانه استفاده می‌کند؛ وصول چک قطعی فرض نشده و موجودی بانک نیز در محاسبه نیست.</p>
                </div>
              </div>
            </div>
          ) : <p className="rounded-xl border border-dashed border-border bg-canvas p-6 text-center text-sm text-text-secondary">برای برآورد جریان نقدی، سند سررسید معتبر و قابل مشاهده‌ای در داده‌های فعلی وجود ندارد؛ وضعیت نقدینگی قابل نتیجه‌گیری نیست.</p>}
        </Panel>
      )}

      {/* شاخص‌های اصلی */}
      {showFinance && <div id="command-kpis" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi i={1} label="ارزش پیش‌فاکتورهای تأیید/پذیرفته" value={ins.sales30} delta={pct(ins.sales30, ins.salesPrev)} />
        <Kpi i={2} label="پرداخت‌های ثبت‌شده با وضعیت تسویه‌شده" value={ins.collected30} delta={pct(ins.collected30, ins.collectedPrev)} />
        <Kpi i={3} label="مانده فاکتورهای ثبت‌شده" value={ins.receivable} hot={ins.overdue > ins.receivable * 0.5} />
        <Kpi i={4} label={net >= 0 ? 'حاشیه برآوردی ۳۰ روز' : 'کسری برآوردی ۳۰ روز'} value={net} good={net >= 0} hot={net < 0} />
      </div>}

      {showFinance && <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel i={5} title="برآورد جریان نقدی ۱۴ روز آینده" aside={<div className="flex gap-4 text-xs font-bold text-text-secondary"><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[var(--c-primary)]" />ورودی</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[var(--c-danger)]" />خروجی</span></div>}>
          {hasCashInputs ? <CashFlowChart days={ins.cashDays} /> : <p className="rounded-xl border border-dashed border-border bg-canvas px-4 py-9 text-center text-sm text-text-secondary">داده سررسید قابل مشاهده‌ای برای ترسیم جریان نقدی وجود ندارد.</p>}
        </Panel>
        <Panel i={6} title="برآورد حاشیه پیشنهادهای تأیید/پذیرفته‌شده" aside={<Pill tone="warn">غیرحسابداری</Pill>}>
          <p className="mb-4 text-caption leading-5 text-text-secondary">این تحلیل از پیش‌فاکتورهای سامانه و هزینه‌های ثبت‌شده استفاده می‌کند؛ فروش قطعی، سود حسابداری یا سند تسویه نیست و باید با سامانه مالی تطبیق شود.</p>
          <div className="space-y-4">
            {plRows.map((r, k) => (
              <div key={r.l}>
                <div className="mb-1.5 flex justify-between text-xs font-bold"><span className="text-text-secondary">{r.l}</span><b className="font-mono text-text-main">{money(r.v)}</b></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-canvas border border-border/50"><i className="block h-full rounded-full" style={{ width: `${Math.max((r.v / plMax) * 100, r.v ? 3 : 0)}%`, background: r.c, ['--i' as Record<string, unknown>]: k }} /></div>
              </div>))}
          </div>
          <div className="mt-6 border-t border-border pt-4">
            <div className="mb-2 text-xs font-bold text-text-secondary">روند حاشیه برآوردی ۶ دوره ۳۰ روزه</div>
            <LineChart values={ins.trend.map(t => t.net)} labels={ins.trend.map(t => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'short' }).format(t.date))} color={net >= 0 ? 'var(--c-primary)' : 'var(--c-danger)'} height={120} />
          </div>
        </Panel>
      </div>
      }

      {/* عملکرد افراد */}
      <div id="command-feed"><Panel i={7} title="عملکرد عملیاتی افراد (۳۰ روز)" aside={<span className="text-xs font-medium text-text-secondary">تعداد وظایف، ویزیت‌ها و فعالیت‌های ثبت‌شده</span>}>
        {ins.people.length === 0 ? <p className="py-8 text-center text-sm text-text-secondary bg-canvas rounded-2xl border border-dashed border-border">فعالیتی از پرسنل ثبت نشده است.</p> : (
          <div id="command-people" className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {ins.people.map((p, k) => (
              <div key={p.id} className="rounded-2xl bg-canvas border border-border p-5 shadow-sm" style={{ ['--i' as Record<string, unknown>]: k }}>
                <div className="flex items-center gap-3">
                  <Avatar name={p.name} src={avatarOf(p.id)} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-text-main">{p.name}</div>
                    <div className="truncate text-xs text-text-secondary mt-0.5">{state.users.find(u => u.id === p.id)?.jobTitle || 'کاربر سامانه'}</div>
                  </div>
                  {showFinance && <Pill tone="warn">برآورد غیرحسابداری</Pill>}
                </div>
                <div className="mt-4">
                  <AllocationBar segments={[{ label: 'تکمیل', value: p.tasksDone, color: 'var(--c-success)' }, { label: 'باز', value: Math.max(p.tasksOpen - p.tasksOverdue, 0), color: 'var(--c-primary)' }, { label: 'معوق', value: p.tasksOverdue, color: 'var(--c-danger)' }]} caption={`وظایف: ${fNum(p.tasksDone)} تکمیل · ${fNum(p.tasksOpen - p.tasksOverdue)} باز · ${fNum(p.tasksOverdue)} معوق`} />
                </div>
                <div className={cn('mt-4 grid gap-3 text-center text-xs text-text-secondary', showFinance ? 'grid-cols-4' : 'grid-cols-3')}>
                  <div className="rounded-lg border border-border bg-surface py-2"><b className="mb-0.5 block text-sm font-black text-text-main tabular-nums">{fNum(p.visits)}</b>ویزیت</div>
                  <div className="rounded-lg border border-border bg-surface py-2"><b className="mb-0.5 block text-sm font-black text-text-main tabular-nums">{fNum(p.activities)}</b>فعالیت</div>
                  <div className="rounded-lg border border-border bg-surface py-2"><b className="mb-0.5 block text-sm font-black text-text-main tabular-nums">{fNum(p.tasksDone + p.tasksOpen)}</b>وظیفه</div>
                  {showFinance && <div className="rounded-lg border border-border bg-surface py-2"><b className="mb-0.5 block text-sm font-black text-text-main tabular-nums">{fCompact(p.sales)}</b>ارزش پیشنهاد</div>}
                </div>
                {showFinance && p.net !== null && (
                  <div className={cn('mt-3 rounded-lg border p-2 text-center text-xs font-bold', p.net >= 0 ? 'border-primary/20 bg-primary-soft text-primary' : 'border-danger-border bg-danger-soft text-danger')}>
                    {p.net >= 0 ? 'مازاد برآوردی' : 'کسری برآوردی'} نسبت به هزینه ثبت‌شده: {money(p.net)}
                  </div>
                )}
              </div>))}
          </div>)}
      </Panel></div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel i={8} title="چه کسی چه کاری کرد؟ (رویدادهای اخیر)">
          <ol className="relative space-y-4 border-s-2 border-border ps-5 ms-2">
            {ins.recent.length === 0 && <li className="text-sm text-text-secondary py-4">رویدادی ثبت نشده است.</li>}
            {ins.recent.map((f, k) => (
              <li key={k} className="relative flex items-start gap-3" style={{ ['--i' as Record<string, unknown>]: k }}>
                <span className="absolute -start-(--size-29) top-1.5 h-3 w-3 rounded-full bg-primary ring-4 ring-surface" />
                {f.actorId ? <Avatar name={ins.userName(f.actorId)} src={avatarOf(f.actorId)} size="sm" /> : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-canvas border border-border text-text-secondary"><ArrowDownLeft size={14} /></span>}
                <div className="min-w-0 text-sm">
                  <div className="text-text-main"><b className="font-extrabold">{f.actorId ? ins.userName(f.actorId) : 'سیستم مالی'}</b> — {f.text}</div>
                  <div className="text-xs text-text-secondary mt-1 font-mono">{formatAppDate(new Date(f.at).toISOString(), locale)} · {new Date(f.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </li>))}
          </ol>
        </Panel>
        
        <Panel i={9} title="نیازها و موانع امروز">
          <ul className="grid gap-3">
            {needs.map((n, k) => (
              <li key={n.l} style={{ ['--i' as Record<string, unknown>]: k }}>
                <button onClick={() => navigate(n.route)} className="flex w-full cursor-pointer items-center gap-4 rounded-2xl bg-canvas border border-border p-3 text-start hover:border-primary/40 hover:shadow-sm transition-all active:scale-(--scale-press-soft)">
                  <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-xl font-mono text-base font-black', n.v > 0 ? 'bg-danger-soft text-danger border border-danger-border' : 'bg-success-soft text-success border border-success-border')}>{n.v > 0 ? fNum(n.v) : '✓'}</span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-text-main">{n.l}</span><span className="block text-xs text-text-secondary mt-0.5">{n.v > 0 ? n.hint : 'مشکلی وجود ندارد'}</span></span>
                </button>
              </li>))}
          </ul>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {showFinance && <Panel i={10} title="کهنگی مطالبات ثبت‌شده در سامانه">
          <div className="py-4">
            <DonutChart size={180} centerValue={fCompact(ins.receivable)} centerLabel="مطالبات باز" segments={ins.aging.map((a, k) => ({ label: a.label, value: a.value, color: ['var(--c-success)', 'var(--c-primary)', 'var(--c-accent)', 'var(--c-warning)', 'var(--c-danger)'][k] }))} />
          </div>
          {rbac.hasPermission('accounts.view') && <div className="mt-6 border-t border-border pt-4">
            <div className="mb-3 text-xs font-bold text-text-secondary">بیشترین بدهکاران</div>
            <ul className="grid gap-2">
              {ins.topDebtors.map(d => (
                <li key={d.id}>
                  <button onClick={() => { updateState(s => { s.activeContextAccountId = d.id; }); navigate('/accounts'); }} className="flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors hover:bg-canvas border border-transparent hover:border-border">
                    <span className="truncate font-bold text-text-main">{d.name}</span>
                    <span className="font-mono font-bold text-text-secondary">{money(d.value)}{d.overdue > 0 && <b className="ms-2 text-danger">({money(d.overdue)} معوق)</b>}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>}
        </Panel>}
        
        {showFinance && <Panel i={11} title="چک‌های ثبت‌شده و سررسیدها">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-canvas border border-border p-5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-text-secondary mb-2"><ArrowDownLeft size={16} className="text-success" />دریافتی در راه</div>
              <div className="text-xl font-black text-text-main tabular-nums">{money(ins.chequeStats.receivablePending)}</div>
              <div className="mt-2 text-caption font-bold text-danger bg-danger-soft px-2 py-1 rounded-lg inline-block border border-danger-border">{ins.chequeStats.receivableBounced ? `برگشتی: ${money(ins.chequeStats.receivableBounced)}` : 'بدون برگشتی'}</div>
            </div>
            <div className="rounded-2xl bg-canvas border border-border p-5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-text-secondary mb-2"><ArrowUpRight size={16} className="text-warning" />پرداختی در راه</div>
              <div className="text-xl font-black text-text-main tabular-nums">{money(ins.chequeStats.payablePending)}</div>
              <div className="mt-2 text-caption font-bold text-danger bg-danger-soft px-2 py-1 rounded-lg inline-block border border-danger-border">{ins.chequeStats.payableOverdue ? `سررسید گذشته: ${money(ins.chequeStats.payableOverdue)}` : 'بدون معوق'}</div>
            </div>
          </div>
          <div className="mt-6 mb-3 text-xs font-bold text-text-secondary">نزدیک‌ترین سررسیدها</div>
          <ul className="grid gap-2">
            {ins.chequeStats.nextDue.length === 0 && <li className="text-sm text-text-secondary bg-canvas p-4 rounded-xl border border-dashed border-border text-center">چک سررسیدنشده‌ای ثبت نشده است.</li>}
            {ins.chequeStats.nextDue.map((c: Record<string, unknown>) => (
              <li key={c.id} className="flex items-center gap-3 rounded-xl bg-canvas border border-border px-3 py-2.5 text-sm shadow-sm">
                <span className={cn('grid h-8 w-8 place-items-center rounded-lg text-white shadow-sm shrink-0', c.dir === 'IN' ? 'bg-success' : 'bg-warning')}>
                  {c.dir === 'IN' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                </span>
                <span className="flex-1 truncate font-bold text-text-main">{c.dir === 'IN' ? 'دریافت از' : 'پرداخت به'} {c.dir === 'IN' ? visibleAccounts.find(a => a.id === c.customerId)?.name : 'ذی‌نفع پرداختی'}</span>
                <div className="text-left">
                  <b className="font-mono text-text-main block">{money(c.amount)}</b>
                  <span className="font-mono text-micro text-text-secondary block mt-0.5">{formatAppDate(c.dueDate, locale)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>}
      </div>

      <div className="rounded-2xl border border-border bg-canvas p-4 text-xs leading-6 text-text-secondary">
        موجودی، خرید و تأمین‌کنندگان در این مرکز فرماندهی سامانه نمایش داده نمی‌شوند؛ مرجع این حوزه‌ها سامانه عملیاتی/سامانه مالی است.
      </div>

      <Panel i={14} title="قیف فروش">
        <div className="py-4">
          <FunnelChart stages={ins.funnel} colors={['var(--c-primary-soft)', 'var(--c-primary)', 'var(--c-accent)', 'var(--c-success)']} />
        </div>
      </Panel>
    </div>
  );
}
