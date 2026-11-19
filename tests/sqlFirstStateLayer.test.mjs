// Contract tests for the SQL-first state layer: classification, diff, merge, integrity, entity service, and a full
// client<->server round trip using the real StateSyncEngine against the real entity service (memory driver).
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {
  classify, splitState, buildHashIndex, diffAgainstIndex, applyToIndex, mergeSnapshot, checkIntegrity, profileCollections,
} from '../src/lib/stateModel.mjs';
import { StateSyncEngine } from '../src/services/stateSync.ts';
import { createEntityService, MemoryEntityDriver, FileEntityDriver } from '../server/entityStore.mjs';

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

test('allocation snapshots distinguish permitted empty, populated and restricted collections', async () => {
  const driver = new MemoryEntityDriver();
  const allowedService = createEntityService({ driver, registry, hasPermission: allow });
  const deniedService = createEntityService({ driver, registry, hasPermission: async () => false });
  const options = { includeEmptyPaymentAllocations: true };
  const allocation = { id: 'al1', paymentId: 'p1', invoiceId: 'i1', amount: 100 };

  assert.deepEqual((await allowedService.snapshot(auth, options)).collections.paymentAllocations, []);
  await allowedService.sync(auth, { upserts: { paymentAllocations: [allocation] } });
  assert.deepEqual((await allowedService.snapshot(auth, options)).collections.paymentAllocations, [allocation]);
  assert.deepEqual((await allowedService.snapshot({ ...auth, tenantId: 'other' }, options)).collections.paymentAllocations, []);

  const restricted = await deniedService.snapshot(auth, options);
  assert.equal(restricted.collections.paymentAllocations, undefined);
  assert.ok(restricted.hiddenCollections.includes('paymentAllocations'));
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

test('a failing server never loses local data and recovers with backoff', async () => {
  const svc = createEntityService({ driver: new MemoryEntityDriver(), registry, hasPermission: allow });
  let fail = true;
  const provider = { ...serviceProvider(svc, auth), syncStateChanges: async (c) => { if (fail) throw new Error('offline'); return svc.sync(auth, c); } };
  const store = fakeStore(sampleState());
  const engine = new StateSyncEngine(store, provider, registry, { debounceMs: 5, maxBackoffMs: 10 });
  provider.getStateSnapshot = async () => ({ collections: {}, singletons: {} });
  await engine.start(); await engine.flush();
  assert.equal(engine.getStatus().phase === 'error' || engine.getStatus().phase === 'pending', true);
  assert.equal(store.getState().state.accounts.length, 2);
  fail = false; await engine.flush(); await engine.flush();
  assert.equal((await svc.snapshot(auth)).collections.accounts.length, 2);
  engine.stop();
});
