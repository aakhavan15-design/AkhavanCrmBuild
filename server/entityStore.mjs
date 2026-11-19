// SQL-first entity store service. Every AppState collection/singleton lands in ONE tenant-isolated table
// (sync.EntityStore, migration 023), so a missing typed table/column can never block a feature:
// data is always persisted, and `profile()` reports which typed columns the product actually needs next.
// Drivers: memory (tests), file (local dev without SQL Server), mssql (production, RLS via SESSION_CONTEXT).
import fs from 'node:fs';
import path from 'node:path';
import {
  splitState, policyOf, recordId, classify, checkIntegrity, profileCollections, SINGLETON_PREFIX,
} from '../src/lib/stateModel.mjs';

const NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;
export const LIMITS = Object.freeze({ maxRecordBytes: 1_000_000, maxChangeRecords: 5000, maxBootstrapRecords: 50000 });
const now = () => new Date().toISOString();
const bytes = (value) => Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');

/* ------------------------------ drivers ------------------------------ */
export class MemoryEntityDriver {
  constructor() { this.tenants = new Map(); this.kind = 'memory'; }
  _t(tenantId) {
    if (!this.tenants.has(tenantId)) this.tenants.set(tenantId, { rows: new Map(), version: 0 });
    return this.tenants.get(tenantId);
  }
  async load(tenantId) {
    const t = this._t(tenantId);
    const collections = {}, singletons = {};
    for (const row of t.rows.values()) {
      if (row.deleted) continue;
      if (row.collection === SINGLETON_PREFIX) singletons[row.id] = row.json;
      else (collections[row.collection] ||= []).push(row.json);
    }
    return { collections, singletons, version: t.version };
  }
  async apply(tenantId, userId, change) {
    const t = this._t(tenantId);
    const stamp = now();
    let upserted = 0, deleted = 0;
    const put = (collection, id, json) => {
      const key = `${collection}\u0000${id}`;
      const prev = t.rows.get(key);
      t.rows.set(key, { collection, id, json: structuredClone(json), deleted: false, version: (prev?.version || 0) + 1, updatedAt: stamp, updatedBy: userId });
      upserted++;
    };
    for (const [name, list] of Object.entries(change.upserts || {})) for (const rec of list) put(name, rec.__id, rec.json);
    for (const [key, value] of Object.entries(change.singletons || {})) put(SINGLETON_PREFIX, key, value);
    for (const [name, ids] of Object.entries(change.deletes || {})) for (const id of ids) {
      const row = t.rows.get(`${name}\u0000${id}`);
      if (row && !row.deleted) { row.deleted = true; row.version++; row.updatedAt = stamp; row.updatedBy = userId; deleted++; }
    }
    t.version++;
    return { upserted, deleted, serverVersion: t.version };
  }
}

export class FileEntityDriver extends MemoryEntityDriver {
  constructor(filePath) {
    super(); this.kind = 'file'; this.filePath = filePath; this._timer = null;
    try {
      if (fs.existsSync(filePath)) {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        for (const [tenant, dump] of Object.entries(raw.tenants || {})) this.tenants.set(tenant, { version: dump.version || 0, rows: new Map(dump.rows || []) });
      }
    } catch (error) { console.error('[ENTITY_STORE] could not read', filePath, error?.message); }
  }
  async apply(tenantId, userId, change) {
    const result = await super.apply(tenantId, userId, change);
    this._flushSoon();
    return result;
  }
  _flushSoon() {
    if (this._timer) return;
    this._timer = setTimeout(() => { this._timer = null; this.flush(); }, 250);
    this._timer.unref?.();
  }
  flush() {
    const dump = { savedAt: now(), tenants: Object.fromEntries([...this.tenants].map(([k, v]) => [k, { version: v.version, rows: [...v.rows] }])) };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(dump));
    fs.renameSync(tmp, this.filePath);
  }
}

/** Production driver. `run(claims, work)` must execute `work(transaction)` inside a transaction that already
 *  executed sp_set_session_context(TenantId/UserId) (server/index.mjs withTenantContext). `sql` is the mssql module. */
export class MssqlEntityDriver {
  constructor({ sql, run }) { this.sql = sql; this.run = run; this.kind = 'mssql'; }
  async load(tenantId, userId) {
    const { sql } = this;
    return this.run({ tenantId, userId }, async (tx) => {
      const rows = (await new sql.Request(tx).input('tenantId', sql.UniqueIdentifier, tenantId)
        .query('SELECT CollectionName, EntityId, JsonDoc FROM sync.EntityStore WHERE TenantId=@tenantId AND IsDeleted=0 ORDER BY CreatedAtUtc, EntityId')).recordset;
      const version = (await new sql.Request(tx).input('tenantId', sql.UniqueIdentifier, tenantId)
        .query('SELECT ISNULL(MAX(Version),0) AS V FROM sync.EntityStore WHERE TenantId=@tenantId')).recordset[0]?.V || 0;
      const collections = {}, singletons = {};
      for (const row of rows) {
        const json = JSON.parse(row.JsonDoc);
        if (row.CollectionName === SINGLETON_PREFIX) singletons[row.EntityId] = json;
        else (collections[row.CollectionName] ||= []).push(json);
      }
      return { collections, singletons, version: Number(version) };
    });
  }
  async apply(tenantId, userId, change) {
    const { sql } = this;
    const rows = [];
    for (const [name, list] of Object.entries(change.upserts || {})) for (const rec of list) rows.push({ c: name, i: rec.__id, j: JSON.stringify(rec.json), d: 0 });
    for (const [key, value] of Object.entries(change.singletons || {})) rows.push({ c: SINGLETON_PREFIX, i: key, j: JSON.stringify(value ?? null), d: 0 });
    for (const [name, ids] of Object.entries(change.deletes || {})) for (const id of ids) rows.push({ c: name, i: id, j: null, d: 1 });
    return this.run({ tenantId, userId }, async (tx) => {
      let upserted = 0, deleted = 0;
      for (let at = 0; at < rows.length; at += 400) {
        const chunk = rows.slice(at, at + 400);
        await new sql.Request(tx)
          .input('tenantId', sql.UniqueIdentifier, tenantId).input('userId', sql.UniqueIdentifier, userId)
          .input('rows', sql.NVarChar(sql.MAX), JSON.stringify(chunk))
          .execute('sync.usp_ApplyEntityChanges');
        for (const r of chunk) r.d ? deleted++ : upserted++;
      }
      const version = (await new sql.Request(tx).input('tenantId', sql.UniqueIdentifier, tenantId)
        .query('SELECT ISNULL(MAX(Version),0) AS V FROM sync.EntityStore WHERE TenantId=@tenantId')).recordset[0]?.V || 0;
      return { upserted, deleted, serverVersion: Number(version) };
    });
  }
}

/* ------------------------------ service ------------------------------ */
export function createEntityService({ driver, registry, hasPermission }) {
  const can = async (auth, code) => code === 'authenticated' || Boolean(await hasPermission(auth, code));
  const readableCache = async (auth) => {
    const memo = new Map();
    return async (name) => {
      const code = policyOf(name, registry).read;
      if (!memo.has(code)) memo.set(code, await can(auth, code));
      return memo.get(code);
    };
  };

  async function snapshot(auth, { includeEmptyPaymentAllocations = false } = {}) {
    const full = await driver.load(auth.tenantId, auth.userId);
    const canRead = await readableCache(auth);
    const collections = {};
    const hidden = [];
    // Preserve the distinction between a permitted empty collection and a hidden source.
    const storedCollections = includeEmptyPaymentAllocations
      ? { paymentAllocations: [], ...full.collections }
      : full.collections;
    for (const [name, list] of Object.entries(storedCollections)) {
      if (await canRead(name)) collections[name] = list; else hidden.push(name);
    }
    return { collections, singletons: full.singletons, serverVersion: full.version, hiddenCollections: hidden, generatedAt: now() };
  }

  /** change = { upserts: {name:[record]}, deletes: {name:[id]}, singletons: {key:value} } (client format) */
  async function sync(auth, change, { allowDeletes = true } = {}) {
    const upserts = {}, deletes = {}, singletons = {};
    const rejected = [];
    let total = 0;
    const writable = new Map();
    const canWrite = async (name) => {
      const code = policyOf(name, registry).write;
      if (!writable.has(code)) writable.set(code, await can(auth, code));
      return writable.get(code);
    };
    for (const [name, list] of Object.entries(change?.upserts || {})) {
      if (!NAME_RE.test(name) || !Array.isArray(list)) { rejected.push({ collection: name, reason: 'INVALID_COLLECTION' }); continue; }
      if (!(await canWrite(name))) { rejected.push({ collection: name, reason: 'FORBIDDEN', count: list.length }); continue; }
      for (const rec of list) {
        const id = recordId(rec, name, registry);
        if (!id) { rejected.push({ collection: name, reason: 'MISSING_ID' }); continue; }
        if (bytes(rec) > LIMITS.maxRecordBytes) { rejected.push({ collection: name, id, reason: 'RECORD_TOO_LARGE' }); continue; }
        (upserts[name] ||= []).push({ __id: id, json: rec }); total++;
      }
    }
    for (const [name, ids] of Object.entries(allowDeletes ? (change?.deletes || {}) : {})) {
      if (!NAME_RE.test(name) || !Array.isArray(ids)) { rejected.push({ collection: name, reason: 'INVALID_COLLECTION' }); continue; }
      if (!(await canWrite(name))) { rejected.push({ collection: name, reason: 'FORBIDDEN', count: ids.length }); continue; }
      deletes[name] = ids.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 200); total += deletes[name].length;
    }
    for (const [key, value] of Object.entries(change?.singletons || {})) {
      if (!NAME_RE.test(key)) { rejected.push({ collection: key, reason: 'INVALID_SINGLETON' }); continue; }
      const code = policyOf(key, registry).write;
      // singletons (settings, locale, flags) follow the strictest write rule: settings.manage
      const needed = code === 'authenticated' ? 'authenticated' : code;
      if (!(await can(auth, needed === 'authenticated' ? 'settings.manage' : needed))) { rejected.push({ collection: key, reason: 'FORBIDDEN' }); continue; }
      if (bytes(value) > LIMITS.maxRecordBytes) { rejected.push({ collection: key, reason: 'RECORD_TOO_LARGE' }); continue; }
      singletons[key] = value; total++;
    }
    if (total > LIMITS.maxChangeRecords) return { ok: false, error: 'CHANGE_TOO_LARGE', limit: LIMITS.maxChangeRecords };
    const result = total ? await driver.apply(auth.tenantId, auth.userId, { upserts, deletes, singletons }) : { upserted: 0, deleted: 0, serverVersion: (await driver.load(auth.tenantId, auth.userId)).version };
    return { ok: true, ...result, rejected };
  }

  /** Upload a full client state (incl. demo seed): merge-only, never deletes server rows. Sent in batches by the client. */
  async function bootstrap(auth, state) {
    const split = splitState(state, registry);
    const change = { upserts: {}, deletes: {}, singletons: {} };
    let n = 0;
    for (const [name, map] of Object.entries(split.collections)) { change.upserts[name] = [...map.values()]; n += map.size; }
    change.singletons = split.singletons;
    if (n > LIMITS.maxBootstrapRecords) return { ok: false, error: 'BOOTSTRAP_TOO_LARGE', limit: LIMITS.maxBootstrapRecords };
    // apply in slices so a single request never exceeds the per-change limit
    const summary = { upserted: 0, deleted: 0, rejected: [], serverVersion: 0 };
    for (const [name, list] of Object.entries(change.upserts)) {
      for (let at = 0; at < list.length; at += LIMITS.maxChangeRecords) {
        const r = await sync(auth, { upserts: { [name]: list.slice(at, at + LIMITS.maxChangeRecords) } }, { allowDeletes: false });
        if (!r.ok) return r;
        summary.upserted += r.upserted; summary.rejected.push(...r.rejected); summary.serverVersion = r.serverVersion;
      }
    }
    const r = await sync(auth, { singletons: change.singletons }, { allowDeletes: false });
    if (!r.ok) return r;
    summary.upserted += r.upserted; summary.rejected.push(...r.rejected); summary.serverVersion = r.serverVersion;
    return { ok: true, collections: Object.keys(change.upserts).length, ...summary };
  }

  async function integrity(auth) {
    const snap = await snapshot(auth);
    const issues = checkIntegrity(snap.collections, registry);
    return { collections: Object.fromEntries(Object.entries(snap.collections).map(([k, v]) => [k, v.length])), issueCount: issues.length, issues: issues.slice(0, 500) };
  }
  async function profile(auth) { return profileCollections((await snapshot(auth)).collections); }
  async function counts(auth) {
    const snap = await snapshot(auth);
    return { driver: driver.kind, serverVersion: snap.serverVersion, collections: Object.fromEntries(Object.entries(snap.collections).map(([k, v]) => [k, v.length])), singletons: Object.keys(snap.singletons), hiddenCollections: snap.hiddenCollections };
  }
  return { snapshot, sync, bootstrap, integrity, profile, counts, classify: (k, v) => classify(k, v, registry) };
}
