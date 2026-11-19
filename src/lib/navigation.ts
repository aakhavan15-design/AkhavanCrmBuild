/** Canonical sales workspace path */
export const SALES_WORKSPACE_PATH = '/workspace/sales';
import type { LucideIcon } from 'lucide-react';
import type { RBACService } from './rbac';
import type { NavigationTab } from '../types';
import { MODULE_ACCESS_PERMS, MODULE_LANDINGS, resolveModuleLandingId } from './moduleLanding';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Navigation target (may include ?tab=) */
  path: string;
  /** RBAC workspace permission key (or an extended key, see EXTENDED_PERMS) */
  perm: string;
  /** Path prefixes (segment-aware) that make this item active */
  match: string[];
  /** Item is active only on this ?tab= value */
  tab?: string;
  /** With `tab`: item is also active when the route has no ?tab= (the workspace default view) */
  isDefault?: boolean;
  /** Optional ?sub= value (second-level view inside a tab, e.g. settings → users → roles) */
  sub?: string;
  /** With `sub`: item is also active when ?sub= is absent */
  subDefault?: boolean;
  /** Item is NOT active when ?tab= is one of these (they belong to sibling items) */
  excludeTabs?: string[];
  /** Secondary destinations shown as a compact nested branch, not page-level pills. */
  children?: NavItem[];
}

export interface NavSection {
  id: string;
  title: string;
  items: NavItem[];
}

/**
 * F1-01 / F1-02 / F1-03:
 * کاتالوگ ناوبری اصلی مستقیماً از کاتالوگ یگانهٔ `MODULE_LANDINGS` تولید می‌شود تا یک منبع واحد وجود داشته باشد.
 * «مرکز گزارشات» مستقل از منوی اصلی حذف شده و هر گزارش زیر فضای مالک قرار دارد؛ مسیر `/reports` برای Deep Link همچنان فعال است.
 */
export const NAV_SECTIONS: NavSection[] = MODULE_LANDINGS.map(mod => ({
  id: mod.id,
  title: mod.title,
  items: [
    {
      id: mod.id,
      label: mod.title,
      icon: mod.icon,
      path: `/workspace/${mod.id}` /* e.g. path: '/workspace/sales' */,
      perm: `module:${mod.id}`,
      match: [`/workspace/${mod.id}`],
    },
  ],
}));

/** Segment-aware prefix match: '/operations' does not match '/operations_control' */
export function pathMatches(pathname: string, prefix: string): boolean {
  if (prefix === '/') return pathname === '/';
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

export function flattenNavItems(items: NavItem[]): NavItem[] {
  return items.flatMap(item => [item, ...flattenNavItems(item.children || [])]);
}

function moduleOwnerOfRoute(pathname: string, search = ''): string | null {
  const params = new URLSearchParams(search);
  const tab = (params.get('tab') || '').toLowerCase();
  const auditMod = (params.get('module') || '').toLowerCase();

  if (pathname.startsWith('/workspace/')) {
    const seg = pathname.split('/').filter(Boolean)[1];
    return resolveModuleLandingId(seg) || null;
  }

  if (
    pathname === '/' ||
    pathname === '/dashboard' ||
    pathname === '/command' ||
    ['/tasks', '/internal_automation', '/calendar', '/groups', '/activities'].includes(pathname)
  ) {
    return 'home';
  }

  if (pathname === '/sync-center') return 'master';
  if (pathname === '/onboarding' || pathname === '/personnel-file') return 'hr';

  if (
    pathname.startsWith('/accounts') ||
    pathname.startsWith('/customers') ||
    ['/cases', '/marketing', '/knowledge', '/leads', '/opportunities', '/quotes'].includes(pathname)
  ) {
    return 'sales';
  }

  if (pathname === '/geo-intelligence') return 'commerce';

  if (pathname === '/operations') {
    if (tab === 'purchasing') return 'procurement';
    if (tab === 'credit' || tab === 'profitability') return 'finance';
    if (tab === 'policies') return 'organization';
    return 'commerce';
  }

  if (pathname === '/finance') {
    return tab === 'invoices' ? 'commerce' : 'finance';
  }

  if (pathname === '/reports') {
    if (tab === 'finance' || tab === 'receivables') return 'finance';
    if (tab === 'distribution') return 'commerce';
    return 'sales';
  }

  if (pathname === '/audit') {
    if (auditMod === 'finance') return 'finance';
    if (auditMod === 'commerce') return 'commerce';
    if (auditMod === 'sales' || auditMod === 'customers') return 'sales';
    if (auditMod === 'organization') return 'organization';
    if (auditMod === 'work') return 'hr';
    return 'home';
  }

  if (pathname === '/settings') {
    if (tab === 'users' || tab === 'groups') return 'master';
    return 'organization';
  }

  return null;
}

export function isNavActive(item: NavItem, pathname: string, search = ''): boolean {
  if (item.path === `/workspace/${item.id}` && moduleOwnerOfRoute(pathname, search) === item.id) return true;
  if (!item.match.some(m => pathMatches(pathname, m))) return false;
  const tab = (new URLSearchParams(search).get('tab') || '').toLowerCase() || null;
  if (item.tab && item.sub !== undefined) {
    const sub = (new URLSearchParams(search).get('sub') || '').toLowerCase();
    if (tab !== item.tab || (sub || (item.subDefault ? item.sub : '')) !== item.sub) return false;
    return true;
  }
  if (item.tab) return tab ? tab === item.tab : item.isDefault === true;
  if (item.excludeTabs && tab && item.excludeTabs.includes(tab)) return false;
  return true;
}

/**
 * The first nav item (depth-first) that is active for a location — used for page titles
 * and breadcrumbs so header text always matches the menu wording.
 */
export function findActiveNav(pathname: string, search = ''): { section: NavSection; item: NavItem; parent?: NavItem } | null {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      const child = (item.children || []).find(c => isNavActive(c, pathname, search));
      if (child) return { section, item: child, parent: item };
      if (isNavActive(item, pathname, search)) return { section, item };
    }
  }
  return null;
}

const ALWAYS_ALLOWED = new Set(['home', 'profile']);

/**
 * Extended permission keys for views that live inside a shared workspace. They mirror
 * exactly the visibility rules already enforced in-page (OperationsControlWorkspace.visibleTabs),
 * so the menu never offers a view the page would refuse to show.
 */
const EXTENDED_PERMS: Record<string, (r: RBACService) => boolean> = {
  'command': r => r.hasPermission('accounts.view') || r.hasPermission('internal.view'),
  'groups': r => r.hasPermission('accounts.view') || r.hasPermission('internal.view') || r.hasPermission('internal.manage'),
  'users': r => r.hasPermission('users.manage') || r.hasPermission('roles.manage') || r.hasPermission('settings.manage'),
  'ops.orders': r => r.can('quotes', 'VIEW') || r.can('finance', 'VIEW'),
  'ops.inventory': r => r.can('quotes', 'VIEW') || r.can('finance', 'VIEW'),
  'ops.dispatch': r => r.can('internal', 'VIEW'),
  'ops.returns': r => r.can('finance', 'VIEW'),
  'ops.credit': r => r.can('finance', 'VIEW'),
  'ops.profitability': r => r.can('finance', 'VIEW') || r.can('internal', 'VIEW'),
  'ops.reports': r => r.can('reports', 'VIEW'),
  'ops.reconciliation': r => r.can('cases', 'VIEW') || r.can('finance', 'VIEW'),
  'ops.purchasing': r => r.can('internal', 'EDIT'),
  'ops.policies': r => r.can('settings', 'VIEW'),
};

export function makeCanAccess(rbac: RBACService | null) {
  return (perm: string): boolean => {
    if (!rbac) return true;
    if (perm.startsWith('module:')) {
      const moduleId = perm.slice('module:'.length);
      return (MODULE_ACCESS_PERMS[moduleId] || []).some(key => {
        if (ALWAYS_ALLOWED.has(key)) return true;
        const nested = EXTENDED_PERMS[key];
        return nested ? (key.startsWith('ops.') ? rbac.canAccessWorkspace('operations_control') : true) && nested(rbac) : rbac.canAccessWorkspace(key as NavigationTab);
      });
    }
    if (ALWAYS_ALLOWED.has(perm)) return true;
    const extended = EXTENDED_PERMS[perm];
    if (extended) return (perm.startsWith('ops.') ? rbac.canAccessWorkspace('operations_control') : true) && extended(rbac);
    return rbac.canAccessWorkspace(perm as NavigationTab);
  };
}
