import type { PermAction, PermModule } from './rbac';

export interface QuickActionRbac {
  can(module: PermModule, action: PermAction): boolean;
  hasPermission(permission: string): boolean;
}

export interface HeaderQuickAction {
  id: string;
  label: string;
  path: string;
  allowed: boolean;
}

/**
 * F1-04: رجیستری یگانهٔ دکمهٔ «+» هدر بر اساس مسیر جاری و سطح دسترسی (RBAC).
 * صفحه‌های صرفاً تحلیلی یا فقط‌خواندنی (مانند گزارش‌ها و پایش مغایرت) اقدام ایجاد دریافت نمی‌کنند.
 */
export function resolveHeaderQuickAction(
  pathname: string,
  search = '',
  rbac: QuickActionRbac | null = null
): HeaderQuickAction | null {
  const allow = (check: () => boolean) => (rbac ? check() : true);
  const cleanPath = pathname.split('?')[0] || '/';
  const tab = (new URLSearchParams(search).get('tab') || '').toLowerCase();

  if (cleanPath.startsWith('/accounts') || cleanPath.startsWith('/customers')) {
    const allowed = allow(() => rbac!.can('accounts', 'CREATE'));
    return allowed ? { id: 'create-account', label: 'ثبت مشتری جدید', path: '/accounts?new=1', allowed } : null;
  }

  if (cleanPath.startsWith('/leads')) {
    const allowed = allow(() => rbac!.can('leads', 'CREATE'));
    return allowed ? { id: 'create-lead', label: 'ثبت سرنخ جدید', path: '/leads?new=1', allowed } : null;
  }

  if (cleanPath.startsWith('/opportunities')) {
    const allowed = allow(() => rbac!.can('opportunities', 'CREATE'));
    return allowed ? { id: 'create-opportunity', label: 'ثبت فرصت فروش', path: '/opportunities?new=1', allowed } : null;
  }

  if (cleanPath.startsWith('/quotes')) {
    const allowed = allow(() => rbac!.can('quotes', 'CREATE'));
    return allowed ? { id: 'create-quote', label: 'صدور پیش‌فاکتور جدید', path: '/quotes?new=1', allowed } : null;
  }

  if (cleanPath.startsWith('/tasks')) {
    const allowed = allow(() => rbac!.can('tasks', 'CREATE'));
    return allowed ? { id: 'create-task', label: 'ایجاد وظیفه جدید', path: '/tasks?new=1', allowed } : null;
  }

  if (cleanPath.startsWith('/internal_automation')) {
    if (tab === 'meetings') {
      const allowed = allow(() => rbac!.can('calendar', 'CREATE'));
      return allowed ? { id: 'create-meeting', label: 'ثبت جلسه جدید', path: '/calendar?new=1', allowed } : null;
    }
    const allowed = allow(() => rbac!.can('internal', 'CREATE'));
    return allowed ? { id: 'create-internal-request', label: 'ثبت درخواست سازمانی', path: '/internal_automation?new=1', allowed } : null;
  }

  if (cleanPath.startsWith('/calendar')) {
    const allowed = allow(() => rbac!.can('calendar', 'CREATE'));
    return allowed ? { id: 'create-meeting', label: 'برنامه‌ریزی جلسه جدید', path: '/calendar?new=1', allowed } : null;
  }

  if (cleanPath.startsWith('/cases')) {
    const allowed = allow(() => rbac!.can('cases', 'CREATE'));
    return allowed ? { id: 'create-case', label: 'ثبت پرونده خدمات', path: '/cases?new=1', allowed } : null;
  }

  if (cleanPath.startsWith('/marketing')) {
    const allowed = allow(() => rbac!.hasPermission('marketing.manage'));
    return allowed ? { id: 'create-campaign', label: 'ایجاد کمپین جدید', path: '/marketing?new=1', allowed } : null;
  }

  if (cleanPath.startsWith('/knowledge')) {
    const allowed = allow(() => rbac!.hasPermission('knowledge.manage'));
    return allowed ? { id: 'create-article', label: 'ثبت مقاله جدید', path: '/knowledge?new=1', allowed } : null;
  }

  if (cleanPath.startsWith('/finance')) {
    const allowed = allow(() => rbac!.can('payments', 'CREATE'));
    return allowed ? { id: 'create-payment', label: 'ثبت دریافتی جدید', path: '/finance?tab=payments&new=1', allowed } : null;
  }

  if (cleanPath === '/') {
    const allowed = allow(() => rbac!.can('tasks', 'CREATE'));
    return allowed ? { id: 'create-task-home', label: 'ایجاد مورد جدید', path: '/tasks?new=1', allowed } : null;
  }

  return null;
}
