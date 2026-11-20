import { calculatePriceWaterfall } from './cpqEngine.ts';

/** Phase 2 canonical order → ERP invoice mirror → dispatch linkage rules.
 * Pure functions only: no ERP success is inferred from local state and no invoice is issued here.
 */
export type ErpRequestStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';
export type DistributionState = 'IN_DISTRIBUTION' | 'NOT_YET_IN_DISTRIBUTION' | 'UNKNOWN';

export interface ErpChangeRequest {
  id: string;
  entityType: 'SALES_ORDER';
  entityId: string;
  sourceSystemCode: string;
  operation: 'CHANGE' | 'CANCEL';
  status: ErpRequestStatus;
  requestedAt: string;
  externalRequestId?: string;
  responseCode?: string;
  responseMessage?: string;
  completedAt?: string;
}

export function classifyInvoiceDistribution(invoice: unknown, plans: Array<Record<string, unknown>> = []): DistributionState {
  if (!invoice || invoice.isVoided === true || ['VOID', 'VOIDED', 'CANCELLED'].includes(String(invoice.status || invoice.statusCode || '').toUpperCase())) return 'UNKNOWN';
  const id = String(invoice.id ?? invoice.invoiceMirrorId ?? '');
  if (!id) return 'UNKNOWN';
  const linked = plans.some(plan => {
    const output = String(plan.distributionOutputNumber ?? plan.outputNumber ?? '').trim();
    const ids: unknown[] = Array.isArray(plan.invoiceIds) ? plan.invoiceIds : Array.isArray(plan.invoiceMirrorIds) ? plan.invoiceMirrorIds : [];
    const lines: Array<Record<string, unknown>> = Array.isArray(plan.lines) ? plan.lines : Array.isArray(plan.invoiceLines) ? plan.invoiceLines : [];
    return Boolean(output) && (ids.some(value => String(value) === id) || lines.some(line => String(line.invoiceId ?? line.invoiceMirrorId ?? '') === id && line.included !== false));
  });
  if (linked) return 'IN_DISTRIBUTION';
  // A plan without a distribution output is not proof that dispatch actually started.
  return 'NOT_YET_IN_DISTRIBUTION';
}

export function isNegotiableErpOrder(order: Record<string, unknown>): boolean {
  const status = String(order?.status ?? order?.statusCode ?? '').toUpperCase();
  const invoiced = order?.invoiceId != null || order?.externalInvoiceId != null || order?.isInvoiced === true || ['INVOICED', 'BILLED', 'CLOSED_INVOICED'].includes(status);
  const inactive = order?.isVoided === true || ['VOID', 'VOIDED', 'CANCELLED', 'CANCELED', 'REJECTED'].includes(status);
  return Boolean(order && (order.externalOrderId || order.externalId || order.sourceSystemCode) && !invoiced && !inactive);
}

/** Source-scoped identity. Never deduplicate across ERP sources by visible document number alone. */
export function externalIdentityKey(input: { tenantId: string; sourceSystemCode: string; entityType: string; externalId: string }): string | null {
  const tenantId = input.tenantId.trim(), source = input.sourceSystemCode.trim().toUpperCase(), type = input.entityType.trim().toUpperCase(), id = input.externalId.trim();
  return tenantId && source && type && id ? [tenantId, source, type, id].map(part => part.replace(/%/g, '%25').replace(/\|/g, '%7C')).join('|') : null;
}

export interface SyncResult<T> { records: T[]; inserted: number; updated: number; skippedStale: number; conflicts: number; appliedKeys: string[]; conflictKeys: string[] }
/** Idempotent in-memory upsert contract mirroring DB unique keys. Stable external IDs are required. */
export function upsertExternalRecords<T extends Record<string, unknown>>(existing: T[], incoming: T[], keyFields: { tenantField?: string; sourceField?: string; typeField?: string; externalIdField?: string } = {}): SyncResult<T> {
  const fields = { tenantField: 'tenantId', sourceField: 'sourceSystemCode', typeField: 'entityType', externalIdField: 'externalId', ...keyFields };
  const records = existing.map(record => ({ ...record }));
  let inserted = 0, updated = 0, skippedStale = 0, conflicts = 0;
  const appliedKeys: string[] = [];
  const conflictKeys: string[] = [];
  const keyOf = (record: T) => externalIdentityKey({ tenantId: String(record[fields.tenantField] ?? ''), sourceSystemCode: String(record[fields.sourceField] ?? ''), entityType: String(record[fields.typeField] ?? ''), externalId: String(record[fields.externalIdField] ?? '') });
  for (const source of incoming) {
    const key = keyOf(source);
    if (!key) { conflicts++; continue; }
    const matches = records.map((record, index) => ({ record, index })).filter(item => keyOf(item.record) === key);
    if (matches.length > 1) { conflicts++; conflictKeys.push(key); continue; }
    if (!matches.length) { records.push({ ...source }); appliedKeys.push(key); inserted++; continue; }
    const { record, index } = matches[0];
    const oldTime = Date.parse(String(record.sourceModifiedAtUtc ?? ''));
    const newTime = Date.parse(String(source.sourceModifiedAtUtc ?? ''));
    if (Number.isFinite(oldTime) && Number.isFinite(newTime) && newTime < oldTime) { skippedStale++; continue; }
    const unchanged = Object.keys(source).every(field =>
      field === 'id' || (field === 'sourceModifiedAtUtc' && oldTime === newTime) || JSON.stringify(record[field]) === JSON.stringify(source[field])
    );
    if (unchanged) continue;
    if (!Number.isFinite(newTime) || (Number.isFinite(oldTime) && newTime === oldTime)) {
      conflicts++; conflictKeys.push(key); continue;
    }
    // Keep the CRM identity when a newer source record replaces an earlier version.
    records[index] = { ...record, ...source, ...(record.id == null ? {} : { id: record.id }) };
    appliedKeys.push(key);
    updated++;
  }
  return { records, inserted, updated, skippedStale, conflicts, appliedKeys, conflictKeys };
}

export function makeErpChangeRequest(input: Omit<ErpChangeRequest, 'status' | 'requestedAt'> & { requestedAt?: string }): ErpChangeRequest {
  if (!input.id.trim() || !input.entityId.trim() || !input.sourceSystemCode.trim()) throw new Error('شناسه درخواست، سفارش و سامانه سامانه مالی الزامی است.');
  return { ...input, status: 'PENDING', requestedAt: input.requestedAt || new Date().toISOString() };
}

export function applyErpChangeResponse(request: ErpChangeRequest, response: { confirmed: boolean; externalRequestId?: string; responseCode?: string; message?: string; completedAt?: string }): ErpChangeRequest {
  return { ...request, status: response.confirmed ? 'SUCCEEDED' : 'FAILED', externalRequestId: response.externalRequestId, responseCode: response.responseCode, responseMessage: response.message, completedAt: response.completedAt || new Date().toISOString() };
}

/** Order CPQ gate: quote/order is evaluated before handoff; this never creates an invoice. */
export function validateOrderForCpq(order: Record<string, unknown>): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const lines = Array.isArray(order?.lines) ? order.lines : [];
  if (!lines.length) reasons.push('سفارش فاقد ردیف کالا است.');
  for (const [index, line] of lines.entries()) {
    if (!String(line.productId ?? line.externalProductId ?? '').trim()) reasons.push(`ردیف ${index + 1}: شناسه کالا نامشخص است.`);
    if (!Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) reasons.push(`ردیف ${index + 1}: تعداد باید مثبت باشد.`);
    if (!Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) < 0) reasons.push(`ردیف ${index + 1}: قیمت معتبر نیست.`);
  }
  return { ok: reasons.length === 0, reasons };
}

export function evaluateOrderCpq(order: unknown, products: Array<Record<string, unknown>> = []) {
  const validation = validateOrderForCpq(order);
  if (!validation.ok) return { ...validation, lines: [], totalNetAmount: null, evaluatedAt: new Date().toISOString() };
  const lines = order.lines.map((line: Record<string, unknown>) => {
    const product = products.find(p => p.id === line.productId || p.externalProductId === line.externalProductId);
    const quantity = Number(line.quantity);
    const basePrice = Number(line.basePrice ?? product?.unitPrice ?? product?.basePrice ?? line.unitPrice);
    const result = calculatePriceWaterfall({
      basePrice,
      quantity,
      costPrice: Number.isFinite(Number(line.costPrice ?? product?.costPrice)) ? Number(line.costPrice ?? product?.costPrice) : undefined,
      negotiatedUnitPrice: Number(line.unitPrice),
      appliedVolumeDiscountPercent: Number(line.appliedVolumeDiscountPercent || 0),
      contractRebatePercent: Number(line.contractRebatePercent || 0),
      bundleDiscountPercent: Number(line.bundleDiscountPercent || 0),
    });
    return { lineId: line.id, productId: line.productId ?? line.externalProductId, quantity, ...result };
  });
  return { ok: true, reasons: [], lines, totalNetAmount: lines.reduce((sum: number, line: unknown) => sum + Number(line.netPrice || 0), 0), evaluatedAt: new Date().toISOString() };
}
