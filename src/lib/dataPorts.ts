/**
 * Storage-neutral data port (spec §7). Engines/reports depend on this contract, never on IndexedDB directly.
 * IndexedDB (via the existing Zustand+idb store) is ONE adapter; a Backend/SQL adapter implements the same port later
 * without rewriting reports/engines. No network adapter is provided here because no backend exists yet.
 *
 * Reports must develop against this contract + swappable providers. Absence of SQL/ERP only blocks LIVE execution,
 * not design, logic, tests, or UI.
 */
export type AppStateRecord = Record<string, unknown>;
export interface DataPort {
  readonly kind: 'INDEXEDDB_TEST' | 'MEMORY' | 'BACKEND';
  readState(): AppStateRecord;
  commitState(next: AppStateRecord): Promise<void> | void;
}
/** Deterministic in-memory adapter for tests and tooling. */
export function createMemoryPort(initial: AppStateRecord = {}): DataPort & { snapshot(): AppStateRecord } {
  let state = initial;
  return { kind: 'MEMORY', readState: () => state, commitState: next => { state = next; }, snapshot: () => state };
}
/** Adapter over the app's real persisted store (IndexedDB-backed, test/dev only). Lazy import keeps node tests free of browser deps. */
export async function createAppStorePort(): Promise<DataPort> {
  const { useAppStore } = await import('./storage.ts');
  return {
    kind: 'INDEXEDDB_TEST',
    readState: () => useAppStore.getState().state as unknown as AppStateRecord,
    commitState: next => useAppStore.getState().updateState(() => next as Record<string, unknown>),
  };
}

/**
 * Report-scoped read model over any DataPort.
 * Canonical collections used by ReportEnginePanels / metricRegistry engines.
 * Does not invent SQL rows; when BACKEND/SQL adapter exists it returns the same shape from views.
 * UI remains consumer; formulas stay in reportAnalytics / receivableReconciliation / ledgerPnl / metricRegistry.
 */
export type ReportCollections = {
  invoices: unknown[];
  payments: unknown[];
  cheques: unknown[];
  expenses: unknown[];
  accounts: unknown[];
  quotes: unknown[];
  journalLines: unknown[];
  coaMirror: unknown[];
  visits: unknown[];
  deliveryEvents: unknown[];
  salesReturns: unknown[];
  paymentAllocations: unknown[];
  creditNotes: unknown[];
  users: unknown[];
  externalProducts: unknown[];
  tasks: unknown[];
  salesTargets: unknown[];
  seedMetadata?: { mode?: string } | null;
};

export function readReportCollections(port: DataPort): ReportCollections {
  const s = port.readState() || {};
  return {
    invoices: Array.isArray(s.invoices) ? s.invoices : [],
    payments: Array.isArray(s.payments) ? s.payments : [],
    cheques: Array.isArray(s.cheques) ? s.cheques : [],
    expenses: Array.isArray(s.expenses) ? s.expenses : [],
    accounts: Array.isArray(s.accounts) ? s.accounts : [],
    quotes: Array.isArray(s.quotes) ? s.quotes : [],
    journalLines: Array.isArray(s.journalLines) ? s.journalLines : [],
    coaMirror: Array.isArray(s.coaMirror) ? s.coaMirror : [],
    visits: Array.isArray(s.visits) ? s.visits : [],
    deliveryEvents: Array.isArray(s.deliveryEvents) ? s.deliveryEvents : [],
    salesReturns: Array.isArray(s.salesReturns) ? s.salesReturns : [],
    paymentAllocations: Array.isArray(s.paymentAllocations) ? s.paymentAllocations : [],
    creditNotes: Array.isArray(s.creditNotes) ? s.creditNotes : [],
    users: Array.isArray(s.users) ? s.users : [],
    externalProducts: Array.isArray(s.externalProducts) ? s.externalProducts : [],
    tasks: Array.isArray(s.tasks) ? s.tasks : [],
    salesTargets: Array.isArray(s.salesTargets) ? s.salesTargets : [],
    seedMetadata: s.seedMetadata ?? null,
  };
}

/** Build a MEMORY port from a full AppState-like object (current UI path). */
export function portFromAppState(state: AppStateRecord): DataPort {
  return createMemoryPort(state || {});
}
