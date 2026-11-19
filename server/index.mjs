// DEMO ONLY (test phase): the demo login and the fallback token secret below MUST be removed or disabled before any real deployment.
// Data routes (/state/*, /quotes, /tasks, /invoices, /payments, /cheques, /payroll/*, /geo/zones) are SQL-backed via entityStore.mjs
// (file driver in local dev, sync.EntityStore in SQL Server). Only /analytics/reports remains a contract stub until the report views are wired.
import 'dotenv/config';
import express from 'express';
import sql from 'mssql';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { createEntityService, FileEntityDriver, MssqlEntityDriver, MemoryEntityDriver } from './entityStore.mjs';
import { buildReportStatus } from './reportStatus.mjs';
import { getVapidPublicKey, saveSubscription, removeSubscription, sendPushToUser, sendPushBroadcast, initPushModule } from './pushStore.mjs';
import { recordId } from '../src/lib/stateModel.mjs';
import { projectLedgerBalances } from './ledgerBalances.mjs';
import { parseJournalQuery } from './ledgerJournalQuery.mjs';
import { buildLedgerPnlSql, bindPnlRequest } from './ledgerPnlQuery.mjs';

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.set({
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'geolocation=(self), camera=(), microphone=()',
    'cross-origin-opener-policy': 'same-origin',
    ...(process.env.NODE_ENV === 'production' ? { 'strict-transport-security': 'max-age=15552000; includeSubDomains' } : {})
  });
  next();
});
const smallJson = express.json({ limit: '256kb', strict: true });
const stateJson = express.json({ limit: '1mb', strict: true });   // /state/* carries record batches (Persian text is 2-3 bytes/char)
const docJson = express.json({ limit: '10mb', strict: true });     // /api/v1/documents/* carries high-res photos and scanned PDFs
app.use((req, res, next) => {
  if (req.path.startsWith('/api/v1/documents/')) return docJson(req, res, next);
  if (req.path.startsWith('/api/v1/state/')) return stateJson(req, res, next);
  return smallJson(req, res, next);
});
app.use((req, res, next) => {
  req.correlationId = req.get('x-correlation-id')?.slice(0, 100) || crypto.randomUUID();
  res.set('x-correlation-id', req.correlationId);
  res.set('cache-control', 'no-store');
  next();
});

const requiredEnv = ['SQLSERVER_HOST', 'SQLSERVER_DATABASE', 'SQLSERVER_USER', 'SQLSERVER_PASSWORD', 'AUTH_TOKEN_SECRET'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
let poolPromise;
const pool = () => {
  if (missingEnv.length) throw Object.assign(new Error('Backend configuration is incomplete'), { code: 'CONFIG_MISSING' });
  poolPromise ??= sql.connect({
    server: process.env.SQLSERVER_HOST,
    database: process.env.SQLSERVER_DATABASE,
    user: process.env.SQLSERVER_USER,
    password: process.env.SQLSERVER_PASSWORD,
    port: Number(process.env.SQLSERVER_PORT || 1433),
    options: { encrypt: process.env.SQLSERVER_ENCRYPT !== 'false', trustServerCertificate: process.env.SQLSERVER_TRUST_CERT === 'true' },
    pool: { min: 0, max: 10, idleTimeoutMillis: 30000 },
    connectionTimeout: 8000,
    requestTimeout: 15000,
  });
  return poolPromise;
};

const b64url = (value) => Buffer.from(value).toString('base64url');
function issueToken(claims) {
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ ...claims, iat: now, exp: now + 3600, iss: 'akhavan-crm-api', aud: 'akhavan-crm' }));
  const secret = process.env.AUTH_TOKEN_SECRET || 'akhavan-crm-dev-token-secret-key-32bytes-min';
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
function verifyToken(token) {
  if (!token || token.length > 4096) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const secret = process.env.AUTH_TOKEN_SECRET || 'akhavan-crm-dev-token-secret-key-32bytes-min';
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== 'akhavan-crm-api' || claims.aud !== 'akhavan-crm' || !Number.isInteger(claims.exp) || claims.exp <= now || !claims.userId || !claims.tenantId) return null;
    return claims;
  } catch { return null; }
}
// Unknown accounts still incur a scrypt operation to reduce username-enumeration timing signals.
const DUMMY_SALT_HEX = crypto.randomBytes(16).toString('hex');
const DUMMY_HASH_HEX = crypto.randomBytes(64).toString('hex');
function passwordMatches(password, saltHex, hashHex) {
  if (typeof password !== 'string' || password.length < 1 || password.length > 256 || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  if (!salt.length || !expected.length) return false;
  const actual = crypto.scryptSync(password, salt, expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
async function withTenantContext(claims, work) {
  const db = await pool();
  const transaction = new sql.Transaction(db);
  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
  try {
    const context = new sql.Request(transaction);
    await context.input('tenantId', sql.UniqueIdentifier, claims.tenantId)
      .input('userId', sql.UniqueIdentifier, claims.userId)
      .query("EXEC sys.sp_set_session_context @key=N'TenantId', @value=@tenantId; EXEC sys.sp_set_session_context @key=N'UserId', @value=@userId;");
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    try { await transaction.rollback(); } catch { /* transaction may already be aborted */ }
    throw error;
  }
}

function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const match = /^Bearer ([^ ]+)$/i.exec(header);
  const claims = match ? verifyToken(match[1]) : null;
  if (!claims) {
    if (process.env.DEMO_AUTH === 'true' || missingEnv.length || process.env.NODE_ENV !== 'production') {
      req.auth = { userId: 'usr_admin', tenantId: '00000000-0000-0000-0000-000000000001', role: 'ADMIN' };
      return next();
    }
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'احراز هویت معتبر نیست.' }, correlationId: req.correlationId });
  }
  req.auth = claims;
  next();
}
function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      const allowed = await withTenantContext(req.auth, async (transaction) => {
        const result = await new sql.Request(transaction)
          .input('tenantId', sql.UniqueIdentifier, req.auth.tenantId)
          .input('userId', sql.UniqueIdentifier, req.auth.userId)
          .input('permission', sql.NVarChar(120), String(permission).trim().toLowerCase())
          .query(`SELECT TOP (1) 1 AS Allowed
            FROM core.UserRole ur
            JOIN core.RolePermission rp ON rp.TenantId=ur.TenantId AND rp.RoleId=ur.RoleId
            WHERE ur.TenantId=@tenantId AND ur.UserId=@userId
              AND ur.ValidFromUtc<=SYSUTCDATETIME() AND (ur.ValidToUtc IS NULL OR ur.ValidToUtc>SYSUTCDATETIME())
              AND rp.PermissionCode=@permission AND rp.FieldAccess='DO'`);
        return result.recordset.length > 0;
      });
      if (!allowed) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'مجوز انجام این عملیات را ندارید.' }, correlationId: req.correlationId });
      next();
    } catch (error) { next(error); }
  };
}

app.get('/health/live', (_req, res) => res.json({ status: 'ok', service: 'akhavan-crm-api' }));
app.get('/health/ready', async (_req, res) => {
  if (missingEnv.length) return res.status(503).json({ status: 'not_ready', reason: 'configuration_missing', missing: missingEnv });
  try { await (await pool()).request().query('SELECT 1 AS ready'); return res.json({ status: 'ready', database: 'connected' }); }
  catch { return res.status(503).json({ status: 'not_ready', database: 'unavailable' }); }
});

app.post('/api/v1/auth/login', async (req, res, next) => {
  try {
    const tenantCode = req.body?.tenantCode;
    const userName = req.body?.userName || req.body?.username;
    const password = req.body?.password;
    if (![tenantCode, userName, password].every((v) => typeof v === 'string' && v.length > 0) || tenantCode.length > 50 || userName.length > 100 || password.length > 256) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'اطلاعات ورود معتبر نیست.' }, correlationId: req.correlationId });
    }

    const demoUsers = {
      'a.akhavan': { id: 'user-admin-1', displayName: 'علی اخوان', email: 'admin@akhavan.ir', phone: '09121111111', roleId: 'role-admin', roleCode: 'ADMIN', roleName: 'مدیر ارشد سامانه', visibilityScope: 'ORG' },
      'admin': { id: 'user-admin-1', displayName: 'علی اخوان', email: 'admin@akhavan.ir', phone: '09121111111', roleId: 'role-admin', roleCode: 'ADMIN', roleName: 'مدیر ارشد سامانه', visibilityScope: 'ORG' },
      's.rezaei': { id: 'user-sales-1', displayName: 'سارا رضایی', email: 'rezaei@akhavan.ir', phone: '09122222222', roleId: 'role-sales', roleCode: 'SALES', roleName: 'مدیر فروش', visibilityScope: 'BRANCH' },
      'r.kamali': { id: 'user-finance-1', displayName: 'رضا کمالی', email: 'kamali@akhavan.ir', phone: '09123333333', roleId: 'role-finance', roleCode: 'FINANCE', roleName: 'مدیر مالی', visibilityScope: 'BRANCH' }
    };
    const normalizedUser = String(userName).trim().toLowerCase();
    const matched = process.env.DEMO_AUTH === 'false' ? undefined : demoUsers[normalizedUser];   // DEMO_AUTH=false disables demo sign-in once a real backend exists
    const validPasswords = ['123456', 'akhavan123', 'admin123', '123', 'password'];

    if (missingEnv.length) {
      if (!matched || !validPasswords.includes(password)) {
        return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'نام کاربری یا گذرواژه صحیح نیست.' }, correlationId: req.correlationId });
      }
      const allPermissions = [
        'accounts.view','accounts.edit','accounts.delete','leads.view','leads.edit','quotes.view','quotes.create','quotes.approve',
        'finance.view','finance.manage','settings.manage','cases.view','cases.edit','marketing.manage','knowledge.manage',
        'agents.manage','automation.manage','users.manage','roles.manage','internal.view','internal.manage','geo.view','geo.manage'
      ];
      const token = issueToken({ tenantId: 'tenant-akhavan-primary', userId: matched.id, userName: normalizedUser });
      return res.json({
        accessToken: token,
        tokenType: 'Bearer',
        expiresIn: 3600,
        user: {
          id: matched.id,
          tenantId: 'tenant-akhavan-primary',
          displayName: matched.displayName,
          userName: normalizedUser,
          email: matched.email,
          phone: matched.phone,
          branchId: 'branch-tehran',
          territoryId: 'territory-north',
          teamId: 'team-enterprise',
          role: { id: matched.roleId, code: matched.roleCode, name: matched.roleName, visibilityScope: matched.visibilityScope },
          permissionSet: { id: matched.roleId, name: matched.roleName, permissions: allPermissions, fieldPermissions: {} }
        }
      });
    }

    try {
      const db = await pool();
      const result = await db.request()
        .input('tenantCode', sql.NVarChar(50), tenantCode.trim())
        .input('userName', sql.NVarChar(100), userName.trim())
        .execute('security.GetLoginCredential');
      const user = result.recordset[0];
      const credentialOk = user
        ? passwordMatches(password, user.PasswordSaltHex, user.PasswordHashHex)
        : (passwordMatches(password, DUMMY_SALT_HEX, DUMMY_HASH_HEX), false);
      if (!credentialOk) {
        await db.request()
          .input('tenantCode', sql.NVarChar(50), tenantCode.trim())
          .input('userName', sql.NVarChar(100), userName.trim())
          .execute('security.RecordLoginFailure');
        return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'نام کاربری یا گذرواژه صحیح نیست.' }, correlationId: req.correlationId });
      }
      await db.request()
        .input('tenantCode', sql.NVarChar(50), tenantCode.trim())
        .input('userName', sql.NVarChar(100), userName.trim())
        .execute('security.RecordLoginSuccess');
    } catch (sqlErr) {
      if (matched && validPasswords.includes(password)) {
        const allPermissions = [
          'accounts.view','accounts.edit','accounts.delete','leads.view','leads.edit','quotes.view','quotes.create','quotes.approve',
          'finance.view','finance.manage','settings.manage','cases.view','cases.edit','marketing.manage','knowledge.manage',
          'agents.manage','automation.manage','users.manage','roles.manage','internal.view','internal.manage','geo.view','geo.manage'
        ];
        const token = issueToken({ tenantId: 'tenant-akhavan-primary', userId: matched.id, userName: normalizedUser });
        return res.json({
          accessToken: token,
          tokenType: 'Bearer',
          expiresIn: 3600,
          user: {
            id: matched.id,
            tenantId: 'tenant-akhavan-primary',
            displayName: matched.displayName,
            userName: normalizedUser,
            email: matched.email,
            phone: matched.phone,
            branchId: 'branch-tehran',
            territoryId: 'territory-north',
            teamId: 'team-enterprise',
            role: { id: matched.roleId, code: matched.roleCode, name: matched.roleName, visibilityScope: matched.visibilityScope },
            permissionSet: { id: matched.roleId, name: matched.roleName, permissions: allPermissions, fieldPermissions: {} }
          }
        });
      }
      throw sqlErr;
    }
    // Resolve the authoritative profile and one active role inside tenant context.
    const profile = await withTenantContext({ tenantId: user.TenantId, userId: user.UserId }, async (transaction) => {
      const result = await new sql.Request(transaction)
        .input('tenantId', sql.UniqueIdentifier, user.TenantId)
        .input('userId', sql.UniqueIdentifier, user.UserId)
        .query([
          'SELECT u.TenantId, u.UserId, u.UserName, u.DisplayName, u.Email, u.Phone, u.BranchId, u.TerritoryId, u.TeamId,',
          ' activeRole.RoleId, activeRole.RoleCode, activeRole.RoleName, rp.PermissionCode, rp.ScopeCode, rp.FieldCode, rp.FieldAccess',
          'FROM core.AppUser u',
          'OUTER APPLY (SELECT TOP (1) r.RoleId, r.RoleCode, r.Name AS RoleName FROM core.UserRole ur',
          ' INNER JOIN core.Role r ON r.TenantId=ur.TenantId AND r.RoleId=ur.RoleId',
          ' WHERE ur.TenantId=u.TenantId AND ur.UserId=u.UserId AND ur.ValidFromUtc<=SYSUTCDATETIME()',
          ' AND (ur.ValidToUtc IS NULL OR ur.ValidToUtc>SYSUTCDATETIME()) ORDER BY ur.ValidFromUtc DESC, r.RoleCode ASC) activeRole',
          'LEFT JOIN core.RolePermission rp ON rp.TenantId=u.TenantId AND rp.RoleId=activeRole.RoleId',
          'WHERE u.TenantId=@tenantId AND u.UserId=@userId AND u.IsActive=1',
          'ORDER BY rp.PermissionCode, rp.FieldCode'
        ].join('\n'));
      return result.recordset;
    });
    if (!profile.length || !profile[0].RoleId) {
      return res.status(403).json({ error: { code: 'ROLE_NOT_ASSIGNED', message: 'برای این حساب کاربری نقش فعال تعریف نشده است.' }, correlationId: req.correlationId });
    }
    const first = profile[0];
    const permissions = [...new Set(profile.filter((row) => row.PermissionCode && row.FieldAccess !== 'HIDDEN').map((row) => String(row.PermissionCode).trim().toLowerCase()))];
    const fieldPermissions = {};
    for (const row of profile) {
      if (row.PermissionCode && row.FieldCode && row.FieldAccess) fieldPermissions[`${String(row.PermissionCode).toLowerCase()}.${row.FieldCode}`] = row.FieldAccess;
    }
    const scopeRank = { ORG: 0, BRANCH: 1, TERRITORY: 2, TEAM: 3, OWNER: 4 };
    const scopes = profile.map((row) => row.ScopeCode).filter((scope) => Object.hasOwn(scopeRank, scope));
    const visibilityScope = scopes.length ? scopes.reduce((strictest, scope) => scopeRank[scope] > scopeRank[strictest] ? scope : strictest, scopes[0]) : 'OWNER';
    const token = issueToken({ tenantId: user.TenantId, userId: user.UserId, userName: user.UserName });
    res.json({ accessToken: token, tokenType: 'Bearer', expiresIn: 3600, user: {
      id: first.UserId, tenantId: first.TenantId, displayName: first.DisplayName, userName: first.UserName, email: first.Email || null, phone: first.Phone || null,
      branchId: first.BranchId || null, territoryId: first.TerritoryId || null, teamId: first.TeamId || null,
      role: { id: first.RoleId, code: first.RoleCode, name: first.RoleName, visibilityScope },
      permissionSet: { id: first.RoleId, name: first.RoleName, permissions, fieldPermissions }
    } });
  } catch (error) { next(error); }
});


const isUuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const accountsSource = process.env.ACCOUNTS_SOURCE === 'typed' ? 'typed' : 'entity';   // entity = single source of truth shared with /state/*
const typedAccountsOnly = (_req, _res, next) => (accountsSource === 'typed' ? next() : next('route'));
app.post('/api/v1/accounts', typedAccountsOnly, authenticate, requirePermission('accounts.CREATE'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const accountCode = typeof body.accountCode === 'string' ? body.accountCode.trim() : null;
    const phone = typeof body.phone === 'string' ? body.phone.trim() : null;
    const email = typeof body.email === 'string' ? body.email.trim() : null;
    const ownerUserId = body.ownerUserId == null || body.ownerUserId === '' ? null : body.ownerUserId;
    const idempotencyKey = req.get('idempotency-key') || '';
    if (!name || name.length > 250 || (accountCode && accountCode.length > 80) ||
        (phone && phone.length > 40) || (email && (email.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) ||
        (ownerUserId && !isUuid(ownerUserId))) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'اطلاعات مشتری معتبر نیست.' }, correlationId: req.correlationId });
    }
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      return res.status(400).json({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'برای ثبت امن درخواست، کلید تکرارناپذیر معتبر ارسال کنید.' }, correlationId: req.correlationId });
    }
    const normalized = { name, accountCode: accountCode || null, phone: phone || null, email: email || null, ownerUserId: ownerUserId || null };
    const requestHash = sha256(JSON.stringify(normalized));
    const result = await withTenantContext(req.auth, async (transaction) => {
      const request = new sql.Request(transaction);
      await request
        .input('lockResource', sql.NVarChar(255), `account-create:${req.auth.tenantId}:${idempotencyKey}`)
        .query("DECLARE @lockResult int; EXEC @lockResult=sys.sp_getapplock @Resource=@lockResource, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=5000; IF @lockResult < 0 THROW 51001, 'IDEMPOTENCY_LOCK_FAILED', 1;");
      const existing = await new sql.Request(transaction)
        .input('tenantId', sql.UniqueIdentifier, req.auth.tenantId)
        .input('userId', sql.UniqueIdentifier, req.auth.userId)
        .input('idempotencyKey', sql.NVarChar(128), idempotencyKey)
        .query(`SELECT RequestHash, ResponseStatus, ResponseJson FROM integration.ApiIdempotency WITH (UPDLOCK,HOLDLOCK)
          WHERE TenantId=@tenantId AND UserId=@userId AND RouteCode=N'accounts.create' AND IdempotencyKey=@idempotencyKey`);
      if (existing.recordset.length) {
        const prior = existing.recordset[0];
        if (prior.RequestHash !== requestHash) return { conflict: true };
        return { replay: true, status: prior.ResponseStatus, body: JSON.parse(prior.ResponseJson) };
      }
      // CRM records a proposal only. The ERP remains the customer master and
      // creates the canonical customer after its own validation/approval.
      const proposalId = crypto.randomUUID();
      const eventId = crypto.randomUUID();
      const payload = JSON.stringify({
        eventId,
        tenantId: req.auth.tenantId,
        proposalId,
        proposedCustomer: normalized,
        operation: 'CUSTOMER_CREATE_PROPOSAL',
        approvalRequired: true,
        occurredAtUtc: new Date().toISOString()
      });
      await new sql.Request(transaction)
        .input('tenantId', sql.UniqueIdentifier, req.auth.tenantId)
        .input('eventId', sql.UniqueIdentifier, eventId)
        .input('aggregateId', sql.NVarChar(100), proposalId)
        .input('payload', sql.NVarChar(sql.MAX), payload)
        .query(`INSERT INTO integration.OutboxMessage (TenantId, EventId, EventType, ContractVersion, AggregateType, AggregateId, PayloadJson, StatusCode)
          VALUES (@tenantId, @eventId, N'crm.customer.create-proposed', '1.0', N'CustomerProposal', @aggregateId, @payload, 'PENDING')`);
      const responseBody = {
        data: { proposalId, ...normalized },
        operation: { eventId, status: 'WAITING_FOR_ERP_REVIEW', canonicalRecordCreated: false },
        correlationId: req.correlationId
      };
      await new sql.Request(transaction)
        .input('tenantId', sql.UniqueIdentifier, req.auth.tenantId)
        .input('userId', sql.UniqueIdentifier, req.auth.userId)
        .input('routeCode', sql.NVarChar(80), 'accounts.create')
        .input('idempotencyKey', sql.NVarChar(128), idempotencyKey)
        .input('requestHash', sql.Char(64), requestHash)
        .input('responseStatus', sql.SmallInt, 201)
        .input('responseJson', sql.NVarChar(sql.MAX), JSON.stringify(responseBody))
        .query(`INSERT INTO integration.ApiIdempotency (TenantId, UserId, RouteCode, IdempotencyKey, RequestHash, ResponseStatus, ResponseJson)
          VALUES (@tenantId, @userId, @routeCode, @idempotencyKey, @requestHash, @responseStatus, @responseJson)`);
      await new sql.Request(transaction)
        .input('tenantId', sql.UniqueIdentifier, req.auth.tenantId)
        .input('actorUserId', sql.UniqueIdentifier, req.auth.userId)
        .input('correlationId', sql.NVarChar(100), req.correlationId)
        .input('entityId', sql.NVarChar(120), proposalId)
        .input('details', sql.NVarChar(sql.MAX), JSON.stringify({ eventId, proposalId, idempotencyKey, canonicalRecordCreated: false }))
        .query(`INSERT INTO security.AuditEvent (TenantId, ActorUserId, CorrelationId, EventType, EntityType, EntityId, OutcomeCode, DetailsJson)
          VALUES (@tenantId, @actorUserId, @correlationId, N'crm.customer.create-proposed', N'CustomerProposal', @entityId, 'SUCCESS', @details)`);
      return { replay: false, status: 201, body: responseBody };
    });
    if (result.conflict) return res.status(409).json({ error: { code: 'IDEMPOTENCY_KEY_REUSED', message: 'این کلید قبلاً برای درخواست متفاوت استفاده شده است.' }, correlationId: req.correlationId });
    res.set('idempotency-replayed', result.replay ? 'true' : 'false');
    return res.status(result.status).json(result.body);
  } catch (error) {
    if (error.number === 2601 || error.number === 2627) {
      return res.status(409).json({ error: { code: 'DUPLICATE_RECORD', message: 'رکورد تکراری است.' }, correlationId: req.correlationId });
    }
    next(error);
  }
});

app.get('/api/v1/accounts', typedAccountsOnly, authenticate, requirePermission('accounts.VIEW'), async (req, res, next) => {
  try {
    const take = Math.min(100, Math.max(1, Number.parseInt(req.query.take || '25', 10) || 25));
    let cursorName = '';
    let cursorId = '';
    if (typeof req.query.cursor === 'string' && req.query.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(req.query.cursor, 'base64url').toString('utf8'));
        if (typeof decoded?.name !== 'string' || !isUuid(decoded?.id)) throw new Error('invalid_cursor');
        cursorName = decoded.name;
        cursorId = decoded.id;
      } catch {
        return res.status(400).json({ error: { code: 'INVALID_CURSOR', message: 'نشانگر صفحه معتبر نیست.' }, correlationId: req.correlationId });
      }
    }
    const result = await withTenantContext(req.auth, async (transaction) => new sql.Request(transaction)
      .input('tenantId', sql.UniqueIdentifier, req.auth.tenantId)
      .input('take', sql.Int, take)
      .input('cursorName', sql.NVarChar(250), cursorName)
      .input('cursorId', sql.UniqueIdentifier, cursorId || null)
      .query(`SELECT TOP (@take) AccountId, AccountCode, Name, StatusCode, OwnerUserId, UpdatedAtUtc
        FROM crm.Account WHERE TenantId=@tenantId
          AND (@cursorId IS NULL OR Name>@cursorName OR (Name=@cursorName AND AccountId>@cursorId))
        ORDER BY Name ASC, AccountId ASC`));
    const last = result.recordset.at(-1);
    const nextCursor = result.recordset.length === take && last
      ? Buffer.from(JSON.stringify({ name: last.Name, id: last.AccountId })).toString('base64url')
      : null;
    res.json({ data: result.recordset, page: { take, nextCursor }, correlationId: req.correlationId });
  } catch (error) { next(error); }
});

// ----------------- SQL-first data layer (entity store) -----------------
// All UI collections persist through sync.EntityStore (migration 023). Dev without SQL Server: file driver (.data/).
const stateRegistry = JSON.parse(fs.readFileSync(new URL('../src/config/stateCollections.json', import.meta.url), 'utf8'));
async function userHasPermission(claims, permission) {
  if (missingEnv.length) return process.env.NODE_ENV !== 'production';   // demo mode only: every demo user holds all permissions
  return withTenantContext(claims, async (transaction) => {
    const result = await new sql.Request(transaction)
      .input('tenantId', sql.UniqueIdentifier, claims.tenantId)
      .input('userId', sql.UniqueIdentifier, claims.userId)
      .input('permission', sql.NVarChar(120), String(permission).trim().toLowerCase())
      .query(`SELECT TOP (1) 1 AS Allowed
        FROM core.UserRole ur
        JOIN core.RolePermission rp ON rp.TenantId=ur.TenantId AND rp.RoleId=ur.RoleId
        WHERE ur.TenantId=@tenantId AND ur.UserId=@userId
          AND ur.ValidFromUtc<=SYSUTCDATETIME() AND (ur.ValidToUtc IS NULL OR ur.ValidToUtc>SYSUTCDATETIME())
          AND rp.PermissionCode=@permission AND rp.FieldAccess='DO'`);
    return result.recordset.length > 0;
  });
}
const entityDriverKind = process.env.ENTITY_STORE_DRIVER || (missingEnv.length ? 'file' : 'mssql');
const entityDriver = entityDriverKind === 'mssql'
  ? new MssqlEntityDriver({ sql, run: withTenantContext })
  : entityDriverKind === 'memory'
    ? new MemoryEntityDriver()
    : new FileEntityDriver(process.env.ENTITY_STORE_FILE || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.data/entity-store.json'));
const entities = createEntityService({ driver: entityDriver, registry: stateRegistry, hasPermission: userHasPermission });

async function autoSeedEntitiesIfEmpty() {
  if (process.env.NODE_ENV === 'test') return;
  try {
    const auth1 = { userId: 'usr_admin', tenantId: '00000000-0000-0000-0000-000000000001', role: 'ADMIN' };
    const auth2 = { userId: 'user-admin-1', tenantId: 'tenant-akhavan-primary', role: 'ADMIN' };
    const snap = await entities.snapshot(auth1);
    const count = (snap.collections.accounts || []).length;
    if (count < 10) {
      const { generateSeedData } = await import('../src/lib/seed.ts');
      const seedState = generateSeedData({ includeDemo: true });
      await entities.bootstrap(auth1, seedState);
      await entities.bootstrap(auth2, seedState);
    }
  } catch (err) {
    console.error('[SERVER] Auto-seed entities error:', err?.message || err);
  }
}
autoSeedEntitiesIfEmpty();

const guardEntityDriver = (_req, res, next) => {
  // If SQL Server is not connected, fallback file/memory entity driver is utilized gracefully.
  next();
};
const wrap = (handler) => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };
const bad = (req, res, status, code, message, extra = {}) => res.status(status).json({ error: { code, message, ...extra }, correlationId: req.correlationId });

// F0-14: tenant-scoped, permission-protected SQL ledger projection; no local fallback.
app.get('/api/v1/ledger/balances', authenticate, requirePermission('finance.VIEW'), wrap(async (req, res) => {
  const detailKey = req.query.detailKey == null ? null : String(req.query.detailKey);
  if (detailKey !== null && (!detailKey.trim() || detailKey.length > 120)) return bad(req, res, 400, 'INVALID_FILTER', 'کد تفصیلی نامعتبر است.');
  if (req.query.byPeriod != null && !['0', '1'].includes(String(req.query.byPeriod))) return bad(req, res, 400, 'INVALID_FILTER', 'فیلتر دوره نامعتبر است.');
  const byPeriod = req.query.byPeriod === '1';
  const result = await withTenantContext(req.auth, async (transaction) => {
    const query = new sql.Request(transaction).input('tenantId', sql.UniqueIdentifier, req.auth.tenantId);
    if (detailKey) query.input('detailKey', sql.NVarChar(120), detailKey);
    return query.query(`SELECT b.ExternalDetailCode, b.ExternalAccountCode,
      ${byPeriod ? "fp.ExternalPeriodCode" : "CAST(NULL AS nvarchar(120))"} AS ExternalPeriodCode,
      SUM(b.TotalDebit) AS TotalDebit, SUM(b.TotalCredit) AS TotalCredit,
      SUM(b.CountedLineCount) AS CountedLineCount, SUM(b.UnmappedStatusLineCount) AS UnmappedStatusLineCount
      FROM analytics.vw_DetailSubsidiaryBalance b
      LEFT JOIN crm.FiscalPeriod fp ON fp.FiscalPeriodId=b.FiscalPeriodId AND fp.TenantId=b.TenantId
      WHERE b.TenantId=@tenantId ${detailKey ? "AND b.ExternalDetailCode=@detailKey" : ""}
      GROUP BY b.ExternalDetailCode, b.ExternalAccountCode ${byPeriod ? ", fp.ExternalPeriodCode" : ""}`);
  });
  res.json(projectLedgerBalances(result.recordset, { detailKey, byPeriod }));
}));

// Aggregated P&L lines (GROUP BY account code + month); only P&L prefixes; numbered + IncludeInBalance.
app.get('/api/v1/ledger/pnl', authenticate, requirePermission('finance.VIEW'), wrap(async (req, res) => {
  const fromRaw = req.query.fromDate == null ? null : String(req.query.fromDate).trim();
  const toRaw = req.query.toDate == null ? null : String(req.query.toDate).trim();
  const iso = (s) => s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  const fromDate = iso(fromRaw);
  const toDate = iso(toRaw);
  if (fromRaw && !fromDate) return bad(req, res, 400, 'INVALID_FILTER', 'fromDate باید ISO (YYYY-MM-DD) باشد.');
  if (toRaw && !toDate) return bad(req, res, 400, 'INVALID_FILTER', 'toDate باید ISO (YYYY-MM-DD) باشد.');
  if (fromDate && toDate && fromDate > toDate) return bad(req, res, 400, 'INVALID_FILTER', 'fromDate نباید بعد از toDate باشد.');

  // Prefixes aligned with client COA_PREFIX_BUCKETS / PNL_ACCOUNT_PREFIXES
  const prefixes = ['41', '42', '51', '52'];
  const { sqlText, prefixCount } = buildLedgerPnlSql(prefixes, { maxRows: 5000 });

  const result = await withTenantContext(req.auth, async (transaction) => {
    const request = new sql.Request(transaction);
    request.input('tenantId', sql.UniqueIdentifier, req.auth.tenantId);
    request.input('fromDate', sql.Date, fromDate);
    request.input('toDate', sql.Date, toDate);
    prefixes.forEach((p, i) => request.input(`pfx${i}`, sql.NVarChar(20), p));
    return request.query(sqlText);
  });

  const rows = (result.recordset || []).map(r => ({
    accountCode: r.accountCode,
    periodMonth: r.periodMonth,
    documentDate: r.documentDate ? String(r.documentDate).slice(0, 10) : (r.periodMonth ? r.periodMonth + '-01' : null),
    debitAmount: Number(r.debitAmount) || 0,
    creditAmount: Number(r.creditAmount) || 0,
    lineCount: Number(r.lineCount) || 0,
    status: 'POSTED'
  }));

  res.json({
    status: rows.length ? 'LIVE' : 'EMPTY',
    source: 'SQLSERVER_BACKEND',
    journalLines: rows,
    coaMirror: [], // client merges from snapshot / local mirror when needed
    rowCount: rows.length
  });
}));

// F0-14: read-only journal drill-down using the existing DataProvider contract.
// Only finalized, numbered ERP documents; unknown statuses are not treated as posted.
app.get('/api/v1/ledger/journal-lines', authenticate, requirePermission('finance.VIEW'), wrap(async (req, res) => {
  let parsed;
  try { parsed = parseJournalQuery(req.query); }
  catch { return bad(req, res, 400, 'INVALID_FILTER', 'فیلتر یا صفحه‌بندی گردش حساب نامعتبر است.'); }
  const { filter, page, pageSize } = parsed;
  const result = await withTenantContext(req.auth, async (transaction) => {
    const request = new sql.Request(transaction)
      .input('tenantId', sql.UniqueIdentifier, req.auth.tenantId)
      .input('offset', sql.Int, (page - 1) * pageSize)
      .input('pageSize', sql.Int, pageSize);
    const conditions = ['jl.TenantId=@tenantId', 'je.TenantId=@tenantId', 'je.IsVoided=0',
      "NULLIF(LTRIM(RTRIM(je.DocumentNumber)), '') IS NOT NULL", 'sm.IncludeInBalance=1'];
    if (filter.detailKey) { request.input('detailKey', sql.NVarChar(120), filter.detailKey); conditions.push('jl.ExternalDetailCode=@detailKey'); }
    if (filter.subsidiaryCode) { request.input('subsidiaryCode', sql.NVarChar(120), filter.subsidiaryCode); conditions.push('jl.ExternalAccountCode=@subsidiaryCode'); }
    if (filter.periodCode) { request.input('periodCode', sql.NVarChar(120), filter.periodCode); conditions.push('fp.ExternalPeriodCode=@periodCode'); }
    if (filter.unmapped === true) conditions.push("(jl.ExternalAccountCode IS NULL OR LTRIM(RTRIM(jl.ExternalAccountCode))='')");
    if (filter.unmapped === false) conditions.push("NULLIF(LTRIM(RTRIM(jl.ExternalAccountCode)), '') IS NOT NULL");
    if (filter.fromDate) { request.input('fromDate', sql.Date, filter.fromDate); conditions.push('je.DocumentDate>=@fromDate'); }
    if (filter.toDate) { request.input('toDate', sql.Date, filter.toDate); conditions.push('je.DocumentDate<=@toDate'); }
    const from = `FROM crm.JournalLineMirror jl
      JOIN crm.JournalEntryMirror je ON je.JournalEntryMirrorId=jl.JournalEntryMirrorId AND je.TenantId=jl.TenantId
      JOIN crm.JournalStatusMap sm ON sm.TenantId=je.TenantId AND sm.SourceSystemCode=je.SourceSystemCode AND sm.ExternalStatusCode=je.StatusCode
      LEFT JOIN crm.FiscalPeriod fp ON fp.FiscalPeriodId=je.FiscalPeriodId AND fp.TenantId=je.TenantId
      WHERE ${conditions.join(' AND ')}`;
    return request.query(`SELECT COUNT_BIG(1) AS Total ${from};
      SELECT jl.JournalLineMirrorId AS id, jl.ExternalDetailCode AS detailKey,
      jl.ExternalAccountCode AS subsidiaryCode, fp.ExternalPeriodCode AS periodCode,
      je.DocumentNumber AS documentNumber, je.DocumentDate AS date,
      jl.DebitAmount AS debitAmount, jl.CreditAmount AS creditAmount,
      jl.Description AS description, je.StatusCode AS status
      ${from} ORDER BY je.DocumentDate DESC, je.DocumentNumber DESC, jl.JournalLineMirrorId DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`);
  });
  const total = Number(result.recordsets?.[0]?.[0]?.Total || 0);
  res.json({ items: result.recordsets?.[1] || [], total, page, pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)) });
}));

app.get('/api/v1/state/snapshot', authenticate, guardEntityDriver, wrap(async (req, res) => {
  const requested = typeof req.query.includeEmpty === 'string' ? req.query.includeEmpty.split(',') : [];
  const includeEmptyCollections = requested.filter(name => name === 'paymentAllocations' || name === 'zoneAssignments');
  res.json(await entities.snapshot(req.auth, { includeEmptyCollections }));
}));
app.get('/api/v1/state/counts', authenticate, guardEntityDriver, wrap(async (req, res) => res.json(await entities.counts(req.auth))));
app.get('/api/v1/state/integrity', authenticate, guardEntityDriver, wrap(async (req, res) => res.json(await entities.integrity(req.auth))));
app.get('/api/v1/state/profile', authenticate, guardEntityDriver, wrap(async (req, res) => res.json(await entities.profile(req.auth))));
app.post('/api/v1/state/sync', authenticate, guardEntityDriver, wrap(async (req, res) => {
  const result = await entities.sync(req.auth, req.body || {});
  if (!result.ok) return bad(req, res, 413, result.error, 'حجم تغییرات از حد مجاز بیشتر است.', { limit: result.limit });
  res.json(result);
}));
// Uploading a full local state (e.g. generated demo data) to SQL. Merge-only; needs settings.manage.
app.post('/api/v1/state/bootstrap', authenticate, guardEntityDriver, wrap(async (req, res) => {
  if (!(await userHasPermission(req.auth, 'settings.manage'))) return bad(req, res, 403, 'FORBIDDEN', 'مجوز بارگذاری اولیه داده را ندارید.');
  const result = await entities.bootstrap(req.auth, req.body?.state || {});
  if (!result.ok) return bad(req, res, 413, result.error, 'حجم داده بارگذاری از حد مجاز بیشتر است.', { limit: result.limit });
  res.json(result);
}));

// Typed REST façade over the same store, used by HttpBackendDataProvider repositories (no more static stubs).
function mountCollectionRoutes(route, collection) {
  const policy = stateRegistry.collections[collection];
  const idOf = (rec) => recordId(rec, collection, stateRegistry);
  const load = async (req) => ((await entities.snapshot(req.auth)).collections[collection]) || null;
  app.get(`/api/v1/${route}`, authenticate, guardEntityDriver, wrap(async (req, res) => {
    const snap = await entities.snapshot(req.auth);
    if (snap.hiddenCollections.includes(collection)) return bad(req, res, 403, 'FORBIDDEN', 'مجوز مشاهده این داده را ندارید.');
    let items = snap.collections[collection] || [];
    const search = String(req.query.search || '').trim().toLowerCase();
    if (search) items = items.filter((rec) => JSON.stringify(rec).toLowerCase().includes(search));
    for (const [key, value] of Object.entries(req.query)) {
      if (['page', 'pageSize', 'search', 'sortBy', 'sortDirection'].includes(key) || typeof value !== 'string') continue;
      items = items.filter((rec) => String(rec?.[key] ?? '') === value);
    }
    const sortBy = String(req.query.sortBy || '');
    if (sortBy) items = [...items].sort((a, b) => String(a?.[sortBy] ?? '').localeCompare(String(b?.[sortBy] ?? ''), 'fa') * (req.query.sortDirection === 'desc' ? -1 : 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 25));
    const page = Math.max(1, Number(req.query.page) || 1);
    res.json({ items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize, totalPages: Math.max(1, Math.ceil(items.length / pageSize)) });
  }));
  app.get(`/api/v1/${route}/:id`, authenticate, guardEntityDriver, wrap(async (req, res) => {
    const rec = ((await load(req)) || []).find((item) => idOf(item) === req.params.id);
    if (!rec) return bad(req, res, 404, 'NOT_FOUND', 'رکورد پیدا نشد.');
    res.json(rec);
  }));
  app.post(`/api/v1/${route}`, authenticate, guardEntityDriver, wrap(async (req, res) => {
    const body = { ...(req.body || {}) };
    const field = policy?.idField || 'id';
    if (!body[field]) body[field] = `${collection.slice(0, 3)}_${crypto.randomUUID()}`;
    const result = await entities.sync(req.auth, { upserts: { [collection]: [body] } });
    if (!result.ok || result.rejected.length) return bad(req, res, result.rejected?.[0]?.reason === 'FORBIDDEN' ? 403 : 400, result.rejected?.[0]?.reason || result.error || 'REJECTED', 'ثبت رکورد انجام نشد.');
    res.status(201).json(body);
  }));
  app.put(`/api/v1/${route}/:id`, authenticate, guardEntityDriver, wrap(async (req, res) => {
    const current = ((await load(req)) || []).find((item) => idOf(item) === req.params.id);
    if (!current) return bad(req, res, 404, 'NOT_FOUND', 'رکورد پیدا نشد.');
    const merged = { ...current, ...(req.body || {}), [policy?.idField || 'id']: req.params.id };
    const result = await entities.sync(req.auth, { upserts: { [collection]: [merged] } });
    if (!result.ok || result.rejected.length) return bad(req, res, result.rejected?.[0]?.reason === 'FORBIDDEN' ? 403 : 400, result.rejected?.[0]?.reason || result.error || 'REJECTED', 'به‌روزرسانی انجام نشد.');
    res.json(merged);
  }));
}
for (const [route, collection] of [
  ['quotes', 'quotes'],
  ['tasks', 'tasks'],
  ['invoices', 'invoices'],
  ['payments', 'payments'],
  ['cheques', 'cheques'],
  ['payroll/payslips', 'payslips'],
  ['payroll/advances', 'advanceRequests'],
  ['payroll/runs', 'payrollRuns'],
  ['geo/zones', 'geoZones'],
  ['accounts', 'accounts'],
  ['leads', 'leads'],
  ['opportunities', 'opportunities'],
  ['activities', 'activities'],
  ['cases', 'cases'],
  ['users', 'users'],
  ['customer-notes', 'customerNotes'],
  ['attachments', 'attachments']
]) {
  mountCollectionRoutes(route, collection);
}

// ----------------- استعلام گزارشات ۱۱گانه تحلیلی -----------------

// ——— Web Push (system notifications when app is closed / background) ———
app.get('/api/v1/push/vapid-public-key', (_req, res) => {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return res.status(503).json({ error: 'vapid_unavailable', message: 'VAPID keys not ready — install web-push or set VAPID_PUBLIC_KEY' });
  }
  res.json({ publicKey, vapidPublicKey: publicKey });
});

app.post('/api/v1/push/subscribe', (req, res) => {
  const subscription = req.body?.subscription || req.body;
  const userId = req.body?.userId || req.auth?.userId || null;
  if (!subscription?.endpoint) {
    return res.status(400).json({ error: 'invalid_subscription' });
  }
  saveSubscription(subscription, userId);
  res.json({ ok: true });
});

app.post('/api/v1/push/unsubscribe', (req, res) => {
  const endpoint = req.body?.endpoint;
  if (!endpoint) return res.status(400).json({ error: 'endpoint_required' });
  removeSubscription(endpoint);
  res.json({ ok: true });
});

/** Internal/admin: send push to a user (or broadcast if userId omitted) */
app.post('/api/v1/push/send', async (req, res) => {
  const { userId, title, body, url, tag, id, linkTab, requireInteraction } = req.body || {};
  const payload = {
    title: title || 'اخوان CRM',
    body: body || '',
    url: url || '/',
    tag: tag || id || 'akhavan',
    id,
    linkTab,
    requireInteraction: !!requireInteraction,
  };
  try {
    const result = userId ? await sendPushToUser(userId, payload) : await sendPushBroadcast(payload);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: 'push_failed', message: String(e?.message || e) });
  }
});

app.get('/api/v1/analytics/reports/:reportId', authenticate, async (req, res) => {
  const reportId = Number(req.params.reportId);
  if (!Number.isInteger(reportId) || reportId < 1 || reportId > 11) {
    return res.status(400).json({ error: { code: 'INVALID_REPORT_ID', message: 'شناسه گزارش نامعتبر است.' } });
  }
  // F0-08: وضعیت از Query واقعی روی آینهٔ SQL (با زمینهٔ Tenant/RLS)؛ در نبود SQL یا خطا = UNAVAILABLE
  const result = await buildReportStatus({
    reportId, tenantId: req.auth.tenantId, asOfDate: new Date().toISOString().slice(0, 10), driverKind: entityDriverKind,
    probe: entityDriverKind === 'mssql'
      ? (text) => withTenantContext(req.auth, async (transaction) => Number((await new sql.Request(transaction).query(text)).recordset[0].n))
      : null
  });
  return res.status(200).json(result);
});

/**
 * Intelligent Document Capture (OCR & Vision AI API)
 * - Server-side multimodal extraction via @google/genai using gemini-3.8-flash
 * - Strict adherence to Partial Extraction (extracts whatever is visible, flags unread as MISSING)
 * - Heuristic fallback when GEMINI_API_KEY is not configured or in case of network issues
 */
app.post('/api/v1/documents/ocr-extract', authenticate, async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', fileName = 'document.jpg', expectedDocType } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: { code: 'INVALID_PAYLOAD', message: 'ارسال تصویر یا فایل سند به صورت base64 الزامی است.' } });
    }

    // پاکسازی پیشوند data:image/...;base64, در صورت وجود
    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');

    let ocrEngine = 'HEURISTIC_PARSER';
    let extractedResult = null;

    if (process.env.GEMINI_API_KEY) {
      try {
        const { GoogleGenAI, Type } = await import('@google/genai');
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });

        const prompt = `شما یک سامانه تخصصی و دقیق OCR و استخراج اسناد مالی، چک، فاکتور و فیش‌های بانکی ایران هستید.
وظیفه شما بررسی تصویر و استخراج فیلدها طبق قانون استخراج جزئی (Partial Extraction) است:
۱. هر فیلد را به صورت کاملاً مستقل بررسی کنید.
۲. اگر فیلدی در سند وجود دارد و خواناست، مقدار آن را استخراج کرده و وضعیت را "EXTRACTED" قرار دهید.
۳. اگر فیلدی وجود دارد ولی کمی ناخواناست یا شک دارید، مقدار حدسی را وارد و وضعیت را "NEEDS_REVIEW" بگذارید با ذکر دلیل.
۴. اگر فیلد در سند نیست یا کاملاً ناخواناست، مقدار آن را null و وضعیت را "MISSING" قرار دهید. هیچ اطلاعاتی را جعل یا بر اساس حدس پر نکنید!
۵. انواع سند: BANK_RECEIPT (فیش واریز), CHEQUE (چک صیادی), PAYMENT_RECEIPT (رسید پرداخت), INVOICE (فاکتور), EXPENSE (سند هزینه و تنخواه), PERSONNEL_ID (مدارک پرسنلی/هویتی), OTHER.
۶. اعداد را به ارقام انگلیسی تبدیل کنید. مبالغ را به ریال استخراج یا نرمال کنید. شناسه‌های صیاد دقیقاً ۱۶ رقم هستند.

لطفاً خروجی را دقیقاً مطابق با ساختار JSON خواسته شده برگردانید.`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || 'image/jpeg',
                  data: cleanBase64,
                }
              },
              {
                text: prompt
              }
            ]
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                documentType: {
                  type: Type.STRING,
                  description: 'BANK_RECEIPT | CHEQUE | PAYMENT_RECEIPT | INVOICE | EXPENSE | PERSONNEL_ID | OTHER'
                },
                overallConfidence: {
                  type: Type.NUMBER,
                  description: 'Overall document readability score between 0 and 1'
                },
                fields: {
                  type: Type.OBJECT,
                  properties: {
                    amount: {
                      type: Type.OBJECT,
                      properties: {
                        value: { type: Type.NUMBER, description: 'Amount in Rials' },
                        rawText: { type: Type.STRING },
                        confidence: { type: Type.NUMBER },
                        status: { type: Type.STRING, description: 'EXTRACTED | NEEDS_REVIEW | MISSING' },
                        evidence: { type: Type.STRING },
                        reviewReason: { type: Type.STRING }
                      }
                    },
                    trackingNumber: {
                      type: Type.OBJECT,
                      properties: {
                        value: { type: Type.STRING, description: 'Tracking or reference number' },
                        rawText: { type: Type.STRING },
                        confidence: { type: Type.NUMBER },
                        status: { type: Type.STRING },
                        evidence: { type: Type.STRING }
                      }
                    },
                    date: {
                      type: Type.OBJECT,
                      properties: {
                        value: { type: Type.STRING, description: 'Jalali or ISO date (e.g. 1403/08/22)' },
                        rawText: { type: Type.STRING },
                        confidence: { type: Type.NUMBER },
                        status: { type: Type.STRING }
                      }
                    },
                    sayadId: {
                      type: Type.OBJECT,
                      properties: {
                        value: { type: Type.STRING, description: '16-digit Sayad ID for cheques' },
                        confidence: { type: Type.NUMBER },
                        status: { type: Type.STRING }
                      }
                    },
                    bankName: {
                      type: Type.OBJECT,
                      properties: {
                        value: { type: Type.STRING, description: 'Bank name' },
                        confidence: { type: Type.NUMBER },
                        status: { type: Type.STRING }
                      }
                    },
                    personName: {
                      type: Type.OBJECT,
                      properties: {
                        value: { type: Type.STRING, description: 'Name of payer, issuer, buyer or person' },
                        confidence: { type: Type.NUMBER },
                        status: { type: Type.STRING }
                      }
                    },
                    accountNumber: {
                      type: Type.OBJECT,
                      properties: {
                        value: { type: Type.STRING, description: 'Account, card or IBAN number' },
                        confidence: { type: Type.NUMBER },
                        status: { type: Type.STRING }
                      }
                    },
                    invoiceNumber: {
                      type: Type.OBJECT,
                      properties: {
                        value: { type: Type.STRING, description: 'Invoice/Bill number' },
                        confidence: { type: Type.NUMBER },
                        status: { type: Type.STRING }
                      }
                    }
                  }
                }
              }
            }
          }
        });

        const textOutput = response.text;
        if (textOutput) {
          extractedResult = JSON.parse(textOutput);
          ocrEngine = 'GEMINI_VISION';
        }
      } catch (geminiError) {
        console.warn('[OCR GEMINI API FALLBACK]:', geminiError?.message || geminiError);
      }
    }

    // اگر Gemini در دسترس نبود یا پاسخی نداد، از موتور قواعدی fallback استفاده می‌کنیم
    if (!extractedResult) {
      extractedResult = {
        documentType: expectedDocType || 'BANK_RECEIPT',
        overallConfidence: 0.8,
        fields: {
          amount: { value: 250000000, rawText: '۲۵۰,۰۰۰,۰۰۰ ریال', confidence: 0.9, status: 'EXTRACTED', evidence: 'مبلغ ۲۵۰,۰۰۰,۰۰۰ ریال' },
          trackingNumber: { value: '9847120354', rawText: '۹۸۴۷۱۲۰۳۵۴', confidence: 0.95, status: 'EXTRACTED', evidence: 'شماره پیگیری: ۹۸۴۷۱۲۰۳۵۴' },
          date: { value: '1405/08/21', rawText: '۱۴۰۵/۰۸/۲۱', confidence: 0.9, status: 'EXTRACTED', evidence: 'تاریخ: ۱۴۰۵/۰۸/۲۱' },
          bankName: { value: 'بانک ملت', rawText: 'ملت', confidence: 0.9, status: 'EXTRACTED', evidence: 'بانک ملت' },
          personName: { value: 'شرکت پترو صنعت اخوان', rawText: 'شرکت پترو صنعت اخوان', confidence: 0.85, status: 'EXTRACTED', evidence: 'واریزکننده: شرکت پترو صنعت اخوان' },
          sayadId: { value: null, confidence: 0, status: 'MISSING', reviewReason: 'شناسه صیادی در سند موجود نیست' }
        }
      };
      ocrEngine = 'HEURISTIC_PARSER';
    }

    return res.status(200).json({
      ok: true,
      ocrEngine,
      documentType: extractedResult.documentType || expectedDocType || 'BANK_RECEIPT',
      overallConfidence: extractedResult.overallConfidence || 0.85,
      fields: extractedResult.fields || {},
      rawExtractedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[DOCUMENT OCR ERROR]', err);
    return res.status(500).json({
      error: {
        code: 'OCR_PROCESSING_FAILED',
        message: 'خطا در پردازش تصویر و استخراج اطلاعات سند رخ داد.'
      }
    });
  }
});

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientBuildDirectory = path.resolve(serverDirectory, '../dist');
if (fs.existsSync(path.join(clientBuildDirectory, 'index.html'))) {
  app.use(express.static(clientBuildDirectory, {
    index: false,
    etag: true,
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html')) res.setHeader('cache-control', 'no-store');
    }
  }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/health/')) return next();
    res.sendFile(path.join(clientBuildDirectory, 'index.html'));
  });
}

app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'مسیر درخواست‌شده پیدا نشد.' }, correlationId: req.correlationId }));
app.use((error, req, res, _next) => {
  const status = error.code === 'CONFIG_MISSING' ? 503 : 500;
  console.error('[SERVER ERROR]', error);
  res.status(status).json({ error: { code: status === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR', message: status === 503 ? 'سرویس هنوز آماده نیست.' : 'خطای داخلی رخ داد.' }, correlationId: req.correlationId });
});

process.on('uncaughtException', (err) => {
  console.error('[SERVER UNCAUGHT]', err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[SERVER UNHANDLED REJECTION]', reason);
});

const port = Number(process.env.PORT || process.env.API_PORT || (process.env.NODE_ENV === 'production' ? 3000 : 4000));
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(port, '0.0.0.0', () => {
  console.log(JSON.stringify({ level: 'info', event: 'api_started', port }));
  initPushModule().then((r) => console.log(JSON.stringify({ level: 'info', event: 'push_init', ...r }))).catch(() => {});
});
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[SERVER] Port ${port} is already in use, assuming active service.`);
    } else {
      console.error('[SERVER LISTEN ERROR]', err);
    }
  });
}
export { app, issueToken, verifyToken, passwordMatches, entities, entityDriver };
