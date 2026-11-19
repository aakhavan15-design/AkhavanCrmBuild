// Shared (browser + server) data model for the SQL-first state layer. Plain ESM, zero dependencies,
// so the exact same rules classify, diff, validate and profile data on both sides.
// Source of truth for collections/permissions: src/config/stateCollections.json (passed in as `registry`).

export const SINGLETON_PREFIX = '__singleton__';
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** FNV-1a 32-bit over a string; used only to detect "did this record change", never for security. */
export function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + ':' + text.length.toString(36);
}
export const hashRecord = (record) => fnv1a(JSON.stringify(record));

export function idFieldOf(name, registry) { return registry?.collections?.[name]?.idField || 'id'; }

export function recordId(record, name, registry) {
  const raw = record?.[idFieldOf(name, registry)];
  return (typeof raw === 'string' && raw.length > 0 && raw.length <= 200) ? raw : (typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : null);
}

/** 'collection' = array of records that all carry a usable id; 'singleton' = any other synced value; 'local' = never synced. */
export function classify(key, value, registry) {
  if ((registry?.localOnlyKeys || []).includes(key)) return 'local';
  if (value === undefined || typeof value === 'function') return 'local';
  if (Array.isArray(value) && value.every(isPlainObject) && value.every((item) => recordId(item, key, registry) !== null)) {
    const ids = new Set(value.map((item) => recordId(item, key, registry)));
    if (ids.size === value.length) return 'collection';
  }
  return 'singleton';
}

export function policyOf(name, registry) {
  const entry = registry?.collections?.[name] || {};
  const profile = registry?.accessProfiles?.[entry.profile || registry?.defaultProfile || 'internal'] || { read: 'authenticated', write: 'authenticated' };
  return { read: profile.read, write: profile.write, refs: entry.refs || {}, idField: entry.idField || 'id', profile: entry.profile || registry?.defaultProfile || 'internal', appendOnly: entry.appendOnly === true, maxLocal: entry.maxLocal || 0 };
}

/** Splits an AppState-like object into collection maps and singleton values. */
export function splitState(state, registry) {
  const collections = {};
  const singletons = {};
  for (const key of Object.keys(state || {})) {
    const value = state[key];
    const kind = classify(key, value, registry);
    if (kind === 'collection') {
      collections[key] = new Map(value.map((item) => [recordId(item, key, registry), item]));
    } else if (kind === 'singleton') {
      singletons[key] = value;
    }
  }
  return { collections, singletons };
}

/** Index of last-synced hashes: { collections: {name: Map(id->hash)}, singletons: {key: hash} } */
export function buildHashIndex(split) {
  const collections = {};
  for (const [name, map] of Object.entries(split.collections)) collections[name] = new Map([...map].map(([id, rec]) => [id, hashRecord(rec)]));
  const singletons = {};
  for (const [key, value] of Object.entries(split.singletons)) singletons[key] = fnv1a(JSON.stringify(value ?? null));
  return { collections, singletons };
}

/**
 * Computes the minimal change-set between the last synced hash index and the next state.
 * Returns { upserts: {name:[record]}, deletes: {name:[id]}, singletons: {key:value}, count }.
 */
export function diffAgainstIndex(index, nextState, registry) {
  const split = splitState(nextState, registry);
  const upserts = {}, deletes = {}, singletons = {};
  let count = 0;
  for (const [name, map] of Object.entries(split.collections)) {
    const known = index.collections[name] || new Map();
    for (const [id, rec] of map) {
      if (known.get(id) !== hashRecord(rec)) { (upserts[name] ||= []).push(rec); count++; }
    }
    if (!registry?.collections?.[name]?.appendOnly) for (const id of known.keys()) if (!map.has(id)) { (deletes[name] ||= []).push(id); count++; }
  }
  // collections that vanished entirely (or became singleton-shaped) are deletions of every known id
  for (const [name, known] of Object.entries(index.collections)) {
    if (!split.collections[name] && !registry?.collections?.[name]?.appendOnly) { for (const id of known.keys()) { (deletes[name] ||= []).push(id); count++; } }
  }
  for (const [key, value] of Object.entries(split.singletons)) {
    if (index.singletons[key] !== fnv1a(JSON.stringify(value ?? null))) { singletons[key] = value; count++; }
  }
  return { upserts, deletes, singletons, count };
}

/** Folds an applied change-set into the hash index so the next diff is relative to it. */
export function applyToIndex(index, change, registry) {
  for (const [name, list] of Object.entries(change.upserts)) {
    const map = (index.collections[name] ||= new Map());
    for (const rec of list) map.set(recordId(rec, name, registry), hashRecord(rec));
  }
  for (const [name, ids] of Object.entries(change.deletes)) {
    const map = index.collections[name]; if (!map) continue;
    for (const id of ids) map.delete(id);
  }
  for (const [key, value] of Object.entries(change.singletons)) index.singletons[key] = fnv1a(JSON.stringify(value ?? null));
}

/** Rebuilds an AppState patch from a server snapshot { collections: {name:[records]}, singletons: {key:value} }. */
export function snapshotToState(snapshot) {
  const out = {};
  for (const [name, list] of Object.entries(snapshot?.collections || {})) out[name] = Array.isArray(list) ? list : [];
  for (const [key, value] of Object.entries(snapshot?.singletons || {})) out[key] = value;
  return out;
}

/** Referential integrity check using the `refs` declared in the registry. Pure: works on { name: [records] }. */
export function checkIntegrity(collectionLists, registry) {
  const issues = [];
  const ids = {};
  for (const [name, list] of Object.entries(collectionLists)) ids[name] = new Set((list || []).map((r) => recordId(r, name, registry)).filter(Boolean));
  // `customers` and `accounts` are two views of the same party master in this product
  const partyIds = new Set([...(ids.accounts || []), ...(ids.customers || [])]);
  for (const [name, list] of Object.entries(collectionLists)) {
    const { refs } = policyOf(name, registry);
    for (const rec of list || []) {
      for (const [field, target] of Object.entries(refs)) {
        const value = rec?.[field];
        if (value === undefined || value === null || value === '') continue;
        const pool = (target === 'accounts' || target === 'customers') ? partyIds : ids[target];
        if (!pool) continue;               // target collection not loaded -> cannot judge
        if (!pool.has(String(value))) issues.push({ collection: name, id: recordId(rec, name, registry), field, value: String(value), target });
      }
    }
  }
  return issues;
}

/** Union of observed field names/types per collection -> tells which columns a typed SQL table would need. */
export function profileCollections(collectionLists) {
  const report = {};
  for (const [name, list] of Object.entries(collectionLists)) {
    const fields = {};
    for (const rec of list || []) for (const [field, value] of Object.entries(rec || {})) {
      const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
      const f = (fields[field] ||= { types: new Set(), seen: 0 });
      f.types.add(type); f.seen++;
    }
    report[name] = { rows: (list || []).length, fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { types: [...v.types].sort(), coverage: (list || []).length ? Math.round((v.seen / list.length) * 100) : 0 }])) };
  }
  return report;
}

/**
 * Three-way-ish merge of a server snapshot into local state, driven by the last-synced hash index:
 *  - same id on both sides: server wins, unless the local copy changed since the last sync (pending push -> local wins)
 *  - id only on server: added locally
 *  - id only local: kept if never synced (local-new, will be pushed); dropped if it WAS synced (deleted by another client)
 * Returns { patch, index } where patch is an AppState partial and index is the new hash index.
 */
export function mergeSnapshot(local, snapshot, index, registry) {
  const patch = {};
  const nextIndex = { collections: { ...index.collections }, singletons: { ...index.singletons } };
  for (const [name, serverList] of Object.entries(snapshot?.collections || {})) {
    const known = index.collections[name] || new Map();
    const localList = Array.isArray(local?.[name]) ? local[name] : [];
    const localById = new Map();
    for (const rec of localList) { const id = recordId(rec, name, registry); if (id) localById.set(id, rec); }
    const merged = [], seen = new Set();
    const newKnown = new Map();
    for (const rec of serverList) {
      const id = recordId(rec, name, registry); if (!id) continue;
      seen.add(id);
      const mine = localById.get(id);
      const pending = mine !== undefined && known.has(id) && known.get(id) !== hashRecord(mine);
      if (pending) { merged.push(mine); newKnown.set(id, known.get(id)); }
      else { merged.push(rec); newKnown.set(id, hashRecord(rec)); }
    }
    for (const rec of localList) {
      const id = recordId(rec, name, registry);
      if (!id || seen.has(id)) continue;
      if (known.has(id)) continue;           // previously synced, now gone on server => remote delete
      merged.push(rec);                       // local-new => stays, pushed on next diff
    }
    const cap = registry?.collections?.[name]?.maxLocal || 0;
    patch[name] = (registry?.collections?.[name]?.appendOnly && cap > 0 && merged.length > cap) ? merged.slice(-cap) : merged;
    nextIndex.collections[name] = newKnown;
  }
  for (const [key, value] of Object.entries(snapshot?.singletons || {})) {
    const localValue = local?.[key];
    const synced = index.singletons[key];
    const localPending = synced !== undefined && localValue !== undefined && synced !== fnv1a(JSON.stringify(localValue ?? null));
    if (localPending) continue;
    patch[key] = value;
    nextIndex.singletons[key] = fnv1a(JSON.stringify(value ?? null));
  }
  return { patch, index: nextIndex };
}
