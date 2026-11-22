// SQL-first state synchronisation. The Zustand store stays the fast read-model the whole UI already uses,
// but with the SQL provider active EVERY collection and setting is hydrated from, and persisted to, the
// provider (SQL Server via /api/v1/state/*). Import-light on purpose so it can be unit-tested without a browser.
import type { AppState } from '../types';
import {
  splitState, diffAgainstIndex, applyToIndex, mergeSnapshot, recordId, hashRecord, PRIVATE_PERSONNEL_COLLECTIONS, type HashIndex, type ChangeSet,
} from '../lib/stateModel.mjs';

export interface StateSnapshot { collections: Record<string, Array<Record<string, unknown>>>; singletons: Record<string, any>; serverVersion?: number; hiddenCollections?: string[] }
interface RejectedChange { collection: string; id?: string; reason: string }
export interface StateSyncResult { ok: boolean; upserted: number; deleted: number; serverVersion: number; rejected: RejectedChange[] }

/** The slice of DataProvider the sync engine needs (both providers implement it). */
export interface StateSyncProvider {
  name: string;
  getStateSnapshot(view?: 'chat'): Promise<StateSnapshot>;
  syncStateChanges(change: Omit<ChangeSet, 'count'>): Promise<StateSyncResult>;
  bootstrapState(state: unknown): Promise<{ ok: boolean; upserted: number; rejected: RejectedChange[]; serverVersion: number }>;
}
type SyncStoreSnapshot = { state: AppState };
export interface SyncableStore {
  getState(): SyncStoreSnapshot;
  setState(update: (previous: SyncStoreSnapshot) => SyncStoreSnapshot): void;
  subscribe(listener: () => void): () => void;
}
export type SyncPhase = 'stopped' | 'hydrating' | 'idle' | 'pending' | 'syncing' | 'error';
export interface SyncStatus { phase: SyncPhase; pending: number; lastSyncedAt: string | null; lastError: string | null; serverVersion: number; rejected: number }

export class StateSyncEngine {
  private index: HashIndex = { collections: {}, singletons: {} };
  private unsubscribe: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private suppress = false;
  private running = false;
  private active = false;
  private hydrated = false;
  private generation = 0;
  private snapshotRequest = 0;
  private readingSnapshot = false;
  private writesStarted = 0;
  private failures = 0;
  private listeners = new Set<(s: SyncStatus) => void>();
  private status: SyncStatus = { phase: 'stopped', pending: 0, lastSyncedAt: null, lastError: null, serverVersion: 0, rejected: 0 };

  private store: SyncableStore;
  private provider: StateSyncProvider;
  private registry: unknown;
  private options: { debounceMs?: number; maxBackoffMs?: number };

  constructor(store: SyncableStore, provider: StateSyncProvider, registry: unknown, options: { debounceMs?: number; maxBackoffMs?: number } = {}) {
    this.store = store; this.provider = provider; this.registry = registry; this.options = options;
  }

  getStatus(): SyncStatus { return this.status; }
  hasSnapshot(): boolean { return this.hydrated; }
  isRecordAcknowledged(collection: string, id: string): boolean { return this.index.collections[collection]?.has(id) ?? false; }

  /** Adopt an authoritative API receipt without sending the same write through state sync. */
  acknowledgeRecord(collection: string, record: Record<string,unknown>, before?: Record<string,unknown>): boolean {
    if (!this.active || !this.hydrated || this.running) return false;
    const id=recordId(record,collection,this.registry);
    const list=(this.store.getState().state as unknown as Record<string,unknown>)[collection];
    if (!id || !Array.isArray(list)) return false;
    const current=list.find(item=>recordId(item,collection,this.registry)===id);
    const alreadyCurrent=current && hashRecord(current)===hashRecord(record);
    if (!alreadyCurrent && (before ? !current || hashRecord(current)!==hashRecord(before) : Boolean(current))) return false;
    this.snapshotRequest++;
    applyToIndex(this.index,{upserts:{[collection]:[record]},deletes:{},singletons:{},count:1},this.registry);
    if (alreadyCurrent) return true;
    this.suppress=true;
    try {
      this.store.setState(prev=>({state:{...prev.state,[collection]:current
        ? list.map(item=>recordId(item,collection,this.registry)===id ? record : item)
        : [record,...list]}}));
    } finally { this.suppress=false; }
    return true;
  }

  onStatus(fn: (s: SyncStatus) => void): () => void { this.listeners.add(fn); fn(this.status); return () => this.listeners.delete(fn); }
  private set(patch: Partial<SyncStatus>) { this.status = { ...this.status, ...patch }; this.listeners.forEach(fn => fn(this.status)); }

  /** Pull the server snapshot into the store (server wins unless a local change is pending), then start tracking changes. */
  async start(): Promise<void> {
    if (this.active) return;
    this.active = true;
    const generation = ++this.generation;
    this.set({ phase: 'hydrating', lastError: null });
    try {
      await this.hydrate();
    } catch (error) {
      if (generation !== this.generation) return;
      this.set({ phase: 'error', lastError: error instanceof Error ? error.message : 'خطا در دریافت داده از پایگاه داده' });
    }
    if (generation !== this.generation) return;
    this.unsubscribe = this.store.subscribe(() => {
      if (!this.suppress) this.schedule(this.options.debounceMs ?? 700);
    });
    // Send local changes after the initial read has completed.
    this.schedule(50);
  }

  stop(): void {
    this.active = false;
    this.generation++;
    this.running = false;
    this.readingSnapshot = false;
    this.hydrated = false;
    this.index = { collections: {}, singletons: {} };
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.set({ phase: 'stopped' });
  }

  async hydrate(view?: 'chat'): Promise<boolean> {
    if (!this.active || (view && (!this.hydrated || this.readingSnapshot || this.running))) return false;
    const generation = this.generation;
    const request = ++this.snapshotRequest;
    const writesStarted = this.writesStarted;
    this.readingSnapshot = true;
    let snapshot: StateSnapshot;
    try {
      snapshot = await this.provider.getStateSnapshot(view);
    } finally {
      if (generation === this.generation && request === this.snapshotRequest) this.readingSnapshot = false;
    }
    if (generation !== this.generation || request !== this.snapshotRequest) return false;
    // A chat response that raced a write may predate its receipt. Keep the local queue and wait for the next poll.
    if (view && writesStarted !== this.writesStarted) return false;
    const current = this.store.getState().state;
    const { patch, index } = mergeSnapshot(current, snapshot, this.index, this.registry);
    const revoked = new Set(snapshot.hiddenCollections ?? []);
    for (const name of ['groups', 'messages', 'attachments', ...PRIVATE_PERSONNEL_COLLECTIONS]) {
      if (revoked.has(name)) {
        patch[name] = [];
        delete index.collections[name];
      }
    }
    // A revoked conversation must lose both synced messages and local compositions linked to it.
    if (patch.groups) {
      const visibleIds = new Set(patch.groups.map(group => group.id));
      patch.messages = (patch.messages ?? current.messages ?? []).filter(message => visibleIds.has(message.groupId));
    }
    this.index = index;
    this.suppress = true;
    try {
      this.store.setState(prev => ({ state: { ...prev.state, ...patch } }));
    } finally {
      this.suppress = false;
    }
    this.hydrated = true;
    if (!view) this.set({ phase: 'idle', serverVersion: snapshot.serverVersion ?? 0, lastError: null });
    return true;
  }

  private schedule(delay: number) {
    if (!this.active) return;
    if (this.timer) clearTimeout(this.timer);
    this.set({ phase: this.status.phase === 'syncing' ? 'syncing' : 'pending' });
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, delay);
  }

  private applyAcceptedChanges(change: Omit<ChangeSet, 'count'>, rejected: RejectedChange[]) {
    const rejectedKeys = new Set(rejected.map(row => `${row.collection}\u0000${row.id ?? ''}`));
    const isAccepted = (name: string, id?: string | null) =>
      !rejectedKeys.has(`${name}\u0000`) && !rejectedKeys.has(`${name}\u0000${id ?? ''}`);
    const accepted: ChangeSet = { upserts: {}, deletes: {}, singletons: {}, count: 0 };
    for (const [name, records] of Object.entries(change.upserts)) {
      const rows = records.filter(row => isAccepted(name, recordId(row, name, this.registry)));
      if (rows.length) accepted.upserts[name] = rows;
    }
    for (const [name, ids] of Object.entries(change.deletes)) {
      const rows = ids.filter(id => isAccepted(name, id));
      if (rows.length) accepted.deletes[name] = rows;
    }
    for (const [key, value] of Object.entries(change.singletons)) {
      if (isAccepted(key)) accepted.singletons[key] = value;
    }
    applyToIndex(this.index, accepted, this.registry);
  }

  /** Push every change made since the last successful sync. Safe to call repeatedly. */
  async flush(): Promise<boolean> {
    if (!this.active) return false;
    if (this.running) {
      this.schedule(300);
      return false;
    }
    this.running = true;
    const generation = this.generation;
    try {
      if (!this.hydrated && !await this.hydrate()) return false;
      if (generation !== this.generation) return false;
      const change = diffAgainstIndex(this.index, this.store.getState().state, this.registry);
      this.set({ pending: change.count });
      if (change.count === 0) { this.set({ phase: 'idle', lastError: null, rejected: 0 }); this.failures = 0; return true; }
      this.set({ phase: 'syncing' });
      const { count, ...payload } = change;
      this.writesStarted++;
      const result = await this.provider.syncStateChanges(payload);
      if (generation !== this.generation) return false;
      if (!result.ok) throw new Error('سرور تغییرات را نپذیرفت.');
      // Fold only what the server accepted into the index; rejected records stay "pending" so the UI can surface them.
      this.applyAcceptedChanges(payload, result.rejected);
      this.failures = 0;
      const stillPending = diffAgainstIndex(this.index, this.store.getState().state, this.registry).count;
      const rejected = result.rejected.length;
      this.set({
        phase: rejected ? 'error' : stillPending ? 'pending' : 'idle',
        pending: stillPending,
        lastSyncedAt: rejected ? this.status.lastSyncedAt : new Date().toISOString(),
        serverVersion: result.serverVersion,
        rejected,
        lastError: rejected ? `${rejected.toLocaleString('fa-IR')} تغییر از سوی سرور پذیرفته نشد و در صف مانده است.` : null,
      });
      if (stillPending && !rejected) this.schedule(this.options.debounceMs ?? 700);
      return !rejected && stillPending === 0;
    } catch (error) {
      if (generation !== this.generation) return false;
      this.failures++;
      const wait = Math.min(this.options.maxBackoffMs ?? 60000, 1000 * 2 ** Math.min(this.failures, 6));
      this.schedule(wait);
      this.set({ phase: 'error', lastError: error instanceof Error ? error.message : 'ارتباط با سرور برقرار نشد' });
      return false;
    } finally {
      if (generation === this.generation) this.running = false;
    }
  }

  /** Explicit "upload everything I have to SQL" (demo seed / first migration). Merge-only on the server. */
  async bootstrapFromLocal(): Promise<{ upserted: number; rejected: number }> {
    const generation = this.generation;
    const state = this.store.getState().state;
    const split = splitState(state, this.registry);
    const result = await this.provider.bootstrapState(state);
    if (!result.ok) throw new Error('سرور بارگذاری اولیه را نپذیرفت.');
    const rejected = result.rejected.length;
    if (generation === this.generation) {
      this.applyAcceptedChanges({
        upserts: Object.fromEntries(Object.entries(split.collections).map(([name, rows]) => [name, [...rows.values()]])),
        deletes: {}, singletons: split.singletons,
      }, result.rejected);
      this.set({
        lastSyncedAt: rejected ? this.status.lastSyncedAt : new Date().toISOString(),
        pending: diffAgainstIndex(this.index, this.store.getState().state, this.registry).count,
        serverVersion: result.serverVersion,
        rejected,
      });
    }
    return { upserted: result.upserted, rejected };
  }
}
