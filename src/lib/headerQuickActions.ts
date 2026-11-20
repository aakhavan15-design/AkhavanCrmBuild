import type { NavigationTab } from '../types';
import type { PermModule } from './rbac';

export interface QuickActionRbac {
  can(module: PermModule, action: 'CREATE'): boolean;
  canAccessWorkspace(workspace: NavigationTab): boolean;
  hasPermission(permission: string): boolean;
}

export interface HeaderQuickAction {
  id: string;
  label: string;
  path: string;
}

type ActionDefinition = HeaderQuickAction & {
  workspace: NavigationTab;
  permission: { module: PermModule } | { capability: string };
};

const task: ActionDefinition = {
  id: 'create-task', label: 'ایجاد وظیفه جدید', path: '/tasks?new=1',
  workspace: 'tasks', permission: { module: 'tasks' },
};
const meeting: ActionDefinition = {
  id: 'create-meeting', label: 'ثبت جلسه جدید', path: '/calendar?new=1',
  workspace: 'calendar', permission: { module: 'calendar' },
};
const receipt: ActionDefinition = {
  id: 'create-payment', label: 'ثبت دریافتی جدید', path: '/finance?tab=payments&new=1',
  workspace: 'finance', permission: { module: 'payments' },
};
const paymentOrder: ActionDefinition = {
  id: 'create-payment-order', label: 'ثبت دستور پرداخت', path: '/finance?tab=requests&new=1',
  workspace: 'finance', permission: { module: 'financeRequests' },
};

const actionsByRoute: ReadonlyMap<string, ActionDefinition> = new Map([
  ['/', task],
  ['/tasks', task],
  ['/calendar', meeting],
  ['/internal_automation:meetings', meeting],
  ['/calendar:meetings', { ...meeting, path: '/calendar?tab=meetings&new=1' }],
  ['/finance', paymentOrder],
  ['/finance:overview', paymentOrder],
  ['/finance:requests', paymentOrder],
  ['/finance:treasury', paymentOrder],
  ['/finance:payments', receipt],
  ['/accounts', { id: 'create-account', label: 'ثبت مشتری جدید', path: '/accounts?new=1', workspace: 'accounts', permission: { module: 'accounts' } }],
  ['/leads', { id: 'create-lead', label: 'ثبت سرنخ جدید', path: '/leads?new=1', workspace: 'leads', permission: { module: 'leads' } }],
  ['/opportunities', { id: 'create-opportunity', label: 'ثبت فرصت فروش', path: '/opportunities?new=1', workspace: 'leads', permission: { module: 'opportunities' } }],
  ['/quotes', { id: 'create-quote', label: 'صدور پیش‌فاکتور جدید', path: '/quotes?new=1', workspace: 'quotes', permission: { module: 'quotes' } }],
  ['/internal_automation', { id: 'create-internal-request', label: 'ثبت درخواست سازمانی', path: '/internal_automation?new=1', workspace: 'internal_automation', permission: { module: 'internal' } }],
  ['/cases', { id: 'create-case', label: 'ثبت پرونده خدمات', path: '/cases?new=1', workspace: 'cases', permission: { module: 'cases' } }],
  ['/marketing', { id: 'create-campaign', label: 'ایجاد کمپین جدید', path: '/marketing?new=1', workspace: 'marketing', permission: { capability: 'marketing.manage' } }],
  ['/knowledge', { id: 'create-article', label: 'ثبت مقاله جدید', path: '/knowledge?new=1', workspace: 'knowledge', permission: { capability: 'knowledge.manage' } }],
]);

export function resolveHeaderQuickAction(
  pathname: string,
  search = '',
  rbac: QuickActionRbac | null = null
): HeaderQuickAction | null {
  if (!rbac) return null;
  const route = pathname.replace(/\/+$/, '') || '/';
  const tab = new URLSearchParams(search).get('tab')?.toLowerCase();
  const contextual = tab ? actionsByRoute.get(`${route}:${tab}`) : undefined;
  const action = contextual ?? (route === '/finance' && tab ? undefined : actionsByRoute.get(route));
  if (!action || !rbac.canAccessWorkspace(action.workspace)) return null;

  const { permission, id, label, path } = action;
  const allowed = 'module' in permission
    ? rbac.can(permission.module, 'CREATE')
    : rbac.hasPermission(permission.capability);
  return allowed ? { id, label, path } : null;
}
