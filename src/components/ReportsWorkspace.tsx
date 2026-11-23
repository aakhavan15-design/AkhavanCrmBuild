import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppState, NavigationTab } from '../types';
import { useCan } from '../hooks/useCan';
import { portFromAppState, readReportCollections } from '../lib/dataPorts';
import { resolveDataSourceStatus, DATA_SOURCE_STATUS_LABELS, sourceStatusNote } from '../lib/dataTrust';
import { ReportsHub } from './ReportsHub';
// Load the large analytical engine only for explicit analytical routes; the
// ordinary ReportsHub stays small and works independently of this chunk.
const ReportEnginePanels = React.lazy(() =>
  import('./ReportEnginePanels').then(module => ({ default: module.ReportEnginePanels }))
);
import { getStateSyncEngine, isSqlProviderActive } from '../services/stateSyncRuntime';

interface ReportScopeSource {
  accountId?: string;
  customerId?: string;
  ownerId?: string;
  createdBy?: string;
  requestedBy?: string;
  assigneeId?: string;
  userId?: string;
  visitorId?: string;
  branchId?: string;
  territoryId?: string;
  teamId?: string;
  tenantId?: string;
}
interface ReportExpense extends ReportScopeSource {
  id?: string;
  deletedAt?: string | null;
  isDeleted?: boolean;
  amount?: number | string;
  status?: string;
  [key: string]: unknown;
}

interface ReportsWorkspaceProps {
  state: AppState;
  updateState: (updater: (draft: AppState) => AppState | void) => void;
  setActiveTab: (tab: NavigationTab) => void;
}

export function ReportsWorkspace({ state, updateState, setActiveTab }: ReportsWorkspaceProps) {
  const { canOn, can, rbac } = useCan(state);
  const [reportParams] = useSearchParams();
  const analyticalView = reportParams.get('view') === 'analytical';
  // The same DataPort used by analytics; the UI receives only permission-scoped collections.
  const reportPort = useMemo(() => portFromAppState(state as unknown as Record<string, unknown>), [state]);
  const reportCols = useMemo(() => readReportCollections(reportPort), [reportPort]);
  const portAccounts = (reportCols.accounts || []) as NonNullable<AppState['accounts']>;
  const portQuotes = (reportCols.quotes || []) as NonNullable<AppState['quotes']>;
  const portInvoices = (reportCols.invoices || []) as NonNullable<AppState['invoices']>;
  const portPayments = (reportCols.payments || []) as NonNullable<AppState['payments']>;
  const portCheques = (reportCols.cheques || []) as NonNullable<AppState['cheques']>;
  const portExpenses = (reportCols.expenses || []) as ReportExpense[];
  const portUsers = (reportCols.users || []) as NonNullable<AppState['users']>;
  const portTasks = (reportCols.tasks || []) as NonNullable<AppState['tasks']>;

  const scopeOf = (record: ReportScopeSource) => {
    const accountId = record.accountId || record.customerId;
    const account = portAccounts.find(item => item.id === accountId);
    const owner = portUsers.find(user => user.id === (record.ownerId || record.createdBy || record.requestedBy || record.assigneeId || record.userId || record.visitorId || account?.ownerId));
    return {
      ownerId: record.ownerId || record.createdBy || record.assigneeId || record.userId || record.visitorId || account?.ownerId || owner?.id,
      branchId: record.branchId || account?.branchId || owner?.branchId,
      territoryId: record.territoryId || account?.territoryId || owner?.territoryId,
      teamId: record.teamId || account?.teamId || owner?.teamId,
      tenantId: record.tenantId || account?.tenantId || owner?.tenantId,
    };
  };

  const visibleAccounts = useMemo(() => portAccounts.filter(row => canOn('accounts', 'VIEW', scopeOf(row))), [portAccounts, portUsers, canOn]);
  const receivableAccounts = visibleAccounts.filter(row => canOn('finance', 'VIEW', scopeOf(row)));
  const visibleQuotes = useMemo(() => portQuotes.filter(row => canOn('quotes', 'VIEW', scopeOf(row))), [portQuotes, portAccounts, portUsers, canOn]);
  const visibleInvoices = useMemo(() => portInvoices.filter(row => canOn('finance', 'VIEW', scopeOf(row))), [portInvoices, portAccounts, portUsers, canOn]);
  const visiblePayments = useMemo(() => portPayments.filter(row => canOn('payments', 'VIEW', scopeOf(row))), [portPayments, portAccounts, portUsers, canOn]);
  const visibleCheques = useMemo(() => portCheques.filter(row => canOn('finance', 'VIEW', scopeOf(row))), [portCheques, portAccounts, portUsers, canOn]);
  const visibleExpenses = useMemo(() => portExpenses.filter(row => !row.deletedAt && !row.isDeleted && canOn('finance', 'VIEW', scopeOf(row))), [portExpenses, portAccounts, portUsers, canOn]);
  const visibleActivities = useMemo(() => (state.activities || []).filter(row => canOn('activities', 'VIEW', scopeOf(row))), [state.activities, portAccounts, portUsers, canOn]);
  const visibleTasks = useMemo(() => portTasks.filter(row => canOn('tasks', 'VIEW', scopeOf(row))), [portTasks, portAccounts, portUsers, canOn]);

  const reportHubState = useMemo(() => {
    const ownerIds = new Set<string>([
      ...visibleInvoices.map(row => { const source = row as typeof row & ReportScopeSource; return source.ownerId || source.createdBy || ''; }),
      ...visibleQuotes.map(row => row.ownerId || ''),
      ...visibleActivities.map(row => row.ownerId || ''),
      ...visibleTasks.map(row => row.assigneeId || ''),
      state.currentUserId || '',
    ].filter(Boolean));
    const visibleInvoiceIds = new Set(visibleInvoices.map(row => row.id));
    const visiblePaymentIds = new Set(visiblePayments.map(row => row.id));
    const canViewInventory = can('quotes', 'VIEW');
    const canViewOperations = can('internal', 'VIEW') || can('finance', 'VIEW');
    const canViewFinance = can('finance', 'VIEW');
    return {
      ...state,
      accounts: visibleAccounts,
      invoices: visibleInvoices,
      payments: visiblePayments,
      cheques: visibleCheques,
      expenses: visibleExpenses,
      quotes: visibleQuotes,
      activities: visibleActivities,
      tasks: visibleTasks,
      users: portUsers.filter(user => ownerIds.has(user.id)),
      journalLines: canViewFinance ? (reportCols.journalLines || []).filter(row => canOn('finance', 'VIEW', scopeOf(row as ReportScopeSource))) : [],
      coaMirror: canViewFinance ? ((reportCols.coaMirror || []) as NonNullable<AppState['coaMirror']>).filter(row => canOn('finance','VIEW',scopeOf(row))) : [],
      externalProducts: canViewInventory ? (reportCols.externalProducts || []) as NonNullable<AppState['externalProducts']> : [],
      salesOrders: canViewOperations ? (state.salesOrders || []).filter(row => canOn('quotes', 'VIEW', scopeOf(row as ReportScopeSource)) || canOn('finance', 'VIEW', scopeOf(row as ReportScopeSource))) : [],
      visits: (state.visits || []).filter(row => canOn('activities', 'VIEW', scopeOf(row as ReportScopeSource))),
      deliveryEvents: canViewOperations ? (state.deliveryEvents || []).filter(row => canOn('finance', 'VIEW', scopeOf(row as ReportScopeSource)) || canOn('activities', 'VIEW', scopeOf(row as ReportScopeSource))) : [],
      salesReturns: canViewFinance ? (state.salesReturns || []).filter(row => canOn('finance', 'VIEW', scopeOf(row as ReportScopeSource))) : [],
      paymentAllocations: (reportCols.paymentAllocations || []).filter(row => { const allocation = row as { invoiceId?: string; paymentId?: string }; return visibleInvoiceIds.has(allocation.invoiceId || '') && visiblePaymentIds.has(allocation.paymentId || ''); }),
      salesTargets: (state.salesTargets || []).filter(row => canOn('reports', 'VIEW', scopeOf(row))),
      // Advanced reports run on the same permission-scoped facts as the regular hub.
      // Do not leak out-of-scope geometry or customer-to-zone relationships.
      geoZones: can('geo', 'VIEW')
        ? (state.geoZones || []).filter(row => canOn('geo', 'VIEW', scopeOf(row as ReportScopeSource)))
        : [],
      zoneAssignments: can('geo', 'VIEW')
        ? (state.zoneAssignments || []).filter(row => {
            const assignment = row as ReportScopeSource & { accountId?: string; customerId?: string };
            const accountId = assignment.accountId || assignment.customerId;
            return !!accountId && visibleAccounts.some(a => a.id === accountId)
              && canOn('geo', 'VIEW', scopeOf(assignment));
          })
        : [],
    } as AppState;
  }, [state, visibleAccounts, visibleInvoices, visiblePayments, visibleCheques, visibleExpenses, visibleQuotes, visibleActivities, visibleTasks, portUsers, reportCols, can, canOn]);

  // The configured provider alone does not prove a successful SQL hydration.
  // Only a confirmed synchronized snapshot can be advertised as live.
  const engine = getStateSyncEngine();
  const sync = engine?.getStatus();
  const sqlSnapshotReady = isSqlProviderActive() && engine?.hasSnapshot() === true
    && !!sync?.lastSyncedAt && sync.phase !== 'error';
  const sourceStatus = resolveDataSourceStatus(state, {
    hasLiveSql: sqlSnapshotReady,
    hasLiveErp: false, // SQL hydration is not evidence of direct ERP freshness.
    stale: isSqlProviderActive() && sync?.phase === 'error' && !!sync.lastSyncedAt,
    partial: isSqlProviderActive() && !sqlSnapshotReady,
    requiredSourcesPresent: visibleInvoices.length > 0 || ((reportHubState.journalLines as unknown[] | undefined)?.length || 0) > 0,
  });

  return (
    <main className="crm-page crm-page-reports mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-3 px-2 py-2 pb-24 sm:px-4 sm:py-3" dir="rtl" aria-label="مرکز گزارشات و هوش تجاری" data-tour-heading>
      <div className="rounded-xl border border-border bg-surface px-3 py-2 text-caption text-text-secondary" role="status">
        <span className="font-semibold text-text-main">وضعیت منبع: {DATA_SOURCE_STATUS_LABELS[sourceStatus]}</span>
        <span className="ms-2">{sourceStatusNote(sourceStatus)}</span>
      </div>
      {can('geo','VIEW') && <Link to="/geo-intelligence?mode=operations" className="inline-flex min-h-11 items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-sm font-bold text-primary">
        <span>گزارش هوشمند ویزیت، اولویت مشتریان و عملکرد تور ERP</span>
        <span aria-hidden="true">←</span>
      </Link>}
      <nav aria-label="نمای گزارش‌ها" className="flex items-center gap-2 rounded-xl border border-border bg-surface p-1">
        <Link to="/reports?tab=sales" aria-current={!analyticalView ? 'page' : undefined}
          className={`min-h-10 flex-1 rounded-lg px-3 py-2 text-center text-xs font-bold ${!analyticalView ? 'bg-primary text-on-primary' : 'text-text-secondary hover:bg-canvas'}`}>
          گزارش‌های موضوعی
        </Link>
        <Link to="/reports?view=analytical" aria-current={analyticalView ? 'page' : undefined}
          className={`min-h-10 flex-1 rounded-lg px-3 py-2 text-center text-xs font-bold ${analyticalView ? 'bg-primary text-on-primary' : 'text-text-secondary hover:bg-canvas'}`}>
          تحلیل‌های عمیق و بینش‌ها
        </Link>
      </nav>
      {analyticalView ? (
        <React.Suspense fallback={<section role="status" className="rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">در حال بارگذاری گزارش تحلیلی…</section>}>
        <ReportEnginePanels
          state={reportHubState}
          visibleInvoices={visibleInvoices}
          visiblePayments={visiblePayments}
          visibleCheques={visibleCheques}
          visibleExpenses={visibleExpenses}
          visibleAccounts={visibleAccounts}
        />
        </React.Suspense>
      ) : (
        <ReportsHub
          canViewChurn={can('accounts','VIEW') && can('quotes','VIEW')}
          canCreateFollowUp={can('tasks','CREATE')}
          state={reportHubState}
          updateState={updateState}
          setActiveTab={setActiveTab}
          canViewFinance={can('finance', 'VIEW')}
          canViewPayments={can('payments', 'VIEW')}
          canOpenJournalCoverage={rbac.hasPermission('finance.view') && rbac.canSeeRecord()}
          canFollowUpJournalCoverage={can('finance','EDIT') && can('tasks','CREATE')}
          receivableAccounts={receivableAccounts}
        />
      )}
    </main>
  );
}
