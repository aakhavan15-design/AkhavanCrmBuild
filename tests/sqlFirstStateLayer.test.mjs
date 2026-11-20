// Contract tests for the SQL-first state layer: classification, diff, merge, integrity, entity service, and a full
// client<->server round trip using the real StateSyncEngine against the real entity service (memory driver).
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {
  classify, splitState, buildHashIndex, diffAgainstIndex, applyToIndex, mergeSnapshot, checkIntegrity, profileCollections,
} from '../src/lib/stateModel.mjs';
import { StateSyncEngine } from '../src/services/stateSync.ts';
import { createEntityService, MemoryEntityDriver, FileEntityDriver, MssqlEntityDriver } from '../server/entityStore.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../src/config/stateCollections.json', import.meta.url), 'utf8'));
const allow = async () => true;
const auth = { tenantId: 'tenant-1', userId: 'user-1' };

const sampleState = () => ({
  currentUserId: 'u1', schemaVersion: 19, draftQuote: { x: 1 },
  users: [{ id: 'u1', name: 'علی' }, { id: 'u2', name: 'سارا' }],
  accounts: [{ id: 'a1', name: 'فراگستر', ownerId: 'u1' }, { id: 'a2', name: 'نوین', ownerId: 'u2' }],
  tasks: [{ id: 't1', title: 'پیگیری', accountId: 'a1', assigneeId: 'u1' }],
  invoices: [{ id: 'i1', accountId: 'a1', totalAmount: 100 }],
  auditLogs: [{ id: 'l1', action: 'X' }, { id: 'l2', action: 'Y' }],
  coaMirror: [{ code: '1101', title: 'صندوق' }],
  settings: { locale: { calendar: 'jalali' } },
  noIdList: [{ a: 1 }, { a: 2 }],
});

test('classify: collections, singletons and local-only keys', () => {
  const s = sampleState();
  assert.equal(classify('accounts', s.accounts, registry), 'collection');
  assert.equal(classify('coaMirror', s.coaMirror, registry), 'collection');          // custom idField = code
  assert.equal(classify('settings', s.settings, registry), 'singleton');
  assert.equal(classify('noIdList', s.noIdList, registry), 'singleton');             // never lose data lacking ids
  assert.equal(classify('currentUserId', s.currentUserId, registry), 'local');
  assert.equal(classify('draftQuote', s.draftQuote, registry), 'local');
  assert.equal(classify('x', [{ id: 'a' }, { id: 'a' }], registry), 'singleton');    // duplicate ids -> never collide silently
});

test('diff: only changed/new/removed records are sent, append-only logs are never deleted', () => {
  const s = sampleState();
  const index = buildHashIndex(splitState(s, registry));
  assert.equal(diffAgainstIndex(index, s, registry).count, 0);
  const next = structuredClone(s);
  next.accounts[0].name = 'تغییر';
  next.accounts.push({ id: 'a3', name: 'جدید' });
  next.tasks = [];
  next.auditLogs = next.auditLogs.slice(-1);                                          // local cap trimming
  next.settings.locale.calendar = 'gregorian';
  next.currentUserId = 'u2';                                                          // local only
  const d = diffAgainstIndex(index, next, registry);
  assert.deepEqual(d.upserts.accounts.map(r => r.id).sort(), ['a1', 'a3']);
  assert.deepEqual(d.deletes.tasks, ['t1']);
  assert.equal(d.deletes.auditLogs, undefined);
  assert.ok(d.singletons.settings);
  assert.equal(d.singletons.currentUserId, undefined);
});

test('merge: server wins, pending local edits win, remote deletes propagate, local-new survives', () => {
  const synced = sampleState();
  const index = buildHashIndex(splitState(synced, registry));
  const local = structuredClone(synced);
  local.accounts[0].name = 'ویرایش محلی';                       // pending push
  local.accounts.push({ id: 'a-local', name: 'فقط محلی' });      // never synced
  const snapshot = {
    collections: {
      accounts: [{ id: 'a1', name: 'نسخه سرور', ownerId: 'u1' }, { id: 'a3', name: 'از سرور' }],   // a2 deleted remotely
      users: synced.users,
    },
    singletons: { settings: { locale: { calendar: 'server' } } },
  };
  const { patch } = mergeSnapshot(local, snapshot, index, registry);
  const names = Object.fromEntries(patch.accounts.map(r => [r.id, r.name]));
  assert.equal(names.a1, 'ویرایش محلی');
  assert.equal(names.a3, 'از سرور');
  assert.equal(names['a-local'], 'فقط محلی');
  assert.equal('a2' in names, false);
  assert.equal(patch.settings.locale.calendar, 'server');
});

test('integrity: dangling references are reported with collection, field and target', () => {
  const issues = checkIntegrity({ accounts: [{ id: 'a1' }], tasks: [{ id: 't1', accountId: 'a1' }, { id: 't2', accountId: 'missing', assigneeId: 'ghost' }], users: [{ id: 'u1' }] }, registry);
  assert.deepEqual(issues.map(i => `${i.collection}.${i.field}=${i.value}`).sort(), ['tasks.accountId=missing', 'tasks.assigneeId=ghost']);
  const profile = profileCollections({ accounts: [{ id: 'a1', name: 'x' }, { id: 'a2', phone: '1' }] });
  assert.equal(profile.accounts.fields.name.coverage, 50);
});

test('entity service: permissions filter reads and block writes; limits enforced', async () => {
  const driver = new MemoryEntityDriver();
  const granted = new Set(['accounts.view', 'accounts.edit']);
  const svc = createEntityService({ driver, registry, hasPermission: async (_a, code) => granted.has(code) });
  const r = await svc.sync(auth, { upserts: { accounts: [{ id: 'a1', name: 'x' }], invoices: [{ id: 'i1' }] }, singletons: { settings: { a: 1 } } });
  assert.equal(r.upserted, 1);
  assert.deepEqual(r.rejected.map(x => `${x.collection}:${x.reason}`).sort(), ['invoices:FORBIDDEN', 'settings:FORBIDDEN']);
  const full = createEntityService({ driver, registry, hasPermission: allow });
  await full.sync(auth, { upserts: { invoices: [{ id: 'i1', accountId: 'a1' }] } });
  const snap = await svc.snapshot(auth);
  assert.ok(snap.collections.accounts);
  assert.equal(snap.collections.invoices, undefined);
  assert.deepEqual(snap.hiddenCollections, ['invoices']);
  const evil = await full.sync(auth, { upserts: { 'bad name; DROP': [{ id: 'z' }] } });
  assert.equal(evil.rejected[0].reason, 'INVALID_COLLECTION');
  const noId = await full.sync(auth, { upserts: { accounts: [{ name: 'no id' }] } });
  assert.equal(noId.rejected[0].reason, 'MISSING_ID');
});

test('tenant isolation: one tenant never sees another tenant rows', async () => {
  const svc = createEntityService({ driver: new MemoryEntityDriver(), registry, hasPermission: allow });
  await svc.sync({ tenantId: 'A', userId: 'u' }, { upserts: { accounts: [{ id: 'a1' }] } });
  assert.equal(Object.keys((await svc.snapshot({ tenantId: 'B', userId: 'u' })).collections).length, 0);
});

test('collection counts distinguish granted empty, populated and denied partitions', async () => {
  const driver = new MemoryEntityDriver();
  const admin = createEntityService({ driver, registry, hasPermission: allow });
  await admin.sync(auth, { upserts: { accounts: [{ id: 'a1' }], invoices: [{ id: 'i1' }] } });
  const viewer = createEntityService({ driver, registry, hasPermission: async (_auth, code) => code === 'accounts.view' });
  const result = await viewer.counts(auth, { includeEmptyCollections: ['accounts', 'invoices', 'externalProducts', 'payments'] });
  assert.equal(result.collections.accounts, 1);
  assert.equal(result.collections.externalProducts, 0);
  assert.equal(result.collections.invoices, undefined);
  assert.equal(result.collections.payments, undefined);
  assert.deepEqual(new Set(result.hiddenCollections), new Set(['invoices', 'payments']));
  assert.equal((await viewer.counts(auth)).collections.externalProducts, undefined);
});

test('operational snapshots exclude marked fixtures and production writes reject them without affecting real records', async () => {
  const driver = new MemoryEntityDriver();
  const demo = createEntityService({ driver, registry, hasPermission: allow });
  const production = createEntityService({ driver, registry, hasPermission: allow, excludeFixtures: true });
  await demo.sync(auth, {
    upserts: {
      accounts: [{ id: 'demo-account' }, { id: 'official-account' }],
      invoices: [{ id: 'old-erp-fixture', source: 'LOCAL_TEST' }, { id: 'official-invoice' }],
    },
    singletons: { extraRecords: [{ id: 'demo-old' }] },
  });
  const snapshot = await production.snapshot(auth);
  assert.deepEqual(snapshot.collections.accounts.map(row => row.id), ['official-account']);
  assert.deepEqual(snapshot.collections.invoices.map(row => row.id), ['official-invoice']);
  assert.equal(snapshot.singletons.extraRecords, undefined);
  const result = await production.sync(auth, {
    upserts: { payments: [{ id: 'TEST-receipt' }, { id: 'normal', source: 'DEMO' }, { id: 'confirmed-receipt' }] },
    singletons: { fixtureRecords: [{ id: 'unknown-id', isDemo: true }] },
  });
  assert.equal(result.upserted, 1);
  assert.equal(result.rejected.length, 3);
  assert.ok(result.rejected.every(record => record.reason === 'TEST_DATA_FORBIDDEN'));
  assert.equal((await demo.snapshot(auth)).collections.accounts.length, 2);
});

test('allocation snapshots distinguish permitted empty, populated and restricted collections', async () => {
  const driver = new MemoryEntityDriver();
  const allowedService = createEntityService({ driver, registry, hasPermission: allow });
  const deniedService = createEntityService({ driver, registry, hasPermission: async () => false });
  const options = { includeEmptyCollections: ['paymentAllocations', 'zoneAssignments'] };
  const allocation = { id: 'al1', paymentId: 'p1', invoiceId: 'i1', amount: 100 };
  const zoneAssignment = { id: 'za1', zoneId: 'z1', entityType: 'CUSTOMER', entityId: 'a1' };

  assert.deepEqual((await allowedService.snapshot(auth, options)).collections.paymentAllocations, []);
  assert.deepEqual((await allowedService.snapshot(auth, options)).collections.zoneAssignments, []);
  await allowedService.sync(auth, { upserts: { paymentAllocations: [allocation], zoneAssignments: [zoneAssignment] } });
  const populated = await allowedService.snapshot(auth, options);
  assert.deepEqual(populated.collections.paymentAllocations, [allocation]);
  assert.deepEqual(populated.collections.zoneAssignments, [zoneAssignment]);
  assert.deepEqual((await allowedService.snapshot({ ...auth, tenantId: 'other' }, options)).collections.paymentAllocations, []);

  const restricted = await deniedService.snapshot(auth, options);
  assert.equal(restricted.collections.paymentAllocations, undefined);
  assert.ok(restricted.hiddenCollections.includes('paymentAllocations'));
  assert.equal(restricted.collections.zoneAssignments, undefined);
  assert.ok(restricted.hiddenCollections.includes('zoneAssignments'));
});

test('SQL driver filters account reads and authorizes existing and incoming records before applying a batch', async () => {
  const applied = [];
  class Request {
    constructor(transaction) { assert.equal(transaction, 'tenant-transaction'); this.params = {}; }
    input(name, _type, value) { this.params[name] = value; return this; }
    async query(text) {
      if (text.includes('fn_EntityAccountScope')) {
        if (!this.params.scoped) {
          assert.match(text, /record.TenantId,@?N'accounts.view'/);
          assert.match(text, /fn_EntityFinancialDocumentScope/);
          return { recordset: [] };
        }
        assert.match(text, /WITH \(UPDLOCK,HOLDLOCK\)/);
        assert.match(text, /previous.EntityId,previous.JsonDoc,previous.UpdatedByUserId/);
        assert.match(text, /incoming.EntityId,incoming.JsonDoc,@userId/);
        assert.match(text, /collection.Name,N'finance.manage',previous.JsonDoc/);
        assert.match(text, /collection.Name,N'finance.manage',incoming.JsonDoc/);
        return { recordset: [{ RowIndex: JSON.parse(this.params.scoped).find(row => row.i === 'own-draft').index }] };
      }
      assert.match(text, /MAX\(Version\)/);
      return { recordset: [{ V: 3 }] };
    }
    async execute(proc) {
      assert.equal(proc, 'sync.usp_ApplyEntityChanges');
      applied.push(...JSON.parse(this.params.rows));
    }
  }
  const driver = new MssqlEntityDriver({
    sql: { Request, UniqueIdentifier: 'uuid', NVarChar: () => 'string' },
    run: async (claims, work) => { assert.deepEqual(claims, auth); return work('tenant-transaction'); },
  });
  const svc = createEntityService({ driver, registry, hasPermission: allow });
  assert.equal((await svc.snapshot(auth)).serverVersion, 3);
  const result = await svc.sync(auth, {
    upserts: { accounts: [{ id: 'own-draft' }, { id: 'different-branch' }], tasks: [{ id: 'task1' }], invoices: [{ id: 'different-branch-invoice' }] },
    deletes: { customers: ['hidden'] },
  });
  assert.equal(result.upserted, 2);
  assert.equal(result.deleted, 0);
  assert.deepEqual(result.rejected, [
    { collection: 'accounts', id: 'different-branch', reason: 'FORBIDDEN_SCOPE' },
    { collection: 'invoices', id: 'different-branch-invoice', reason: 'FORBIDDEN_SCOPE' },
    { collection: 'customers', id: 'hidden', reason: 'FORBIDDEN_SCOPE' },
  ]);
  assert.deepEqual(applied.map(row => row.i), ['own-draft', 'task1']);
});

test('financial scope checks both persisted references and rejects contradictory account links', () => {
  const migration = fs.readFileSync(new URL('../database/sqlserver/v1/031_scoped_financial_entity_reads.sql', import.meta.url), 'utf8');
  assert.match(migration, /ref.AccountId IS NULL OR ref.CustomerId IS NULL OR ref.AccountId=ref.CustomerId/);
  assert.match(migration, /fn_EntityFinancialPartyScope\(payment.TenantId,@PermissionCode,payment.JsonDoc\)/);
  assert.match(migration, /fn_EntityFinancialPartyScope\(invoice.TenantId,@PermissionCode,invoice.JsonDoc\)/);
  assert.match(migration, /payment.IsDeleted=0/);
  assert.match(migration, /invoice.IsDeleted=0/);
});

test('file driver persists across restarts', async () => {
  const file = new URL('../.tmp-entity-test.json', import.meta.url).pathname;
  fs.rmSync(file, { force: true });
  const d1 = new FileEntityDriver(file);
  const s1 = createEntityService({ driver: d1, registry, hasPermission: allow });
  await s1.sync(auth, { upserts: { tasks: [{ id: 't1', title: 'ماندگار' }] } });
  d1.flush();
  const s2 = createEntityService({ driver: new FileEntityDriver(file), registry, hasPermission: allow });
  assert.equal((await s2.snapshot(auth)).collections.tasks[0].title, 'ماندگار');
  fs.rmSync(file, { force: true });
});

/** Provider that talks to the real entity service, like HttpBackendDataProvider talks to the real server. */
function serviceProvider(svc, a) {
  return {
    name: 'SQLSERVER_BACKEND',
    getStateSnapshot: () => svc.snapshot(a),
    syncStateChanges: async (change) => { const r = await svc.sync(a, change); if (!r.ok) throw new Error(r.error); return r; },
    bootstrapState: (state) => svc.bootstrap(a, state),
  };
}
function fakeStore(state) {
  let current = { state }; const listeners = new Set();
  return {
    getState: () => current,
    setState: (p) => { const prev = current; current = typeof p === 'function' ? p(prev) : { ...prev, ...p }; listeners.forEach(l => l(current, prev)); },
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
  };
}

test('round trip: client edits reach SQL, a second client sees them, deletes propagate', async () => {
  const svc = createEntityService({ driver: new MemoryEntityDriver(), registry, hasPermission: allow });
  const storeA = fakeStore(sampleState());
  const A = new StateSyncEngine(storeA, serviceProvider(svc, auth), registry, { debounceMs: 5 });
  await A.start(); await A.flush();
  let snap = await svc.snapshot(auth);
  assert.equal(snap.collections.accounts.length, 2);                      // initial upload of local data
  assert.equal(snap.collections.users.length, 2);
  assert.equal(snap.singletons.settings.locale.calendar, 'jalali');
  assert.equal(snap.collections.draftQuote, undefined);                   // local-only never leaves the device

  storeA.setState(p => ({ ...p, state: { ...p.state, accounts: [...p.state.accounts, { id: 'a9', name: 'تازه', ownerId: 'u1' }], tasks: [] } }));
  await A.flush();
  snap = await svc.snapshot(auth);
  assert.ok(snap.collections.accounts.find(x => x.id === 'a9'));
  assert.equal((snap.collections.tasks || []).length, 0);

  const storeB = fakeStore({ users: [], accounts: [], settings: {} });
  const B = new StateSyncEngine(storeB, serviceProvider(svc, auth), registry, { debounceMs: 5 });
  await B.start(); await B.flush();
  assert.ok(storeB.getState().state.accounts.find(x => x.id === 'a9'));
  assert.equal(storeB.getState().state.users.length, 2);

  storeB.setState(p => ({ ...p, state: { ...p.state, accounts: p.state.accounts.filter(x => x.id !== 'a9') } }));
  await B.flush();
  await A.hydrate();
  assert.equal(storeA.getState().state.accounts.some(x => x.id === 'a9'), false);
  assert.equal(A.getStatus().pending, 0);
  A.stop(); B.stop();
});

test('bootstrap uploads the full local state (demo seed) merge-only and is idempotent', async () => {
  const svc = createEntityService({ driver: new MemoryEntityDriver(), registry, hasPermission: allow });
  const state = sampleState();
  state.accounts.push(...Array.from({ length: 300 }, (_, i) => ({ id: `demo-acc-${i}`, name: `مشتری ${i}`, ownerId: 'u1' })));
  const r1 = await svc.bootstrap(auth, state);
  const r2 = await svc.bootstrap(auth, state);
  assert.equal(r1.ok, true);
  assert.equal(r1.upserted, r2.upserted);
  const snap = await svc.snapshot(auth);
  assert.equal(snap.collections.accounts.length, 302);                    // second run did not duplicate
  assert.equal((await svc.integrity(auth)).issueCount, 0);
});

test('stopping an in-flight initial read leaves the store and queue untouched', async () => {
  let resolveSnapshot;
  let writes = 0;
  const store = fakeStore({ accounts: [{ id: 'new-session-local' }] });
  const engine = new StateSyncEngine(store, {
    getStateSnapshot: () => new Promise(resolve => { resolveSnapshot = resolve; }),
    syncStateChanges: async () => { writes++; throw new Error('unexpected write'); },
  }, registry, { debounceMs: 5 });
  const starting = engine.start();
  engine.stop();
  resolveSnapshot({ collections: { accounts: [{ id: 'old-session-remote' }] }, singletons: {} });
  await starting;
  assert.equal(engine.getStatus().phase, 'stopped');
  assert.deepEqual(store.getState().state.accounts.map(row => row.id), ['new-session-local']);
  assert.equal(await engine.flush(), false);
  assert.equal(writes, 0);
});

test('no records are sent until the first server snapshot succeeds', async () => {
  let denyRead = true;
  let writes = 0;
  const store = fakeStore({ accounts: [{ id: 'a1' }] });
  const engine = new StateSyncEngine(store, {
    getStateSnapshot: async () => {
      if (denyRead) throw new Error('read unavailable');
      return { collections: {}, singletons: {} };
    },
    syncStateChanges: async () => {
      writes++;
      return { ok: true, upserted: 1, deleted: 0, serverVersion: 1, rejected: [] };
    },
  }, registry);
  await engine.start();
  assert.equal(await engine.flush(), false);
  assert.equal(writes, 0);
  denyRead = false;
  assert.equal(await engine.flush(), true);
  assert.equal(writes, 1);
  engine.stop();
});

test('partial server rejections remain pending and do not report a successful push', async () => {
  const service = createEntityService({
    driver: new MemoryEntityDriver(),
    registry,
    hasPermission: async (_auth, code) => ['accounts.view', 'accounts.edit'].includes(code),
  });
  const store = fakeStore({ accounts: [{ id: 'a1' }], invoices: [{ id: 'i1' }] });
  const engine = new StateSyncEngine(store, serviceProvider(service, auth), registry);
  await engine.start();
  assert.equal(await engine.flush(), false);
  const status = engine.getStatus();
  assert.equal(status.phase, 'error');
  assert.equal(status.pending, 1);
  assert.equal(status.rejected, 1);
  assert.equal(status.lastSyncedAt, null);
  assert.deepEqual(store.getState().state.invoices, [{ id: 'i1' }]);
  assert.equal((await service.snapshot(auth)).collections.accounts.length, 1);
  engine.stop();
});

test('a failing server never loses local data and recovers with backoff', async () => {
  const svc = createEntityService({ driver: new MemoryEntityDriver(), registry, hasPermission: allow });
  let fail = true;
  const provider = { ...serviceProvider(svc, auth), syncStateChanges: async (c) => { if (fail) throw new Error('offline'); return svc.sync(auth, c); } };
  const store = fakeStore(sampleState());
  const engine = new StateSyncEngine(store, provider, registry, { debounceMs: 5, maxBackoffMs: 10 });
  provider.getStateSnapshot = async () => ({ collections: {}, singletons: {} });
  await engine.start();
  assert.equal(await engine.flush(), false);
  assert.equal(engine.getStatus().phase, 'error');
  assert.equal(store.getState().state.accounts.length, 2);
  fail = false;
  assert.equal(await engine.flush(), true);
  assert.equal((await svc.snapshot(auth)).collections.accounts.length, 2);
  engine.stop();
});
