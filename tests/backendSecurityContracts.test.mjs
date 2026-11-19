import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = fs.readFileSync(path.join(root, 'server/index.mjs'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'database/sqlserver/v1/013_server_identity_and_audit.sql'), 'utf8');
const lockoutMigration = fs.readFileSync(path.join(root, 'database/sqlserver/v1/015_persistent_login_lockout.sql'), 'utf8');
const writeMigration = fs.readFileSync(path.join(root, 'database/sqlserver/v1/014_api_idempotency_and_outbox.sql'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.ok(server.includes("app.get('/health/live'"), 'liveness endpoint exists');
assert.ok(server.includes("app.get('/health/ready'"), 'readiness endpoint exists');
assert.ok(server.includes("app.post('/api/v1/auth/login'"), 'login endpoint exists');
assert.match(server, /allowDemoAuth = !isProduction && missingEnv\.length > 0 && process\.env\.DEMO_AUTH !== 'false'/);
assert.match(server, /app\.use\('\/api\/v1',[\s\S]*?invalidProductionDriver[\s\S]*?SERVICE_NOT_READY/);
assert.match(server, /AUTH_TOKEN_SECRET \|\| \(allowDemoAuth \? crypto\.randomBytes\(32\) : null\)/);
assert.match(server, /if \(allowDemoAuth && !header\)/);
assert.match(server, /autoSeedEntitiesIfEmpty\(\)[\s\S]*?!allowDemoAuth \|\| entityDriverKind === 'mssql'/);
for (const operation of ['subscribe', 'unsubscribe', 'send']) {
  assert.ok(server.includes(`app.post('/api/v1/push/${operation}', authenticate,`), `push ${operation} uses server identity`);
}
assert.match(server, /sendPushToUser\(req\.auth, payload\)/);
assert.ok(server.includes('crypto.timingSafeEqual'), 'constant-time comparisons are used');
assert.ok(server.includes('crypto.scryptSync'), 'password verifier uses scrypt');
assert.ok(server.includes('function requirePermission'), 'server-side permission gate exists');
assert.ok(server.includes("sp_set_session_context @key=N'TenantId'"), 'tenant context is set inside a transaction');
assert.ok(!/res\.(?:json|send)\(\s*\{[^}]*stack/i.test(server), 'stack traces are not serialized to clients');
assert.ok(migration.includes('security.UserCredential'), 'credential table migration exists');
assert.ok(migration.includes('security.AuditEvent'), 'audit table migration exists');
assert.ok(migration.includes('ON security.UserCredential'), 'credential table is added to tenant RLS policy');
assert.ok(server.includes("app.post('/api/v1/accounts'"), 'account creation endpoint exists');
assert.ok(server.includes("requirePermission('accounts.CREATE')"), 'account creation is permission guarded');
assert.ok(server.includes('integration.ApiIdempotency'), 'write path uses idempotency records');
assert.ok(server.includes('integration.OutboxMessage'), 'write path emits an outbox message');
assert.ok(server.includes('sp_getapplock'), 'idempotency requests are serialized in SQL transaction');
assert.ok(server.includes('security.AuditEvent'), 'successful account creation emits audit event');
assert.ok(server.includes('CUSTOMER_CREATE_PROPOSAL'), 'CRM submits customer proposal instead of creating the ERP master record');
assert.ok(server.includes('canonicalRecordCreated: false'), 'customer proposal explicitly states no canonical ERP record was created');
assert.ok(!/INSERT\s+INTO\s+crm\.Account/i.test(server), 'CRM API never creates the ERP-owned customer master');
assert.ok(server.includes('cursorId') && server.includes('cursorName'), 'account pagination uses a stable composite cursor');
assert.ok(writeMigration.includes('integration.ApiIdempotency'), 'idempotency migration exists');
assert.ok(writeMigration.includes('ADD FILTER PREDICATE security.fn_TenantAccessPredicate(TenantId) ON integration.ApiIdempotency'), 'idempotency records are tenant isolated');
assert.ok(writeMigration.includes('IX_Outbox_Dispatch'), 'outbox dispatch index exists');
assert.ok(server.includes("execute('security.RecordLoginFailure')"), 'login failures are persisted');
assert.ok(server.includes("execute('security.RecordLoginSuccess')"), 'successful login resets failure counter');
assert.ok(lockoutMigration.includes('DATEADD(minute, 15'), 'persistent lockout window exists');
assert.equal(pkg.scripts['start:api'], 'node server/index.mjs');

const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'akhavan-push-store-test-'));
try {
  const fixtureModule = path.join(fixtureDir, 'server', 'pushStore.mjs');
  fs.mkdirSync(path.dirname(fixtureModule));
  fs.copyFileSync(path.join(root, 'server', 'pushStore.mjs'), fixtureModule);
  const pushStore = await import(pathToFileURL(fixtureModule).href);
  const owner = { tenantId: 'tenant-a', userId: 'user-a' };
  const other = { tenantId: 'tenant-b', userId: 'user-a' };
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-fixture',
    keys: { auth: Buffer.alloc(16, 1).toString('base64url'), p256dh: Buffer.alloc(65, 2).toString('base64url') }
  };
  assert.equal(pushStore.saveSubscription(subscription, owner), true);
  assert.equal(pushStore.listSubscriptions(owner).length, 1);
  assert.deepEqual(pushStore.listSubscriptions(other), []);
  assert.equal(pushStore.removeSubscription(subscription.endpoint, other), false);
  assert.equal(pushStore.removeSubscription(subscription.endpoint, owner), true);
  assert.deepEqual(pushStore.listSubscriptions(owner), []);
} finally {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
}
console.log('backend security contracts: PASS');
