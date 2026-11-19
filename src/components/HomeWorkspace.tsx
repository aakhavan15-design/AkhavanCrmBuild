import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppState } from '../types';
import {
  Clock,
  ChevronLeft,
  ArrowUpRight,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { formatMoneyCompact } from '../lib/format';
import { RBACService } from '../lib/rbac';
import { isReceivableInvoice } from '../services/agingBuckets';
import { evaluatePortfolioChurn } from '../services/churnPredictionService';
import { DonutChart } from './charts/DonutChart';
import { VerdictStrip } from './shared/VerdictStrip';
import { IntentSurface } from './shared/IntentSurface';
import { DemoTrustBanner } from './shared/DemoTrustBanner';
import { FollowUpInbox } from './shared/FollowUpInbox';
import { MyWorkPanel } from './shared/MyWorkPanel';
import { DecisionBriefPanel } from './shared/DecisionBriefPanel';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';

const fa = (n: number) => n.toLocaleString('fa-IR');

export function HomeWorkspace({ state }: { state: AppState }) {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<'6M' | '12M'>('6M');

  const rbac = useMemo(() => new RBACService(state), [state]);
  const currentUser = rbac.getCurrentUser();
  const userId = currentUser?.id;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const visibleTasks = (state.tasks || []).filter(t =>
    rbac.canActOnRecord('tasks', 'VIEW', {
      ownerId: t.assigneeId || t.assignedTo || t.ownerId,
      branchId: t.branchId,
      territoryId: t.territoryId,
      teamId: t.teamId,
      tenantId: t.tenantId,
      deletedAt: t.deletedAt,
      isDeleted: t.isDeleted,
    })
  );
  const myTasks = userId
    ? visibleTasks.filter(t => (t.assigneeId || t.assignedTo) === userId && !['COMPLETED', 'CANCELLED', 'CANCELED'].includes(String(t.status || '').toUpperCase()))
    : [];
  const overdueTasks = myTasks.filter(t => t.dueDate && t.dueDate < today);

  const todayActivities = userId
    ? (state.activities || []).filter(
        a =>
          a.ownerId === userId &&
          a.dateTime?.startsWith(today) &&
          rbac.canActOnRecord('activities', 'VIEW', {
            ownerId: a.ownerId,
            branchId: a.branchId,
            territoryId: a.territoryId,
            teamId: a.teamId,
            tenantId: a.tenantId,
          })
      )
    : [];

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
  const visibleAccountIds = new Set(visibleAccounts.map(a => a.id));

  const canViewFinance = rbac.can('finance', 'VIEW');
  const visibleInvoices = useMemo(
    () =>
      canViewFinance
        ? (state.invoices || []).filter(
            inv =>
              isReceivableInvoice(inv) &&
              rbac.canActOnRecord('finance', 'VIEW', {
                ownerId: (inv as Record<string, unknown>).ownerId as string | undefined,
                branchId: (inv as Record<string, unknown>).branchId as string | undefined,
                territoryId: (inv as Record<string, unknown>).territoryId as string | undefined,
                teamId: (inv as Record<string, unknown>).teamId as string | undefined,
                tenantId: (inv as Record<string, unknown>).tenantId as string | undefined,
              }) &&
              (!inv.accountId && !inv.customerId ? true : visibleAccountIds.has(String(inv.accountId || inv.customerId)))
          )
        : [],
    [state.invoices, canViewFinance, rbac, visibleAccountIds]
  );

  // سری واقعی ماهانه از فاکتورهای معتبر در بازه ۶ یا ۱۲ ماهه
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'short' }),
    []
  );

  const monthlySeries = useMemo(() => {
    const count = period === '6M' ? 6 : 12;
    const buckets = Array.from({ length: count }, (_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - idx), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return { key, label: monthFormatter.format(d), total: 0, newAccounts: 0 };
    });
    const byKey = new Map(buckets.map(b => [b.key, b]));
    visibleInvoices.forEach(inv => {
      const dKey = String(inv.date || '').slice(0, 7);
      const bucket = byKey.get(dKey);
      const amount = Number(inv.totalAmount);
      if (bucket && Number.isFinite(amount) && amount > 0) {
        bucket.total += amount;
      }
    });
    visibleAccounts.forEach(acc => {
      const dKey = String(acc.createdAt || '').slice(0, 7);
      const bucket = byKey.get(dKey);
      if (bucket) bucket.newAccounts += 1;
    });
    return buckets;
  }, [period, visibleInvoices, visibleAccounts, monthFormatter, now]);

  const currentMonthRev = monthlySeries[monthlySeries.length - 1]?.total ?? 0;
  const prevMonthRev = monthlySeries.length >= 2 ? monthlySeries[monthlySeries.length - 2].total : 0;
  const hasRealRevenue = canViewFinance && monthlySeries.some(m => m.total > 0);
  const revDeltaPct =
    hasRealRevenue && prevMonthRev > 0
      ? Math.round(((currentMonthRev - prevMonthRev) / prevMonthRev) * 1000) / 10
      : null;

  // سهم واقعی دسته‌بندی کالاها از اقلام فاکتورهای معتبر یا پیشنهادهای مجاز
  const categoryBreakdown = useMemo(() => {
    if (!canViewFinance) return [];
    const productCategory = new Map(
      (state.externalProducts || []).map(p => [p.id, p.category || 'سایر'] as const)
    );
    const totals = new Map<string, number>();
    visibleInvoices.forEach(inv => {
      const lines = (inv as Record<string, unknown>).lines as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(lines) && lines.length > 0) {
        lines.forEach(line => {
          const cat = (line.productId ? productCategory.get(String(line.productId)) : undefined) || 'فروش عمومی';
          const amt = Number(line.lineTotal) || (Number(line.unitPrice) * Number(line.quantity)) || 0;
          if (amt > 0) totals.set(cat, (totals.get(cat) || 0) + amt);
        });
      } else if (Number(inv.totalAmount) > 0) {
        totals.set('فروش عمومی', (totals.get('فروش عمومی') || 0) + Number(inv.totalAmount));
      }
    });
    const colors = ['var(--c-primary)', 'var(--c-copper)', 'var(--c-ink-main)', 'var(--c-info)'];
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([label, value], i) => ({ label, value, color: colors[i % colors.length] }));
  }, [canViewFinance, visibleInvoices, state.externalProducts]);
  const totalCategoryValue = categoryBreakdown.reduce((s, x) => s + x.value, 0);

  // وضعیت مشتریان جدید در برابر مشتریان در آستانه ریزش (محاسبه‌شده از موتور churnPredictionService روی فاکتورهای ERP)
  const churnSummary = useMemo(() => {
    if (!visibleAccounts.length) return null;
    const scopedState = {
      ...state,
      accounts: visibleAccounts,
      invoices: visibleInvoices,
    } as AppState;
    return evaluatePortfolioChurn(scopedState, now);
  }, [state, visibleAccounts, visibleInvoices, now]);

  const W = 320;
  const H = 84;
  const maxVal = Math.max(...monthlySeries.map(p => p.total), 1);
  const pts: [number, number][] = monthlySeries.map((p, i) => [
    12 + (i / Math.max(1, monthlySeries.length - 1)) * (W - 24),
    H - 12 - (p.total / maxVal) * (H - 24)
  ]);

  const smoothPath = useMemo(() => {
    if (pts.length < 2) return '';
    let d = `M ${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
    }
    return d;
  }, [pts]);

  const lastPt = pts[pts.length - 1];
  const areaD = pts.length >= 2 ? `${smoothPath} L ${W - 12},${H} L 12,${H} Z` : '';
  const maxNewAcc = Math.max(...monthlySeries.slice(-6).map(b => b.newAccounts), 1);

  return (
    <div className="crm-page w-full space-y-3.5 px-2 pt-1 pb-[calc(5rem+env(safe-area-inset-bottom))] font-sans animate-in fade-in slide-in-from-bottom-1 duration-300" dir="rtl">
      {/* نوار حکم ۸ ثانیه‌ای */}
      <VerdictStrip
        verdict={overdueTasks.length ? `${fa(overdueTasks.length)} اقدام دارای دیرکرد نیازمند رسیدگی فوری است` : `عملیات روز جاری در مسیر برنامه تعیین‌شده قرار دارد`}
        magnitude={overdueTasks.length ? `${fa(overdueTasks.length)} مورد معوق` : `پایداری کامل`}
        tone={overdueTasks.length ? 'warning' : 'success'}
        actionLabel="بررسی وظایف"
        onAction={() => navigate('/tasks')}
      />

      <IntentSurface state={state} maxItems={3} />
      <DemoTrustBanner state={state} surface="decision" />
      <FollowUpInbox state={state} maxItems={4} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <MyWorkPanel state={state} maxItems={5} />
        <DecisionBriefPanel state={state} maxItems={3} />
      </div>

      {/* کارت قهرمان فروش ماهانه — فقط از فاکتورهای واقعی مجاز */}
      <section
        id="home-hero"
        data-tour-primary
        className="relative overflow-hidden rounded-lg p-4 text-white transition-all duration-300"
        style={{
          background: 'linear-gradient(160deg, var(--brand) 0%, var(--brand-strong) 100%)',
          boxShadow: '0 8px 24px color-mix(in srgb, var(--brand) 25%, transparent)',
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-label font-medium text-white/90">
            فروش ماه جاری (فاکتورهای معتبر)
          </span>

          <div className="inline-flex p-0.5 rounded-full bg-white/20 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setPeriod('6M')}
              className={cn(
                'px-2.5 py-0.5 rounded-full text-mini font-bold transition-all cursor-pointer',
                period === '6M' ? 'bg-white text-emerald-950 shadow-xs' : 'text-white/80 hover:text-white'
              )}
            >
              ۶ ماه
            </button>
            <button
              type="button"
              onClick={() => setPeriod('12M')}
              className={cn(
                'px-2.5 py-0.5 rounded-full text-mini font-bold transition-all cursor-pointer',
                period === '12M' ? 'bg-white text-emerald-950 shadow-xs' : 'text-white/80 hover:text-white'
              )}
            >
              ۱۲ ماه
            </button>
          </div>
        </div>

        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="text-kpi-lg font-bold tracking-tight leading-none tabular-nums">
            {!canViewFinance ? 'دسترسی محدود' : hasRealRevenue ? `${formatMoneyCompact(currentMonthRev)}` : 'بدون فاکتور'}
          </span>
          {revDeltaPct !== null && (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-mini font-bold bg-white/20 text-white">
              <ArrowUpRight size={11} />
              <span>{revDeltaPct >= 0 ? `+ ${fa(revDeltaPct)}` : fa(revDeltaPct)}٪</span>
            </span>
          )}
        </div>

        {hasRealRevenue ? (
          <div className="relative mt-2.5 h-(--size-84) w-full">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="homeHeroGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="white" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="white" stopOpacity="0" />
                </linearGradient>
              </defs>

              <line x1="12" y1={H * 0.35} x2={W - 12} y2={H * 0.35} stroke="white" strokeOpacity="0.12" strokeDasharray="3 4" strokeWidth="0.5" />
              <line x1="12" y1={H * 0.7} x2={W - 12} y2={H * 0.7} stroke="white" strokeOpacity="0.12" strokeDasharray="3 4" strokeWidth="0.5" />

              <path d={areaD} fill="url(#homeHeroGradient)" />
              <path d={smoothPath} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />

              {lastPt && (
                <>
                  <circle cx={lastPt[0]} cy={lastPt[1]} r="6" fill="white" fillOpacity="0.25" />
                  <circle cx={lastPt[0]} cy={lastPt[1]} r="3" fill="white" />
                </>
              )}
            </svg>

            <div className="flex justify-between items-center text-micro text-white/70 px-1 mt-0.5 font-mono">
              <span>{monthlySeries[0]?.label}</span>
              <span>{monthlySeries[monthlySeries.length - 1]?.label}</span>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-caption text-white/80">
            {canViewFinance ? 'هنوز فاکتور معتبری در این بازه برای رسم نمودار ثبت نشده است.' : 'برای مشاهده فروش ماهانه به مجوز مشاهده مالی نیاز است.'}
          </p>
        )}
      </section>

      {/* دو کارت هم‌ردیف: سهم واقعی دسته‌بندی فروش + جذب در برابر ریسک ریزش */}
      <div id="home-portfolio" className="grid grid-cols-2 gap-2.5">
        <article className="rounded-lg bg-surface p-3.5 border border-border flex flex-col justify-between min-h-(--size-165)">
          <div>
            <span className="text-caption font-medium text-text-secondary block">
              سهم سبد فروش
            </span>
            <div className="text-lead font-bold text-text-main tabular-nums mt-0.5 leading-none">
              {totalCategoryValue > 0 ? formatMoneyCompact(totalCategoryValue) : 'نامشخص'}
            </div>
          </div>

          {categoryBreakdown.length > 0 ? (
            <>
              <div className="py-1.5 flex justify-center">
                <DonutChart
                  size={76}
                  thickness={8}
                  centerValue={visibleInvoices.length}
                  centerLabel="فاکتور"
                  showLegend={false}
                  segments={categoryBreakdown}
                />
              </div>

              <div className="space-y-1 pt-1 border-t border-border/60 text-micro">
                {categoryBreakdown.slice(0, 2).map(seg => (
                  <div key={seg.label} className="flex items-center justify-between gap-1">
                    <span className="flex items-center gap-1.5 text-text-secondary truncate">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: seg.color }} />
                      <span className="truncate">{seg.label}</span>
                    </span>
                    <span className="font-bold text-text-main tabular-nums shrink-0">
                      {fa(Math.round((seg.value / totalCategoryValue) * 100))}٪
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="py-4 text-center text-micro text-text-secondary">
              داده سبد فروش برای نمایش وجود ندارد.
            </div>
          )}
        </article>

        <article className="rounded-lg bg-surface p-3.5 border border-border flex flex-col justify-between min-h-(--size-165)">
          <div>
            <span className="text-caption font-medium text-text-secondary block">
              جذب و ریسک ریزش
            </span>
            <div className="text-lead font-bold text-text-main tabular-nums mt-0.5 leading-none">
              {fa(visibleAccounts.length)} <span className="text-tiny font-normal text-text-secondary">مشتری</span>
            </div>
          </div>

          {visibleAccounts.length > 0 ? (
            <>
              <div className="h-(--size-68) flex items-end justify-between gap-1 pt-1.5">
                {monthlySeries.slice(-6).map((b, idx) => (
                  <div key={b.key || idx} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end">
                    <div className="w-full flex items-end justify-center gap-0.5 h-(--size-50)">
                      <div
                        className="w-2 rounded-full transition-all duration-300"
                        style={{
                          height: `${b.newAccounts > 0 ? Math.max(15, (b.newAccounts / maxNewAcc) * 100) : 4}%`,
                          background: b.newAccounts > 0 ? 'var(--c-primary)' : 'var(--c-border)',
                        }}
                        title={`${b.label}: ${fa(b.newAccounts)} مشتری جدید`}
                      />
                    </div>
                    <span className="text-atom text-text-secondary font-mono">{b.label.slice(0, 3)}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-border/60 text-micro">
                <span className="flex items-center gap-1 text-text-secondary">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <span>جدید: {fa(monthlySeries.slice(-6).reduce((s, b) => s + b.newAccounts, 0))}</span>
                </span>
                <span className="flex items-center gap-1 text-text-secondary">
                  <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                  <span>در معرض ریسک: {fa(churnSummary?.atRiskAccounts.length || 0)}</span>
                </span>
              </div>
            </>
          ) : (
            <div className="py-4 text-center text-micro text-text-secondary">
              مشتری فعالی در محدوده شما نیست.
            </div>
          )}
        </article>
      </div>

      {/* فهرست اقدامات و اولویت‌های امروز */}
      <section id="home-actions" className="rounded-lg bg-surface p-3.5 border border-border">
        <div className="flex items-center justify-between pb-2.5 border-b border-border/60">
          <div>
            <h2 data-tour-heading className="text-xs font-bold text-text-main">اقدامات و پیگیری‌های امروز</h2>
            <span className="text-mini text-text-secondary">
              {myTasks.length ? `${fa(myTasks.length)} وظیفه در جریان` : 'کارتابل شما مرتب است'}
            </span>
          </div>
          <Button variant="link" size="inline" type="button" onClick={() => navigate('/tasks')}>
            <span>مشاهده همه</span>
            <ChevronLeft size={13} />
          </Button>
        </div>

        <div className="divide-y divide-border/50">
          {overdueTasks.slice(0, 3).map(task => (
            <div
              key={task.id}
              onClick={() => navigate('/tasks')}
              className="py-2 flex items-center justify-between gap-2.5 cursor-pointer hover:bg-canvas/60 rounded-lg px-1 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-full bg-danger-soft text-danger flex items-center justify-center shrink-0 border border-danger-border">
                  <AlertTriangle size={13} />
                </span>
                <div className="min-w-0">
                  <strong className="block text-xs font-medium text-text-main truncate">
                    {task.title}
                  </strong>
                  <span className="text-micro text-danger font-medium">مهلت گذشته · نیاز به اقدام فوری</span>
                </div>
              </div>
              <span className="text-micro font-mono text-text-secondary shrink-0">{task.dueDate}</span>
            </div>
          ))}

          {todayActivities.slice(0, 2).map(act => (
            <div
              key={act.id}
              onClick={() => navigate('/calendar')}
              className="py-2 flex items-center justify-between gap-2.5 cursor-pointer hover:bg-canvas/60 rounded-lg px-1 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-full bg-primary-soft text-primary flex items-center justify-center shrink-0 border border-primary/20">
                  <Clock size={13} />
                </span>
                <div className="min-w-0">
                  <strong className="block text-xs font-medium text-text-main truncate">
                    {act.title}
                  </strong>
                  <span className="text-micro text-text-secondary">جلسه / پیگیری مشتری</span>
                </div>
              </div>
              <span className="text-micro font-mono text-text-secondary shrink-0">
                {new Date(act.dateTime).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}

          {overdueTasks.length === 0 && todayActivities.length === 0 && (
            <EmptyState surface="home_workspace"
              compact
              title="اقدام معوق یا جلسهٔ فوری برای امروز نیست"
              description="وظایف و فعالیت‌های جدید پس از ثبت اینجا نمایش داده می‌شوند."
            />
          )}
        </div>
      </section>
    </div>
  );
}
