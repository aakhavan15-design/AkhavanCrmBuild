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
import { createAccountDirectory } from './accountDirectory.mjs';
import { createInvoiceFifoEvidence } from './invoiceFifoEvidence.mjs';
import { createCollectionReceiptEvidence } from './collectionReceiptEvidence.mjs';
import { createTreasuryFlowReader } from './treasuryFlow.mjs';
import { createMoneyIntelligenceReader, parseMoneyReportQuery } from './moneyIntelligence.mjs';
import { createJournalCoverageReader, createJournalCoverageFollowUp, createJournalFollowUpEvidenceReader, coverageFilter } from './journalCoverage.mjs';
import { createCollectionActions } from './collectionActions.mjs';
import { createPublicRecruitment } from './publicRecruitment.mjs';
import { buildReportStatus } from './reportStatus.mjs';
import { getVapidPublicKey, saveSubscription, removeSubscription, sendPushToUser, initPushModule } from './pushStore.mjs';
import { recordId } from '../src/lib/stateModel.mjs';
import { projectLedgerBalances } from './ledgerBalances.mjs';
import { parseJournalQuery } from './ledgerJournalQuery.mjs';
import { createOfficialLedgerReader, parseLedgerSource } from './officialLedgerReads.mjs';
import { createTaskRequests } from './taskRequests.mjs';
import { createTaskWorkflowStore, parseTaskWorkflowInput, TaskWorkflowError } from './taskWorkflowStore.mjs';
import { creditNoteEvidenceSql, projectCreditNoteEvidence, CREDIT_NOTE_EVIDENCE_LIMIT } from './creditNoteEvidence.mjs';

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
const recruitmentJson = express.json({ limit: '15mb', strict: true });
const docJson = express.json({ limit: '10mb', strict: true });     // /api/v1/documents/* carries high-res photos and scanned PDFs
app.use((req, res, next) => {
  if (req.method === 'POST' && /^\/api\/v1\/public\/recruitment\/applications\/?$/i.test(req.path)) {
    if (!attemptRecruitment(req.ip)) return res.status(429).json({ error: { message: 'تعداد تلاش‌ها زیاد است. کمی بعد دوباره امتحان کنید.' } });
    return recruitmentJson(req, res, next);
  }
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

const recruitmentAttempts = new Map();
let recruitmentWindow = 0;
function attemptRecruitment(ip) {
  const window = Math.floor(Date.now() / (10 * 60 * 1000));
  if (window !== recruitmentWindow) { recruitmentWindow = window; recruitmentAttempts.clear(); }
  const attempts = recruitmentAttempts.get(ip) || 0;
  if (attempts >= 12 || recruitmentAttempts.size >= 2000) return false;
  recruitmentAttempts.set(ip, attempts + 1);
  return true;
}

const requiredEnv = ['SQLSERVER_HOST', 'SQLSERVER_DATABASE', 'SQLSERVER_USER', 'SQLSERVER_PASSWORD', 'AUTH_TOKEN_SECRET'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
const isProduction = process.env.NODE_ENV === 'production';
const allowDemoAuth = !isProduction && missingEnv.length > 0 && process.env.DEMO_AUTH !== 'false';
const authTokenSecret = process.env.AUTH_TOKEN_SECRET || (allowDemoAuth ? crypto.randomBytes(32) : null);
const configuredEntityDriver = process.env.ENTITY_STORE_DRIVER || (allowDemoAuth ? 'file' : 'mssql');
const invalidProductionDriver = isProduction && configuredEntityDriver !== 'mssql';

app.use('/api/v1', (req, res, next) => {
  if ((!allowDemoAuth && missingEnv.length) || invalidProductionDriver) {
    return res.status(503).json({
      error: { code: 'SERVICE_NOT_READY', message: 'پیکربندی سرویس عملیاتی کامل نیست.' },
      correlationId: req.correlationId
    });
  }
  next();
});

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
  }).catch(error => {
    poolPromise = undefined;
    throw error;
  });
  return poolPromise;
};

const b64url = (value) => Buffer.from(value).toString('base64url');
function issueToken(claims) {
  if (!authTokenSecret) throw Object.assign(new Error('Authentication configuration is incomplete'), { code: 'CONFIG_MISSING' });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ ...claims, iat: now, exp: now + 3600, iss: 'akhavan-crm-api', aud: 'akhavan-crm' }));
  const signature = crypto.createHmac('sha256', authTokenSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
function verifyToken(token) {
  if (!authTokenSecret || !token || token.length > 4096) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const expected = crypto.createHmac('sha256', authTokenSecret).update(payload).digest();
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
    if (allowDemoAuth && !header) {
      req.auth = { userId: 'usr_admin', tenantId: '00000000-0000-0000-0000-000000000001', role: 'ADMIN' };
      return next();
    }
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'احراز هویت معتبر نیست.' }, correlationId: req.correlationId });
  }
  req.auth = claims;
  next();
}
function requirePermission(permission, { organizationWide = false } = {}) {
  return async (req, res, next) => {
    try {
      const allowed = await hasSqlPermission(req.auth, permission, { organizationWide });
      if (!allowed) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'مجوز انجام این عملیات را ندارید.' }, correlationId: req.correlationId });
      next();
    } catch (error) { next(error); }
  };
}

app.get('/health/live', (_req, res) => res.json({ status: 'ok', service: 'akhavan-crm-api' }));
app.get('/health/ready', async (_req, res) => {
  if (missingEnv.length) return res.status(503).json({ status: 'not_ready', reason: 'configuration_missing', missing: missingEnv });
  if (invalidProductionDriver) return res.status(503).json({ status: 'not_ready', reason: 'sql_driver_required' });
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
    const matched = demoUsers[normalizedUser];
    const validPasswords = ['123456', 'akhavan123', 'admin123', '123', 'password'];

    if (allowDemoAuth) {
      if (!matched || !validPasswords.includes(password)) {
        return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'نام کاربری یا گذرواژه صحیح نیست.' }, correlationId: req.correlationId });
      }
      const allPermissions = [
        'accounts.view','accounts.edit','accounts.delete','leads.view','leads.edit','quotes.view','quotes.create','quotes.approve',
        'finance.view','finance.manage','settings.manage','cases.view','cases.edit','marketing.manage','knowledge.manage',
        'agents.manage','automation.manage','users.manage','roles.manage','internal.view','internal.manage','geo.view','geo.manage'
      ];
      const token = issueToken({ tenantId: 'tenant-akhavan-primary', userId: matched.id, userName: normalizedUser, role: matched.roleCode });
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
async function submitCustomerProposal(req, res, next) {
  try {
    const draft = req.customerProposalDraft;
    const body = draft?.account || req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const accountCode = typeof body.accountCode === 'string' ? body.accountCode.trim() : null;
    const phone = typeof body.phone === 'string' ? body.phone.trim() : null;
    const email = typeof body.email === 'string' ? body.email.trim() : null;
    const ownerUserId = draft ? req.auth.userId : (body.ownerUserId || null);
    const idempotencyKey = draft ? `customer-proposal:${sha256(draft.id)}` : (req.get('idempotency-key') || '');
    if (!name || name.length > 250 || (accountCode && accountCode.length > 80) ||
        (phone && phone.length > 40) || (email && (email.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) ||
        (ownerUserId && !isUuid(ownerUserId))) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'اطلاعات مشتری معتبر نیست.' }, correlationId: req.correlationId });
    }
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      return res.status(400).json({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'برای ثبت امن درخواست، کلید تکرارناپذیر معتبر ارسال کنید.' }, correlationId: req.correlationId });
    }
    const normalized = { name, accountCode: draft ? null : (accountCode || null), phone: phone || null, email: email || null, ownerUserId: ownerUserId || null };
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
        ...(draft ? { draftAccountId: draft.id } : {}),
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
}
app.post('/api/v1/accounts', typedAccountsOnly, authenticate, requirePermission('accounts.CREATE'), submitCustomerProposal);
app.post('/api/v1/accounts/proposals', authenticate, requirePermission('accounts.CREATE'), async (req, res, next) => {
  try {
    const draftId = req.body?.draftAccountId;
    if (typeof draftId !== 'string' || !draftId.trim() || draftId.length > 200) {
      return res.status(400).json({ error: { code: 'INVALID_DRAFT_ID', message: 'شناسهٔ پیش‌نویس معتبر نیست.' }, correlationId: req.correlationId });
    }
    const draft = await withTenantContext(req.auth, async transaction => {
      const result = await new sql.Request(transaction)
        .input('tenantId', sql.UniqueIdentifier, req.auth.tenantId)
        .input('draftId', sql.NVarChar(200), draftId)
        .input('ownerId', sql.UniqueIdentifier, req.auth.userId)
        .query(`SELECT JsonDoc FROM sync.EntityStore
          WHERE TenantId=@tenantId AND CollectionName=N'accounts' AND EntityId=@draftId
            AND IsDeleted=0 AND IsDemo=0
            AND UpdatedByUserId=@ownerId
            AND TRY_CONVERT(uniqueidentifier, JSON_VALUE(JsonDoc, '$.ownerId'))=@ownerId
            AND JSON_VALUE(JsonDoc, '$.origin')=N'CRM_LOCAL'
            AND JSON_VALUE(JsonDoc, '$.isLocalDraft')=N'true'
            AND JSON_VALUE(JsonDoc, '$.erpProposalStatus') IN (N'LOCAL_DRAFT', N'PENDING_ERP_REVIEW')`);
      return result.recordset[0] ? JSON.parse(result.recordset[0].JsonDoc) : null;
    });
    if (!draft) {
      return res.status(409).json({ error: { code: 'PROPOSAL_DRAFT_NOT_READY', message: 'پیش‌نویس قابل ارسال نیست. وضعیت مالکیت و همگام‌سازی را بررسی کنید.' }, correlationId: req.correlationId });
    }
    req.customerProposalDraft = { id: draftId, account: draft };
    return submitCustomerProposal(req, res, next);
  } catch (error) { next(error); }
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
        FROM crm.Account AS account WHERE account.TenantId=@tenantId
          AND EXISTS (SELECT 1 FROM security.fn_RecordReadScope(
            account.TenantId,N'accounts.view',account.OwnerUserId,account.BranchId,account.TerritoryId,account.TeamId
          ))
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
  return allowDemoAuth || hasSqlPermission(claims, permission);
}

async function hasSqlPermission(claims, permission, { organizationWide = false } = {}) {
  const permissionCode = String(permission).trim().toLowerCase();
  return withTenantContext(claims, async (transaction) => {
    const result = await new sql.Request(transaction)
      .input('tenantId', sql.UniqueIdentifier, claims.tenantId)
      .input('userId', sql.UniqueIdentifier, claims.userId)
      .input('permission', sql.NVarChar(120), permissionCode)
      .input('isRead', sql.Bit, permissionCode.endsWith('.view'))
      .input('organizationWide', sql.Bit, organizationWide)
      .query(`SELECT TOP (1) 1 AS Allowed
        FROM core.UserRole ur
        JOIN core.AppUser u ON u.TenantId=ur.TenantId AND u.UserId=ur.UserId AND u.IsActive=1
        JOIN core.Tenant t ON t.TenantId=ur.TenantId AND t.IsActive=1
        JOIN core.RolePermission rp ON rp.TenantId=ur.TenantId AND rp.RoleId=ur.RoleId
        WHERE ur.TenantId=@tenantId AND ur.UserId=@userId
          AND ur.ValidFromUtc<=SYSUTCDATETIME() AND (ur.ValidToUtc IS NULL OR ur.ValidToUtc>SYSUTCDATETIME())
          AND rp.PermissionCode=@permission AND rp.FieldCode=N''
          AND (rp.FieldAccess='DO' OR (@isRead=1 AND rp.FieldAccess='SEE'))
          AND (@organizationWide=0 OR rp.ScopeCode='ORG')`);
    return result.recordset.length > 0;
  });
}
const entityDriverKind = invalidProductionDriver ? 'mssql' : configuredEntityDriver;
const entityDriver = entityDriverKind === 'mssql'
  ? new MssqlEntityDriver({ sql, run: withTenantContext })
  : entityDriverKind === 'memory'
    ? new MemoryEntityDriver()
    : new FileEntityDriver(process.env.ENTITY_STORE_FILE || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.data/entity-store.json'));
const entities = createEntityService({ driver: entityDriver, registry: stateRegistry, hasPermission: userHasPermission, excludeFixtures: isProduction });

async function autoSeedEntitiesIfEmpty() {
  if (process.env.NODE_ENV === 'test' || !allowDemoAuth || entityDriverKind === 'mssql') return;
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
  // Production storage configuration has already been checked before route dispatch.
  next();
};
const wrap = (handler) => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };
const bad = (req, res, status, code, message, extra = {}) => res.status(status).json({ error: { code, message, ...extra }, correlationId: req.correlationId });

app.get('/api/v1/ledger/credit-notes', authenticate, requirePermission('finance.view'), wrap(async (req, res) => {
  if (entityDriverKind !== 'mssql') return bad(req, res, 503, 'CREDIT_NOTE_SOURCE_UNAVAILABLE', 'منبع اعلامیهٔ بستانکاری در دسترس نیست.');
  const result = await withTenantContext(req.auth, transaction => new sql.Request(transaction)
    .input('tenantId', sql.UniqueIdentifier, req.auth.tenantId)
    .input('take', sql.Int, CREDIT_NOTE_EVIDENCE_LIMIT + 1)
    .query(creditNoteEvidenceSql));
  res.json(projectCreditNoteEvidence(result.recordset));
}));

app.get('/api/v1/inventory/fifo/valuation', authenticate, requirePermission('finance.view', { organizationWide: true }), wrap(async (req, res) => {
  if (entityDriverKind !== 'mssql') return bad(req, res, 503, 'FIFO_SOURCE_UNAVAILABLE', 'ارزش‌گذاری FIFO در دسترس نیست.');
  const result = await withTenantContext(req.auth, transaction => new sql.Request(transaction)
    .input('tenantId', sql.UniqueIdentifier, req.auth.tenantId)
    .query(`SELECT TOP (26) run.RunId AS runId, run.SourceSystemCode AS sourceSystemCode,
      run.ProductExternalId AS productId, run.UnitCode AS unitCode, run.CurrencyCode AS currencyCode,
      run.PeriodStartUtc AS periodStart, run.ThroughUtc AS through, run.MethodCode AS method,
      valuation.WarehouseExternalId AS warehouseId, CONVERT(varchar(40),valuation.Quantity) AS quantity,
      CONVERT(varchar(42),valuation.Amount) AS amount
      FROM analytics.FifoRun AS run
      JOIN analytics.FifoValuation AS valuation ON valuation.TenantId=run.TenantId AND valuation.RunId=run.RunId
      WHERE run.TenantId=@tenantId AND run.IsCurrent=1
        AND EXISTS (SELECT 1 FROM security.fn_RecordReadScope(@tenantId,N'finance.view',NULL,NULL,NULL,NULL))
      ORDER BY run.ThroughUtc DESC,run.PeriodStartUtc DESC,run.RunId DESC,valuation.WarehouseExternalId`));
  const items = result.recordset.slice(0, 25);
  res.json({ status: items.length ? 'AVAILABLE' : 'EMPTY', items, hasMore: result.recordset.length > items.length });
}));

app.get('/api/v1/inventory/fifo/layers', authenticate, requirePermission('finance.view', { organizationWide: true }), wrap(async (req, res) => {
  if (entityDriverKind !== 'mssql') return bad(req, res, 503, 'FIFO_SOURCE_UNAVAILABLE', 'ریز لایه‌های موجودی در دسترس نیست.');
  const { runId, warehouseId, after = '0', activity = 'inbound' } = req.query;
  if (!['inbound', 'withdrawals'].includes(activity) || typeof runId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(runId) ||
      typeof warehouseId !== 'string' || !warehouseId.trim() || warehouseId.length > 200 ||
      typeof after !== 'string' || !/^\d{1,10}$/.test(after) || Number(after) > 2147483647) {
    return bad(req, res, 400, 'INVALID_FIFO_FILTER', 'محدودهٔ لایه‌های موجودی معتبر نیست.');
  }
  const withdrawals = activity === 'withdrawals';
  const result = await withTenantContext(req.auth, transaction => new sql.Request(transaction)
    .input('tenantId', sql.UniqueIdentifier, req.auth.tenantId)
    .input('runId', sql.UniqueIdentifier, runId)
    .input('warehouseId', sql.NVarChar(200), warehouseId)
    .input('after', sql.Int, Number(after))
    .query(withdrawals ? `SELECT TOP (51) c.ConsumptionNo AS consumptionNo,l.LayerNo AS layerNo,
      c.DocumentId AS documentId,c.LineId AS lineId,c.EffectiveAtUtc AS effectiveAt,c.KindCode AS kind,
      CONVERT(varchar(40),c.Quantity) AS quantity,CONVERT(varchar(40),c.ReturnedQuantity) AS returned,
      CONVERT(varchar(48),c.TotalCost) AS totalCost,l.DocumentId AS layerDocumentId
      FROM analytics.FifoConsumption c
      JOIN analytics.FifoLayer l ON l.TenantId=c.TenantId AND l.RunId=c.RunId AND l.LayerNo=c.LayerNo
      JOIN analytics.FifoValuation v ON v.TenantId=l.TenantId AND v.RunId=l.RunId AND v.WarehouseExternalId=l.WarehouseExternalId
      WHERE c.TenantId=@tenantId AND c.RunId=@runId AND l.WarehouseExternalId=@warehouseId AND c.ConsumptionNo>@after
        AND EXISTS (SELECT 1 FROM security.fn_RecordReadScope(@tenantId,N'finance.view',NULL,NULL,NULL,NULL))
      ORDER BY c.ConsumptionNo` : `SELECT TOP (51) l.LayerNo AS layerNo,l.DocumentId AS documentId,l.LineId AS lineId,
      l.EffectiveAtUtc AS effectiveAt,l.KindCode AS kind,
      CONVERT(varchar(40),l.InitialQuantity) AS quantity, CONVERT(varchar(40),l.RemainingQuantity) AS remaining,
      CONVERT(varchar(40),l.UnitCost) AS unitCost,l.OriginConsumptionNo AS originConsumptionNo
      FROM analytics.FifoLayer AS l
      JOIN analytics.FifoValuation AS v ON v.TenantId=l.TenantId AND v.RunId=l.RunId AND v.WarehouseExternalId=l.WarehouseExternalId
      WHERE l.TenantId=@tenantId AND l.RunId=@runId AND l.WarehouseExternalId=@warehouseId AND l.LayerNo>@after
        AND EXISTS (SELECT 1 FROM security.fn_RecordReadScope(@tenantId,N'finance.view',NULL,NULL,NULL,NULL))
      ORDER BY l.LayerNo`));
  const items = result.recordset.slice(0, 50);
  res.json({ status: items.length ? 'AVAILABLE' : 'EMPTY', items,
    next: result.recordset.length > items.length ? (withdrawals ? items.at(-1).consumptionNo : items.at(-1).layerNo) : null });
}));

app.get('/api/v1/inventory/fifo/sales/:documentId/cogs', authenticate, requirePermission('finance.view', { organizationWide: true }), wrap(async (req, res) => {
  if (entityDriverKind !== 'mssql') return bad(req, res, 503, 'FIFO_SOURCE_UNAVAILABLE', 'برداشت‌های ثبت‌شدهٔ سند در دسترس نیست.');
  const { documentId } = req.params;
  const { source, periodStart } = req.query;
  if (!documentId.trim() || documentId.length > 200 || typeof source !== 'string' || !/^[A-Za-z0-9._-]{1,40}$/.test(source) ||
      typeof periodStart !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(periodStart) ||
      !Number.isFinite(Date.parse(periodStart)) || new Date(periodStart).toISOString() !== periodStart) {
    return bad(req, res, 400, 'INVALID_FIFO_DOCUMENT', 'منبع، سند یا ابتدای دوره معتبر نیست.');
  }
  const result = await withTenantContext(req.auth, transaction => new sql.Request(transaction)
    .input('tenantId', sql.UniqueIdentifier, req.auth.tenantId)
    .input('source', sql.VarChar(40), source)
    .input('documentId', sql.NVarChar(200), documentId)
    .input('periodStart', sql.DateTime2(3), new Date(periodStart))
    .query(`SELECT TOP (101) r.RunId AS runId,r.ThroughUtc AS through,r.ProductExternalId AS productId,
      r.UnitCode AS unitCode,r.CurrencyCode AS currencyCode,c.LineId AS lineId,c.MovementId AS movementId,
      c.ConsumptionNo AS consumptionNo,c.LayerNo AS layerNo,l.WarehouseExternalId AS warehouseId,
      CONVERT(varchar(40),c.Quantity) AS quantity,CONVERT(varchar(40),c.ReturnedQuantity) AS returned,
      CONVERT(varchar(40),l.UnitCost) AS unitCost,CONVERT(varchar(42),c.TotalCost) AS originalCost
      FROM analytics.FifoRun AS r
      JOIN analytics.FifoConsumption AS c ON c.TenantId=r.TenantId AND c.RunId=r.RunId
      JOIN analytics.FifoLayer AS l ON l.TenantId=c.TenantId AND l.RunId=c.RunId AND l.LayerNo=c.LayerNo
      WHERE r.TenantId=@tenantId AND r.IsCurrent=1 AND r.SourceSystemCode=@source AND r.PeriodStartUtc=@periodStart
        AND c.KindCode='SALE' AND c.DocumentId COLLATE Latin1_General_100_BIN2=@documentId
        AND EXISTS (SELECT 1 FROM security.fn_RecordReadScope(@tenantId,N'finance.view',NULL,NULL,NULL,NULL))
      ORDER BY c.LineId,r.RunId,c.ConsumptionNo`));
  const items = result.recordset.slice(0, 100);
  res.json({ status: items.length ? 'AVAILABLE' : 'EMPTY', coverage: 'UNVERIFIED', items, hasMore: result.recordset.length > items.length });
}));

const readInvoiceFifoEvidence = createInvoiceFifoEvidence({ sql, run: withTenantContext });
app.get('/api/v1/finance/invoices/:id/fifo', authenticate, requirePermission('finance.view', { organizationWide: true }),
  wrap(async (req, res) => {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(req.params.id)) {
      return bad(req, res, 400, 'INVALID_INVOICE', 'شناسهٔ فاکتور معتبر نیست.');
    }
    res.json(await readInvoiceFifoEvidence(req.auth, req.params.id));
  }));

const officialLedger = createOfficialLedgerReader({ sql, run: withTenantContext });
app.get('/api/v1/ledger/sources', authenticate, requirePermission('finance.VIEW'), wrap(async (req,res) => {
  res.set('Cache-Control','private, no-store');
  res.json(await officialLedger.sources(req.auth,{source:null,currency:null}));
}));

app.get('/api/v1/ledger/balances', authenticate, requirePermission('finance.VIEW'), wrap(async (req,res) => {
  res.set('Cache-Control','private, no-store');
  const scope = parseLedgerSource(req.query);
  const detailKey = req.query.detailKey ?? null;
  const role = req.query.role ?? null;
  if (!scope || (detailKey!==null && (typeof detailKey!=='string' || !detailKey.trim() || detailKey.length>120))
      || (req.query.byPeriod!=null && !['0','1'].includes(req.query.byPeriod))
      || (role!==null && !['RECEIVABLE','PAYABLE'].includes(role))) {
    return bad(req,res,400,'INVALID_FILTER','شرکت، ارز یا فیلتر مانده معتبر نیست.');
  }
  const byPeriod = req.query.byPeriod==='1';
  const result = await officialLedger.balances(req.auth,{ ...scope,detailKey,role,byPeriod });
  if (result.blocked) return res.json({ ...result.blocked,source:'SQLSERVER_BACKEND',balances:[] });
  res.json(projectLedgerBalances(result.rows,{detailKey,byPeriod,scope:result.source}));
}));

app.get('/api/v1/ledger/pnl', authenticate, requirePermission('finance.VIEW', { organizationWide:true }), wrap(async (req,res) => {
  res.set('Cache-Control','private, no-store');
  const scope = parseLedgerSource(req.query);
  let parsed;
  try { parsed = parseJournalQuery(req.query); }
  catch { return bad(req,res,400,'INVALID_FILTER','بازه یا فیلتر سود و زیان معتبر نیست.'); }
  if (!scope) return bad(req,res,400,'INVALID_SOURCE','شرکت یا ارز دفتر معتبر نیست.');
  res.json(await officialLedger.pnl(req.auth,{ ...scope,...parsed.filter }));
}));

app.get('/api/v1/ledger/books', authenticate, requirePermission('finance.VIEW',{organizationWide:true}), wrap(async (req,res) => {
  res.set('Cache-Control','private, no-store');
  const scope = parseLedgerSource(req.query), period = parseMoneyReportQuery(req.query);
  const role = req.query.role ?? null;
  if (!scope || !period || (role!==null && !['RECEIVABLE','PAYABLE'].includes(role))) {
    return bad(req,res,400,'INVALID_FILTER','شرکت، بازه یا فیلتر دفتر معتبر نیست.');
  }
  res.json(await officialLedger.books(req.auth,{ ...scope,...period,role }));
}));

// F0-14: read-only journal drill-down using the existing DataProvider contract.
// Only finalized, numbered ERP documents; unknown statuses are not treated as posted.
app.get('/api/v1/ledger/journal-lines', authenticate, requirePermission('finance.VIEW'), wrap(async (req, res) => {
  let parsed;
  try { parsed = parseJournalQuery(req.query); }
  catch { return bad(req, res, 400, 'INVALID_FILTER', 'فیلتر یا صفحه‌بندی گردش حساب نامعتبر است.'); }
  const { filter, page, pageSize } = parsed;
  const scope = parseLedgerSource(req.query);
  if (!scope) return bad(req,res,400,'INVALID_SOURCE','شرکت یا ارز دفتر معتبر نیست.');
  const result = await withTenantContext(req.auth, async (transaction) => {
    const request = new sql.Request(transaction)
      .input('tenantId', sql.UniqueIdentifier, req.auth.tenantId)
      .input('offset', sql.Int, (page - 1) * pageSize)
      .input('pageSize', sql.Int, pageSize);
    const conditions = ['jl.TenantId=@tenantId', 'je.TenantId=@tenantId', "je.JournalQuality='VALID'",
      'EXISTS (SELECT 1 FROM security.fn_LedgerDetailReadScope(jl.TenantId,jl.SourceSystemCode,jl.ExternalDetailCode))',
      'jl.SourceSystemCode=je.SourceSystemCode'];
    if (scope.source) { request.input('source',sql.VarChar(40),scope.source); conditions.push('je.SourceSystemCode=@source'); }
    if (scope.currency) { request.input('currency',sql.Char(3),scope.currency); conditions.push('je.CurrencyCode=@currency'); }
    if (filter.withoutDetail) conditions.push("NULLIF(jl.ExternalDetailCode,N'') IS NULL");
    if (filter.role) {
      request.input('role',sql.VarChar(32),filter.role);
      conditions.push('EXISTS(SELECT 1 FROM analytics.vw_FinancialJournalArticle article WHERE article.TenantId=jl.TenantId AND article.JournalLineMirrorId=jl.JournalLineMirrorId AND article.MoneyRoleCode=@role)');
    }
    if (filter.activityOnly) conditions.push(`NOT EXISTS (SELECT 1 FROM analytics.MoneyReportSource p
      JOIN core.AppUser approver ON approver.UserId=p.ApprovedBy AND approver.TenantId=p.TenantId
      WHERE p.TenantId=je.TenantId AND p.SourceSystemCode=je.SourceSystemCode AND je.CurrencyCode='IRR'
        AND p.OpeningDocumentTypeCode=je.DocumentTypeCode)`);
    if (filter.journalId) { request.input('journalId', sql.UniqueIdentifier, filter.journalId); conditions.push('je.JournalEntryMirrorId=@journalId'); }
    if (filter.detailKey) { request.input('detailKey', sql.NVarChar(120), filter.detailKey); conditions.push('jl.ExternalDetailCode=@detailKey'); }
    if (filter.subsidiaryCode) { request.input('subsidiaryCode', sql.NVarChar(120), filter.subsidiaryCode); conditions.push('jl.ExternalAccountCode=@subsidiaryCode'); }
    if (filter.periodCode) { request.input('periodCode', sql.NVarChar(120), filter.periodCode); conditions.push('je.ExternalPeriodCode=@periodCode'); }
    if (filter.unmapped === true) conditions.push("(jl.ExternalAccountCode IS NULL OR LTRIM(RTRIM(jl.ExternalAccountCode))='')");
    if (filter.unmapped === false) conditions.push("NULLIF(LTRIM(RTRIM(jl.ExternalAccountCode)), '') IS NOT NULL");
    if (filter.fromDate) { request.input('fromDate', sql.Date, filter.fromDate); conditions.push('je.AccountingDate>=@fromDate'); }
    if (filter.toDate) { request.input('toDate', sql.Date, filter.toDate); conditions.push('je.AccountingDate<=@toDate'); }
    const from = `FROM crm.JournalLineMirror jl
      JOIN analytics.vw_FinancialJournalState je ON je.JournalEntryMirrorId=jl.JournalEntryMirrorId AND je.TenantId=jl.TenantId
      WHERE ${conditions.join(' AND ')}`;
    return request.query(`SELECT COUNT_BIG(1) AS Total ${from};
      SELECT jl.JournalLineMirrorId AS id, jl.ExternalDetailCode AS detailKey,
      jl.ExternalAccountCode AS subsidiaryCode, je.ExternalPeriodCode AS periodCode,
      je.DocumentNumber AS documentNumber, je.AccountingDate AS date,
      CONVERT(varchar(48),jl.DebitAmount) AS debitAmount, CONVERT(varchar(48),jl.CreditAmount) AS creditAmount,
      je.CurrencyCode AS currencyCode,je.SourceSystemCode AS sourceSystem,jl.SourceLineNumber AS lineNumber,jl.ExternalJournalLineId AS externalLineId,
      jl.Description AS description, je.StatusCode AS status
      ${from} ORDER BY je.AccountingDate DESC, je.DocumentNumber DESC, jl.JournalLineMirrorId DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`);
  });
  const total = Number(result.recordsets?.[0]?.[0]?.Total || 0);
  res.json({ items: result.recordsets?.[1] || [], total, page, pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)) });
}));

app.get('/api/v1/integrations/erp/sync-overview', authenticate,
  requirePermission('settings.manage', { organizationWide: true }), wrap(async (req, res) => {
    if (entityDriverKind !== 'mssql') {
      return bad(req, res, 503, 'ERP_SYNC_METADATA_UNAVAILABLE', 'سوابق ورود دادهٔ ERP در دسترس نیست.');
    }
    const result = await withTenantContext(req.auth, transaction =>
      new sql.Request(transaction).input('tenantId', sql.UniqueIdentifier, req.auth.tenantId)
        .query(`SELECT TOP (25)
          connector.ConnectorId AS id, connector.DisplayName AS displayName,
          connector.SystemCode AS sourceSystemCode, connector.IsEnabled AS enabled,
          batch.EntityType AS entityType, batch.StatusCode AS batchStatus,
          batch.StartedAtUtc AS startedAt, batch.FinishedAtUtc AS finishedAt,
          batch.ReceivedCount AS received, batch.RejectedCount AS rejected,
          batch.InsertedCount AS inserted, batch.UpdatedCount AS updated,
          checkpoint.WatermarkUtc AS watermark
        FROM integration.Connector AS connector
        OUTER APPLY (
          SELECT TOP (1) b.EntityType,b.StatusCode,b.StartedAtUtc,b.FinishedAtUtc,
            b.ReceivedCount,b.RejectedCount,b.InsertedCount,b.UpdatedCount
          FROM integration.SyncBatch AS b
          WHERE b.TenantId=connector.TenantId AND b.ConnectorId=connector.ConnectorId
            AND b.SourceSystemCode=connector.SystemCode
          ORDER BY b.StartedAtUtc DESC,b.SyncBatchId DESC
        ) AS batch
        LEFT JOIN integration.SyncCheckpoint AS checkpoint
          ON checkpoint.TenantId=connector.TenantId AND checkpoint.ConnectorId=connector.ConnectorId
          AND checkpoint.EntityType=batch.EntityType
        WHERE connector.TenantId=@tenantId
          AND connector.DirectionCode IN ('INBOUND','BIDIRECTIONAL')
          AND EXISTS (SELECT 1 FROM security.fn_RecordReadScope(
            connector.TenantId,N'settings.manage',NULL,NULL,NULL,NULL
          ))
        ORDER BY connector.DisplayName,connector.ConnectorId`)
    );
    res.json({ status: result.recordset.length ? 'AVAILABLE' : 'EMPTY', items: result.recordset });
  }),
);

const publicRecruitment = createPublicRecruitment({
  sql, run: withTenantContext, tenantId: process.env.PUBLIC_RECRUITMENT_TENANT_ID,
});
app.get('/api/v1/public/recruitment/config', wrap(async (req, res) => {
  const config = await publicRecruitment.config();
  if (!config) return bad(req, res, 503, 'RECRUITMENT_UNAVAILABLE', 'دریافت درخواست همکاری در حال حاضر فعال نیست.');
  res.json(config);
}));
app.post('/api/v1/public/recruitment/applications', wrap(async (req, res) => {
  const result = await publicRecruitment.submit(req.body);
  if (!result.receipt) return bad(req, res, result.status, 'RECRUITMENT_NOT_ACCEPTED', result.message);
  res.status(result.status).json(result.receipt);
}));

const searchAccountDirectory = createAccountDirectory({ sql, run: withTenantContext, excludeFixtures: isProduction });
app.post('/api/v1/accounts/search', authenticate, requirePermission('accounts.VIEW'), wrap(async (req, res) => {
  res.json(await searchAccountDirectory(req.auth, req.body?.query, req.body?.page));
}));

const readTreasuryFlow = createTreasuryFlowReader({ sql, run: withTenantContext });
app.get('/api/v1/finance/cash-flow', authenticate, requirePermission('finance.VIEW', { organizationWide: true }),
  wrap(async (req, res) => res.json(await readTreasuryFlow(req.auth))));

const readMoneyIntelligence = createMoneyIntelligenceReader({ sql, run: withTenantContext });
app.get('/api/v1/finance/money-intelligence', authenticate, requirePermission('finance.VIEW', { organizationWide: true }),
  wrap(async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (entityDriverKind !== 'mssql') {
      return bad(req, res, 503, 'MONEY_SOURCE_UNAVAILABLE', 'آینهٔ مالی ERP در دسترس نیست.');
    }
    const filter = parseMoneyReportQuery(req.query);
    if (!filter) return bad(req, res, 400, 'INVALID_MONEY_FILTER', 'بازه یا فیلتر گزارش معتبر نیست.');
    res.json(await readMoneyIntelligence(req.auth, filter));
  }));

const readJournalCoverage = createJournalCoverageReader({ sql, run: withTenantContext });
app.get('/api/v1/finance/journal-coverage', authenticate, requirePermission('finance.VIEW', { organizationWide: true }),
  wrap(async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    const period = parseMoneyReportQuery(req.query);
    const filter = coverageFilter(req.query);
    if (!period || !filter) return bad(req, res, 400, 'INVALID_COVERAGE_FILTER', 'بازه یا فیلتر پوشش اسناد معتبر نیست.');
    if (entityDriverKind!=='mssql') return bad(req, res, 503, 'JOURNAL_SOURCE_UNAVAILABLE', 'آینهٔ اسناد ERP در دسترس نیست.');
    res.json(await readJournalCoverage(req.auth, { ...period, ...filter }));
  }));

const submitJournalCoverageFollowUp = createJournalCoverageFollowUp({sql,run:withTenantContext});
app.post('/api/v1/finance/journal-coverage/follow-up', authenticate, requirePermission('finance.manage',{organizationWide:true}),
  wrap(async (req,res) => {
    const period = parseMoneyReportQuery(req.body ?? {});
    if (!period || entityDriverKind!=='mssql') {
      return bad(req,res,400,'INVALID_COVERAGE_FILTER','بازهٔ پیگیری یا منبع اسناد معتبر نیست.');
    }
    const result = await submitJournalCoverageFollowUp(req.auth,{ ...period,operation:req.body.operation,externalId:req.body.externalId },req.correlationId);
    if (!result.id) return bad(req,res,result.status,'JOURNAL_FOLLOW_UP_REJECTED',result.message);
    res.status(result.status).json({id:result.id,replayed:result.replayed});
  }));

const readJournalFollowUpEvidence = createJournalFollowUpEvidenceReader({sql,run:withTenantContext});
app.get('/api/v1/finance/journal-coverage/follow-up/:id', authenticate, requirePermission('finance.VIEW',{organizationWide:true}),
  wrap(async (req,res) => {
    res.set('Cache-Control','private, no-store');
    const evidence = entityDriverKind==='mssql' ? await readJournalFollowUpEvidence(req.auth,req.params.id) : null;
    if (!evidence) return bad(req,res,404,'FOLLOW_UP_EVIDENCE_UNAVAILABLE','شاهد مجاز پیگیری پیدا نشد.');
    res.json(evidence);
  }));

const collectionReceiptEvidence = createCollectionReceiptEvidence({ sql, run: withTenantContext });
app.get('/api/v1/finance/collection-promises/:id/evidence', authenticate, wrap(async (req, res) => {
  const result = await collectionReceiptEvidence.list(req.auth, req.params.id, req.query.page);
  if (!result.body) return bad(req, res, result.status, 'COLLECTION_EVIDENCE_UNAVAILABLE', result.message);
  res.json(result.body);
}));
app.post('/api/v1/finance/collection-promises/:id/evidence', authenticate, wrap(async (req, res) => {
  const result = await collectionReceiptEvidence.attach(req.auth, req.params.id, req.body?.paymentId, req.correlationId);
  if (!result.body) return bad(req, res, result.status, 'COLLECTION_EVIDENCE_REJECTED', result.message);
  res.json(result.body);
}));

const submitCollectionAction = createCollectionActions({ sql, run: withTenantContext });
app.post('/api/v1/finance/collections/:accountId/actions', authenticate, wrap(async (req, res) => {
  const result = await submitCollectionAction(req.auth, req.params.accountId, req.body);
  if (!result.id) return bad(req, res, result.status, 'COLLECTION_ACTION_REJECTED', result.message);
  res.status(result.status).json({ id: result.id, status: 'RECORDED' });
}));

app.get('/api/v1/state/snapshot', authenticate, guardEntityDriver, wrap(async (req, res) => {
  const requested = typeof req.query.includeEmpty === 'string' ? req.query.includeEmpty.split(',') : [];
  const includeEmptyCollections = requested.filter(name => name === 'paymentAllocations' || name === 'zoneAssignments');
  res.json(await entities.snapshot(req.auth, { includeEmptyCollections }));
}));
app.get('/api/v1/state/counts', authenticate, guardEntityDriver, wrap(async (req, res) => {
  const requested = typeof req.query.includeEmpty === 'string' ? req.query.includeEmpty.split(',') : [];
  const includeEmptyCollections = [...new Set(requested)].filter(name => Object.hasOwn(stateRegistry.collections, name));
  res.json(await entities.counts(req.auth, { includeEmptyCollections }));
}));
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

const taskRequests = createTaskRequests({sql,run:withTenantContext});
const taskRequestRoute = handler => wrap(async (req,res) => {
  res.set('Cache-Control','private, no-store');
  if (entityDriverKind!=='mssql') return bad(req,res,503,'REQUEST_BACKEND_REQUIRED','ثبت و پیگیری درخواست به سرور SQL نیاز دارد.');
  try {
    const result = await handler(req);
    res.status(req.method==='POST' && !result.replayed ? 201 : 200).json(result);
  } catch (error) {
    if (typeof error.status!=='number' || !String(error.code).startsWith('REQUEST_') &&
      !['APPROVAL_POLICY_UNAVAILABLE','WATCHER_NOT_ALLOWED'].includes(error.code)) throw error;
    return bad(req,res,error.status,error.code,error.message);
  }
});
app.get('/api/v1/tasks/requests',authenticate,taskRequestRoute(req => taskRequests.list(req.auth,req.query)));
app.post('/api/v1/tasks/requests',authenticate,taskRequestRoute(req => taskRequests.create(req.auth,req.body)));
app.get('/api/v1/tasks/request-directory',authenticate,requirePermission('tasks.VIEW'),taskRequestRoute(req => taskRequests.users(req.auth,req.query.search ?? '')));
app.get('/api/v1/tasks/request-resources',authenticate,taskRequestRoute(req => taskRequests.resources(req.auth,req.query)));
app.get('/api/v1/tasks/request-policies',authenticate,requirePermission('settings.manage',{organizationWide:true}),
  taskRequestRoute(req => taskRequests.readPolicies(req.auth)));
app.put('/api/v1/tasks/request-policies/:kind',authenticate,requirePermission('settings.manage',{organizationWide:true}),
  taskRequestRoute(req => taskRequests.savePolicy(req.auth,req.params.kind,req.body)));
app.get('/api/v1/tasks/requests/:id',authenticate,taskRequestRoute(req => taskRequests.read(req.auth,req.params.id)));
app.post('/api/v1/tasks/requests/:id/actions',authenticate,taskRequestRoute(req => taskRequests.change(req.auth,req.params.id,req.body)));
app.get('/api/v1/tasks/requests/:id/files',authenticate,taskRequestRoute(req => taskRequests.files(req.auth,req.params.id)));
app.get('/api/v1/tasks/requests/:id/files/:file',authenticate,taskRequestRoute(req => taskRequests.file(req.auth,req.params.id,req.params.file)));
app.post('/api/v1/tasks/requests/:id/files',authenticate,express.raw({type:'application/octet-stream',limit:'5mb'}),
  taskRequestRoute(req => taskRequests.attach(req.auth,req.params.id,req.query,req.body)));

const taskWorkflowStore = createTaskWorkflowStore({ sql, run: withTenantContext, excludeFixtures: isProduction });
app.route('/api/v1/tasks/:id/workflow').all(authenticate).get(wrap(taskWorkflowEndpoint(false))).post(wrap(taskWorkflowEndpoint(true)));

function taskWorkflowEndpoint(change) {
  return async (req, res) => {
    if (entityDriverKind !== 'mssql') return bad(req, res, 503, 'TASK_WORKFLOW_UNAVAILABLE', 'ذخیرهٔ گردش وظیفه به اتصال پایگاه داده نیاز دارد.');
    const id = req.params.id;
    if (!id || id.length > 200) return bad(req, res, 400, 'INVALID_TASK_ID', 'شناسهٔ وظیفه معتبر نیست.');
    try {
      const result = change
        ? await taskWorkflowStore.change(req.auth, id, parseTaskWorkflowInput(req.body), req.correlationId)
        : await taskWorkflowStore.read(req.auth, id);
      res.json(result);
    } catch (error) {
      if (!(error instanceof TaskWorkflowError)) throw error;
      return bad(req, res, error.status, error.code, error.message);
    }
  };
}

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
    if (!result.ok || result.rejected.length) return bad(req, res, result.rejected?.[0]?.reason?.startsWith('FORBIDDEN') ? 403 : 400, result.rejected?.[0]?.reason || result.error || 'REJECTED', 'ثبت رکورد انجام نشد.');
    res.status(201).json(body);
  }));
  app.put(`/api/v1/${route}/:id`, authenticate, guardEntityDriver, wrap(async (req, res) => {
    const current = ((await load(req)) || []).find((item) => idOf(item) === req.params.id);
    if (!current) return bad(req, res, 404, 'NOT_FOUND', 'رکورد پیدا نشد.');
    if (collection === 'tasks' && current.taskWorkflowRevision && req.body?.taskWorkflowRevision !== current.taskWorkflowRevision) {
      return bad(req, res, 409, 'TASK_VERSION_CONFLICT', 'وظیفه تغییر کرده است. نسخهٔ تازه را دریافت کنید.');
    }
    const merged = { ...current, ...(req.body || {}), [policy?.idField || 'id']: req.params.id };
    const result = await entities.sync(req.auth, { upserts: { [collection]: [merged] } });
    if (result.rejected?.[0]?.reason === 'TASK_VERSION_CONFLICT') {
      return bad(req, res, 409, 'TASK_VERSION_CONFLICT', 'وظیفه تغییر کرده است. نسخهٔ تازه را دریافت کنید.');
    }
    if (result.rejected?.[0]?.reason === 'TASK_WORKFLOW_REQUIRED') {
      return bad(req, res, 409, 'TASK_WORKFLOW_REQUIRED', 'تغییر وضعیت یا نتیجه از مسیر گردش وظیفه ثبت می‌شود.');
    }
    if (!result.ok || result.rejected.length) return bad(req, res, result.rejected?.[0]?.reason?.startsWith('FORBIDDEN') ? 403 : 400, result.rejected?.[0]?.reason || result.error || 'REJECTED', 'به‌روزرسانی انجام نشد.');
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

function requireSignedSession(req, res, next) {
  if (!req.get('authorization')) {
    return bad(req, res, 401, 'UNAUTHENTICATED', 'برای انجام این عملیات وارد سامانه شوید.');
  }
  next();
}

const requirePushSendPermission = allowDemoAuth
  ? (req, res, next) => req.auth.role === 'ADMIN'
    ? next()
    : bad(req, res, 403, 'FORBIDDEN', 'مجوز ارسال اعلان دستگاه را ندارید.')
  : requirePermission('settings.manage');

const pushSendWindows = new Map();
const pushSendWindowMs = 60_000;
const pushSendLimit = 10;
const pushSendMaxActors = 2_000;

function limitPushSend(req, res, next) {
  const now = Date.now();
  for (const [key, window] of pushSendWindows) {
    if (window.expiresAt > now) break;
    pushSendWindows.delete(key);
  }
  const key = JSON.stringify([req.auth.tenantId, req.auth.userId]);
  let window = pushSendWindows.get(key);
  if (!window && pushSendWindows.size >= pushSendMaxActors) {
    res.set('Retry-After', '60');
    return bad(req, res, 429, 'PUSH_RATE_LIMITED', 'ارسال اعلان موقتاً محدود است.');
  }
  if (!window) {
    window = { expiresAt: now + pushSendWindowMs, attempts: 0 };
    pushSendWindows.set(key, window);
  }
  if (window.attempts >= pushSendLimit) {
    res.set('Retry-After', String(Math.ceil((window.expiresAt - now) / 1_000)));
    return bad(req, res, 429, 'PUSH_RATE_LIMITED', 'تعداد درخواست‌های ارسال اعلان بیش از حد مجاز است.');
  }
  window.attempts++;
  next();
}

async function auditPushSend(req) {
  if (entityDriverKind !== 'mssql') return;
  await withTenantContext(req.auth, async transaction => {
    await new sql.Request(transaction)
      .input('tenantId', sql.UniqueIdentifier, req.auth.tenantId)
      .input('actorUserId', sql.UniqueIdentifier, req.auth.userId)
      .input('correlationId', sql.NVarChar(100), req.correlationId)
      .query(`INSERT INTO security.AuditEvent (TenantId, ActorUserId, CorrelationId, EventType, EntityType, OutcomeCode)
        VALUES (@tenantId, @actorUserId, @correlationId, N'push.send.authorized', N'PushSubscription', 'SUCCESS')`);
  });
}

app.post('/api/v1/push/subscribe', authenticate, requireSignedSession, (req, res) => {
  const subscription = req.body?.subscription || req.body;
  if (!saveSubscription(subscription, req.auth)) {
    return res.status(400).json({ error: 'invalid_subscription' });
  }
  res.json({ ok: true });
});

app.post('/api/v1/push/unsubscribe', authenticate, requireSignedSession, (req, res) => {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== 'string' || !endpoint) return res.status(400).json({ error: 'endpoint_required' });
  removeSubscription(endpoint, req.auth);
  res.json({ ok: true });
});

// This endpoint sends only a generic preview to the authorized caller's own subscriptions.
app.post('/api/v1/push/send', authenticate, requireSignedSession, limitPushSend, requirePushSendPermission, wrap(async (req, res) => {
  const { userId, tag, id, linkTab, requireInteraction } = req.body || {};
  if (userId != null && userId !== req.auth.userId) {
    return res.status(403).json({ error: 'push_recipient_forbidden' });
  }
  const safeTab = typeof linkTab === 'string' && /^[a-z_]{1,50}$/.test(linkTab) ? linkTab : undefined;
  const safeTag = typeof tag === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(tag) ? tag : 'akhavan';
  const safeId = typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id) ? id : undefined;
  const payload = {
    title: 'اعلان جدید اخوان',
    body: 'برای مشاهده وارد سامانه شوید.',
    url: safeTab ? `/?tab=${safeTab}` : '/',
    tag: safeId || safeTag,
    id: safeId,
    linkTab: safeTab,
    requireInteraction: requireInteraction === true,
  };
  await auditPushSend(req);
  const result = await sendPushToUser(req.auth, payload);
  if (['web-push-not-installed', 'no-vapid'].includes(result.reason)) {
    return bad(req, res, 503, 'PUSH_UNAVAILABLE', 'سرویس ارسال اعلان دستگاه در دسترس نیست.');
  }
  res.json({ ok: true, sent: result.sent, reason: result.reason });
}));

app.get('/api/v1/analytics/reports/:reportId', authenticate, async (req, res) => {
  const reportId = Number(req.params.reportId);
  if (!Number.isInteger(reportId) || reportId < 1 || reportId > 11) {
    return res.status(400).json({ error: { code: 'INVALID_REPORT_ID', message: 'شناسه گزارش نامعتبر است.' } });
  }
  if (entityDriverKind === 'mssql' && !await hasSqlPermission(req.auth, 'finance.view', { organizationWide: true })) {
    return bad(req, res, 403, 'FORBIDDEN', 'مجوز مشاهدهٔ وضعیت منابع مالی کل سازمان را ندارید.');
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
 * - Unavailable OCR returns a failure so the operator may enter the actual fields manually.
 */
app.post('/api/v1/documents/ocr-extract', authenticate, requireSignedSession, async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', expectedDocType } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: { code: 'INVALID_PAYLOAD', message: 'ارسال تصویر یا فایل سند به صورت base64 الزامی است.' } });
    }

    // پاکسازی پیشوند data:image/...;base64, در صورت وجود
    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');

    const apiKey = process.env.GEMINI_API_KEY;
    let extractedResult = null;

    if (apiKey) {
      try {
        const { GoogleGenAI, Type } = await import('@google/genai');
        const ai = new GoogleGenAI({
          apiKey,
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
        }
      } catch {
        console.warn('[OCR PROVIDER UNAVAILABLE]', { correlationId: req.correlationId });
      }
    } else {
      return bad(req, res, 503, 'OCR_UNAVAILABLE', 'سرویس استخراج اطلاعات سند پیکربندی نشده است.');
    }

    if (!extractedResult?.fields || typeof extractedResult.fields !== 'object' || Array.isArray(extractedResult.fields)) {
      return bad(req, res, 503, 'OCR_UNAVAILABLE', 'پاسخ معتبر از سرویس استخراج سند دریافت نشد.');
    }

    return res.status(200).json({
      ok: true,
      ocrEngine: 'GEMINI_VISION',
      documentType: extractedResult.documentType || expectedDocType || 'BANK_RECEIPT',
      overallConfidence: Number.isFinite(extractedResult.overallConfidence) ? extractedResult.overallConfidence : null,
      fields: extractedResult.fields || {},
      rawExtractedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[DOCUMENT OCR ERROR]', { correlationId: req.correlationId });
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
  const status = ['CONFIG_MISSING', 'ESOCKET', 'ETIMEOUT', 'ECONNCLOSED', 'ENOTOPEN'].includes(error.code) ? 503 : 500;
  console.error('[SERVER ERROR]', { status, code: typeof error.code === 'string' && /^[A-Z_]{1,40}$/.test(error.code) ? error.code : 'INTERNAL_ERROR', correlationId: req.correlationId });
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
