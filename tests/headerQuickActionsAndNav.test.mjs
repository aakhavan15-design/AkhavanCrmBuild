import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveHeaderQuickAction } from '../src/lib/headerQuickActions.ts';
import { RBACService } from '../src/lib/rbac.ts';

// ۱. بررسی رجیستری اکشن + هدر بر اساس Route و RBAC
const adminState = {
  currentUserId: 'u-admin',
  users: [{ id: 'u-admin', name: 'مدیر', roleId: 'r-admin', permissionSetId: 'p-admin', isActive: true }],
  roles: [{ id: 'r-admin', name: 'مدیر کل', visibilityScope: 'ORG' }],
  permissionSets: [{
    id: 'p-admin',
    name: 'کامل',
    permissions: ['accounts.view', 'accounts.edit', 'leads.view', 'leads.edit', 'quotes.view', 'quotes.create', 'finance.view', 'finance.manage', 'cases.view', 'cases.edit', 'marketing.manage', 'knowledge.manage', 'internal.view', 'internal.manage'],
  }],
};

const readOnlyState = {
  currentUserId: 'u-view',
  users: [{ id: 'u-view', name: 'بیننده', roleId: 'r-view', permissionSetId: 'p-view', isActive: true }],
  roles: [{ id: 'r-view', name: 'مشاهده‌گر', visibilityScope: 'ORG' }],
  permissionSets: [{
    id: 'p-view',
    name: 'فقط خواندنی',
    permissions: ['accounts.view', 'leads.view', 'quotes.view', 'finance.view', 'cases.view', 'internal.view'],
  }],
};

const adminRbac = new RBACService(adminState);
const viewRbac = new RBACService(readOnlyState);

assert.equal(resolveHeaderQuickAction('/accounts', '', adminRbac)?.path, '/accounts?new=1');
assert.equal(resolveHeaderQuickAction('/leads', '', adminRbac)?.path, '/leads?new=1');
assert.equal(resolveHeaderQuickAction('/quotes', '', adminRbac)?.path, '/quotes?new=1');
assert.equal(resolveHeaderQuickAction('/internal_automation', '?tab=meetings', adminRbac)?.path, '/calendar?new=1');
assert.equal(resolveHeaderQuickAction('/calendar', '?tab=meetings', adminRbac)?.path, '/calendar?tab=meetings&new=1');
assert.equal(resolveHeaderQuickAction('/internal_automation', '', adminRbac)?.path, '/internal_automation?new=1');
assert.equal(resolveHeaderQuickAction('/finance', '', adminRbac)?.path, '/finance?tab=requests&new=1');
assert.equal(resolveHeaderQuickAction('/reports', '', adminRbac), null, 'Read-only reports route must not show + action');
assert.equal(resolveHeaderQuickAction('/audit', '', adminRbac), null, 'Read-only audit route must not show + action');

assert.equal(resolveHeaderQuickAction('/finance', '?tab=payments', adminRbac)?.path, '/finance?tab=payments&new=1');
assert.equal(resolveHeaderQuickAction('/finance', '?tab=collection', adminRbac), null);
assert.equal(resolveHeaderQuickAction('/finance', '?tab=credits', adminRbac), null);
assert.equal(resolveHeaderQuickAction('/marketing', '', adminRbac)?.path, '/marketing?new=1');
assert.equal(resolveHeaderQuickAction('/opportunities', '', adminRbac)?.path, '/opportunities?new=1');
assert.equal(resolveHeaderQuickAction('/accounts/record-1', '', adminRbac), null);
assert.equal(resolveHeaderQuickAction('/accounts-broken', '', adminRbac), null);
assert.equal(resolveHeaderQuickAction('/accounts', ''), null);
const createWithoutWorkspace = new RBACService({
  ...readOnlyState,
  permissionSets: [{ ...readOnlyState.permissionSets[0], permissions: ['accounts.edit'] }],
});
assert.equal(resolveHeaderQuickAction('/accounts', '', createWithoutWorkspace), null);

// کاربر فاقد مجوز ایجاد نباید دکمه + ببیند (fail-closed)
assert.equal(resolveHeaderQuickAction('/accounts', '', viewRbac), null);
assert.equal(resolveHeaderQuickAction('/quotes', '', viewRbac), null);
assert.equal(resolveHeaderQuickAction('/finance', '', viewRbac), null);
assert.equal(resolveHeaderQuickAction('/cases', '', viewRbac), null);

// ۲. بررسی کاتالوگ یگانه ۸ فضای کاری و نبود «مرکز گزارشات» مستقل
const landingSrc = fs.readFileSync(new URL('../src/lib/moduleLanding.ts', import.meta.url), 'utf8');
const navSrc = fs.readFileSync(new URL('../src/lib/navigation.ts', import.meta.url), 'utf8');
const tourSrc = fs.readFileSync(new URL('../src/services/tourEngine.ts', import.meta.url), 'utf8');

for (const id of ['home', 'master', 'sales', 'commerce', 'procurement', 'finance', 'hr', 'organization']) {
  assert.ok(landingSrc.includes(`id: '${id}'`), `Missing canonical workspace ${id}`);
}
assert.ok(!landingSrc.includes("id: 'reports',\n    title: 'گزارشات"), 'Standalone reports workspace must be removed from menu');
assert.ok(navSrc.includes('MODULE_LANDINGS.map'), 'NAV_SECTIONS must derive directly from MODULE_LANDINGS');
assert.ok(landingSrc.includes('/operations?tab=overview'), 'Orphan overview tab must have landing tile');
assert.ok(landingSrc.includes('/operations?tab=purchasing'), 'Orphan purchasing tab must have landing tile');
assert.ok(landingSrc.includes('/operations?tab=profitability'), 'Orphan profitability tab must have landing tile');
assert.ok(landingSrc.includes('/finance?tab=overview'), 'Orphan finance overview tab must have landing tile');
assert.ok(landingSrc.includes('/reports?tab=finance'), 'Orphan finance report domain must have landing tile');
assert.ok(landingSrc.includes('/reports?tab=receivables'), 'Orphan receivables report domain must have landing tile');
assert.ok(!landingSrc.includes('/operations?tab=reconciliation'), 'Operational reconciliation must not appear under commerce landing');
assert.ok(tourSrc.includes("id: 'audit'"), 'tourEngine must include /audit module coverage');

console.log('headerQuickActionsAndNav: OK');
