import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const auth = fs.readFileSync(path.join(root, 'src/services/AuthService.ts'), 'utf8');
const login = fs.readFileSync(path.join(root, 'src/components/LoginWorkspace.tsx'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
assert.ok(auth.includes("fetch('/api/v1/auth/login'"), 'authentication uses the server endpoint');
assert.ok(auth.includes('credentials: \'same-origin\''), 'authentication is same-origin');
assert.ok(auth.includes('accessTokenExpiresAt'), 'server session expires locally with token lifetime');
assert.ok(!/u\s*===\s*'admin'|u\.includes\('اخوان'\)|state\?\.users\[0\]/.test(auth), 'local users cannot bypass server authentication');
assert.ok(!/useState\('admin'\)|useState\('123456'\)|handleBiometricLogin|handleQuickLogin/.test(login), 'login has no seeded credentials or fake shortcuts');
assert.ok(app.includes('!AuthService.isAuthenticated()'), 'protected routes redirect unauthenticated users');
console.log('auth security contracts: PASS');

const server = fs.readFileSync(path.join(root, 'server/index.mjs'), 'utf8');
const sqlLogin = server.slice(server.indexOf('const credentialOk'), server.indexOf('const isUuid'));
assert.doesNotMatch(sqlLogin, /demoUsers|validPasswords|matched\.id/, 'SQL login cannot fall back to demo credentials');
assert.match(sqlLogin, /const profile = await withTenantContext\(\{ tenantId: user\.TenantId, userId: user\.UserId \}/);
assert.ok(server.includes('OUTER APPLY (SELECT TOP (1) r.RoleId'), 'login resolves an active server role');
assert.ok(server.includes('rp.PermissionCode, rp.ScopeCode, rp.FieldCode, rp.FieldAccess'), 'login projects server permissions and scopes');
assert.ok(server.includes("code: 'ROLE_NOT_ASSIGNED'"), 'login fails closed when no active role is assigned');
assert.ok(auth.includes("permissionSet: PermissionSet") && auth.includes("role: Role"), 'client accepts authoritative role and permission projections');
assert.ok(login.includes('draft.permissionSets = [...(draft.permissionSets || [])'), 'login hydrates the production permission projection');
assert.ok(login.includes('draft.roles = [...(draft.roles || [])'), 'login hydrates the production role projection');

const permissionCatalog = fs.readFileSync(path.join(root, 'database/sqlserver/v1/016_permission_catalog.sql'), 'utf8');
assert.ok(permissionCatalog.includes("N'accounts.create'"), 'permission catalog defines the protected account proposal operation');
assert.ok(permissionCatalog.includes('WHERE NOT EXISTS'), 'permission catalog migration is idempotent');
assert.ok(permissionCatalog.includes('grants no role access'), 'permission catalog does not grant permissions to tenant roles');
assert.ok(server.includes("String(permission).trim().toLowerCase()"), 'API permission checks normalize permission codes');
assert.match(server, /hasSqlPermission\(req\.auth, permission\)/);
assert.match(server, /u\.UserId=ur\.UserId AND u\.IsActive=1/);
assert.match(server, /t\.TenantId=ur\.TenantId AND t\.IsActive=1/);
assert.match(server, /rp\.FieldCode=N'' AND rp\.FieldAccess='DO'/);

assert.ok(server.includes("u.TenantId, u.UserId"), 'login profile includes canonical tenant id for record-scope checks');
assert.ok(auth.includes('tenantId: serverUser.tenantId'), 'client uses canonical tenant id rather than tenant code');
