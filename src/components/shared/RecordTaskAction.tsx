import React, { useMemo, useState } from 'react';
import { CheckSquare } from 'lucide-react';
import type { Account, AppState, CustomerTask } from '../../types';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { DynamicFormRenderer } from './DynamicFormRenderer';
import { createTaskWorkspaceFormSchema } from '../../services/dynamicFormEngine';
import { useCan, requireActiveUser } from '../../hooks/useCan';
import { canCreateCrossDepartmentTask } from '../../services/taskAccessEngine';
import { assignSla } from '../../services/taskIntelligence';
import { parseTaskIntent } from '../../lib/enterprise';
import { processTaskCollaborationEvents } from '../../lib/collaboration';
import { emitBusinessEvent } from '../../lib/events';
import { enqueueOptimisticMutation } from '../../lib/optimisticMutation';
import { generateId } from '../../lib/utils';

export interface TaskRecordLink {
  type: string;
  id: string;
  display: string;
  /** Customer/account owning the source record; required by the existing task form contract. */
  accountId?: string;
}

interface RecordTaskActionProps {
  state: AppState;
  updateState: (updater: (draft: AppState) => AppState | void) => void;
  accounts: Account[];
  record?: TaskRecordLink;
  selectedCount?: number;
  label?: string;
  className?: string;
  onCreated?: (task: CustomerTask) => void;
}

/** Shared toolbar action for creating a task linked to the current record (never rendered per row). */
export function RecordTaskAction({
  state, updateState, accounts, record, selectedCount = 0, label = 'ایجاد تسک', className, onCreated,
}: RecordTaskActionProps) {
  const { can, canOn, denied } = useCan(state, updateState);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const activeUsers = useMemo(() => (state.users || []).filter(user => (user.isActive ?? user.active) !== false), [state.users]);
  const activeGroups = useMemo(() => (state.groups || []).filter(group => group.active !== false), [state.groups]);
  const schema = useMemo(() => createTaskWorkspaceFormSchema(activeUsers, activeGroups, accounts), [activeUsers, activeGroups, accounts]);
  const accountId = record?.accountId || (record?.type === 'ACCOUNT' ? record.id : '');
  const linkedAccount = accountId ? accounts.find(item => item.id === accountId) : undefined;
  const taskCreateAllowed = record && linkedAccount
    ? canOn('tasks', 'CREATE', { ownerId: linkedAccount.ownerId, branchId: linkedAccount.branchId, territoryId: linkedAccount.territoryId, teamId: linkedAccount.teamId, tenantId: linkedAccount.tenantId })
    : can('tasks', 'CREATE');
  const initialValues = useMemo(() => ({
    accountId,
    assigneeType: 'USER',
    assigneeId: state.currentUserId || '',
    priority: 'NORMAL',
  }), [accountId, state.currentUserId]);

  const openForm = () => {
    if (!taskCreateAllowed) return denied('ایجاد وظیفه برای این رکورد');
    setError('');
    setOpen(true);
  };

  const submit = (values: Record<string, unknown>) => {
    if (!taskCreateAllowed) return denied('ایجاد وظیفه برای این رکورد');
    if (!requireActiveUser(state, updateState, 'ایجاد وظیفه')) return;

    const creator = (state.users || []).find(user => user.id === state.currentUserId);
    if (!creator) return;
    const title = String(values.title || '').trim();
    const description = String(values.description || '').trim();
    const selectedAccountId = String(values.accountId || '');
    const account = accounts.find(item => item.id === selectedAccountId);
    const assigneeType = String(values.assigneeType || 'USER') as 'USER' | 'GROUP';
    const assigneeId = String(values.assigneeId || '');
    const priority = String(values.priority || 'NORMAL') as CustomerTask['priority'];
    const dueDate = String(values.dueDate || '');

    if (title.length < 3) return setError('عنوان تسک باید حداقل ۳ نویسه داشته باشد.');
    if (!account) return setError('مشتری یا حساب تجاری مرتبط را انتخاب کنید.');
    const taskScope = { ownerId: account.ownerId, branchId: account.branchId, territoryId: account.territoryId, teamId: account.teamId, tenantId: account.tenantId };
    if (!canOn('accounts', 'VIEW', taskScope)) return denied('دسترسی به حساب تجاری مرتبط');
    if (!canOn('tasks', 'CREATE', taskScope)) return denied('ایجاد وظیفه برای این حساب');
    if (!assigneeId) return setError('مسئول انجام تسک را انتخاب کنید.');
    if (accountId && accountId !== selectedAccountId) return setError('حساب انتخاب‌شده با رکورد مرجع هم‌خوان نیست.');

    if (assigneeType === 'USER') {
      const assignee = activeUsers.find(user => user.id === assigneeId);
      if (!canCreateCrossDepartmentTask(creator, assignee, can('tasks', 'ASSIGN'))) {
        return assignee ? denied('ارجاع وظیفه به کاربر دیگر') : setError('مسئول انتخاب‌شده فعال یا معتبر نیست.');
      }
    } else {
      const group = activeGroups.find(item => item.id === assigneeId);
      if (!group) return setError('گروه کاری انتخاب‌شده معتبر نیست.');
      if (!can('tasks', 'ASSIGN')) return denied('ارجاع وظیفه به گروه کاری');
    }

    const intent = parseTaskIntent(`${title} ${description}`);
    const now = new Date().toISOString();
    const link: TaskRecordLink = record || { type: 'ACCOUNT', id: account.id, display: account.name, accountId: account.id };
    const task = assignSla({
      id: generateId(), title, description, accountId: account.id, customerId: account.id,
      dueDate: dueDate || undefined, targetDate: dueDate || undefined,
      status: 'OPEN', priority, slaStatus: 'ON_TRACK', assigneeType, assigneeId,
      assignedTo: assigneeType === 'USER' ? assigneeId : undefined,
      ownerId: creator.id, createdBy: creator.id,
      smartIntent: intent.intent, smartReason: intent.reason,
      mentions: Array.isArray(values.mentions) ? values.mentions : [],
      relatedEntity: { type: link.type, id: link.id, display: link.display },
      relatedEntityType: link.type, relatedEntityId: link.id,
      createdAt: now,
    }, new Date(now)) as CustomerTask;

    updateState(draft => {
      if (!draft.tasks) draft.tasks = [];
      draft.tasks.unshift(task);
      processTaskCollaborationEvents(task, state, draft, true);
      if (!draft.auditLogs) draft.auditLogs = [];
      draft.auditLogs.push({
        id: generateId(), action: 'TASK_CREATED', entityType: 'TASK', entityId: task.id,
        details: `تسک «${task.title}» به رکورد «${link.display}» متصل شد.`, actor: creator.name, createdAt: now,
      });
    });
    emitBusinessEvent('TASK_CREATED', 'TASK', task.id, task, state, updateState);
    void enqueueOptimisticMutation({ action: 'CREATE', entityType: 'tasks', entityId: task.id, payload: { ...task }, alwaysQueue: true });
    onCreated?.(task);
    setOpen(false);
    setError('');
  };

  return <>
    <Button type="button" size="sm" variant="outline" className={className} icon={<CheckSquare size={15} />} onClick={openForm}
      title={selectedCount === 1 ? 'ایجاد تسک متصل به رکورد انتخاب‌شده' : 'ایجاد تسک و انتخاب حساب مرتبط'}>
      {label}{selectedCount === 1 ? ' · رکورد انتخاب‌شده' : ''}
    </Button>
    <Modal isOpen={open} onClose={() => setOpen(false)} title="ایجاد تسک و ارجاع" subtitle={record ? `این تسک به «${record.display}» متصل می‌شود.` : selectedCount > 1 ? 'برای اتصال مستقیم، یک رکورد انتخاب کنید؛ در غیر این صورت حساب مرتبط را در فرم مشخص کنید.' : 'تسک را به یک حساب تجاری متصل و به مسئول مربوط ارجاع دهید.'} size="2xl">
      {error && <div role="alert" className="mb-3 rounded-xl border border-danger/20 bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">{error}</div>}
      <DynamicFormRenderer schema={schema} initialValues={initialValues} draftKey={`akhavan:record-task:${record?.type || 'generic'}:${record?.id || 'new'}`} onSubmit={submit} onCancel={() => setOpen(false)} submitLabel="ثبت تسک و ارجاع" />
    </Modal>
  </>;
}
