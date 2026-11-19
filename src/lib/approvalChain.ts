/**
 * ApprovalChain — multi-stage org request workflow (2026 Global-Scale)
 * Visible circulation: each step has role, label, and optional ERP handoff flag.
 */
import type { AppState, InternalRequest, RequestType } from '../types';
import { routeInternalRequest } from './internalAutomation';

export type ApprovalStepKey =
  | 'SUBMITTED'
  | 'MANAGER_REVIEW'
  | 'FINANCE_REVIEW'
  | 'ERP_HANDOFF'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED';

export interface ApprovalStepDef {
  key: ApprovalStepKey;
  label: string;
  role: 'CREATOR' | 'MANAGER' | 'FINANCE' | 'ERP' | 'SYSTEM';
  /** When true, CRM only prepares handoff — ERP remains system of record */
  erpHandoff?: boolean;
}

export interface ApprovalStepState extends ApprovalStepDef {
  status: 'pending' | 'active' | 'done' | 'skipped' | 'rejected';
  actorId?: string;
  at?: string;
  comment?: string;
}

/** Built-in defaults — overridden by settings.orgConfig.approvalChains[type] when present */
export const DEFAULT_CHAIN_BY_FAMILY = {
  finance: [
    { key: 'SUBMITTED' as const, label: 'ثبت درخواست', role: 'CREATOR' as const },
    { key: 'MANAGER_REVIEW' as const, label: 'بررسی مدیر مستقیم', role: 'MANAGER' as const },
    { key: 'FINANCE_REVIEW' as const, label: 'بررسی مالی', role: 'FINANCE' as const },
    { key: 'ERP_HANDOFF' as const, label: 'آماده‌سازی ورود به سامانه مالی', role: 'ERP' as const, erpHandoff: true },
    { key: 'COMPLETED' as const, label: 'بسته شد', role: 'SYSTEM' as const },
  ],
  standard: [
    { key: 'SUBMITTED' as const, label: 'ثبت درخواست', role: 'CREATOR' as const },
    { key: 'MANAGER_REVIEW' as const, label: 'بررسی مدیر / مسئول', role: 'MANAGER' as const },
    { key: 'APPROVED' as const, label: 'تأیید نهایی', role: 'MANAGER' as const },
    { key: 'COMPLETED' as const, label: 'بسته شد', role: 'SYSTEM' as const },
  ],
};

export const FINANCE_REQUEST_TYPES: RequestType[] = ['PAYMENT', 'EXPENSE', 'ADVANCE', 'PURCHASE'];

export type ApprovalChainsConfig = Partial<Record<RequestType | string, ApprovalStepDef[]>>;

/** Read configured chain from settings, else family default */
export function getChainTemplate(
  type: RequestType,
  chainsConfig?: ApprovalChainsConfig | null
): ApprovalStepDef[] {
  const configured = chainsConfig?.[type];
  if (Array.isArray(configured) && configured.length >= 2) {
    return configured.map((s) => ({
      key: s.key,
      label: s.label || s.key,
      role: s.role || 'MANAGER',
      erpHandoff: !!s.erpHandoff,
    }));
  }
  if (FINANCE_REQUEST_TYPES.includes(type)) return [...DEFAULT_CHAIN_BY_FAMILY.finance];
  return [...DEFAULT_CHAIN_BY_FAMILY.standard];
}

export function getChainsConfigFromState(state?: AppState | null): ApprovalChainsConfig {
  return ((state?.settings as Record<string, unknown>)?.orgConfig?.approvalChains || {}) as ApprovalChainsConfig;
}

export function initApprovalChain(
  type: RequestType,
  creatorId: string,
  at: string,
  chainsConfig?: ApprovalChainsConfig | null
): ApprovalStepState[] {
  const template = getChainTemplate(type, chainsConfig);
  return template.map((step, index) => ({
    ...step,
    status: index === 0 ? 'done' : index === 1 ? 'active' : 'pending',
    actorId: index === 0 ? creatorId : undefined,
    at: index === 0 ? at : undefined,
    comment: index === 0 ? 'ثبت توسط درخواست‌دهنده' : undefined,
  }));
}

/** Schema version for audit; stored on request as approvalChainVersion */
export const APPROVAL_CHAIN_SCHEMA_VERSION = 1;

export function getActiveStep(steps?: ApprovalStepState[]): ApprovalStepState | undefined {
  return (steps || []).find((s) => s.status === 'active');
}

/**
 * Advance one step on approve. Returns next status string for InternalRequest.status
 * and whether ERP handoff note should be shown.
 */
export function advanceApprovalOnApprove(
  request: InternalRequest,
  actorId: string,
  at: string,
  comment?: string
): {
  steps: ApprovalStepState[];
  status: string;
  erpHandoffReady: boolean;
  done: boolean;
} {
  const steps: ApprovalStepState[] = Array.isArray((request as Record<string, unknown>).approvalSteps)
    ? structuredClone((request as Record<string, unknown>).approvalSteps)
    : initApprovalChain(request.type, request.creatorId, request.createdAt || at, undefined);

  const activeIdx = steps.findIndex((s) => s.status === 'active');
  if (activeIdx < 0) {
    return { steps, status: request.status, erpHandoffReady: false, done: true };
  }

  steps[activeIdx] = {
    ...steps[activeIdx],
    status: 'done',
    actorId,
    at,
    comment: comment || 'تأیید مرحله',
  };

  const nextIdx = activeIdx + 1;
  if (nextIdx >= steps.length) {
    return { steps, status: 'COMPLETED', erpHandoffReady: false, done: true };
  }

  const next = steps[nextIdx];
  // Auto-complete pure SYSTEM terminal if previous was final business step
  if (next.key === 'COMPLETED' && steps[activeIdx].key !== 'ERP_HANDOFF') {
    steps[nextIdx] = { ...next, status: 'done', actorId, at, comment: 'اتمام گردش' };
    return {
      steps,
      status: steps[activeIdx].key === 'APPROVED' || steps[activeIdx].key === 'FINANCE_REVIEW' ? 'APPROVED' : 'COMPLETED',
      erpHandoffReady: steps[activeIdx].erpHandoff === true,
      done: true,
    };
  }

  if (next.key === 'ERP_HANDOFF') {
    steps[nextIdx] = {
      ...next,
      status: 'done',
      actorId,
      at,
      comment: 'آماده‌سازی برای سامانه مالی — ثبت سند رسمی فقط در سامانه مالی',
    };
    // mark COMPLETED as pending for ERP confirmation later
    if (nextIdx + 1 < steps.length) {
      steps[nextIdx + 1] = { ...steps[nextIdx + 1], status: 'active' };
    }
    return { steps, status: 'APPROVED', erpHandoffReady: true, done: false };
  }

  if (next.key === 'APPROVED') {
    steps[nextIdx] = { ...next, status: 'done', actorId, at, comment: comment || 'تأیید نهایی' };
    if (nextIdx + 1 < steps.length && steps[nextIdx + 1].key === 'COMPLETED') {
      steps[nextIdx + 1] = {
        ...steps[nextIdx + 1],
        status: 'done',
        actorId,
        at,
        comment: 'اتمام گردش',
      };
    }
    return { steps, status: 'APPROVED', erpHandoffReady: false, done: true };
  }

  steps[nextIdx] = { ...next, status: 'active' };
  const statusMap: Record<string, string> = {
    MANAGER_REVIEW: 'IN_REVIEW',
    FINANCE_REVIEW: 'IN_REVIEW',
    ERP_HANDOFF: 'APPROVED',
    APPROVED: 'APPROVED',
    COMPLETED: 'COMPLETED',
  };
  return {
    steps,
    status: statusMap[next.key] || 'IN_REVIEW',
    erpHandoffReady: false,
    done: false,
  };
}

export function rejectApprovalChain(
  request: InternalRequest,
  actorId: string,
  at: string,
  comment?: string
): ApprovalStepState[] {
  const steps: ApprovalStepState[] = Array.isArray((request as Record<string, unknown>).approvalSteps)
    ? structuredClone((request as Record<string, unknown>).approvalSteps)
    : initApprovalChain(request.type, request.creatorId, request.createdAt || at, undefined);

  return steps.map((s) => {
    if (s.status === 'active') {
      return { ...s, status: 'rejected' as const, actorId, at, comment: comment || 'رد' };
    }
    if (s.status === 'pending') return { ...s, status: 'skipped' as const };
    return s;
  });
}

/** Suggest next assignee after advancing a step */
export function suggestAssigneeForActiveStep(
  state: AppState,
  request: InternalRequest,
  steps: ApprovalStepState[]
): string | undefined {
  const active = getActiveStep(steps);
  if (!active) return undefined;
  if (active.role === 'MANAGER') return routeInternalRequest(request, state);
  if (active.role === 'FINANCE') {
    const fin = (state.users || []).find((u: Record<string, unknown>) => {
      if ((u.isActive ?? u.active) === false) return false;
      const ps = (state.permissionSets || []).find((p: Record<string, unknown>) => p.id === u.permissionSetId);
      return !!ps?.permissions?.includes('finance.manage') || !!ps?.permissions?.includes('finance.view');
    });
    return fin?.id;
  }
  return undefined;
}

/** Build timeline items for UI from request */
export function requestTimelineItems(
  request: InternalRequest,
  chainsConfig?: ApprovalChainsConfig | null
): Array<{
  id: string;
  label: string;
  state: 'done' | 'active' | 'pending' | 'rejected';
  meta?: string;
  at?: string;
}> {
  const steps: ApprovalStepState[] = Array.isArray((request as Record<string, unknown>).approvalSteps)
    ? (request as Record<string, unknown>).approvalSteps
    : initApprovalChain(request.type, request.creatorId, request.createdAt || new Date().toISOString(), chainsConfig);
  return steps.map((s, i) => ({
    id: `${request.id}-step-${i}`,
    label: s.label,
    state:
      s.status === 'done'
        ? 'done'
        : s.status === 'active'
          ? 'active'
          : s.status === 'rejected'
            ? 'rejected'
            : 'pending',
    meta: s.comment || (s.erpHandoff ? 'سند رسمی فقط در سامانه مالی' : undefined),
    at: s.at,
  }));
}
