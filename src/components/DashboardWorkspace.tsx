import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppState } from '../types';
import { Card } from './ui/Card';
import { Avatar } from './ui/Avatar';
import { EmptyState } from './ui/EmptyState';
import {
  FileText,
  Hourglass,
  MessageSquare,
  MessageCircle,
  AlertTriangle,
  TrendingUp,
  Maximize
} from 'lucide-react';
import { cn } from '../lib/utils';
import { formatCount, formatPercent } from '../lib/format';
import { DonutChart, GaugeChart, FunnelChart, MiniChart } from './charts';
import { DemoBadge } from './shared/DemoBadge';
import { DataLineageBadge } from './shared/DataLineageBadge';
import { isDemoContext, defaultLineageForSurface } from '../lib/dataTrust';
import { LineChart } from './charts/LineChart';
import { Button } from './ui/Button';
import { useCountUp } from '../hooks/useCountUp';
import { RBACService } from '../lib/rbac';
import { OPPORTUNITY_STAGES } from '../config/pipeline';
import { activeRecords } from '../lib/recordLifecycle';
import { evaluatePortfolioChurn } from '../services/churnPredictionService';
import { isReceivableInvoice } from '../services/agingBuckets';
import { VerdictStrip } from './shared/VerdictStrip';

const localDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const dateKeyOf = (value?: string) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : localDateKey(date);
};

function AnimatedMetric({ value }: { value: number }) {
  const count = useCountUp(value, 850);
  return <>{Math.round(count).toLocaleString('fa-IR')}</>;
}

const getPeriodStart = (period: string, now: Date) => {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'هفتگی') start.setDate(start.getDate() - ((start.getDay() + 1) % 7));
  else if (period === 'ماهانه') start.setDate(1);
  else start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
  return localDateKey(start);
};

function buildSixMonthCounts(
  items: Array<{ createdAt?: string; dateTime?: string; date?: string }>,
  now: Date,
  formatter: Intl.DateTimeFormat
): { labels: string[]; values: number[] } {
  const buckets = Array.from({ length: 6 }, (_, idx) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: formatter.format(d),
      count: 0,
    };
  });
  const byKey = new Map(buckets.map(b => [b.key, b]));
  items.forEach(item => {
    const raw = item.createdAt || item.dateTime || item.date;
    const key = dateKeyOf(raw).slice(0, 7);
    const bucket = byKey.get(key);
    if (bucket) bucket.count += 1;
  });
  return {
    labels: buckets.map(b => b.label),
    values: buckets.map(b => b.count),
  };
}

export function DashboardWorkspace({ state }: { state: AppState }) {
  const navigate = useNavigate();
  const [filterPeriod, setFilterPeriod] = useState('هفتگی');
  const [cockpitMode, setCockpitMode] = useState(false);
  const [showCelebration] = useState(false);

  const toggleCockpit = () => {
    const next = !cockpitMode;
    setCockpitMode(next);
    window.dispatchEvent(new CustomEvent('akhavan-cockpit', { detail: { active: next } }));
  };

  const rbac = useMemo(() => new RBACService(state), [state]);
  const currentUser = rbac.getCurrentUser();
  const userId = currentUser?.id;
  const now = new Date();
  const todayStr = localDateKey(now);
  const periodStart = getPeriodStart(filterPeriod, now);
  const inPeriod = (value?: string) => {
    const key = dateKeyOf(value);
    return !!key && key >= periodStart && key <= todayStr;
  };

  const visibleAccounts = rbac.can('accounts', 'VIEW')
    ? (state.accounts || []).filter(account =>
        rbac.canActOnRecord('accounts', 'VIEW', {
          ownerId: account.ownerId,
          branchId: account.branchId,
          territoryId: account.territoryId,
          teamId: account.teamId,
          tenantId: account.tenantId,
          deletedAt: account.deletedAt,
          isDeleted: account.isDeleted,
        })
      )
    : [];
  const visibleAccountIds = new Set(visibleAccounts.map(account => account.id));

  const myTasks = userId
    ? (state.tasks || []).filter(task =>
        rbac.canActOnRecord('tasks', 'VIEW', {
          ownerId: task.assigneeId || task.assignedTo || task.ownerId,
          branchId: task.branchId,
          territoryId: task.territoryId,
          teamId: task.teamId,
          tenantId: task.tenantId,
          deletedAt: task.deletedAt,
          isDeleted: task.isDeleted,
        })
      )
    : [];
  const periodTasks = activeRecords(myTasks).filter(task => !['CANCELLED', 'CANCELED', 'VOID', 'DELETED'].includes(task.status) && inPeriod(task.createdAt || task.updatedAt || task.dueDate));

  const visibleOpportunities = (state.opportunities || []).filter(
    opportunity =>
      rbac.canActOnRecord('opportunities', 'VIEW', {
        ownerId: opportunity.ownerId,
        branchId: opportunity.branchId,
        territoryId: opportunity.territoryId,
        teamId: opportunity.teamId,
        tenantId: opportunity.tenantId,
        deletedAt: opportunity.deletedAt,
        isDeleted: opportunity.isDeleted,
      }) &&
      (!opportunity.accountId ||
        visibleAccountIds.has(opportunity.accountId) ||
        rbac.canSeeRecord(opportunity.ownerId, opportunity.branchId, opportunity.territoryId, opportunity.teamId))
  );
  const periodOpportunities = activeRecords(visibleOpportunities).filter(opportunity => inPeriod(opportunity.createdAt));

  const userGroups = (state.groups || []).filter(group => group.memberIds?.includes(userId || ''));
  const groupIds = new Set(userGroups.map(group => group.id));
  const visibleMessages = userId
    ? (state.messages || []).filter(message => groupIds.has(String(message.groupId)) && !!message.senderId)
    : [];
  const discussionsCount = visibleMessages.length;

  const overdueTasks = periodTasks.filter(task => !['COMPLETED', 'CANCELLED', 'CANCELED', 'VOID', 'DELETED'].includes(task.status) && !!task.dueDate && task.dueDate < todayStr);
  const inProgressTasks = periodTasks.filter(task => task.status === 'IN_PROGRESS' && !overdueTasks.includes(task));
  const inReviewTasks = periodTasks.filter(task => !['COMPLETED', 'CANCELLED', 'CANCELED', 'VOID', 'DELETED', 'IN_PROGRESS'].includes(task.status) && !(task.dueDate && task.dueDate < todayStr));
  const doneTasks = periodTasks.filter(task => task.status === 'COMPLETED');

  const oppStages = OPPORTUNITY_STAGES.filter(stage => stage.id !== 'LOST').map(stage => ({
    label: stage.id === 'DISCOVERY' ? 'کشف نیاز' : stage.id === 'PROPOSAL' ? 'پیشنهاد' : stage.label.split(' (')[0],
    value: periodOpportunities.filter(opportunity => opportunity.stage === stage.id).length,
  }));

  const canViewQuotes = rbac.can('quotes', 'VIEW');
  const canViewFinance = rbac.can('finance', 'VIEW');
  const canViewCases = rbac.can('cases', 'VIEW');

  const visibleInvoices = canViewFinance
    ? (state.invoices || []).filter(
        invoice =>
          isReceivableInvoice(invoice) &&
          visibleAccountIds.has(String(invoice.accountId || invoice.customerId || ''))
      )
    : [];

  const visibleActivities = (state.activities || []).filter(a =>
    !a.deletedAt && !a.isDeleted &&
    (!a.accountId && !a.customerId || visibleAccountIds.has(String(a.accountId || a.customerId))) &&
    rbac.canActOnRecord('activities', 'VIEW', {
      ownerId: a.ownerId, branchId: a.branchId, territoryId: a.territoryId,
      teamId: a.teamId, tenantId: a.tenantId,
    })
  );

  const scopedState = {
    ...state,
    accounts: visibleAccounts,
    groups: userGroups,
    messages: visibleMessages,
    customerNotes: (((state as Record<string, unknown>).customerNotes || []) as Array<Record<string, unknown>>).filter(note => visibleAccountIds.has(String(note.accountId || note.customerId || ''))),
    users: (state.users || []).filter(user => rbac.canSeeRecord(user.id, user.branchId, user.territoryId, user.teamId)),
    tasks: myTasks,
    activities: visibleActivities,
    opportunities: visibleOpportunities,
    quotes: canViewQuotes ? (state.quotes || []).filter(quote => visibleAccountIds.has(String(quote.accountId || quote.customerId || ''))) : [],
    invoices: visibleInvoices,
    cases: canViewCases ? (state.cases || []).filter((record: { accountId?:string; customerId?:string; ownerId?:string; branchId?:string; territoryId?:string; teamId?:string; tenantId?:string; deletedAt?:string; isDeleted?:boolean }) => {
      return visibleAccountIds.has(String(record.accountId || record.customerId || '')) && rbac.canActOnRecord('cases', 'VIEW', {
        ownerId: record.ownerId, branchId: record.branchId, territoryId: record.territoryId, teamId: record.teamId, tenantId: record.tenantId,
        deletedAt: record.deletedAt, isDeleted: record.isDeleted,
      });
    }) : [],
    payments: canViewFinance ? (state.payments || []).filter(payment => visibleAccountIds.has(String(payment.accountId || payment.customerId || ''))) : [],
    cheques: canViewFinance ? (state.cheques || []).filter(cheque => visibleAccountIds.has(String((cheque as Record<string, unknown>).accountId || (cheque as Record<string, unknown>).customerId || ''))) : [],
  } as AppState;

  const churnPortfolio = useMemo(() => (visibleAccounts.length ? evaluatePortfolioChurn(scopedState, now) : null), [scopedState, visibleAccounts.length, now]);

  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'short' }),
    []
  );

  // سری‌های واقعی ۶ماهه به جای اعداد ثابت
  const taskSeries = useMemo(() => buildSixMonthCounts(myTasks, now, monthFormatter), [myTasks, now, monthFormatter]);
  const oppSeries = useMemo(() => buildSixMonthCounts(visibleOpportunities, now, monthFormatter), [visibleOpportunities, now, monthFormatter]);
  const msgSeries = useMemo(
    () => buildSixMonthCounts(visibleMessages, now, monthFormatter),
    [visibleMessages, now, monthFormatter]
  );
  const accSeries = useMemo(() => buildSixMonthCounts(visibleAccounts, now, monthFormatter), [visibleAccounts, now, monthFormatter]);

  const activityTrend = useMemo(
    () => buildSixMonthCounts([...visibleActivities, ...myTasks], now, monthFormatter),
    [visibleActivities, myTasks, now, monthFormatter]
  );
  const hasActivityTrend = activityTrend.values.some(v => v > 0);
  const hasAnySpark = (vals: number[]) => vals.filter(v => v > 0).length >= 2;

  return (
    <div className="crm-page crm-page-dashboard w-full min-w-0 space-y-3.5 px-2 py-2 sm:px-4 sm:py-3 pb-[calc(6rem+env(safe-area-inset-bottom))] font-sans animate-in fade-in slide-in-from-bottom-1 duration-300" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-surface border border-border shadow-xs">
        <div className="flex items-center gap-2.5">
          <Avatar name={currentUser?.name || 'کاربر'} src={currentUser?.avatar} size="md" />
          <div>
            <h1 data-tour-heading className="text-sm sm:text-base font-bold text-text-main tracking-tight">
              داشبورد مدیریتی · {currentUser?.name || 'کاربر'}
            </h1>
            <p className="text-caption text-text-secondary mt-0.5">
              پایش عملکرد فروش، فرصت‌ها و وضعیت پیگیری‌ها
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="xs" type="button" onClick={toggleCockpit}>
            <Maximize size={12} />
            <span>تمام‌صفحه</span>
          </Button>

          <div className="crm-period-filter inline-flex items-center gap-1 p-0.5 rounded-lg bg-canvas border border-border">
            {(['هفتگی', 'ماهانه', 'فصلی'] as const).map(period => (
              <button
                key={period}
                type="button"
                onClick={() => setFilterPeriod(period)}
                aria-pressed={filterPeriod === period}
                className={cn(
                  'px-2.5 py-1 rounded-md text-caption font-bold transition-all cursor-pointer',
                  filterPeriod === period
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-text-secondary hover:text-text-main hover:bg-surface'
                )}
              >
                {period}
              </button>
            ))}
          </div>
        </div>
      </div>

      <VerdictStrip
        verdict={overdueTasks.length ? `${formatCount(overdueTasks.length)} وظیفه معوق در دوره جاری نیازمند تعیین تکلیف است` : `در وظایف قابل مشاهده این دوره مورد معوق ثبت نشده است`}
        magnitude={periodTasks.length ? `نرخ اتمام وظایف: ${formatPercent(doneTasks.length / periodTasks.length * 100, 0)}` : 'بدون وظیفه در دوره'}
        tone={overdueTasks.length ? 'warning' : 'neutral'}
        actionLabel="بررسی وظایف"
        onAction={() => navigate('/tasks')}
      />

      {isDemoContext(state) && (
        <div className="flex items-center gap-2 mb-2">
          <DemoBadge />
          <DataLineageBadge lineage={defaultLineageForSurface('analytics')} />
          <span className="text-mini text-text-secondary">اعداد زیر ممکن است شامل داده آزمایشی باشند</span>
        </div>
      )}

      <div id="dash-kpis" data-tour-primary className="crm-metric-grid grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Card padding="sm" className="bg-surface border border-border rounded-xl p-3 flex flex-col justify-between cursor-pointer hover:border-primary/40 transition-colors" onClick={() => navigate('/tasks')}>
          <div className="flex items-center justify-between">
            <span className="text-micro font-bold text-text-muted">وظایف</span>
            <FileText size={15} className="text-primary" />
          </div>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div>
              <div className="text-xl font-bold text-text-main tabular-nums tracking-tight">
                <AnimatedMetric value={periodTasks.length} />
              </div>
              <div className="text-mini text-text-secondary mt-0.5">وظایف دوره</div>
            </div>
            {hasAnySpark(taskSeries.values) && (
              <div className="w-16 h-7 shrink-0">
                <MiniChart data={taskSeries.values} height={28} showTooltip />
              </div>
            )}
          </div>
        </Card>

        <Card padding="sm" className="bg-surface border border-border rounded-xl p-3 flex flex-col justify-between cursor-pointer hover:border-warning/40 transition-colors" onClick={() => navigate('/opportunities')}>
          <div className="flex items-center justify-between">
            <span className="text-micro font-bold text-text-muted">فرصت‌ها</span>
            <Hourglass size={15} className="text-warning" />
          </div>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div>
              <div className="text-xl font-bold text-text-main tabular-nums tracking-tight">
                <AnimatedMetric value={periodOpportunities.filter(o => o.stage !== 'WON' && o.stage !== 'LOST').length} />
              </div>
              <div className="text-mini text-text-secondary mt-0.5">فرصت‌های باز</div>
            </div>
            {hasAnySpark(oppSeries.values) && (
              <div className="w-16 h-7 shrink-0">
                <MiniChart data={oppSeries.values} color="var(--c-warning)" height={28} showTooltip />
              </div>
            )}
          </div>
        </Card>

        <Card padding="sm" className="bg-surface border border-border rounded-xl p-3 flex flex-col justify-between cursor-pointer hover:border-success/40 transition-colors" onClick={() => navigate('/groups')}>
          <div className="flex items-center justify-between">
            <span className="text-micro font-bold text-text-muted">گفتگوها</span>
            <MessageSquare size={15} className="text-success" />
          </div>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div>
              <div className="text-xl font-bold text-text-main tabular-nums tracking-tight">
                <AnimatedMetric value={discussionsCount} />
              </div>
              <div className="text-mini text-text-secondary mt-0.5">پیام‌های تیمی</div>
            </div>
            {hasAnySpark(msgSeries.values) && (
              <div className="w-16 h-7 shrink-0">
                <MiniChart data={msgSeries.values} color="var(--c-success)" height={28} showTooltip />
              </div>
            )}
          </div>
        </Card>

        <Card padding="sm" className="bg-surface border border-border rounded-xl p-3 flex flex-col justify-between cursor-pointer hover:border-primary/40 transition-colors" onClick={() => navigate('/accounts')}>
          <div className="flex items-center justify-between">
            <span className="text-micro font-bold text-text-muted">مشتریان</span>
            <MessageCircle size={15} className="text-text-secondary" />
          </div>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div>
              <div className="text-xl font-bold text-text-main tabular-nums tracking-tight">
                <AnimatedMetric value={visibleAccounts.length} />
              </div>
              <div className="text-mini text-text-secondary mt-0.5">مشتریان فعال</div>
            </div>
            {hasAnySpark(accSeries.values) && (
              <div className="w-16 h-7 shrink-0">
                <MiniChart data={accSeries.values} color="var(--c-primary)" height={28} showTooltip />
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* نمودار روند ۶ ماهه از داده‌های واقعی */}
      <Card id="dash-trend" padding="md" className="border-border rounded-xl p-3.5 space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="font-bold text-text-main flex items-center gap-1.5">
            <TrendingUp size={14} className="text-primary" />
            <span>روند پیگیری و فعالیت‌های تجاری</span>
          </span>
          <span className="text-micro text-text-secondary">شش ماه اخیر</span>
        </div>
        <div className="pt-1">
          {hasActivityTrend ? (
            <LineChart values={activityTrend.values} labels={activityTrend.labels} height={140} />
          ) : (
            <EmptyState surface="dashboard_workspace_1"
              compact
              title="داده‌ای برای رسم روند ۶ماهه ثبت نشده است"
              description="با ثبت فعالیت‌ها و وظایف، روند ماهانه اینجا ترسیم می‌شود."
            />
          )}
        </div>
      </Card>

      {/* دونات وضعیت وظایف و گیج نرخ انجام */}
      <div id="dash-donut" className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <Card padding="md" className="sm:col-span-2 rounded-xl p-3.5 space-y-2">
          <h3 className="text-xs font-bold text-text-main">توزیع وضعیت وظایف دوره</h3>
          {periodTasks.length > 0 ? (
            <div className="flex justify-center py-1">
              <DonutChart
                size={130}
                thickness={12}
                centerValue={doneTasks.length}
                centerLabel="تکمیل‌شده"
                segments={[
                  { label: 'معوق', value: overdueTasks.length, color: 'var(--c-danger)' },
                  { label: 'در جریان', value: inProgressTasks.length, color: 'var(--c-primary)' },
                  { label: 'در انتظار', value: inReviewTasks.length, color: 'var(--c-copper)' },
                  { label: 'انجام‌شده', value: doneTasks.length, color: 'var(--c-success)' },
                ]}
              />
            </div>
          ) : (
            <EmptyState surface="dashboard_workspace_2" compact title="وظیفه‌ای در این دوره نیست" description="بازه را تغییر دهید یا وظیفه جدید ثبت کنید." />
          )}
        </Card>

        <Card padding="md" className="rounded-xl p-3.5 flex flex-col items-center justify-center">
          <h3 className="text-xs font-bold text-text-main mb-2 self-start">نرخ اتمام وظایف</h3>
          <GaugeChart
            value={periodTasks.length ? doneTasks.length : 0}
            max={periodTasks.length || 1}
            display={periodTasks.length ? `${Math.round((doneTasks.length / periodTasks.length) * 100).toLocaleString('fa-IR')}٪` : '—'}
            label={periodTasks.length ? `${doneTasks.length.toLocaleString('fa-IR')} از ${periodTasks.length.toLocaleString('fa-IR')}` : 'بدون داده'}
            color="var(--c-primary)"
            size={110}
          />
        </Card>
      </div>

      {oppStages.some(x => x.value > 0) && (
        <Card padding="md" className="rounded-xl p-3.5 space-y-2">
          <h3 className="text-xs font-bold text-text-main">قیف فرصت‌های فروش به تفکیک مرحله</h3>
          <FunnelChart stages={oppStages} colors={['var(--c-primary-soft)', 'var(--c-primary)', 'var(--c-accent)', 'var(--c-success)']} />
        </Card>
      )}

      {churnPortfolio && (
        <Card id="dash-churn-card" padding="md" className="rounded-xl p-3.5 border-border space-y-2.5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={15} className="text-warning" />
              <h3 className="text-xs font-bold text-text-main">پایش هوشمند احتمال ریزش مشتریان</h3>
            </div>
            <Button variant="link" size="inline" type="button" onClick={() => navigate('/accounts')}>
              مشاهده مشتریان
            </Button>
          </div>

          <p className="text-caption text-text-secondary">برآورد از شواهد قابل مشاهده؛ پوشش مانده دفتری و فروش خالص در این نما تأیید نشده است.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
            <div className="p-2 rounded-lg bg-danger-soft text-danger">
              <span className="text-micro block">بحرانی</span>
              <strong className="text-base font-bold tabular-nums mt-0.5 block">{churnPortfolio.criticalCount.toLocaleString('fa-IR')}</strong>
            </div>
            <div className="p-2 rounded-lg bg-warning-soft text-warning">
              <span className="text-micro block">ریسک بالا</span>
              <strong className="text-base font-bold tabular-nums mt-0.5 block">{churnPortfolio.highCount.toLocaleString('fa-IR')}</strong>
            </div>
            <div className="p-2 rounded-lg bg-primary-soft text-primary">
              <span className="text-micro block">هشدار متوسط</span>
              <strong className="text-base font-bold tabular-nums mt-0.5 block">{churnPortfolio.mediumCount.toLocaleString('fa-IR')}</strong>
            </div>
            <div className="p-2 rounded-lg bg-success-soft text-success">
              <span className="text-micro block">ریسک کم برآوردی</span>
              <strong className="text-base font-bold tabular-nums mt-0.5 block">{churnPortfolio.lowCount.toLocaleString('fa-IR')}</strong>
            </div>
          </div>
        </Card>
      )}

      {showCelebration && (
        <div className="fixed inset-0 z-(--z-top) pointer-events-none flex items-center justify-center overflow-hidden bg-black/40 backdrop-blur-sm">
          <div className="text-center animate-in zoom-in duration-500">
            <h2 className="text-2xl font-black text-warning">هدف محقق شد</h2>
            <p className="text-white mt-2">عملکرد تیم در این دوره ثبت گردید.</p>
          </div>
        </div>
      )}
    </div>
  );
}
