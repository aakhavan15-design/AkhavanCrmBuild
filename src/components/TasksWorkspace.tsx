import { useCan } from '../hooks/useCan';
import { useDataQuery } from '../hooks/useDataProvider';
import { getActiveDataProvider } from '../services/dataProvider';
import { canCreateCrossDepartmentTask } from '../services/taskAccessEngine';
import { Select, Textarea } from './ui';
import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppState, CustomerTask, ID, Priority } from '../types';
import { processTaskCollaborationEvents } from '../lib/collaboration';
import { CheckSquare, Search, X } from 'lucide-react';
import { Modal } from './ui/Modal';
import { useDeepLinkCreate } from '../hooks/useDeepLinkCreate';
import { EmptyState } from './ui/EmptyState';
import { Button } from './ui/Button';
import { TaskCard } from './shared/TaskCard';
import { AttachmentManager } from './ui/AttachmentManager';
import { generateId, formatAppDate } from '../lib/utils';
import { getPersianStatusLabel } from '../lib/labels';
import { parseTaskIntent } from '../lib/enterprise';
import { emitBusinessEvent } from '../lib/events';
import { DynamicFormRenderer } from './shared/DynamicFormRenderer';
import { createTaskWorkspaceFormSchema } from '../services/dynamicFormEngine';
import { assignSla, proposeOverflow, assessTaskSla, rankTasksForAttention, type TaskSlaState } from '../services/taskIntelligence';
import { OPERATIONS_CONFIG } from '../config/operations';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { appendTaskActivity } from '../services/taskActivity';
import { applyTaskWorkflow, type TaskWorkflowAction } from '../services/taskWorkflow';
import { evaluateAllCustomerCollections } from '../services/collectionEngine';
import { buildOperationalExceptionCenter } from '../services/operationalExceptionCenter';
import { VerdictStrip } from './shared/VerdictStrip';
import { FollowUpInbox } from './shared/FollowUpInbox';
import { IntentSurface } from './shared/IntentSurface';
import { WorkflowTimeline } from './shared/WorkflowTimeline';
import { BpmnLiteFlow } from './shared/BpmnLiteFlow';
import { buildTaskCirculation } from '../lib/taskCirculation';
import { enqueueOptimisticMutation } from '../lib/optimisticMutation';
import { InputControl } from './ui/Input';

interface TasksWorkspaceProps {
  state: AppState;
  updateState: (updater: (draft: AppState) => AppState | void) => void;
}

const canReopenTask = (task: CustomerTask) => !task.isDeleted && !task.deletedAt &&
  ['COMPLETED', 'CANCELLED', 'CANCELED'].includes(String(task.status).toUpperCase());

export function TasksWorkspace({ state, updateState }: TasksWorkspaceProps) {
  const { can, canOn, denied } = useCan(state, updateState);
  const [searchParams] = useSearchParams();
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED'>('ALL');
  const [slaFilter, setSlaFilter] = useState<'ALL' | 'BREACHED' | 'AT_RISK' | 'UNSCHEDULED' | 'BLOCKED'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'HIGH' | 'URGENT'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, OPERATIONS_CONFIG.searchDebounceMs);

  const [overdueOnly, setOverdueOnly] = useState(false);

  useEffect(() => {
    const f = (searchParams.get('filter') || '').toLowerCase();
    const p = (searchParams.get('priority') || '').toUpperCase();
    setOverdueOnly(f === 'overdue');
    if (f === 'breached') setSlaFilter('BREACHED');
    if (f === 'at_risk' || f === 'atrisk') setSlaFilter('AT_RISK');
    if (f === 'open') setFilterStatus('OPEN');
    if (f === 'completed') setFilterStatus('COMPLETED');
    if (p === 'HIGH' || p === 'URGENT') setPriorityFilter(p as 'HIGH' | 'URGENT');
  }, [searchParams]);
  
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<CustomerTask | null>(null);
  const [showAttachModalFor, setShowAttachModalFor] = useState<ID | null>(null);
  const [workflowTaskId, setWorkflowTaskId] = useState<ID | null>(null);
  const [workflowReason, setWorkflowReason] = useState('');
  const [workflowResult, setWorkflowResult] = useState('');
  const [workflowNextAction, setWorkflowNextAction] = useState('');
  const [workflowError, setWorkflowError] = useState('');
  const [showExceptions, setShowExceptions] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [capacityWarning, setCapacityWarning] = useState<{ values: Record<string, unknown>; suggestedDate: string | null; count: number; limit: number } | null>(null);
  const capacityOverrideRef = React.useRef(false);

  const activeAccountId = state.activeContextAccountId;
  const currentUserId = state.currentUserId || '';
  const taskScope = (task: CustomerTask) => {
    const group = task.assigneeType === 'GROUP' ? (state.groups || []).find(item => item.id === task.assigneeId) : undefined;
    const isGroupMember = Boolean(group?.memberIds?.includes(currentUserId));
    const creatorId = String(task.createdBy || task.ownerId || '');
    const isCreator = Boolean(currentUserId && creatorId === currentUserId);
    if (task.assigneeType === 'GROUP' && !isGroupMember && !isCreator) return null;
    const ownerId = isCreator || isGroupMember ? currentUserId : String(task.assigneeId || task.assignedTo || '');
    return { ownerId: ownerId || undefined, branchId: (task as Record<string, unknown>).branchId as string | undefined, territoryId: (task as Record<string, unknown>).territoryId as string | undefined, teamId: (task as Record<string, unknown>).teamId as string | undefined, tenantId: (task as Record<string, unknown>).tenantId as string | undefined };
  };
  const canViewTask = (task: CustomerTask) => {
    const scope = taskScope(task);
    return Boolean(currentUserId && scope && canOn('tasks', 'VIEW', scope));
  };

  const visibleTasks = useMemo(() => (state.tasks || []).filter(task => canViewTask(task)), [state.tasks, state.groups, currentUserId, canOn]);

  const visibleAccounts = useMemo(() => (state.accounts || []).filter(account => canOn('accounts', 'VIEW', {
    ownerId: account.ownerId, branchId: account.branchId, territoryId: account.territoryId,
    teamId: (account as Record<string, unknown>).teamId as string | undefined, tenantId: (account as Record<string, unknown>).tenantId as string | undefined
  })), [state.accounts, canOn]);

  const filteredTasks = useMemo(() => {
    let list = visibleTasks.filter(t => activeAccountId ? (t.accountId === activeAccountId || t.customerId === activeAccountId) : true);

    if (filterStatus === 'OPEN') list = list.filter(t => t.status === 'OPEN');
    if (filterStatus === 'IN_PROGRESS') list = list.filter(t => t.status === 'IN_PROGRESS');
    if (filterStatus === 'COMPLETED') list = list.filter(t => t.status === 'COMPLETED');

    if (priorityFilter !== 'ALL') list = list.filter(t => String(t.priority || '').toUpperCase() === priorityFilter);
    if (overdueOnly) {
      const today = new Date().toISOString().slice(0, 10);
      list = list.filter(t => t.dueDate && t.dueDate < today && !['COMPLETED', 'CANCELLED', 'CANCELED'].includes(String(t.status || '').toUpperCase()));
    }

    if (debouncedSearchQuery.trim()) {
      const q = debouncedSearchQuery.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q)));
    }

    if (slaFilter === 'BLOCKED') list = list.filter(task => String(task.status).toUpperCase() === 'BLOCKED');
    else if (slaFilter !== 'ALL') list = list.filter(task => assessTaskSla(task).state === (slaFilter as TaskSlaState));
    return [...rankTasksForAttention(list), ...list.filter(canReopenTask)];
  }, [visibleTasks, activeAccountId, filterStatus, slaFilter, debouncedSearchQuery, priorityFilter, overdueOnly]);

  const activeTasks = useMemo(() => visibleTasks.filter(task => !['COMPLETED','CANCELLED','CANCELED','VOID','DELETED'].includes(String(task.status || '').toUpperCase()) && (!activeAccountId || task.accountId === activeAccountId || task.customerId === activeAccountId)), [visibleTasks, activeAccountId]);
  const canSeeCollectionLedger = can('finance', 'VIEW');
  const ledgerLineTotal = Array.isArray(state.journalLines) ? state.journalLines.length : 0;
  const { data: collectionLedger, error: collectionLedgerError } = useDataQuery(async provider => (canSeeCollectionLedger ? provider.getDetailSubsidiaryBalances() : null), [canSeeCollectionLedger, ledgerLineTotal]);
  const availableCollectionLedger = collectionLedgerError
    ? { status: 'UNAVAILABLE' as const, source: getActiveDataProvider().name, balances: [], reason: collectionLedgerError.message }
    : collectionLedger;
  const collectionProfiles = useMemo(() => evaluateAllCustomerCollections(state, new Date(), availableCollectionLedger).profiles, [state.accounts, state.invoices, state.cheques, state.settings, (state as Record<string, unknown>).collectionPromises, availableCollectionLedger]);
  const operationalExceptions = useMemo(() => {
    const all = buildOperationalExceptionCenter(state, new Date(), collectionProfiles);
    return all.filter(item => {
      if (activeAccountId && item.accountId && item.accountId !== activeAccountId) return false;
      if (item.kind === 'TASK') {
        const task = visibleTasks.find(candidate => String(candidate.id) === item.taskId);
        if (!task) return false;
        const ownerId = task.assigneeType === 'GROUP'
          ? (state.groups?.find(group => group.id === task.assigneeId)?.memberIds.includes(state.currentUserId || '') ? state.currentUserId : undefined)
          : task.assigneeId;
        return canOn('tasks', 'VIEW', { ownerId, branchId: (task as Record<string, unknown>).branchId as string | undefined, territoryId: (task as Record<string, unknown>).territoryId as string | undefined, teamId: (task as Record<string, unknown>).teamId as string | undefined, tenantId: (task as Record<string, unknown>).tenantId as string | undefined });
      }
      if (!can('finance', 'VIEW')) return false;
      const account = (state.accounts || []).find(candidate => candidate.id === item.accountId);
      if (!account) return false;
      return canOn('finance', 'VIEW', { ownerId: (account as Record<string, unknown>).ownerId as string | undefined, branchId: (account as Record<string, unknown>).branchId as string | undefined, territoryId: (account as Record<string, unknown>).territoryId as string | undefined, teamId: (account as Record<string, unknown>).teamId as string | undefined, tenantId: (account as Record<string, unknown>).tenantId as string | undefined });
    });
  }, [state, activeAccountId, collectionProfiles, can, canOn, visibleTasks]);
  const slaCounts = useMemo(() => activeTasks.reduce((counts, task) => { const status = assessTaskSla(task).state; if (status === 'BREACHED') counts.breached++; else if (status === 'AT_RISK') counts.atRisk++; else if (status === 'UNSCHEDULED') counts.unscheduled++; if (String(task.status).toUpperCase() === 'BLOCKED') counts.blocked++; return counts; }, { breached: 0, atRisk: 0, unscheduled: 0, blocked: 0 }), [activeTasks]);

  const openNewTaskModalRef = React.useRef<() => void>(() => {});
  useDeepLinkCreate(() => openNewTaskModalRef.current());
  const openNewTaskModal = () => {
    if (!can('tasks', 'CREATE')) return denied('ایجاد وظیفه');
    setEditingTask(null);
    setErrorMsg('');
    setShowTaskModal(true);
  };

  openNewTaskModalRef.current = openNewTaskModal;

  const openEditTaskModal = (task: CustomerTask) => {
    if (!canViewTask(task) || !canOn('tasks', 'EDIT', taskScope(task) || undefined)) return denied('ویرایش این وظیفه');
    setEditingTask(task);
    setErrorMsg('');
    setShowTaskModal(true);
  };

  const handleSaveTask = (values: Record<string, unknown>) => {
    if (editingTask ? (!canViewTask(editingTask) || !canOn('tasks', 'EDIT', taskScope(editingTask) || undefined)) : !can('tasks', 'CREATE')) { setErrorMsg('مجوز ثبت یا ویرایش این وظیفه را ندارید.'); return denied('ثبت/ویرایش وظیفه'); }
    const assigneeUser = (state.users || []).find(user => user.id === String(values.assigneeId || ''));
    if (assigneeUser && !canCreateCrossDepartmentTask((state.users || []).find(user => user.id === state.currentUserId), assigneeUser, can('tasks', 'ASSIGN'))) {
      const inactive = (assigneeUser.isActive ?? assigneeUser.active) === false;
      setErrorMsg(inactive ? 'مسئول انتخاب‌شده غیرفعال است.' : 'مجوز ارجاع وظیفه به دیگران را ندارید.');
      return inactive ? undefined : denied('ارجاع وظیفه به دیگران');
    }
    if (!assigneeUser && String(values.assigneeId || '') && String(values.assigneeId) !== state.currentUserId && !can('tasks', 'ASSIGN')) { setErrorMsg('مجوز ارجاع وظیفه به دیگران را ندارید.'); return denied('ارجاع وظیفه به دیگران'); }
    setErrorMsg('');
    const taskTitle = String(values.title || '').trim();
    const taskAccountId = String(values.accountId || '');
    const taskDueDate = String(values.dueDate || '');
    const taskPriority = (values.priority || 'NORMAL') as Priority;
    const assigneeType = (values.assigneeType || 'USER') as 'USER' | 'GROUP';
    const assigneeId = String(values.assigneeId || '');
    const taskDescription = String(values.description || '').trim();
    if (!taskTitle) return setErrorMsg('عنوان وظیفه را تکمیل کنید.');
    if (!taskAccountId) return setErrorMsg('حساب تجاری مربوطه را مشخص کنید.');
    if (!assigneeId) return setErrorMsg('مسئول انجام کار را انتخاب کنید.');

    if (!editingTask && !capacityOverrideRef.current && taskDueDate) {
      const preview = { title: taskTitle, description: taskDescription, priority: taskPriority, assigneeId, dueDate: taskDueDate };
      const settings = (state.settings as Record<string, any>)?.taskWorkloadLimits?.[assigneeId] || {};
      const proposal = proposeOverflow(state.tasks || [], assigneeId, taskDueDate, [preview], {
        maxDailyTasks: settings.maxDailyTasks ?? OPERATIONS_CONFIG.defaultDailyTaskCapacity,
        maxDailyScore: settings.maxDailyScore ?? OPERATIONS_CONFIG.defaultDailyScoreCapacity,
        workingDays: settings.workingDays
      }, (state.users || []).filter(u => (u.isActive ?? u.active) !== false).map(u => u.id));
      if (!proposal.capacity.fits) {
        setCapacityWarning({ values, suggestedDate: proposal.nextSlot?.date || null, count: proposal.capacity.currentCount, limit: proposal.capacity.maxDailyTasks });
        return;
      }
    }
    capacityOverrideRef.current = false;
    setCapacityWarning(null);

    let createdTaskId: string | null = null;
    let createdPayload: Record<string, unknown> | null = null;

    updateState(draft => {
      if (!draft.tasks) draft.tasks = [];
      if (editingTask) {
        const t = draft.tasks.find(x => x.id === editingTask.id);
        if (t) {
          t.title = taskTitle;
          t.description = taskDescription;
          t.accountId = taskAccountId;
          t.customerId = taskAccountId;
          t.dueDate = taskDueDate;
          t.priority = taskPriority;
          t.assigneeType = assigneeType;
          t.assigneeId = assigneeId;
          createdTaskId = t.id;
          createdPayload = { ...t };
        }
      } else {
        const intentInfo = parseTaskIntent(taskTitle + ' ' + taskDescription);
        const newTask = assignSla({
          id: generateId(), accountId: taskAccountId, customerId: taskAccountId,
          title: taskTitle, description: taskDescription, dueDate: taskDueDate, targetDate: taskDueDate,
          status: 'OPEN', priority: taskPriority,
          slaStatus: 'ON_TRACK', assigneeType, assigneeId,
          smartIntent: intentInfo.intent, smartReason: intentInfo.reason, mentions: Array.isArray(values.mentions) ? values.mentions : [], createdAt: new Date().toISOString()
        }) as CustomerTask;
        draft.tasks.unshift(newTask);
        processTaskCollaborationEvents(newTask, state, draft, true);
        emitBusinessEvent('TASK_CREATED', 'TASK', newTask.id, newTask, state, updateState);
        createdTaskId = newTask.id;
        createdPayload = { ...newTask };
      }
    });

    if (createdTaskId && createdPayload) {
      void enqueueOptimisticMutation({
        action: editingTask ? 'UPDATE' : 'CREATE',
        entityType: 'tasks',
        entityId: createdTaskId,
        payload: createdPayload,
        alwaysQueue: true,
      });
    }

    setShowTaskModal(false);
  };

  const handleToggleTaskStatus = (taskId: ID) => {
    const task = visibleTasks.find(item => item.id === taskId);
    if (!task || !canOn('tasks', 'EDIT', taskScope(task) || undefined)) return denied('تغییر وضعیت این وظیفه');
    const closed = canReopenTask(task);
    setWorkflowTaskId(task.id);
    setWorkflowReason(closed ? '' : task.blockReason || '');
    setWorkflowResult(closed ? '' : task.result || '');
    setWorkflowNextAction(closed ? '' : task.nextAction || '');
    setWorkflowError('');
  };

  const applyWorkflowAction = (action: TaskWorkflowAction) => {
    const task = visibleTasks.find(item => item.id === workflowTaskId);
    if (!task) return;
    if (!canOn('tasks', 'EDIT', taskScope(task) || undefined)) return denied('تغییر گردش کار این وظیفه');
    const result = applyTaskWorkflow(task, {
      action, actorId: currentUserId, reason: workflowReason,
      result: action === 'REOPEN' ? undefined : workflowResult,
      nextAction: workflowNextAction,
    });
    if (!result.ok) { setWorkflowError(result.error || 'تغییر وضعیت انجام نشد.'); return; }
    updateState(draft => { const idx = draft.tasks?.findIndex(item => item.id === task.id) ?? -1; if (idx >= 0 && draft.tasks) draft.tasks[idx] = result.task as CustomerTask; });
    void enqueueOptimisticMutation({
      action: 'UPDATE',
      entityType: 'tasks',
      entityId: task.id,
      payload: { ...(result.task as object), workflowAction: action },
      alwaysQueue: true,
    });
    setWorkflowError(''); setWorkflowReason(''); setWorkflowResult(''); setWorkflowNextAction('');
    if (action === 'COMPLETE' || action === 'RECORD_RESULT') setWorkflowTaskId(null);
  };

  const taskFormSchema = createTaskWorkspaceFormSchema(state.users || [], state.groups || [], visibleAccounts);

  return (
    <div className="crm-page crm-page-tasks flex-1 flex flex-col min-h-0 h-full bg-transparent font-sans" dir="rtl">
      <div id="task-filters" data-tour-actions className="crm-page-toolbar shrink-0 bg-transparent px-2 sm:px-4 pt-1 pb-2 space-y-2 z-10">
        <div className="relative w-full">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" size={15} />
          <InputControl
            type="search"
            placeholder="جستجوی عنوان وظیفه، مشتری یا شرح..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <VerdictStrip
          verdict={slaCounts.breached > 0 ? `${slaCounts.breached} اقدام دارای دیرکرد مهلت تعهد نیازمند پیگیری فوری است` : `کلیه پیگیری‌ها در محدوده مهلت تعهد تعیین‌شده قرار دارند`}
          magnitude={slaCounts.breached > 0 ? `${slaCounts.breached} مورد معوق` : `پایداری کامل`}
          tone={slaCounts.breached > 0 ? 'danger' : slaCounts.atRisk > 0 ? 'warning' : 'success'}
          actionLabel={slaCounts.breached > 0 ? 'فیلتر موارد معوق' : undefined}
          onAction={() => setSlaFilter('BREACHED')}
        />

        <FollowUpInbox state={state} maxItems={4} className="px-0.5" />
        <IntentSurface state={state} maxItems={2} className="px-0.5" />

        {activeAccountId && (
          <div className="bg-primary/10 border border-primary/20 text-primary text-xs font-bold p-2.5 rounded-xl flex items-center justify-between">
            <span>پیگیری‌های اختصاصی مشتری: {state.accounts?.find(a => a.id === activeAccountId)?.name}</span>
            <button aria-label="حذف فیلتر حساب جاری" onClick={() => updateState(d => { d.activeContextAccountId = null; d.activeContextCustomerId = null; })} className="text-primary hover:text-primary-hover p-1 rounded-lg cursor-pointer">
              <X size={14} />
            </button>
          </div>
        )}

        <div id="task-sla-cards" data-tour-heading className="grid grid-cols-2 sm:grid-cols-4 gap-2" aria-label="خلاصه وضعیت و استثناهای وظایف">
          <button
            type="button"
            onClick={() => setSlaFilter(slaFilter === 'BREACHED' ? 'ALL' : 'BREACHED')}
            aria-pressed={slaFilter === 'BREACHED'}
            className={`rounded-xl border p-2.5 text-start transition-all cursor-pointer ${
              slaFilter === 'BREACHED' ? 'border-danger-line bg-danger-soft ring-1 ring-danger' : 'border-border bg-surface hover:border-primary/40'
            }`}
          >
            <span className="block text-caption font-medium text-text-secondary leading-tight">مهلت گذشته</span>
            <strong className="mt-1 block text-lg font-bold text-danger tabular-nums leading-none">{slaCounts.breached}</strong>
          </button>

          <button
            type="button"
            onClick={() => setSlaFilter(slaFilter === 'AT_RISK' ? 'ALL' : 'AT_RISK')}
            aria-pressed={slaFilter === 'AT_RISK'}
            className={`rounded-xl border p-2.5 text-start transition-all cursor-pointer ${
              slaFilter === 'AT_RISK' ? 'border-warning-line bg-warning-soft ring-1 ring-warning' : 'border-border bg-surface hover:border-primary/40'
            }`}
          >
            <span className="block text-caption font-medium text-text-secondary leading-tight">در آستانه تأخیر</span>
            <strong className="mt-1 block text-lg font-bold text-warning tabular-nums leading-none">{slaCounts.atRisk}</strong>
          </button>

          <button
            type="button"
            onClick={() => setSlaFilter(slaFilter === 'UNSCHEDULED' ? 'ALL' : 'UNSCHEDULED')}
            aria-pressed={slaFilter === 'UNSCHEDULED'}
            className={`rounded-xl border p-2.5 text-start transition-all cursor-pointer ${
              slaFilter === 'UNSCHEDULED' ? 'border-border bg-canvas ring-1 ring-border-strong' : 'border-border bg-surface hover:border-primary/40'
            }`}
          >
            <span className="block text-caption font-medium text-text-secondary leading-tight">بدون مهلت</span>
            <strong className="mt-1 block text-lg font-bold text-text-main tabular-nums leading-none">{slaCounts.unscheduled}</strong>
          </button>

          <button
            type="button"
            onClick={() => setSlaFilter(slaFilter === 'BLOCKED' ? 'ALL' : 'BLOCKED')}
            aria-pressed={slaFilter === 'BLOCKED'}
            className={`rounded-xl border p-2.5 text-start transition-all cursor-pointer ${
              slaFilter === 'BLOCKED' ? 'border-danger-line bg-danger-soft ring-1 ring-danger' : 'border-border bg-surface hover:border-primary/40'
            }`}
          >
            <span className="block text-caption font-medium text-text-secondary leading-tight">متوقف / مانع</span>
            <strong className="mt-1 block text-lg font-bold text-danger tabular-nums leading-none">{slaCounts.blocked}</strong>
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-0.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary shrink-0">
            <span>وضعیت:</span>
            <Select value={filterStatus} onChange={event => setFilterStatus(event.target.value as typeof filterStatus)} >
              <option value="ALL">همه وظایف</option>
              <option value="OPEN">در انتظار</option>
              <option value="IN_PROGRESS">در حال انجام</option>
              <option value="COMPLETED">تکمیل‌شده</option>
            </Select>
          </label>

          <Button size="sm" variant={showExceptions ? 'soft' : 'outline'} className="shrink-0" onClick={() => setShowExceptions(v => !v)} aria-pressed={showExceptions}>
            <span>مرکز استثناها</span>
            <span className="opacity-80 font-mono text-micro">({operationalExceptions.length})</span>
          </Button>

          {slaFilter !== 'ALL' && (
            <Button variant="link" size="inline" className="shrink-0" type="button" onClick={() => setSlaFilter('ALL')} >
              حذف فیلتر مهلت تعهد
            </Button>
          )}
        </div>

        {showExceptions && (
          <div className="rounded-xl border border-warning-line bg-warning-soft/50 p-2.5 space-y-1.5" aria-label="مرکز استثناهای عملیاتی">
            {operationalExceptions.length ? operationalExceptions.slice(0, 8).map(item => item.kind === 'TASK' ? (
              <button
                key={item.id}
                type="button"
                onClick={() => { if (item.taskId) handleToggleTaskStatus(item.taskId); }}
                className="w-full text-start rounded-lg bg-surface border border-border p-2.5 cursor-pointer hover:bg-canvas transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-text-main">{item.title}</span>
                  <span className="text-micro font-bold text-warning">{item.severity === 'CRITICAL' ? 'بحرانی' : 'متوسط'}</span>
                </div>
                <span className="block mt-0.5 text-mini text-text-secondary">{item.description}</span>
              </button>
            ) : null) : (
              <p className="text-xs text-text-secondary">مورد استثنایی فعالی در کارتابل پیدا نشد.</p>
            )}
          </div>
        )}
      </div>

      <div id="task-list" data-tour-primary className="flex-1 overflow-y-auto min-h-0 px-2 sm:px-4 pb-28 pt-1">
        {filteredTasks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {filteredTasks.map(task => {
              const acc = visibleAccounts.find(a => a.id === (task.accountId || task.customerId));
              const isDone = task.status === 'COMPLETED';
              let assigneeName = 'نامشخص';
              if (task.assigneeType === 'GROUP') {
                assigneeName = state.groups?.find(g => g.id === task.assigneeId)?.name || assigneeName;
              } else {
                assigneeName = state.users?.find(u => u.id === task.assigneeId)?.name || assigneeName;
              }
              const attachmentCount = (state.attachments || []).filter(a => a.entityId === task.id).length;

              return (
                <TaskCard 
                  key={task.id}
                  task={task}
                  account={acc}
                  assigneeName={assigneeName}
                  isCompleted={isDone}
                  attachmentCount={attachmentCount}
                  onToggleStatus={() => handleToggleTaskStatus(task.id)}
                  onEdit={() => openEditTaskModal(task)}
                  onAttach={() => setShowAttachModalFor(task.id)}
                  onWorkflow={() => handleToggleTaskStatus(task.id)}
                />
              );
            })}
          </div>
        ) : (
          <EmptyState surface="tasks_workspace" 
            icon={<CheckSquare className="w-8 h-8 text-text-secondary opacity-50" />} 
            title="وظیفه‌ای یافت نشد" 
            description="وظایف جدید از طریق علامت + در هدر بالای صفحه قابل ثبت هستند." 
            compact
          />
        )}
      </div>

      <Modal
        isOpen={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        title={editingTask ? 'ویرایش وظیفه' : 'تعریف وظیفه جدید'}
      >
        <div className="space-y-3">
          {errorMsg && <div role="alert" className="bg-danger-soft border border-danger-line text-danger px-3 py-2 rounded-xl text-xs font-bold">{errorMsg}</div>}
          <DynamicFormRenderer
            schema={taskFormSchema}
            initialValues={editingTask ? {
              title: editingTask.title,
              accountId: editingTask.accountId || editingTask.customerId || '',
              dueDate: editingTask.dueDate || '',
              priority: editingTask.priority || 'NORMAL',
              assigneeType: editingTask.assigneeType || 'USER',
              assigneeId: editingTask.assigneeId || '',
              description: editingTask.description || ''
            } : {
              accountId: state.activeContextAccountId || visibleAccounts[0]?.id || '',
              dueDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
              priority: 'NORMAL', assigneeType: 'USER', assigneeId: state.currentUserId || ''
            }}
            onSubmit={handleSaveTask}
            onCancel={() => setShowTaskModal(false)}
            submitLabel={editingTask ? 'ذخیره تغییرات' : 'ثبت وظیفه'}
          />
        </div>
      </Modal>

      <Modal
        isOpen={!!capacityWarning}
        onClose={() => { setCapacityWarning(null); capacityOverrideRef.current = false; }}
        title="ظرفیت روزانه مسئول تکمیل شده است"
      >
        {capacityWarning && (
          <div className="space-y-3 text-xs">
            <p className="text-text-secondary leading-6">
              ظرفیت روزانه این مسئول ({capacityWarning.limit} وظیفه) تکمیل شده است؛ در تاریخ انتخابی {capacityWarning.count} وظیفه ثبت شده.
            </p>
            {capacityWarning.suggestedDate && (
              <Button size="sm" variant="primary" onClick={() => {
                const nextValues = { ...capacityWarning.values, dueDate: capacityWarning.suggestedDate };
                setCapacityWarning(null); capacityOverrideRef.current = true; handleSaveTask(nextValues);
              }}>انتقال به اولین نوبت پیشنهادی ({capacityWarning.suggestedDate})</Button>
            )}
            <Button size="sm" variant="outline" onClick={() => {
              const values = capacityWarning.values;
              setCapacityWarning(null); capacityOverrideRef.current = true; handleSaveTask(values);
            }}>ثبت در تاریخ انتخاب‌شده با تأیید مسئول</Button>
            <Button size="sm" variant="ghost" onClick={() => { setCapacityWarning(null); capacityOverrideRef.current = false; }}>انصراف</Button>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!workflowTaskId} onClose={() => { setWorkflowTaskId(null); setWorkflowError(''); }} title="گردش کار و نتیجه پیگیری">
        {(() => {
          const task = visibleTasks.find(item => item.id === workflowTaskId);
          if (!task) return <p className="text-sm text-text-secondary">وظیفه در دسترس نیست.</p>;
          const status = String(task.status || 'OPEN').toUpperCase();
          return (
            <div className="space-y-3 text-xs">
              <div className="rounded-xl bg-canvas border border-border p-2.5">
                <div className="text-xs font-bold text-text-main">{task.title}</div>
                <div className="mt-0.5 text-mini text-text-secondary">وضعیت فعلی: {getPersianStatusLabel(status)}</div>
                {task.blockReason && <div className="mt-1 text-xs text-danger">مانع: {task.blockReason}</div>}
              </div>
              <WorkflowTimeline nodes={buildTaskCirculation(task)} title="مسیر گردش کار (قابل مشاهده)" />
              <BpmnLiteFlow nodes={buildTaskCirculation(task)} title="نمای فرآیند وظیفه" />
              {(task.activityHistory || []).length > 0 && <div className="rounded-xl border border-border bg-surface p-2.5 space-y-2">
                <strong className="block text-caption text-text-main">سابقه گردش کار</strong>
                <ol className="space-y-1.5">{task.activityHistory.slice(-8).reverse().map((entry: Record<string, unknown>, index: number) => <li key={String(entry.id || `${entry.at}-${index}`)} className="text-micro leading-5 text-text-secondary">{String(entry.summary || entry.action)} · {entry.at ? formatAppDate(String(entry.at), state.settings?.locale) : 'بدون تاریخ'}{entry.details ? ` — ${String(entry.details)}` : ''}</li>)}</ol>
              </div>}
              {workflowError && <div role="alert" className="rounded-lg border border-danger-line bg-danger-soft p-2 text-xs font-bold text-danger">{workflowError}</div>}
              <label className="block font-bold text-text-main">شرح مانع / علت توقف<Textarea value={workflowReason} onChange={e => setWorkflowReason(e.target.value)} rows={2} className="mt-1" placeholder="در صورت وجود مانع الزامی است" /></label>
              <label className="block font-bold text-text-main">نتیجه پیگیری<Textarea value={workflowResult} onChange={e => setWorkflowResult(e.target.value)} rows={2} className="mt-1" placeholder="نتیجه حاصل‌شده را وارد کنید" /></label>
              <label className="block font-bold text-text-main">اقدام بعدی<Textarea value={workflowNextAction} onChange={e => setWorkflowNextAction(e.target.value)} rows={2} className="mt-1" placeholder="اقدام تکمیلی بعدی" /></label>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {canReopenTask(task) && <Button variant="secondary" size="sm" onClick={() => applyWorkflowAction('REOPEN')}>بازگشایی وظیفه</Button>}
                {['OPEN', 'PENDING'].includes(status) && <Button variant="secondary" size="sm" onClick={() => applyWorkflowAction('START')}>شروع کار</Button>}
                {['OPEN', 'PENDING', 'IN_PROGRESS'].includes(status) && <Button variant="secondary" size="sm" onClick={() => applyWorkflowAction('BLOCK')}>ثبت مانع</Button>}
                {status === 'BLOCKED' && <Button variant="secondary" size="sm" onClick={() => applyWorkflowAction('UNBLOCK')}>رفع مانع</Button>}
                {['OPEN', 'PENDING', 'IN_PROGRESS'].includes(status) && <Button variant="primary" size="sm" onClick={() => applyWorkflowAction('COMPLETE')}>ثبت نتیجه و تکمیل</Button>}
                <Button variant="outline" size="sm" disabled={!workflowResult.trim()} onClick={() => applyWorkflowAction('RECORD_RESULT')}>ثبت نتیجه بدون تکمیل وظیفه</Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal
        isOpen={!!showAttachModalFor}
        onClose={() => setShowAttachModalFor(null)}
        title="مدیریت فایل‌ها و پیوست‌ها"
        footer={<Button size="sm" variant="primary" onClick={() => setShowAttachModalFor(null)}>بستن</Button>}
      >
        {showAttachModalFor && (
          <AttachmentManager 
            entityId={showAttachModalFor}
            entityType="TASK"
            state={state}
            updateState={updateState}
          />
        )}
      </Modal>
    </div>
  );
}
