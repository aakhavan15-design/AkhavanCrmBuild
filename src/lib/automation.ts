import { AppState, BusinessEvent, Job, CustomerTask } from '../types';
import { generateId } from './utils';
import { getSegmentMembers } from './segments';

let isProcessingJobs = false;

/** کاتالوگ واحد رویدادها/اکشن‌های قابل استفاده در قوانین (UI تنظیمات از همین‌جا می‌خواند). */
export const AUTOMATION_EVENT_TYPES: { value: string; label: string }[] = [
  { value: 'OPPORTUNITY_CREATED', label: 'ثبت فرصت فروش جدید' },
  { value: 'QUOTE_APPROVED', label: 'تأیید پیش‌فاکتور' },
  { value: 'QUOTE_HANDOFF', label: 'ارجاع پیش‌فاکتور به عملیات' },
  { value: 'TASK_CREATED', label: 'ثبت وظیفه جدید' },
  { value: 'TASK_SLA_BREACHED', label: 'شکست مهلت تعهد وظیفه' },
  { value: 'TASK_OVERDUE', label: 'وظیفه معوق' },
  { value: 'INTERNAL_REQUEST_SUBMITTED', label: 'ثبت درخواست سازمانی' },
  { value: 'INTERNAL_REQUEST_APPROVED', label: 'تأیید درخواست سازمانی' },
  { value: 'FINANCE_REQUEST_SUBMITTED', label: 'ثبت درخواست مالی' },
  { value: 'CAMPAIGN_CREATED', label: 'ایجاد کمپین' },
  { value: 'ERP_SYNC_COMPLETED', label: 'همگام‌سازی سامانه مالی تکمیل شد' },
];
export const AUTOMATION_ACTION_TYPES: { value: string; label: string }[] = [
  { value: 'CREATE_TASK', label: 'ایجاد وظیفه پیگیری' },
  { value: 'NOTIFY_USER', label: 'ارسال اعلان به کاربر' },
  { value: 'NOTIFY_ROLE', label: 'اعلان به نقش / سطح دسترسی' },
  { value: 'ESCALATE_MANAGER', label: 'ارجاع به مدیر مستقیم' },
];

export function evaluateAutomations(event: BusinessEvent, state: AppState, updateState: (fn: (draft: AppState) => void) => void) {
  const activeRules = (state.automations || []).filter((a: Record<string, unknown>) => a.active && a.triggerEvent === event.type);
  
  activeRules.forEach((rule: Record<string, unknown>) => {
    let conditionMet = true;
    if (rule.conditions && rule.conditions.length > 0) {
      conditionMet = rule.conditions.every((cond: Record<string, unknown>) => {
        if (!event.payload) return true;
        const val = event.payload[cond.field];
        if (cond.operator === '=') return val == cond.value;
        if (cond.operator === '!=') return val != cond.value;
        if (cond.operator === '>') return Number(val) > Number(cond.value);
        if (cond.operator === '<') return Number(val) < Number(cond.value);
        return true;
      });
    }

    if (conditionMet) {
      (rule.actions || []).forEach((action: Record<string, unknown>) => {
        enqueueJob(action.type, { ...action.payload, sourceEvent: event }, state, updateState);
      });
    }
  });
}

export function enqueueJob(type: string, payload: Record<string, unknown>, state: AppState, updateState: (fn: (draft: AppState) => void) => void) {
  const idempotencyKey = payload?.idempotencyKey;
  
  if (idempotencyKey) {
    const existing = (state.jobs || []).find((j: Record<string, unknown>) => j.idempotencyKey === idempotencyKey && (j.status === 'COMPLETED' || j.status === 'PENDING' || j.status === 'RUNNING'));
    if (existing) return;
  }

  updateState((draft: AppState) => {
    if (!draft.jobs) draft.jobs = [];
    draft.jobs.push({
      id: generateId(),
      type,
      payload,
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 3,
      idempotencyKey,
      correlationId: payload?.sourceEvent?.correlationId,
      createdAt: new Date().toISOString()
    });
  });
}

export async function processPendingJobs(state: AppState, updateState: (fn: (draft: AppState) => void) => void) {
  if (isProcessingJobs) return;
  isProcessingJobs = true;

  try {
    const now = new Date();
    const pendingJobs = (state.jobs || []).filter((j: Record<string, unknown>) => 
      (j.status === 'PENDING' || j.status === 'RETRYING') && 
      (!j.nextAttemptAt || new Date(j.nextAttemptAt) <= now)
    );

    if (pendingJobs.length === 0) return;

    for (const job of pendingJobs) {
      updateState((draft: AppState) => {
        const draftJob = (draft.jobs || []).find((x: unknown) => x.id === job.id);
        if (draftJob) draftJob.status = 'RUNNING';
      });

      try {
        await executeJobAction(job, state, updateState);
        
        updateState((draft: AppState) => {
          const draftJob = (draft.jobs || []).find((x: unknown) => x.id === job.id);
          if (draftJob) {
            draftJob.status = 'COMPLETED';
            draftJob.completedAt = new Date().toISOString();
          }
        });
      } catch (error: unknown) {
        updateState((draft: AppState) => {
          const draftJob = (draft.jobs || []).find((x: unknown) => x.id === job.id);
          if (draftJob) {
            draftJob.attempts += 1;
            draftJob.error = error.message;
            // Missing integration is a configuration failure, not a transient error worth retrying.
            if (String(error?.message || '').includes('NOT_CONFIGURED') || draftJob.attempts >= draftJob.maxAttempts) {
              draftJob.status = 'FAILED';
              // شکست قطعی (Dead-letter): از صف خارج می‌شود و به مدیر اعلان می‌دهد؛ ضدتکرار با dedupeKey
              if (!draft.notifications) draft.notifications = [];
              const dlKey = `job-failed:${draftJob.id}`;
              if (!draft.notifications.some((n: Record<string, unknown>) => n.dedupeKey === dlKey)) {
                draft.notifications.push({
                  id: generateId(), title: 'شکست قطعی عملیات پس‌زمینه',
                  message: `عملیات «${draftJob.type}» پس از ${draftJob.attempts} تلاش ناموفق ماند${String(error?.message || '').includes('NOT_CONFIGURED') ? ' (درگاه پیکربندی نشده است)' : ''}.`,
                  type: 'ERROR', read: false, createdAt: new Date().toISOString(), dedupeKey: dlKey, entityId: draftJob.id
                } as Record<string, unknown>);
              }
            } else {
              draftJob.status = 'RETRYING';
              draftJob.nextAttemptAt = new Date(Date.now() + 60000).toISOString();
            }
          }
        });
      }
    }
  } finally {
    isProcessingJobs = false;
  }
}

async function executeJobAction(job: Job, state: AppState, updateState: (fn: (draft: AppState) => void) => void) {
  switch (job.type) {
    case 'CREATE_TASK':
      updateState((draft: AppState) => {
        if (!draft.tasks) draft.tasks = [];
        const t: CustomerTask = {
          id: generateId(),
          title: job.payload.title,
          description: job.payload.description,
          assigneeType: job.payload.assigneeType || 'USER',
          assigneeId: job.payload.assigneeId || draft.currentUserId,
          accountId: job.payload.accountId,
          dueDate: job.payload.dueDate || new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
          priority: job.payload.priority || 'NORMAL',
          status: 'OPEN',
          slaStatus: 'ON_TRACK',
          createdAt: new Date().toISOString()
        };
        draft.tasks.unshift(t);
      });
      break;

    case 'NOTIFY_USER':
    case 'NOTIFY_ROLE':
      updateState((draft: AppState) => {
        if (!draft.notifications) draft.notifications = [];
        const dedupeKey = job.payload?.dedupeKey || `job-notify:${job.id}`;
        if (draft.notifications.some((n: Record<string, unknown>) => n.dedupeKey === dedupeKey)) return;
        draft.notifications.push({
          id: generateId(),
          title: job.payload?.title || 'اعلان سیستمی',
          message: job.payload?.message || '',
          type: job.payload?.type || 'INFO',
          read: false,
          createdAt: new Date().toISOString(),
          linkTab: job.payload?.linkTab || 'home',
          recipientId: job.payload?.recipientId,
          dedupeKey,
          entityId: job.payload?.entityId,
        } as Record<string, unknown>);
      });
      break;

    case 'ESCALATE_MANAGER':
      updateState((draft: AppState) => {
        if (!draft.notifications) draft.notifications = [];
        const assigneeId = job.payload?.assigneeId;
        const user = (draft.users || []).find((u: Record<string, unknown>) => u.id === assigneeId);
        const managerId = user?.managerId || user?.parentId;
        if (!managerId) return;
        const dedupeKey = job.payload?.dedupeKey || `escalate:${job.payload?.entityId || job.id}`;
        if (draft.notifications.some((n: Record<string, unknown>) => n.dedupeKey === dedupeKey)) return;
        draft.notifications.push({
          id: generateId(),
          title: job.payload?.title || 'ارجاع هشدار به مدیر',
          message: job.payload?.message || 'یک مورد عملیاتی برای پیگیری مدیر ارجاع شد.',
          type: 'WARNING',
          read: false,
          createdAt: new Date().toISOString(),
          linkTab: job.payload?.linkTab || 'tasks',
          recipientId: managerId,
          dedupeKey,
          entityId: job.payload?.entityId,
        } as Record<string, unknown>);
      });
      break;

    case 'SEND_CHANNEL_MESSAGE':
      // No real provider adapter exists in this client build. Configuration fields alone are not proof of delivery.
      throw new Error('NOT_CONFIGURED: no verified server-side messaging adapter is available.');

    case 'EVALUATE_DYNAMIC_CAMPAIGN':
      const campaign = (state.campaigns || []).find((c: Record<string, unknown>) => c.id === job.payload.campaignId);
      if (!campaign || campaign.mode !== 'DYNAMIC' || !campaign.segmentId) break;
      
      const accountIds = getSegmentMembers(campaign.segmentId, state);
      accountIds.forEach(accId => {
        enqueueJob('EXECUTE_CAMPAIGN_MESSAGE', { campaignId: campaign.id, accountId: accId }, state, updateState);
      });
      break;

    case 'EXECUTE_CAMPAIGN_MESSAGE':
      updateState((draft: AppState) => {
        if (!draft.campaignExecutions) draft.campaignExecutions = [];
        draft.campaignExecutions.push({
          id: generateId(),
          campaignId: job.payload.campaignId,
          accountId: job.payload.accountId,
          channel: 'WHATSAPP',
          status: 'NOT_CONFIGURED',
          createdAt: new Date().toISOString()
        });
      });
      break;

    default:
      console.warn(`Unknown job type: ${job.type}`);
  }
}

export async function sendChannelMessage(
  providerId: string, 
  to: string, 
  message: string, 
  state: AppState
): Promise<{ success: boolean; status: string }> {
  const provider = (state.providers || []).find((p: Record<string, unknown>) => p.id === providerId);
  
  if (!provider) {
    return { success: false, status: 'NOT_FOUND' };
  }

  if (!provider.active || provider.status !== 'CONNECTED' || !provider.endpoint || !provider.token) {
    return { success: false, status: 'NOT_CONFIGURED' };
  }

  // Do not report SENT until a real adapter returns a provider delivery result.
  return { success: false, status: 'NOT_CONFIGURED' };
}
