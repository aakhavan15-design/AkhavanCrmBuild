import { ChartCard } from './charts/ChartCard';
import { WorkspaceViewSwitcher } from './shared/WorkspaceViewSwitcher';
import React, { useMemo, useState } from 'react';
import { DemoTrustBanner } from './shared/DemoTrustBanner';
import { useTabParam } from '../hooks/useTabParam';
import { OPERATIONS_AREAS, areaOf } from '../lib/workspaceHierarchy';
import { generateSecureId } from '../lib/secureId';
import { 
  ArrowLeftRight, Boxes, ClipboardCheck, 
  Gauge, Package, Plus, ShieldCheck, ShoppingCart, 
  Truck, Wallet, CheckSquare, Sparkles, Layers, AlertCircle
} from 'lucide-react';
import { Card } from './ui/Card';
import { calculateProfitability, buildOperationsMetrics, analyzeReturns } from '../lib/operationsEngine';
import { DispatchIntelligenceReports } from './dispatch/DispatchIntelligenceReports';
import { guard, requireActiveUser, useCan } from '../hooks/useCan';
import { InventoryTab, PurchasingTab, CreditTab, OperationsReportsTab } from './OperationsSupplementalTabs';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { formatRialOrUnknown, formatCurrency } from '../lib/utils';
import { formatMoneyCompact, formatCount, formatNumber } from '../lib/format';
import { getPersianStatusLabel } from '../lib/labels';
import { VerdictStrip } from './shared/VerdictStrip';
import { DonutChart } from './charts/DonutChart';
import { LineChart } from './charts/LineChart';
import { useNavigate } from 'react-router-dom';
import { isNegotiableErpOrder } from '../lib/phase2Flow';
import { getActiveDataProvider } from '../services/dataProvider';
import { PurchaseProductHints } from './reports/PurchaseCycleFollowUp';
import type { AppState } from '../types';

interface Props { state: AppState; updateState: (updater: (draft: AppState) => void | Partial<AppState>) => void }
type Tab = 'overview' | 'orders' | 'dispatch' | 'returns' | 'policies' | 'inventory' | 'purchasing' | 'credit' | 'profitability' | 'reports' | 'reconciliation';
const TABS: Array<{id: Tab; label: string; icon: React.ElementType}> = [
  { id: 'overview', label: 'نمای کلی', icon: Gauge }, { id: 'orders', label: 'سفارش‌ها', icon: Package },
  { id: 'dispatch', label: 'پخش و ناوگان', icon: Truck } /* وضعیت‌های آزمایشی پخش فقط با برچسب آزمایشی */, { id: 'returns', label: 'برگشتی‌ها', icon: ArrowLeftRight },
  { id: 'policies', label: 'قوانین تجاری', icon: ShieldCheck }, { id: 'inventory', label: 'کالا و موجودی', icon: Boxes },
  { id: 'purchasing', label: 'خرید و تأمین', icon: ShoppingCart }, { id: 'credit', label: 'اعتبار مشتری', icon: ShieldCheck },
  { id: 'profitability', label: 'سودآوری', icon: Wallet }, { id: 'reports', label: 'گزارشات', icon: Gauge },
  { id: 'reconciliation', label: 'مغایرت‌ها', icon: ClipboardCheck },
];
const money = formatRialOrUnknown;
const nextId = (prefix: string) => generateSecureId(prefix);

export function OperationsControlWorkspace({ state, updateState }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [dispatchName, setDispatchName] = useState('');
  const [vehicleCapacity, setVehicleCapacity] = useState('');
  const [distributionOutputNumber, setDistributionOutputNumber] = useState('');

  const { can, canOn } = useCan(state, updateState);
  const scopeOf = (record: Record<string, unknown>) => ({ ownerId: record?.ownerId || record?.createdBy, branchId: record?.branchId, territoryId: record?.territoryId, teamId: record?.teamId, tenantId: record?.tenantId });
  const customersAll: Array<Record<string, unknown>> = state.accounts || state.customers || [];
  const customers: Array<Record<string, unknown>> = customersAll.filter(c => {
    const scope = scopeOf(c);
    return can('accounts', 'VIEW') ? canOn('accounts', 'VIEW', scope) : canOn('finance', 'VIEW', scope);
  });
  const ordersAll: Array<Record<string, unknown>> = state.salesOrders || [];
  const orders: Array<Record<string, unknown>> = ordersAll.filter(o => {
    const scope = scopeOf(o);
    return can('quotes', 'VIEW') ? canOn('quotes', 'VIEW', scope) : canOn('finance', 'VIEW', scope);
  });
  const dispatchPlansAll: Array<Record<string, unknown>> = state.dispatchPlans || []; // برنامه‌های آزمایشی پخش باید برچسب «آزمایشی» داشته باشند
  const dispatchPlans: Array<Record<string, unknown>> = dispatchPlansAll.filter(p => {
    const scope = scopeOf(p);
    return can('internal', 'VIEW') ? canOn('internal', 'VIEW', scope) : canOn('finance', 'VIEW', scope);
  });
  const returnsAll: Array<Record<string, unknown>> = state.salesReturns || [];
  const returns: Array<Record<string, unknown>> = can('finance', 'VIEW') ? returnsAll.filter(r => {
    const customer = customersAll.find(c => c.id === (r.customerId || ordersAll.find(o => o.id === r.orderId)?.customerId));
    return Boolean(customer && canOn('finance', 'VIEW', scopeOf(customer)));
  }) : [];
  const casesAll: Array<Record<string, unknown>> = state.reconciliationCases || [];
  const cases: Array<Record<string, unknown>> = casesAll.filter(c => {
    const relatedReturn = returnsAll.find(r => r.id === c.relatedEntityId);
    const relatedOrder = ordersAll.find(o => o.id === c.relatedEntityId);
    const linkedCustId = c.accountId || c.customerId || relatedReturn?.customerId || relatedOrder?.customerId;
    const customer = customersAll.find(item => item.id === linkedCustId);
    const scope = customer ? scopeOf(customer) : scopeOf(c);
    return Boolean((canOn('cases', 'VIEW', scope) || canOn('finance', 'VIEW', scope)) && (customer || c.assignedTo === state.currentUserId));
  });
  const invoicesAll: Array<Record<string, unknown>> = state.invoices || [];
  const invoices: Array<Record<string, unknown>> = can('finance', 'VIEW') ? invoicesAll.filter(i => {
    const customer = customersAll.find(c => c.id === (i.customerId || i.accountId));
    return Boolean(customer && canOn('finance', 'VIEW', scopeOf(customer)));
  }) : [];
  const payments: Array<Record<string, unknown>> = can('finance', 'VIEW') ? (state.payments || []).filter(p => {
    const customer = customersAll.find(c => c.id === (p.customerId || p.accountId));
    return Boolean(customer && canOn('finance', 'VIEW', scopeOf(customer)));
  }) : [];
  const expenses: Array<Record<string, unknown>> = can('finance', 'VIEW') ? (state.expenses || []).filter(e => canOn('finance', 'VIEW', scopeOf(e))) : [];
  const currentUser = state.users?.find((u: Record<string, unknown>) => u.id === state.currentUserId);
  const visibleTabs = TABS.filter(t => {
    if (t.id === 'policies') return can('settings', 'VIEW');
    if (t.id === 'purchasing') return can('internal', 'EDIT');
    if (t.id === 'credit' || t.id === 'returns') return can('finance', 'VIEW');
    if (t.id === 'dispatch') return can('internal', 'VIEW');
    if (t.id === 'inventory' || t.id === 'orders') return can('quotes', 'VIEW') || can('finance', 'VIEW');
    if (t.id === 'profitability') return can('finance', 'VIEW') || can('internal', 'VIEW');
    if (t.id === 'reports') return can('reports', 'VIEW');
    if (t.id === 'reconciliation') return can('cases', 'VIEW') || can('finance', 'VIEW');
    return true;
  });

  const [tab, setTab] = useTabParam<Tab>(visibleTabs.map(t => t.id), 'overview');
  const activeArea = areaOf(OPERATIONS_AREAS, tab);
  const visibleAreas = OPERATIONS_AREAS.map(area => ({ ...area,
    views: area.views.filter(view => visibleTabs.some(tab => tab.id === view.id)),
  })).filter(area => area.views.length > 0);
  const isDistributionArea = activeArea.id === 'distribution';
  const totalOrderValue = orders.filter(o => o.status !== 'CANCELLED').reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
  const totalReturns = returns.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const activeOrders = orders.filter(o => o.status !== 'CANCELLED');
  const costCoverage = activeOrders.length ? activeOrders.filter(o => o.costKnown === true).length / activeOrders.length : 0;
  const openCases = cases.filter(c => c.status !== 'RESOLVED').length;
  const activeDispatch = dispatchPlans.filter(p => !['DELIVERED','CANCELLED'].includes(p.status)).length;

  const [createdTaskNotice, setCreatedTaskNotice] = useState<string | null>(null);

  const handleCreateInsightTask = (title: string, description: string) => {
    if (!guard(state, updateState, 'tasks', 'CREATE', 'ایجاد وظیفه') || !requireActiveUser(state, updateState, 'ایجاد وظیفه')) return;
    const newTask = {
      id: nextId('tsk'),
      title,
      description,
      dueDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
      status: 'OPEN',
      priority: 'HIGH',
      ownerId: currentUser?.id || state.currentUserId,
      assigneeType: 'USER',
      assigneeId: currentUser?.id || state.currentUserId,
      createdAt: new Date().toISOString()
    };
    updateState(draft => {
      draft.tasks = [newTask, ...(draft.tasks || [])];
      if (!draft.auditLogs) draft.auditLogs = [];
      draft.auditLogs.push({
        id: nextId('log'),
        action: 'TASK_CREATED',
        entityType: 'TASK',
        entityId: newTask.id,
        details: `وظیفه تحلیلی "${title}" از گزارش سودآوری/عملیات ایجاد شد`,
        actor: currentUser?.name || 'مدیر سیستم',
        createdAt: new Date().toISOString()
      });
    });
    setCreatedTaskNotice(`وظیفه «${title}» با موفقیت در سامانه ایجاد شد.`);
    setTimeout(() => setCreatedTaskNotice(null), 4000);
  };

  const profitability = useMemo(() => {
    return calculateProfitability({
      invoices,
      returns,
      payments,
      dispatchPlans,
      expenses
    });
  }, [invoices, returns, payments, dispatchPlans, expenses]);

  const returnsAnalysis = useMemo(() => {
    return analyzeReturns(returns);
  }, [returns]);

  const costBreakdownSegments = useMemo(() => {
    const dispatch = Math.max(0, profitability.knownDispatchCosts || 0);
    const operatingExp = Math.max(0, profitability.knownExpenses || 0);
    return [
      { label: 'هزینه پخش ثبت‌شده', value: dispatch, color: 'var(--c-chart-1)' },
      { label: 'هزینه‌های پرداخت‌شده', value: operatingExp, color: 'var(--c-chart-2)' }
    ].filter(segment => segment.value > 0);
  }, [profitability]);

  const returnCausesSegments = useMemo(() => {
    const labelsMap: Record<string, { label: string; color: string }> = {
      'CUSTOMER_REJECTED': { label: 'انصراف یا رد مشتری', color: 'var(--c-chart-1)' },
      'DAMAGED_LOGISTICS': { label: 'آسیب حمل و ناوگان', color: 'var(--c-chart-2)' },
      'EXPIRED_SHELF_LIFE': { label: 'انقضای تاریخ مصرف', color: 'var(--c-chart-3)' },
      'INCORRECT_ORDER': { label: 'مغایرت در سفارش', color: 'var(--c-chart-4)' },
      'UNKNOWN': { label: 'سایر موارد', color: 'var(--c-chart-5)' }
    };

    return returnsAnalysis.map(item => {
      const meta = labelsMap[item.reasonCode] || labelsMap.UNKNOWN;
      return {
        label: meta.label,
        value: item.count,
        color: meta.color
      };
    });
  }, [returnsAnalysis]);

  const returnsByProduct = useMemo(() => {
    const map = new Map<string, { name: string; amount: number; count: number }>();
    returns.forEach(r => {
      const order = orders.find(o => o.id === r.orderId);
      const prodName = r.productName || (order?.lines as any)?.[0]?.productName || 'محصولات عمومی';
      const existing = map.get(prodName) || { name: prodName, amount: 0, count: 0 };
      existing.amount += Number(r.amount || 0);
      existing.count += Number(r.quantity || 1);
      map.set(prodName, existing);
    });
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [returns, orders]);

  const monthlyProfitTrend = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return { key, label: new Intl.DateTimeFormat('fa-IR', { month: 'short' }).format(date), revenue: 0, expenses: 0 };
    });
    const byMonth = new Map(months.map(month => [month.key, month]));
    invoices.filter(invoice => !invoice.deletedAt && !invoice.isDeleted && !invoice.isVoided && ['PAID','PARTIAL','UNPAID','OVERDUE','POSTED','CONFIRMED','FINAL','ISSUED'].includes(String(invoice.status || '').toUpperCase())).forEach(invoice => {
      const key = String(invoice.date || '').slice(0, 7);
      const bucket = byMonth.get(key);
      const amount = Number(invoice.totalAmount);
      if (bucket && Number.isFinite(amount) && amount > 0) bucket.revenue += amount;
    });
    expenses.filter(expense => expense.status === 'PAID' && !expense.deletedAt && !expense.isDeleted && !expense.isVoided).forEach(expense => {
      const key = String(expense.paidAt || expense.date || '').slice(0, 7);
      const bucket = byMonth.get(key);
      const amount = Number(expense.amount);
      if (bucket && Number.isFinite(amount) && amount > 0) bucket.expenses += amount;
    });
    return {
      months: months.map(month => month.label),
      revenueValues: months.map(month => month.revenue),
      expenseValues: months.map(month => month.expenses),
      hasRevenue: months.some(month => month.revenue > 0),
      hasExpenses: months.some(month => month.expenses > 0)
    };
  }, [invoices, expenses]);

  return (
    <div className="crm-page w-full space-y-3 px-2 py-1 pb-16 font-sans sm:px-4" dir="rtl">
      <DemoTrustBanner state={state} surface="operations" className="mx-2 mt-2" />
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5 p-3 rounded-xl border border-border bg-surface shadow-xs">
        <div>
          <div className="text-micro font-bold text-primary">عملیات فروش و زنجیره توزیع</div>
          <h1 data-tour-heading className="text-sm sm:text-base font-bold text-text-main tracking-tight">{activeArea.title}</h1>
          <p className="text-caption text-text-secondary mt-0.5">{activeArea.subtitle}</p>
        </div>
      </div>

      <WorkspaceViewSwitcher<Tab> id="ops-tabs" label="بخش عملیات" areas={visibleAreas} value={tab} onChange={setTab} />

      <VerdictStrip
        verdict={openCases > 0 ? `${formatCount(openCases)} مورد مغایرت در فرآیند توزیع نیازمند رسیدگی است` : `در داده‌های قابل مشاهده مغایرت باز ثبت نشده است`}
        magnitude={`پوشش بهای تمام‌شده: ${formatCount(Math.round(costCoverage * 100))}٪`}
        tone={openCases > 0 ? 'warning' : 'neutral'}
        actionLabel={openCases > 0 ? 'مشاهده مغایرت‌ها' : undefined}
        onAction={() => setTab('reconciliation')}
      />

      {isDistributionArea && (
        <div id="ops-summary" data-tour-primary className="grid grid-cols-2 xl:grid-cols-4 gap-2">
          <button type="button" onClick={() => setTab('orders')} className="text-start bg-surface border border-border rounded-xl p-3 hover:border-primary/40 transition-colors cursor-pointer">
            <span className="text-micro text-text-secondary font-medium">مجموع سفارشات</span>
            <div className="text-base sm:text-lg font-bold text-text-main tabular-nums mt-1" title={money(totalOrderValue)}>{formatMoneyCompact(totalOrderValue)}</div>
            <span className="text-micro text-text-secondary mt-0.5 block">{formatCount(orders.length)} فقره</span>
          </button>

          <button type="button" onClick={() => setTab('returns')} className="text-start bg-surface border border-border rounded-xl p-3 hover:border-primary/40 transition-colors cursor-pointer">
            <span className="text-micro text-text-secondary font-medium">برگشتی‌های ثبت‌شده</span>
            <div className="text-base sm:text-lg font-bold text-danger tabular-nums mt-1" title={money(totalReturns)}>{formatMoneyCompact(totalReturns)}</div>
            <span className="text-micro text-text-secondary mt-0.5 block">{formatCount(returns.length)} مورد</span>
          </button>

          <button type="button" onClick={() => setTab('dispatch')} className="text-start bg-surface border border-border rounded-xl p-3 hover:border-primary/40 transition-colors cursor-pointer">
            <span className="text-micro text-text-secondary font-medium">برنامه‌های پخش باز</span>
            <div className="text-base sm:text-lg font-bold text-text-main tabular-nums mt-1">{formatCount(activeDispatch)} مسیر</div>
            <span className="text-micro text-text-secondary mt-0.5 block">آماده / در مسیر</span>
          </button>

          <button type="button" onClick={() => setTab('reconciliation')} className="text-start bg-surface border border-border rounded-xl p-3 hover:border-primary/40 transition-colors cursor-pointer">
            <span className="text-micro text-text-secondary font-medium">مغایرت‌ها</span>
            <div className="text-base sm:text-lg font-bold text-primary tabular-nums mt-1">{formatCount(openCases)}</div>
            <span className="text-micro text-text-secondary mt-0.5 block">نیازمند رسیدگی</span>
          </button>
        </div>
      )}

      {tab==='overview' && (
        <div className="space-y-3">
          <Card padding="md" className="space-y-2 rounded-xl border border-border">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-text-main">مغایرت‌های نیازمند اقدام</span>
              <span className="text-micro text-warning font-bold">{openCases} مورد باز</span>
            </div>
            <div className="divide-y divide-border/60">
              {cases.slice(0, 4).map(c => (
                <div key={String(c.id)} className="py-2 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-text-main block">{String(c.title || '')}</span>
                    <span className="text-mini text-text-secondary block mt-0.5">{String(c.reason || '')}</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setTab('reconciliation')}>بررسی</Button>
                </div>
              ))}
              {cases.length === 0 && <p className="text-xs text-text-secondary py-3 text-center">مغایرت بازی وجود ندارد.</p>}
            </div>
          </Card>
        </div>
      )}

      {tab==='orders' && (
        <div className="space-y-2">
          {orders.map(o => {
            const account = customers.find(customer => customer.id === (o.accountId ?? o.customerId));
            const source = typeof o.sourceSystemCode === 'string' ? o.sourceSystemCode : '';
            const accountId = typeof account?.id === 'string' ? account.id : '';
            const externalId = o.externalOrderId ?? o.externalId;
            const relevant = Boolean(getActiveDataProvider().name === 'SQLSERVER_BACKEND' && can('quotes', 'VIEW') && source.trim()
              && typeof externalId === 'string' && externalId.trim() && isNegotiableErpOrder(o)
              && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(accountId));
            const existingProducts = new Set<string>(Array.isArray(o.lines) ? o.lines
              .flatMap(line => typeof line?.externalProductId === 'string' ? [line.externalProductId] : []) : []);
            return <article key={String(o.id)} className="space-y-2 rounded-xl border border-border bg-surface p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-bold font-mono text-text-main">{String(o.orderNumber || '')}</span>
                <span className="block text-mini text-text-secondary mt-0.5">{String(o.notes || 'سفارش ثبت شده')}</span>
              </div>
              <span className="font-bold font-mono text-text-main">{o.totalAmount == null || o.totalAmount === '' ? 'مبلغ نامشخص' : money(Number(o.totalAmount))}</span>
              </div>
              {relevant && <PurchaseProductHints key={`${state.currentUserId}:${accountId}:${source}`} account={accountId} source={source} excludeProductIds={existingProducts} />}
            </article>;
          })}
          {orders.length === 0 && <p className="text-xs text-text-secondary py-6 text-center">سفارشی یافت نشد.</p>}
        </div>
      )}

      {tab==='dispatch' && (
        <div className="space-y-2">
          {dispatchPlans.map(p => (
            <div key={String(p.id)} className="p-3 bg-surface border border-border rounded-xl flex justify-between items-center text-xs">
              <div>
                <span className="font-bold text-text-main">{String(p.name || p.planNumber || '')}</span>
                <span className="block text-mini text-text-secondary mt-0.5">ظرفیت: {String(p.capacityKg || '—')} kg</span>
              </div>
              <span className="font-bold text-text-main">{String(p.status || '—')}</span>
            </div>
          ))}
          {dispatchPlans.length === 0 && <p className="text-xs text-text-secondary py-6 text-center">برنامه پخشی یافت نشد.</p>}
        </div>
      )}

      {tab==='returns' && (
        <div id="ops-reconciliation" data-tour-primary className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Card padding="sm" className="bg-surface border border-border rounded-xl p-3">
              <span className="text-micro text-text-secondary font-medium">مجموع مرجوعی‌ها</span>
              <div className="text-base sm:text-lg font-bold text-danger font-mono mt-1">{money(totalReturns)}</div>
              <span className="text-micro text-text-secondary mt-0.5 block">{returns.length} فقره پرونده</span>
            </Card>

            <Card padding="sm" className="bg-surface border border-border rounded-xl p-3">
              <span className="text-micro text-text-secondary font-medium">تعداد اقلام مرجوعی</span>
              <div className="text-base sm:text-lg font-bold text-text-main font-mono mt-1">
                {returns.reduce((sum, r) => sum + Number(r.quantity || 1), 0)} عدد
              </div>
              <span className="text-micro text-text-secondary mt-0.5 block">در {orders.length} سفارش</span>
            </Card>

            <Card padding="sm" className="bg-surface border border-border rounded-xl p-3">
              <span className="text-micro text-text-secondary font-medium">نسبت مرجوعی به سفارش</span>
              <div className="text-base sm:text-lg font-bold text-warning font-mono mt-1">
                {totalOrderValue > 0 ? `${formatNumber((totalReturns / totalOrderValue) * 100, { maximumFractionDigits: 1 })}٪` : 'نامشخص'}
              </div>
              <span className="text-micro text-text-secondary mt-0.5 block">شاخص کنترلی</span>
            </Card>

            <Card padding="sm" className="bg-surface border border-border rounded-xl p-3">
              <span className="text-micro text-text-secondary font-medium">تأییدشده در سامانه مالی</span>
              <div className="text-base sm:text-lg font-bold text-primary font-mono mt-1">
                {formatCount(returns.filter(r => r.financialDocumentConfirmed === true).length)} فقره
              </div>
              <span className="text-micro text-text-secondary mt-0.5 block">تطبیق کامل حسابداری</span>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ChartCard title="علل ثبت‌شده مرجوعی کالا" periodLabel="تعداد در داده‌های قابل مشاهده"
              empty={!returnCausesSegments.some(segment => segment.value > 0)} sourceLabel="اسناد برگشتِ قابل مشاهده">
              <DonutChart size={150} thickness={16} segments={returnCausesSegments} centerLabel="تعداد برگشتی" />
            </ChartCard>

            <Card padding="md" className="space-y-3 rounded-xl border border-border bg-surface">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-text-main">مرجوعی بر اساس کالا</span>
                <span className="text-micro text-text-secondary">محصولات دارای مرجوعی</span>
              </div>
              <div className="space-y-2">
                {returnsByProduct.slice(0, 5).map((item, idx) => {
                  const maxAmt = returnsByProduct[0]?.amount || 1;
                  const pct = Math.max(4, Math.round((item.amount / maxAmt) * 100));
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-text-main">{item.name}</span>
                        <span className="font-mono text-text-secondary">{money(item.amount)}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-border/60 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-danger transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {returnsByProduct.length === 0 && (
                  <p className="text-xs text-text-secondary py-4 text-center">داده مرجوعی ثبت نشده است.</p>
                )}
              </div>
            </Card>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-text-secondary px-1">سوابق تفصیلی مرجوعی‌های ثبت‌شده</h4>
            {returns.map(r => (
              <div key={String(r.id)} className="p-3 bg-surface border border-border rounded-xl flex justify-between items-center text-xs">
                <div>
                  <span className="font-bold text-text-main">{String(r.reason || 'برگشتی')}</span>
                  <span className="block text-mini text-text-secondary mt-0.5">کد دلیل: {String(r.reasonCode || '—')} · اقلام: {String(r.quantity || 1)}</span>
                </div>
                <div className="text-left font-mono">
                  <span className="font-bold text-text-main block">{money(Number(r.amount || 0))}</span>
                  <span className="text-micro text-text-secondary">{r.financialDocumentConfirmed ? 'تأیید مالی' : 'در انتظار بررسی'}</span>
                </div>
              </div>
            ))}
            {returns.length === 0 && <p className="text-xs text-text-secondary py-6 text-center">مرجوعی ثبت نشده است.</p>}
          </div>
        </div>
      )}

      {tab==='reconciliation' && (
        <div className="space-y-3 pb-24">
          <div className="flex items-center justify-between pb-1">
            <span className="text-xs font-bold text-text-main">
              فهرست مغایرت‌های توزیع و کسری/اضافی کالا ({cases.length})
            </span>
          </div>

          {cases.map((c: Record<string, unknown>) => {
            const statusKey = String(c.status || 'OPEN').toUpperCase();
            const isOpen = statusKey === 'OPEN' || statusKey === 'IN_PROGRESS';
            const hasRefDoc = Boolean(c.referenceDocument || c.documentId || c.invoiceId || c.orderId);
            const refDocText = String(c.referenceDocument || c.documentId || c.invoiceId || c.orderId || 'فاقد سند مرجع پیوست');

            return (
              <div
                key={String(c.id)}
                className="p-3.5 bg-surface border border-border rounded-2xl space-y-2.5 shadow-xs hover:border-primary/40 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-danger shrink-0" />
                    <strong className="text-compact font-bold text-text-main">
                      {String(c.title || 'مغایرت بدون عنوان')}
                    </strong>
                    <Badge
                      variant={isOpen ? 'warning' : 'success'}
                      size="sm"
                    >
                      {getPersianStatusLabel(statusKey)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {c.amount ? (
                      <span className="font-mono font-bold text-danger">
                        مبلغ اثر مالی: {formatCurrency(Number(c.amount))} ریال
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="text-xs text-text-secondary leading-relaxed bg-canvas/60 p-2.5 rounded-xl border border-border/60">
                  <span className="font-semibold text-text-main">شرح و علت مغایرت: </span>
                  <span>{String(c.reason || c.description || 'علت مشخص نشده است.')}</span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-caption text-text-secondary border-t border-border/60">
                  <div className="flex items-center gap-2">
                    <span>سند مرجع:</span>
                    <span className={hasRefDoc ? 'font-mono text-text-main font-semibold' : 'text-danger font-medium'}>
                      {refDocText}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {c.severity && (
                      <span className="text-mini text-text-muted">
                        سطح اهمیت: <strong className="text-text-main">{c.severity === 'HIGH' ? 'بالا' : c.severity === 'CRITICAL' ? 'بحرانی' : 'عادی'}</strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {cases.length === 0 && (
            <div className="p-8 text-center text-xs text-text-secondary bg-surface rounded-2xl border border-border">
              هیچ مغایرت بازی در توزیع و پخش گزارش نشده است.
            </div>
          )}
        </div>
      )}

      {tab==='profitability' && (
        <div className="space-y-3">
          <div className="p-4 bg-surface border border-border rounded-xl text-xs space-y-1">
            <strong className="text-text-main block">تحلیل سودآوری جامع در مرکز گزارشات</strong>
            <p className="text-text-secondary leading-relaxed">برای ماتریس هیت‌مپ سودآوری محصول × زون، آبشار سود و زیان و دریل‌داون چندسطحی، از گزارش ۱ در «مرکز گزارشات» استفاده کنید.</p>
            <Button size="sm" variant="outline" onClick={() => navigate('/reports')}>رفتن به مرکز گزارشات</Button>
          </div>

          <VerdictStrip
            verdict={profitability.realizedGrossProfit == null ? 'سود تحقق‌یافته تا تطبیق فاکتور فروش، برگشتی قطعی و بهای FIFO نامشخص است.' : 'سود ناخالص تحقق‌یافته از اسناد فروش تطبیق‌یافته محاسبه شده است.'}
            magnitude={`سود ناخالص تحقق‌یافته: ${money(profitability.realizedGrossProfit)}`}
            tone="neutral"
            actionLabel={can('finance', 'VIEW') ? 'بررسی سود فاکتورها' : undefined}
            onAction={() => navigate('/finance?tab=invoices&view=margin')}
          />
          {can('tasks', 'CREATE') && can('finance', 'VIEW') && profitability.realizedGrossProfit == null && <Button size="sm" variant="outline" onClick={() => handleCreateInsightTask('تطبیق سود فاکتورهای فروش', 'بررسی فاکتور قطعی، برگشتی، آفر و شواهد بهای FIFO')}>ارجاع بررسی شواهد سود</Button>}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Card padding="sm" className="bg-surface border border-border rounded-xl p-3">
              <span className="text-micro text-text-secondary font-medium">فروش ناخالص فاکتورها</span>
              <div className="text-base sm:text-lg font-bold text-text-main font-mono mt-1">
                {money(profitability.invoiceGross)}
              </div>
              <span className="text-micro text-text-secondary mt-0.5 block">فاکتورهای قابل مشاهده</span>
            </Card>

            <Card padding="sm" className="bg-surface border border-border rounded-xl p-3">
              <span className="text-micro text-text-secondary font-medium">سود ناخالص تحقق‌یافته</span>
              <div className="text-base sm:text-lg font-bold text-primary font-mono mt-1">
                {money(profitability.realizedGrossProfit)}
              </div>
              <span className="text-micro text-text-secondary mt-0.5 block">پوشش بهای معتبر</span>
            </Card>

            <Card padding="sm" className="bg-surface border border-border rounded-xl p-3">
              <span className="text-micro text-text-secondary font-medium">حاشیه سود ناخالص تحقق‌یافته</span>
              <div className="text-base sm:text-lg font-bold text-text-main font-mono mt-1">
                {profitability.realizedGrossMarginPercent == null ? 'نامشخص' : `${Math.round(profitability.realizedGrossMarginPercent)}٪`}
              </div>
              <span className="text-micro text-text-secondary mt-0.5 block">فاکتور فروش و برگشتی قطعی با بهای FIFO</span>
            </Card>

            <Card padding="sm" className="bg-surface border border-border rounded-xl p-3">
              <span className="text-micro text-text-secondary font-medium">هزینه‌های توزیع و ناوگان</span>
              <div className="text-base sm:text-lg font-bold text-text-main font-mono mt-1">
                {money(profitability.knownDispatchCosts)}
              </div>
              <span className="text-micro text-text-secondary mt-0.5 block">{dispatchPlans.length} مسیر فعال</span>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card padding="md" className="space-y-3 rounded-xl border border-border bg-surface">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-text-main">ترکیب هزینه‌های عملیاتی ثبت‌شده</span>
                <span className="text-micro text-text-secondary">فقط هزینه‌های با مبلغ معتبر</span>
              </div>
              <div className="py-2 flex justify-center">
                {costBreakdownSegments.length ? <DonutChart
                  size={150}
                  thickness={16}
                  segments={costBreakdownSegments}
                  centerLabel="هزینه عملیاتی معلوم"
                  centerValue={money(profitability.knownDispatchCosts + profitability.knownExpenses)}
                /> : <p className="w-full rounded-xl border border-dashed border-border p-4 text-center text-xs text-text-secondary">هزینه عملیاتی دارای مبلغ معتبر ثبت نشده است.</p>}
              </div>
            </Card>

            <Card padding="md" className="space-y-3 rounded-xl border border-border bg-surface">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-text-main">سودآوری تفصیلی فاکتور فروش</span>
                <span className="text-micro text-text-secondary">شواهد FIFO</span>
              </div>
              <p className="text-caption text-text-secondary">رتبه‌بندی قطعی کالا نیازمند پوشش فاکتور، تخفیف و آفر قطعی، برگشتی و بهای تمام‌شده است. سفارش و قیمت فعلی کالا جایگزین این شواهد نمی‌شوند.</p>
              {can('finance', 'VIEW') && <Button size="sm" variant="outline" onClick={() => navigate('/finance?tab=invoices&view=margin')}>مشاهده سود و ریز بهای فاکتورها</Button>}
              {can('reports', 'VIEW') && <Button size="sm" variant="ghost" onClick={() => navigate('/reports')}>گزارش تفصیلی سودآوری</Button>}
            </Card>
          </div>

          <Card padding="md" className="space-y-3 rounded-xl border border-border bg-surface">
            <div className="flex justify-between items-center text-xs">
              <div>
                <span className="font-bold text-text-main block">روند ماهانه فاکتور و هزینه پرداخت‌شده</span>
                <span className="text-mini text-text-secondary mt-0.5 block">جمع رکوردهای قابل مشاهده؛ ماه بدون رکورد لزوماً به معنی صفر فعالیت نیست. این نمودار سود و زیان رسمی نیست.</span>
              </div>
              <span className="text-micro text-text-secondary">۱۲ ماه اخیر</span>
            </div>
            <div className="pt-2">
              {monthlyProfitTrend.hasRevenue || monthlyProfitTrend.hasExpenses ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {monthlyProfitTrend.hasRevenue && <div className="space-y-1"><span className="text-micro text-text-secondary">مبلغ ناخالص فاکتورهای معتبر قابل مشاهده</span><LineChart values={monthlyProfitTrend.revenueValues} labels={monthlyProfitTrend.months} color="var(--c-chart-1)" height={120} /></div>}
                  {monthlyProfitTrend.hasExpenses && <div className="space-y-1"><span className="text-micro text-text-secondary">هزینه‌های پرداخت‌شده</span><LineChart values={monthlyProfitTrend.expenseValues} labels={monthlyProfitTrend.months} color="var(--c-chart-3)" height={120} /></div>}
                </div>
              ) : <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-text-secondary">برای ۱۲ ماه اخیر فاکتور یا هزینه پرداخت‌شده دارای تاریخ معتبر ثبت نشده است.</p>}
            </div>
          </Card>
        </div>
      )}

      {tab==='policies' && (
        <div className="p-4 bg-surface border border-border rounded-xl text-xs space-y-2">
          <h3 className="font-bold text-text-main">قوانین تجاری و سیاست‌های کنترل</h3>
          <p className="text-text-secondary">سیاست‌های سقف اعتبار، تخفیف‌های حجمی و اعتبارسنجی</p>
        </div>
      )}

      {tab==='inventory' && <InventoryTab state={state} />}
      {tab==='purchasing' && <PurchasingTab state={state} updateState={updateState} />}
      {tab==='credit' && <CreditTab state={state} />}
      {tab==='reports' && <><OperationsReportsTab state={state} /><DispatchIntelligenceReports plans={dispatchPlans} /></>}

      {createdTaskNotice && (
        <div role="status" className="fixed inset-x-4 top-4 z-(--z-sticky) mx-auto max-w-md rounded-2xl border border-border bg-surface p-3 text-xs font-bold text-text-main shadow-lg">
          {createdTaskNotice}
        </div>
      )}
    </div>
  );
}
