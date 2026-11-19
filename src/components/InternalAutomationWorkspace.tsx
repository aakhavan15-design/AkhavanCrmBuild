import { useTabParam } from '../hooks/useTabParam';
import { AUTOMATION_TABS } from '../lib/workspaceHierarchy';
import { useDeepLinkCreate } from '../hooks/useDeepLinkCreate';
import { useCan } from '../hooks/useCan';
import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  AppState, InternalRequest, RequestType, Priority, InternalMeeting, 
  WorkflowRule, ID, ActionItem 
} from '../types';
import { generateId, formatAppDate, parsePersianNumber, formatCurrency, toLocalDateISO, matchesSearch } from '../lib/utils';
import { pushNotification } from '../lib/notifyAndPush';
import { 
  routeInternalRequest, evaluateRequestIntelligence, notifyMeetingParticipants, 
  addMeetingActionItem, reassignInternalRequest, updateInternalRequestStatus 
} from '../lib/internalAutomation';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { EmptyState } from './ui/EmptyState';
import { CustomDatePicker } from './ui/CustomDatePicker';
import { 
  CalendarDays, FileText, CheckCircle2, Inbox, Activity, 
  AlertTriangle, AlertCircle, RefreshCcw, Plus, Sliders, 
  Clock, UserCheck, Shield, ChevronDown, Check, X, MessageSquare, 
  ListChecks, ArrowRight, UserPlus
} from 'lucide-react';
import { RBACService } from '../lib/rbac';
import { DynamicFormRenderer } from './shared/DynamicFormRenderer';
import { toLatinDigits } from '../lib/digits';
import { createInternalRequestFormSchema, INTERNAL_REQUEST_DATA_LABELS, INTERNAL_REQUEST_TYPE_FIELDS } from '../services/dynamicFormEngine';
import { assignSla } from '../services/taskIntelligence';
import { appendTaskActivity } from '../services/taskActivity';
import { applyTaskWorkflow } from '../services/taskWorkflow';
import { processTaskCollaborationEvents } from '../lib/collaboration';
import {
  initApprovalChain,
  advanceApprovalOnApprove,
  rejectApprovalChain,
  suggestAssigneeForActiveStep,
  requestTimelineItems,
  getChainsConfigFromState,
  getChainTemplate,
  APPROVAL_CHAIN_SCHEMA_VERSION,
} from '../lib/approvalChain';
import { WorkflowTimeline } from './shared/WorkflowTimeline';
import { FinancialContextPanel, ContextToggle } from './shared/FinancialContextPanel';
import { snapshotRequestDecision } from '../lib/financialIntelligence';
import { withViewer } from '../lib/financialAccess';

const FI_CONTEXT_TYPES = ['LEAVE', 'ADVANCE', 'EXPENSE', 'PURCHASE', 'PAYMENT', 'EQUIPMENT'];
import { BpmnLiteFlow } from './shared/BpmnLiteFlow';

interface InternalAutomationProps {
  state: AppState;
  updateState: (updater: (draft: AppState) => AppState | void) => void;
  setActiveTab?: (tab: any) => void;
}

const REQUEST_TYPE_LABELS: Record<RequestType, { title: string; category: 'PERSONNEL' | 'ORG' }> = {
  LEAVE: { title: 'مرخصی (استحقاقی/استعلاجی/ساعتی)', category: 'PERSONNEL' },
  MISSION: { title: 'مأموریت کاری', category: 'PERSONNEL' },
  OVERTIME: { title: 'اضافه کاری و تردد', category: 'PERSONNEL' },
  ADVANCE: { title: 'مساعده مالی', category: 'PERSONNEL' },
  ATTENDANCE: { title: 'اصلاح تردد / فراموشی کارت', category: 'PERSONNEL' },
  CERTIFICATE: { title: 'گواهی اشتغال / معرفی‌نامه', category: 'PERSONNEL' },
  PAYMENT: { title: 'درخواست پرداخت و تسویه', category: 'ORG' },
  EXPENSE: { title: 'تنخواه و فاکتور هزینه', category: 'ORG' },
  PURCHASE: { title: 'خرید کالا و ملزومات', category: 'ORG' },
  EQUIPMENT: { title: 'تجهیزات و ابزار کار', category: 'ORG' },
  IT_SUPPORT: { title: 'پشتیبانی فنی و سیستم‌ها', category: 'ORG' },
  GENERAL: { title: 'درخواست اداری و عمومی', category: 'ORG' }
};

export function InternalAutomationWorkspace({ state, updateState }: InternalAutomationProps) {
  const { can, canOn, denied } = useCan(state, updateState);
  const navigate = useNavigate();
  type AutomationTab = 'INBOX' | 'MY_REQUESTS' | 'MEETINGS';
  const [automationTabParam, setAutomationTabParam] = useTabParam(AUTOMATION_TABS, 'inbox');
  const activeTab = automationTabParam.toUpperCase() as AutomationTab;
  const setLocalTab = (next: AutomationTab) => setAutomationTabParam(next.toLowerCase() as typeof automationTabParam);
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'PERSONNEL' | 'ORG'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const rbac = new RBACService(state);
  const isAdmin = rbac.hasPermission('internal.manage');
  const currentUserId = state.currentUserId || '';

  const userGroupIds = (state.groups || []).filter(g => g.memberIds.includes(currentUserId)).map(g => g.id);

  const filterRequestList = (list: InternalRequest[]) => {
    return list.filter(r => {
      if (categoryFilter !== 'ALL') {
        const cat = REQUEST_TYPE_LABELS[r.type]?.category;
        if (cat !== categoryFilter) return false;
      }
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'IN_REVIEW' && r.status !== 'IN_REVIEW' && r.status !== 'SUBMITTED') return false;
        if (statusFilter === 'APPROVED' && r.status !== 'APPROVED') return false;
        if (statusFilter === 'REJECTED' && r.status !== 'REJECTED') return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const creator = state.users.find(u => u.id === r.creatorId)?.name.toLowerCase() || '';
        return matchesSearch(`${r.title || ''} ${r.description || ''} ${creator}`, q);
      }
      return true;
    }).sort((a, b) => {
      const weight: Record<string, number> = { URGENT: 4, HIGH: 3, NORMAL: 2, LOW: 1 };
      const priorityDelta = (weight[String(b.priority || 'NORMAL').toUpperCase()] || 0) - (weight[String(a.priority || 'NORMAL').toUpperCase()] || 0);
      return priorityDelta || (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0);
    });
  };

  const myInbox = filterRequestList((state.internalRequests || []).filter((r: any) => 
    (r.currentAssigneeId === currentUserId || (r.currentGroupId && userGroupIds.includes(r.currentGroupId))) 
    && r.status !== 'COMPLETED' && r.status !== 'REJECTED' && r.status !== 'CANCELLED'
  ));

  const myRequests = filterRequestList((state.internalRequests || []).filter((r: any) => r.creatorId === currentUserId));
  const orgRequests = isAdmin ? filterRequestList(state.internalRequests || []) : [];
  const myMeetings = (state.internalMeetings || []).filter((m: any) => 
    m.organizerId === currentUserId || 
    (m.participantIds || []).includes(currentUserId) || 
    (m.groupIds || []).some((gid: any) => userGroupIds.includes(gid))
  );

  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);
  useDeepLinkCreate(() => setIsNewRequestOpen(true));
  const [formError, setFormError] = useState('');
  const requestSubmitLock = useRef(false);
  const requestFormSchema = createInternalRequestFormSchema(Object.entries(REQUEST_TYPE_LABELS).map(([value, item]) => ({ value, label: item.title })));

  const canReviewRequest = (request: InternalRequest) =>
    isAdmin || request.currentAssigneeId === currentUserId || (!!request.currentGroupId && userGroupIds.includes(request.currentGroupId));

  const finalizeLinkedApprovalTask = (draft: AppState, request: InternalRequest, decision: 'APPROVED' | 'REJECTED', at: string) => {
    const taskId = String((request as any).approvalTaskId || '');
    if (!taskId) return;
    const task = (draft.tasks || []).find((item: any) => item.id === taskId);
    if (!task || ['COMPLETED', 'CANCELLED', 'CANCELED', 'VOID', 'DELETED'].includes(String(task.status || '').toUpperCase())) return;
    if (String(task.status || '').toUpperCase() === 'BLOCKED') {
      const unblocked = applyTaskWorkflow(task, { action: 'UNBLOCK', actorId: currentUserId, at });
      if (!unblocked.ok) return;
      Object.assign(task, unblocked.task);
    }
    const result = applyTaskWorkflow(task, {
      action: 'COMPLETE', actorId: currentUserId, at,
      result: decision === 'APPROVED' ? `درخواست «${request.title}» تأیید شد.` : `درخواست «${request.title}» رد شد.`
    });
    if (result.ok) Object.assign(task, result.task);
  };

  const handleApprove = (reqId: string) => {
    if (!can('internal', 'APPROVE')) return denied('تایید درخواست سازمانی');
    const request = (state.internalRequests || []).find((item: any) => item.id === reqId);
    if (!request || !['IN_REVIEW', 'SUBMITTED', 'APPROVED'].includes(request.status)) return;
    // APPROVED + active ERP/COMPLETED step still may need confirmation path — only IN_REVIEW/SUBMITTED for human approve
    if (!['IN_REVIEW', 'SUBMITTED'].includes(request.status)) return;
    if (!canReviewRequest(request)) return denied('بررسی این درخواست به شما ارجاع نشده است');
    updateState(draft => {
      const r = (draft.internalRequests || []).find((x: any) => x.id === reqId);
      if (!r || !['IN_REVIEW', 'SUBMITTED'].includes(r.status) || !canReviewRequest(r)) return;
      const at = new Date().toISOString();
      const prevStatus = r.status;
      snapshotRequestDecision(draft, { kind: 'INTERNAL_REQUEST', id: r.id }, 'APPROVE_STEP', currentUserId, undefined, new Date(at), withViewer(draft));
      const advanced = advanceApprovalOnApprove(r, currentUserId, at, 'تأیید مرحله گردش');
      (r as any).approvalSteps = advanced.steps;
      r.status = advanced.status as any;
      r.updatedAt = at;
      const nextAssignee = suggestAssigneeForActiveStep(draft, r, advanced.steps);
      if (nextAssignee && !advanced.done) r.currentAssigneeId = nextAssignee;
      if (!Array.isArray(r.history)) r.history = [];
      r.history.push({
        fromStatus: prevStatus,
        toStatus: r.status,
        actorId: currentUserId,
        comment: advanced.erpHandoffReady
          ? 'تأیید مرحله · آمادهٔ تحویل به سامانه مالی (سند رسمی فقط در سامانه مالی)'
          : advanced.done
            ? 'تأیید نهایی گردش'
            : 'تأیید مرحله و ارجاع به مرحله بعد',
        timestamp: at,
      });
      if (advanced.done) finalizeLinkedApprovalTask(draft, r, 'APPROVED', at);
      if (!draft.notifications) draft.notifications = [];
      const msg = advanced.erpHandoffReady
        ? `درخواست «${r.title}» تأیید سازمانی شد و برای ثبت سند در سامانه مالی آماده است. این تأیید به‌معنی پرداخت قطعی نیست.`
        : advanced.done
          ? `درخواست «${r.title}» در گردش کار به‌طور کامل تأیید شد.`
          : `درخواست «${r.title}» یک مرحله پیش رفت و به مسئول بعدی ارجاع شد.`;
      draft.notifications.push({
        id: generateId(),
        title: advanced.done ? 'درخواست تأیید شد' : 'پیشرفت گردش درخواست',
        message: msg,
        type: 'SUCCESS',
        read: false,
        createdAt: at,
        linkTab: 'internal_automation',
        recipientId: r.creatorId,
      });
      if (nextAssignee && !advanced.done && nextAssignee !== currentUserId) {
        pushNotification(draft, {
          title: 'ارجاع درخواست برای بررسی',
          message: `درخواست «${r.title}» برای تصمیم‌گیری به شما ارجاع شد.`,
          type: 'INFO',
          linkTab: 'internal_automation',
          recipientId: nextAssignee,
        });
      }
    });
  };

  const handleReject = (reqId: string) => {
    if (!can('internal', 'APPROVE')) return denied('رد درخواست سازمانی');
    const request = (state.internalRequests || []).find((item: any) => item.id === reqId);
    if (!request || !['IN_REVIEW', 'SUBMITTED'].includes(request.status)) return;
    if (!canReviewRequest(request)) return denied('بررسی این درخواست به شما ارجاع نشده است');
    updateState(draft => {
      const r = (draft.internalRequests || []).find((x: any) => x.id === reqId);
      if (!r || !['IN_REVIEW', 'SUBMITTED'].includes(r.status) || !canReviewRequest(r)) return;
      const at = new Date().toISOString();
      snapshotRequestDecision(draft, { kind: 'INTERNAL_REQUEST', id: r.id }, 'REJECT', currentUserId, undefined, new Date(at), withViewer(draft));
      (r as any).approvalSteps = rejectApprovalChain(r, currentUserId, at, 'رد درخواست');
      r.status = 'REJECTED'; r.updatedAt = at;
      if (!Array.isArray(r.history)) r.history = [];
      r.history.push({ fromStatus: 'IN_REVIEW', toStatus: 'REJECTED', actorId: currentUserId, comment: 'رد درخواست', timestamp: at });
      finalizeLinkedApprovalTask(draft, r, 'REJECTED', at);
      if (!draft.notifications) draft.notifications = [];
      pushNotification(draft, { title: 'درخواست رد شد', message: `درخواست «${r.title}» رد گردید.`, type: 'WARNING', linkTab: 'internal_automation', recipientId: r.creatorId });
    });
  };

  const handleCreateRequest = (values: Record<string, any>) => {
    if (requestSubmitLock.current) return;
    if (!can('internal', 'CREATE')) return denied('ثبت درخواست سازمانی');
    setFormError('');
    const type = (values.type || 'GENERAL') as RequestType;
    const title = String(values.title || '').trim();
    const description = String(values.description || '').trim();
    const priority = (values.priority || 'NORMAL') as Priority;
    if (!title) return setFormError('عنوان درخواست را وارد نمایید.');
    const approverId = routeInternalRequest({ creatorId: currentUserId } as InternalRequest, state);
    if (!approverId) return setFormError('مسئول تأیید فعال در ساختار سازمانی مشخص نشده است؛ ابتدا مدیر یا تأییدکنندهٔ مجاز را در ساختار کاربران تعیین کنید.');
    requestSubmitLock.current = true;

    // داده‌های شرطی نوع درخواست در request.data ذخیره می‌شود (قبلاً ذخیره نمی‌شد).
    const data: Record<string, unknown> = {};
    for (const key of INTERNAL_REQUEST_TYPE_FIELDS[type] || []) {
      const v = values[key];
      if (v === undefined || v === null || String(v).trim() === '') continue;
      data[key] = key === 'amount' || key === 'quantity' ? Number(toLatinDigits(String(v)).replace(/[^\d.]/g, '')) : typeof v === 'string' ? v.trim() : v;
    }
    if (type === 'LEAVE' && data.leaveMode === 'HOURLY' && data.leaveDate) { data.startDate = data.leaveDate; data.endDate = data.leaveDate; }
    const createdAtIso = new Date().toISOString();
    const approvalSteps = initApprovalChain(type, currentUserId, createdAtIso, getChainsConfigFromState(state));
    const newReq: InternalRequest = {
      id: generateId(),
      type,
      title,
      description,
      data,
      creatorId: currentUserId,
      currentAssigneeId: approverId,
      status: 'IN_REVIEW',
      priority,
      approvalSteps,
      approvalChainVersion: APPROVAL_CHAIN_SCHEMA_VERSION,
      history: [{
        fromStatus: 'DRAFT',
        toStatus: 'IN_REVIEW',
        actorId: currentUserId,
        comment: 'ثبت و ارسال اولیه در سامانه · شروع گردش چندمرحله‌ای',
        timestamp: createdAtIso
      }],
      createdAt: createdAtIso,
      updatedAt: createdAtIso
    };

    const createdAt = newReq.createdAt;
    const approvalTaskId = generateId();
    const approvalTask = appendTaskActivity(assignSla({
      id: approvalTaskId, title: `بررسی درخواست: ${newReq.title}`,
      description: `درخواست داخلی ${newReq.id} از نوع ${type}؛ تصمیم نهایی باید در اتوماسیون ثبت شود.`,
      dueDate: toLocalDateISO(new Date(Date.now() + 86400000)),
      targetDate: toLocalDateISO(new Date(Date.now() + 86400000)),
      priority, status: 'OPEN', assigneeType: 'USER', assigneeId: newReq.currentAssigneeId || currentUserId,
      ownerId: currentUserId, sourceRequestId: newReq.id, createdAt
    }), { action: 'CREATED', actorId: currentUserId, at: createdAt, summary: 'وظیفه بررسی درخواست ایجاد شد', details: `شناسه درخواست: ${newReq.id}` });
    (newReq as any).approvalTaskId = approvalTaskId;

    updateState(draft => {
      if (!draft.internalRequests) draft.internalRequests = [];
      if (draft.internalRequests.some((item: any) => item.id === newReq.id)) return;
      draft.internalRequests.unshift(newReq);
      if (!draft.tasks) draft.tasks = [];
      if (!draft.tasks.some((item: any) => item.id === approvalTaskId || item.sourceRequestId === newReq.id)) {
        draft.tasks.unshift(approvalTask as any);
        processTaskCollaborationEvents(approvalTask as any, state, draft, true);
      }
      if (!draft.notifications) draft.notifications = [];
      pushNotification(draft, { title: 'درخواست اداری جدید ثبت شد', message: `درخواست «${newReq.title}» در اتوماسیون ثبت گردید.`, type: 'INFO', linkTab: 'internal_automation', recipientId: newReq.currentAssigneeId });
    });

    setIsNewRequestOpen(false);
    requestSubmitLock.current = false;
  };

  const renderRequestCard = (req: InternalRequest, isReviewer: boolean) => {
    const creator = (state.users || []).find(u => u.id === req.creatorId);
    const assignedUser = (state.users || []).find(u => u.id === req.currentAssigneeId);
    const assignedGroup = (state.groups || []).find(g => g.id === req.currentGroupId);
    const intelligence = isReviewer ? evaluateRequestIntelligence(req, state) : [];
    const typeMeta = REQUEST_TYPE_LABELS[req.type] || { title: req.type, category: 'ORG' };

    return (
      <Card key={req.id} padding="md" className="space-y-3 border-border hover:shadow-card transition-shadow">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-micro font-bold px-2 py-0.5 rounded-full ${typeMeta.category === 'PERSONNEL' ? 'bg-sky-50 text-info border border-sky-200' : 'bg-amber-50 text-warning border border-amber-200'}`}>
                {typeMeta.category === 'PERSONNEL' ? 'پرسنلی' : 'سازمانی'}
              </span>
              <h4 className="font-bold text-sm text-text-main">{req.title}</h4>
            </div>
            <div className="text-xs text-text-secondary mt-1 flex flex-wrap items-center gap-2">
              <span>درخواست‌دهنده: <strong className="text-text-main">{creator?.name || 'نامشخص'}</strong></span>
              <span>•</span>
              <span className="font-mono">{formatAppDate(req.createdAt, state.settings?.locale)}</span>
              {(assignedGroup || assignedUser) && (
                <>
                  <span>•</span>
                  <span className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-caption font-medium">
                    در دست: {assignedGroup ? `گروه ${assignedGroup.name}` : assignedUser?.name}
                  </span>
                </>
              )}
            </div>
          </div>
          <span className={`text-micro font-bold px-2.5 py-1 rounded-lg ${req.status === 'APPROVED' ? 'bg-success-soft text-success' : req.status === 'REJECTED' ? 'bg-red-50 text-danger' : req.status === 'WAITING_FOR_INFORMATION' ? 'bg-amber-50 text-warning' : 'bg-sky-50 text-info'}`}>
            {req.status === 'APPROVED' ? 'تأیید شده' : req.status === 'REJECTED' ? 'رد شده' : req.status === 'WAITING_FOR_INFORMATION' ? 'در انتظار اطلاعات' : 'در حال بررسی'}
          </span>
        </div>

        {req.description && (
          <p className="text-xs text-text-secondary leading-relaxed bg-canvas p-2.5 rounded-xl border border-border">
            {req.description}
          </p>
        )}

        <WorkflowTimeline
          nodes={requestTimelineItems(req, getChainsConfigFromState(state))}
          title="گردش تأیید چندمرحله‌ای"
        />
        <BpmnLiteFlow
          nodes={requestTimelineItems(req, getChainsConfigFromState(state))}
          title="نمای فرآیند"
        />

        <div className="bg-canvas p-2.5 rounded-xl text-xs space-y-1 border border-border font-medium">
          {req.type === 'LEAVE' && (
            <div className="text-text-main flex justify-between items-center">
              <span>بازه مرخصی: از {formatAppDate(req.data?.startDate, state.settings?.locale)} تا {formatAppDate(req.data?.endDate, state.settings?.locale)}</span>
              {req.data?.substituteName && <span className="text-text-secondary text-caption">جانشین: {req.data.substituteName}</span>}
            </div>
          )}
          {req.type === 'ADVANCE' && (
            <div className="text-text-main flex justify-between items-center font-mono">
              <span>مبلغ مساعده: {formatCurrency(req.data?.amount)} ریال</span>
              {req.data?.reason && <span className="text-text-secondary font-sans text-caption">{req.data.reason}</span>}
            </div>
          )}
          {req.data && Object.keys(req.data).length > 0 && (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-caption sm:grid-cols-2">
              {Object.entries(req.data as Record<string, unknown>)
                .filter(([k, v]) => INTERNAL_REQUEST_DATA_LABELS[k] && v !== '' && v !== null && v !== undefined && !(req.type === 'LEAVE' && ['startDate', 'endDate', 'substituteName'].includes(k) && req.data?.leaveMode !== 'HOURLY') && !(req.type === 'ADVANCE' && ['amount', 'reason'].includes(k)) && !(req.type === 'LEAVE' && k === 'leaveDate'))
                .map(([k, v]) => (
                  <div key={k} className="flex gap-1"><dt className="text-text-secondary">{INTERNAL_REQUEST_DATA_LABELS[k]}:</dt><dd className="font-medium text-text-main">{k === 'amount' ? `${formatCurrency(Number(v))} ریال` : /(Date|startDate|endDate)$/.test(k) ? formatAppDate(String(v), state.settings?.locale) : k === 'leaveMode' ? (v === 'HOURLY' ? 'ساعتی' : 'روزانه') : k === 'payMethod' ? (v === 'CHEQUE' ? 'چک' : 'واریز به شبا') : String(v)}</dd></div>
                ))}
            </dl>
          )}
        </div>

        {isReviewer && intelligence.length > 0 && (
          <div className="space-y-1 pt-1">
            <span className="text-micro font-bold text-text-secondary block">سیگنال‌های هوشمندی و تاریخچه مرتبط:</span>
            {intelligence.map((sig, idx) => (
              <div key={idx} className={`p-2 text-caption font-medium rounded-lg flex items-start gap-1.5 ${sig.type === 'RISK' ? 'bg-red-50 text-danger border border-red-200' : sig.type === 'ATTENTION' ? 'bg-amber-50 text-warning border border-amber-200' : 'bg-sky-50 text-info border border-sky-200'}`}>
                {sig.type === 'RISK' ? <AlertTriangle size={14} className="shrink-0 text-danger mt-0.5"/> : sig.type === 'ATTENTION' ? <AlertCircle size={14} className="shrink-0 text-warning mt-0.5"/> : <CheckCircle2 size={14} className="shrink-0 text-info mt-0.5"/>}
                <span>{sig.message}</span>
              </div>
            ))}
          </div>
        )}

        {isReviewer && FI_CONTEXT_TYPES.includes(req.type) && (req.status === 'IN_REVIEW' || req.status === 'SUBMITTED') && (
          <ContextToggle label="مشاهده سابقه و وضعیت مرتبط با این درخواست">
            <FinancialContextPanel approval={{ kind: 'INTERNAL_REQUEST', id: req.id }} refreshKey={(state.internalRequests || []).length} compact />
          </ContextToggle>
        )}

        {isReviewer && (req.status === 'IN_REVIEW' || req.status === 'SUBMITTED') && (
          <div className="pt-2 border-t border-border flex justify-end gap-2">
            <Button size="sm" variant="danger" onClick={() => handleReject(req.id)} icon={<X size={14} />}>
              رد درخواست
            </Button>
            <Button size="sm" variant="success" onClick={() => handleApprove(req.id)} icon={<Check size={14} />}>
              تأیید نهایی
            </Button>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full bg-transparent" dir="rtl">
      <div className="shrink-0 bg-canvas px-4 pt-4 pb-2 space-y-4 z-10">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div>
            <h2 data-tour-heading className="text-xl font-extrabold text-text-main tracking-tight flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" /> اتوماسیون اداری و گردش‌کار داخلی
            </h2>
            <span className="text-xs text-text-secondary">مدیریت یکپارچه درخواست‌های پرسنلی، مأموریت، هزینه‌ها، جلسات و قوانین ارجاع</span>
          </div>
          <Button variant="primary" onClick={() => setIsNewRequestOpen(true)} icon={<Plus size={16} />}>
            ثبت درخواست جدید
          </Button>
        </div>

        <div id="automation-tabs" data-tour-actions className="flex gap-2 overflow-x-auto no-scrollbar pb-1 border-b border-border">
          <button onClick={() => setLocalTab('INBOX')} className={`px-4 py-2 text-sm font-bold whitespace-nowrap border-b-(length:--bw-accent) cursor-pointer transition-colors ${activeTab === 'INBOX' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-main'}`}>
            کارتابل من ({myInbox.length})
          </button>
          <button onClick={() => setLocalTab('MY_REQUESTS')} className={`px-4 py-2 text-sm font-bold whitespace-nowrap border-b-(length:--bw-accent) cursor-pointer transition-colors ${activeTab === 'MY_REQUESTS' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-main'}`}>
            درخواست‌های من ({myRequests.length})
          </button>
          <button onClick={() => setLocalTab('MEETINGS')} className={`px-4 py-2 text-sm font-bold whitespace-nowrap border-b-(length:--bw-accent) cursor-pointer transition-colors ${activeTab === 'MEETINGS' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-main'}`}>
            جلسات و مصوبات ({myMeetings.length})
          </button>
        </div>
      </div>

      <div id="automation-inbox" data-tour-primary className="flex-1 overflow-y-auto min-h-0 px-4 pb-8 space-y-4 pt-2">
        {activeTab === 'INBOX' && (
          <div className="space-y-3">
            {myInbox.length > 0 ? myInbox.map(r => renderRequestCard(r, true)) : (
              <EmptyState surface="internal_automation_workspace_1" 
                icon={<Inbox className="w-8 h-8 text-text-secondary opacity-50"/>} 
                title="کارتابل شما خالی است" 
                description="هیچ درخواستی در حال حاضر منتظر اقدام یا بررسی شما نیست."
                actionLabel="ثبت درخواست جدید"
                onAction={() => setIsNewRequestOpen(true)}
              />
            )}
          </div>
        )}

        {activeTab === 'MY_REQUESTS' && (
          <div className="space-y-3">
            {myRequests.length > 0 ? myRequests.map(r => renderRequestCard(r, false)) : (
              <EmptyState surface="internal_automation_workspace_2" 
                icon={<FileText className="w-8 h-8 text-text-secondary opacity-50"/>} 
                title="درخواستی ثبت نشده است" 
                description="شما تاکنون هیچ درخواست مرخصی، مأموریت یا اداری ثبت نکرده‌اید."
                actionLabel="ثبت درخواست جدید"
                onAction={() => setIsNewRequestOpen(true)}
              />
            )}
          </div>
        )}

        {activeTab === 'MEETINGS' && (
          <div className="space-y-3">
            {myMeetings.length > 0 ? myMeetings.map((m: any) => (
              <Card key={m.id} padding="md" className="space-y-3 border-border hover:shadow-card transition-shadow">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-sm text-text-main">{m.title}</h4>
                    <div className="text-xs text-text-secondary mt-1 flex items-center gap-3 font-mono">
                      <span>تاریخ: {m.date}</span>
                      <span>ساعت: {m.startTime} تا {m.endTime}</span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 text-micro font-bold rounded-lg bg-sky-50 text-info">
                    {m.status === 'SCHEDULED' ? 'برنامه‌ریزی شده' : 'برگزار شده'}
                  </span>
                </div>
                {m.agenda && <p className="text-xs text-text-secondary bg-canvas p-2 rounded-xl">{m.agenda}</p>}
                {m.actionItems && m.actionItems.length > 0 && (
                  <div className="pt-2 border-t border-border">
                    <span className="text-micro font-bold text-text-secondary block mb-1">مصوبات و اقدامات جلسه:</span>
                    <div className="space-y-1">
                      {m.actionItems.map((act: any, idx: number) => (
                        <div key={idx} className="text-xs flex items-center gap-2 text-text-main">
                          <CheckCircle2 size={13} className="text-primary" />
                          <span>{act.title}</span>
                          {act.dueDate && <span className="text-micro text-text-secondary font-mono">({act.dueDate})</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )) : (
              <EmptyState surface="internal_automation_workspace_3" 
                icon={<CalendarDays className="w-8 h-8 text-text-secondary opacity-50"/>} 
                title="جلسه‌ای یافت نشد" 
                description="جلسه کاری برای شما در این بخش ثبت نشده است."
              />
            )}
          </div>
        )}
      </div>

      <Modal
        isOpen={isNewRequestOpen}
        onClose={() => setIsNewRequestOpen(false)}
        title="ثبت درخواست جدید در اتوماسیون اداری"
      >
        {formError && <div role="alert" className="mb-3 p-3 bg-red-50 text-danger rounded-xl font-bold border border-red-200">{formError}</div>}
        {(() => {
          const cfg = getChainsConfigFromState(state);
          const mk = (t: RequestType, prefix: string) =>
            getChainTemplate(t, cfg).map((s, i) => ({
              id: `${prefix}-${i}`,
              label: s.label,
              state: (i === 0 ? 'done' : i === 1 ? 'active' : 'pending') as 'done' | 'active' | 'pending',
              meta: s.erpHandoff ? 'سامانه مالی' : undefined,
            }));
          return (
            <div className="mb-3 space-y-2">
              <p className="text-caption text-text-secondary">مسیر واقعی از «نوع درخواست» در فرم + تنظیمات سازمان می‌آید:</p>
              <BpmnLiteFlow nodes={mk('LEAVE', 'l')} title="نمونه پرسنلی" />
              <BpmnLiteFlow nodes={mk('PAYMENT', 'p')} title="نمونه مالی (با سامانه مالی)" />
            </div>
          );
        })()}
        <DynamicFormRenderer
          schema={requestFormSchema}
          initialValues={{ type: 'LEAVE', priority: 'NORMAL' }}
          onSubmit={handleCreateRequest}
          onCancel={() => setIsNewRequestOpen(false)}
          submitLabel="ثبت و ارسال درخواست"
        />
      </Modal>
    </div>
  );
}
