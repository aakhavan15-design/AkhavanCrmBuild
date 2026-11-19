// Contracts for modules that were previously unused at runtime and are now wired in (r13-cp28).
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import assert from 'node:assert/strict';
const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// 1) RBAC: task visibility follows the management chain (via taskAccessEngine), read-only and capability-gated.
const access = read('src/services/taskAccessEngine.ts').replace(/import type \{[^}]*\} from '\.\.\/types';/, '');
const rbacSrc = read('src/lib/rbac.ts').replace(/import \{[^}]*\} from '\.\.\/types';/, '').replace(/import \{ getManagerChain \} from '\.\.\/services\/taskAccessEngine\.ts';/, '');
const tmp = path.join(os.tmpdir(), `rbac-wired-${Date.now()}.ts`);
fs.writeFileSync(tmp, 'type AppState=any;type CapabilityPermission=string;type UserAccount=any;type NavigationTab=string;\n' + access + '\n' + rbacSrc);
const { RBACService } = await import(tmp);
const users = [
  { id: 'ceo', roleId: 'r_owner', permissionSetId: 'ps', isActive: true },
  { id: 'sup', roleId: 'r_owner', permissionSetId: 'ps', managerId: 'ceo', isActive: true },
  { id: 'vis', roleId: 'r_owner', permissionSetId: 'ps', managerId: 'sup', isActive: true },
  { id: 'other', roleId: 'r_owner', permissionSetId: 'ps', isActive: true },
  { id: 'nocap', roleId: 'r_owner', permissionSetId: 'ps_none', managerId: undefined, isActive: true },
];
const make = (currentUserId, us = users) => new RBACService({ users: us, currentUserId, roles: [{ id: 'r_owner', visibilityScope: 'OWNER' }], permissionSets: [{ id: 'ps', permissions: ['accounts.view', 'internal.view'] }, { id: 'ps_none', permissions: [] }] });
assert.equal(make('sup').canActOnRecord('tasks', 'VIEW', { ownerId: 'vis' }), true, 'direct manager sees subordinate task');
assert.equal(make('ceo').canActOnRecord('tasks', 'VIEW', { ownerId: 'vis' }), true, 'upper manager sees task through the chain');
assert.equal(make('other').canActOnRecord('tasks', 'VIEW', { ownerId: 'vis' }), false, 'unrelated user cannot see it');
assert.equal(make('vis').canActOnRecord('tasks', 'VIEW', { ownerId: 'sup' }), false, 'subordinate cannot see manager task');
assert.equal(make('sup').canActOnRecord('tasks', 'EDIT', { ownerId: 'vis' }), false, 'chain visibility is read-only');
assert.equal(make('sup').canActOnRecord('accounts', 'VIEW', { ownerId: 'vis' }), false, 'chain visibility applies to tasks only');
const looped = users.map(u => u.id === 'ceo' ? { ...u, managerId: 'vis' } : u);
assert.equal(make('other', looped).canActOnRecord('tasks', 'VIEW', { ownerId: 'vis' }), false, 'manager cycles are safe');

// 2) Wiring: UI really imports and uses the engines.
const tasks = read('src/components/TasksWorkspace.tsx');
assert.ok(/canCreateCrossDepartmentTask\(/.test(tasks) && tasks.includes("from '../services/taskAccessEngine'"), 'task save uses canCreateCrossDepartmentTask');
const geo = read('src/components/GeoIntelligenceWorkspace.tsx');
assert.ok(geo.includes("from '../lib/geoRoutingEngine'") && geo.includes('optimizeRouteStops(origin, stops)') && geo.includes('routePlan&&'), 'zone operations show the suggested visit route');
assert.ok(/get provider\(\): DataProvider/.test(read('src/services/repository.ts')) && !/provider: getActiveDataProvider\(\)/.test(read('src/services/repository.ts')), 'repositories resolve the provider lazily');

// 3) Demo authentication can never ship in a production build by accident.
const auth = read('src/services/AuthService.ts');
assert.ok(/DEMO_AUTH_ENABLED\s*=\s*import\.meta\.env\?\.DEV === true \|\| import\.meta\.env\?\.VITE_ENABLE_DEMO_DATA === 'true'/.test(auth), 'demo auth flag derives from DEV or explicit env');
assert.ok(auth.indexOf('if (!DEMO_AUTH_ENABLED)') > 0 && auth.indexOf('if (!DEMO_AUTH_ENABLED)') < auth.indexOf("'123456'"), 'demo fallback is guarded before any default password');

// 4) Tour anchor kept in sync with the Finance workspace.
assert.ok(read('src/components/FinanceWorkspace.tsx').includes('id="fin-trend"'), 'fin-trend tour anchor exists');
console.log('wiredModulesContracts.test.mjs: PASS');
