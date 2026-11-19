import { externalIdentityKey, upsertExternalRecords } from './phase2Flow.ts';
import type { ERPImportRecord } from './erpContracts';

export type ErpEntityType =
  | 'SALES_ORDER' | 'INVOICE'
  // Canonical ETL entities (docs/MASTER_SPEC_FA.md پیوست ب). Same upsert/stale/identity engine — no parallel importer.
  | 'PAYMENT' | 'PAYMENT_ALLOCATION' | 'CREDIT_NOTE' | 'CHEQUE' | 'JOURNAL_LINE' | 'LEDGER_ACCOUNT' | 'PRODUCT' | 'PRODUCT_COST' | 'SALES_RETURN' | 'DELIVERY_EVENT';
export type ErpImportRecord = ERPImportRecord;
export interface ErpImportSummary {
  entityType: ErpEntityType;
  received: number;
  inserted: number;
  updated: number;
  skippedStale: number;
  conflicts: number;
  persisted: boolean;
}

const COLLECTIONS: Record<ErpEntityType, string> = {
  SALES_ORDER: 'salesOrders',
  INVOICE: 'invoices',
  PAYMENT: 'payments',
  PAYMENT_ALLOCATION: 'paymentAllocations',
  CREDIT_NOTE: 'creditNotes',
  CHEQUE: 'cheques',
  JOURNAL_LINE: 'journalLines',
  // reuses the existing app-side chart-of-accounts collection (coaMirror) — no parallel 'ledgerAccounts' store.
  LEDGER_ACCOUNT: 'coaMirror',
  // کالا: همان مجموعهٔ موجود اپ (`externalProducts`)؛ مجموعهٔ موازی نساز. نرخ مالیات هر کالا از ERP می‌آید.
  PRODUCT: 'externalProducts',
  PRODUCT_COST: 'productCosts',
  SALES_RETURN: 'salesReturns',
  DELIVERY_EVENT: 'deliveryEvents',
};
export const ERP_ENTITY_TYPES = Object.keys(COLLECTIONS) as ErpEntityType[];
export const erpCollectionFor = (entityType: ErpEntityType) => COLLECTIONS[entityType];

function normalizeRecord(entityType: ErpEntityType, source: ErpImportRecord) {
  const externalId = String(source.externalId ?? source.externalOrderId ?? source.externalInvoiceId ?? '').trim();
  const tenantId = String(source.tenantId ?? '').trim();
  const sourceSystemCode = String(source.sourceSystemCode ?? '').trim().toUpperCase();
  const modifiedAt = source.sourceModifiedAtUtc;
  // A supplied source timestamp is part of stale-update protection. Reject malformed
  // timestamps instead of silently letting them bypass the ordering guard.
  if (modifiedAt != null && String(modifiedAt).trim() !== '' && !Number.isFinite(Date.parse(String(modifiedAt)))) return null;
  if (!tenantId || !sourceSystemCode || !externalId) return null;
  const productTax = entityType === 'PRODUCT'
    ? { taxRatePercent: (source.taxRatePercent == null || String(source.taxRatePercent).trim() === '' || !Number.isFinite(Number(source.taxRatePercent))) ? null : Number(source.taxRatePercent) }
    : {};
  return {
    ...source,
    ...productTax,
    id: String(source.id ?? `${sourceSystemCode}:${entityType}:${externalId}`),
    tenantId,
    sourceSystemCode,
    entityType,
    externalId,
    ...(entityType === 'SALES_ORDER'
      ? { externalOrderId: externalId, origin: source.origin ?? 'ERP' }
      : entityType === 'INVOICE'
        ? { externalInvoiceId: externalId, isErpMirror: true, readOnlySource: 'ERP' }
        : { isErpMirror: true, readOnlySource: 'ERP', ...(entityType === 'CREDIT_NOTE' ? { externalCreditNoteId: externalId, sourceType: source.sourceType ?? 'ERP_MIRROR' } : {}) }),
  };
}

/** Pure transaction planner used by the persisted app adapter and deterministic tests. */
export function planErpImport(state: Record<string, unknown>, entityType: ErpEntityType, incoming: ErpImportRecord[]) {
  const collectionName = COLLECTIONS[entityType];
  const rawExisting = Array.isArray(state[collectionName]) ? state[collectionName] : [];
  const existing = rawExisting.map((record: Record<string, unknown>) => {
    const externalId = record?.externalId ?? record?.externalOrderId ?? record?.externalInvoiceId ?? record?.externalCreditNoteId;
    if (!externalId || !record?.tenantId || !record?.sourceSystemCode) return record;
    return normalizeRecord(entityType, { ...record, externalId, tenantId: record.tenantId, sourceSystemCode: record.sourceSystemCode });
  }).map((record: unknown, index: number) => record ?? rawExisting[index]);
  const normalized = incoming.map(record => normalizeRecord(entityType, record));
  const invalid = normalized.filter(record => record === null).length;
  const valid = normalized.filter((record): record is NonNullable<typeof record> => record !== null);
  const result = upsertExternalRecords(existing, valid, {
    externalIdField: 'externalId',
    typeField: 'entityType',
  });
  return {
    nextState: { ...state, [collectionName]: result.records },
    summary: {
      entityType,
      received: incoming.length,
      inserted: result.inserted,
      updated: result.updated,
      skippedStale: result.skippedStale,
      conflicts: result.conflicts + invalid,
      persisted: false,
    } satisfies ErpImportSummary,
  };
}

let importQueue: Promise<unknown> = Promise.resolve();
/** Serializes imports in this browser tab and commits the complete merged app state via Zustand persistence. */
export function importErpRecords(entityType: ErpEntityType, incoming: ErpImportRecord[], adapter: {
  readState: () => Record<string, unknown>;
  commitState: (nextState: Record<string, unknown>) => Promise<void> | void;
}): Promise<ErpImportSummary> {
  const run = async () => {
    const current = adapter.readState();
    const planned = planErpImport(current, entityType, incoming);
    if (planned.summary.conflicts > 0 && planned.summary.inserted === 0 && planned.summary.updated === 0 && planned.summary.skippedStale === 0) {
      return planned.summary;
    }
    await adapter.commitState(planned.nextState);
    return { ...planned.summary, persisted: true };
  };
  const result = importQueue.then(run, run);
  importQueue = result.then(() => undefined, () => undefined);
  return result;
}

/** Runtime entry point wired to the app's real persisted Zustand store. */
export async function importErpIntoApp(entityType: ErpEntityType, incoming: ErpImportRecord[]) {
  const { useAppStore } = await import('./storage.ts');
  return importErpRecords(entityType, incoming, {
    readState: () => useAppStore.getState().state as unknown as Record<string, unknown>,
    commitState: (nextState) => useAppStore.getState().updateState(() => nextState as Record<string, unknown>),
  });
}

export function getErpIdentity(record: ErpImportRecord, entityType: ErpEntityType) {
  return externalIdentityKey({ tenantId: record.tenantId, sourceSystemCode: record.sourceSystemCode, entityType, externalId: String(record.externalId ?? record.externalOrderId ?? record.externalInvoiceId ?? '') });
}
