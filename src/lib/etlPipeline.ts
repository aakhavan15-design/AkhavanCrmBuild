/**
 * AKHAVAN CRM — canonical ETL pipeline (pure, storage-agnostic).
 * Wraps the EXISTING identity/stale engine (erpImportService.planErpImport → phase2Flow.upsertExternalRecords);
 * adds: per-entity validation, replay-safe dedupe by payload hash, rejection ledger, checkpoints,
 * ledger-code mapping and control-total reconciliation. Storage-neutral: works on plain state objects so the
 * same code runs on IndexedDB (test) and on a Backend adapter (production). See docs/MASTER_SPEC_FA.md پیوست ب.
 */
import { planErpImport, erpCollectionFor, type ErpEntityType, type ErpImportRecord } from './erpImportService.ts';
import { externalIdentityKey } from './phase2Flow.ts';

export type EtlMode = 'FULL' | 'INCREMENTAL' | 'ONLINE' | 'REPLAY';
export interface EtlRejection { entityType: ErpEntityType; externalId?: string; ruleCode: string; severity: 'ERROR' | 'WARNING'; messageFa: string }
export interface EtlBatchSummary {
  batchId: string; entityType: ErpEntityType; mode: EtlMode; startedAt: string;
  received: number; valid: number; rejected: number; duplicate: number; inserted: number; updated: number; skippedStale: number; conflicts: number;
  status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
}
export interface EtlLedger {
  /** identity key → payload hash of the last applied version (replay guard). */
  hashes: Record<string, string>;
  checkpoints: Record<string, { watermarkUtc?: string; lastExternalId?: string; lastBatchId?: string }>;
  batches: EtlBatchSummary[];
  rejections: EtlRejection[];
}
export const emptyEtlLedger = (): EtlLedger => ({ hashes: {}, checkpoints: {}, batches: [], rejections: [] });

/** Stable, key-order-independent 53-bit hash (sync; works in browser, Node and workers). Not cryptographic — used for change detection only. */
export function stablePayloadHash(value: unknown): string {
  const norm = (v: Record<string, unknown>): unknown => Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o: unknown, k) => { o[k] = norm(v[k]); return o; }, {}) : v;
  const str = JSON.stringify(norm(value));
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

const num = (v: unknown) => (v === null || v === undefined || v === '' ? NaN : Number(v));
const validDate = (v: unknown) => typeof v === 'string' && v.trim() !== '' && Number.isFinite(Date.parse(v));
const LEDGER_LEVELS = ['GROUP', 'GENERAL', 'SUBSIDIARY', 'DETAIL', 'EXTRA'];
const DELIVERY_STATUS = ['READY', 'LOADED', 'SHIPPED', 'DELIVERED_FULL', 'DELIVERED_PARTIAL', 'FAILED', 'RETURNED'];

type Rule = (r: Record<string, unknown>) => [code: string, messageFa: string] | null;
const positive = (field: string, code: string): Rule => r => (num(r[field]) > 0 ? null : [code, `مبلغ «${field}» باید عددی مثبت باشد.`]);
const nonNegative = (field: string, code: string): Rule => r => (num(r[field]) >= 0 ? null : [code, `مقدار «${field}» باید عدد نامنفی باشد (مقدار خالی صفر فرض نمی‌شود).`]);
const dateRule = (field: string, code: string): Rule => r => (validDate(r[field]) ? null : [code, `تاریخ «${field}» معتبر نیست.`]);
const anyOf = (fields: string[], code: string): Rule => r => (fields.some(f => String(r[f] ?? '').trim()) ? null : [code, `یکی از فیلدهای ${fields.join(' / ')} الزامی است.`]);

/** Entity-specific rules, applied after the common identity rules. Missing cost/amount is rejected — never defaulted to 0. */
export const ETL_RULES: Record<ErpEntityType, Rule[]> = {
  SALES_ORDER: [anyOf(['externalAccountId', 'customerId', 'accountId'], 'ORDER_ACCOUNT_REF_MISSING')],
  INVOICE: [anyOf(['externalAccountId', 'customerId', 'accountId'], 'INVOICE_ACCOUNT_REF_MISSING'), dateRule('invoiceDate', 'INVOICE_DATE_INVALID'), nonNegative('totalAmount', 'INVOICE_AMOUNT_INVALID')],
  PAYMENT: [dateRule('paymentDate', 'PAYMENT_DATE_INVALID'), positive('amount', 'PAYMENT_AMOUNT_INVALID')],
  PAYMENT_ALLOCATION: [anyOf(['externalPaymentId', 'paymentId'], 'ALLOCATION_PAYMENT_REF_MISSING'), anyOf(['externalInvoiceId', 'invoiceId'], 'ALLOCATION_INVOICE_REF_MISSING'), positive('amount', 'ALLOCATION_AMOUNT_INVALID')],
  CREDIT_NOTE: [anyOf(['externalInvoiceId', 'invoiceId'], 'CREDIT_INVOICE_REF_MISSING'), positive('amount', 'CREDIT_AMOUNT_INVALID')],
  CHEQUE: [r => (['RECEIVED', 'ISSUED'].includes(String(r.directionCode)) ? null : ['CHEQUE_DIRECTION_INVALID', 'جهت چک باید «دریافتی» یا «صادره» باشد.']), positive('amount', 'CHEQUE_AMOUNT_INVALID'), dateRule('dueDate', 'CHEQUE_DUE_DATE_INVALID')],
  JOURNAL_LINE: [anyOf(['externalAccountCode'], 'JOURNAL_ACCOUNT_CODE_MISSING'), nonNegative('debitAmount', 'JOURNAL_DEBIT_INVALID'), nonNegative('creditAmount', 'JOURNAL_CREDIT_INVALID'),
    r => (num(r.debitAmount) > 0 && num(r.creditAmount) > 0 ? ['JOURNAL_BOTH_SIDES', 'یک ردیف سند نمی‌تواند هم‌زمان بدهکار و بستانکار باشد.'] : null)],
  // CoaMirror (existing app model) uses code/level(1..n); SQL crm.LedgerAccount uses AccountCode/LevelCode — both accepted at the boundary.
  LEDGER_ACCOUNT: [anyOf(['accountCode', 'code'], 'LEDGER_CODE_MISSING'), r => (LEDGER_LEVELS.includes(String(r.levelCode)) || (Number.isInteger(num(r.level)) && num(r.level) >= 1 && num(r.level) <= 9) ? null : ['LEDGER_LEVEL_INVALID', 'سطح کدینگ باید یکی از گروه/کل/معین/تفصیلی/تکمیلی (یا سطح عددی ۱ تا ۹) باشد.'])],
  // نرخ مالیات کالا اختیاری است (نبود = نامشخص/null، نه ۰)؛ اگر آمد باید در ۰..۱۰۰ باشد.
  PRODUCT: [r => (r.taxRatePercent == null || String(r.taxRatePercent).trim() === '' || (Number.isFinite(Number(r.taxRatePercent)) && Number(r.taxRatePercent) >= 0 && Number(r.taxRatePercent) <= 100) ? null : ['PRODUCT_TAX_RATE_INVALID', 'نرخ مالیات کالا باید عددی بین ۰ تا ۱۰۰ باشد (خالی = نامشخص).'])],
  PRODUCT_COST: [anyOf(['externalProductId'], 'COST_PRODUCT_MISSING'), nonNegative('unitCost', 'COST_VALUE_INVALID'), dateRule('effectiveFrom', 'COST_EFFECTIVE_FROM_INVALID')],
  SALES_RETURN: [dateRule('returnDate', 'RETURN_DATE_INVALID'), nonNegative('totalAmount', 'RETURN_AMOUNT_INVALID')],
  DELIVERY_EVENT: [anyOf(['externalInvoiceId', 'invoiceId'], 'DELIVERY_INVOICE_REF_MISSING'), r => (DELIVERY_STATUS.includes(String(r.deliveryStatusCode)) ? null : ['DELIVERY_STATUS_INVALID', 'وضعیت تحویل نامعتبر است.']),
    r => ((r.latitude == null || Math.abs(num(r.latitude)) <= 90) && (r.longitude == null || Math.abs(num(r.longitude)) <= 180) ? null : ['DELIVERY_COORDINATE_INVALID', 'مختصات خارج از بازهٔ معتبر است.'])],
};

export function validateEtlRecord(entityType: ErpEntityType, record: ErpImportRecord): EtlRejection[] {
  const out: EtlRejection[] = [];
  const externalId = String(record?.externalId ?? record?.externalOrderId ?? record?.externalInvoiceId ?? record?.externalCreditNoteId ?? '').trim();
  const push = (ruleCode: string, messageFa: string) => out.push({ entityType, externalId: externalId || undefined, ruleCode, severity: 'ERROR', messageFa });
  if (!String(record?.tenantId ?? '').trim()) push('TENANT_MISSING', 'شناسهٔ مستأجر الزامی است.');
  if (!String(record?.sourceSystemCode ?? '').trim()) push('SOURCE_SYSTEM_MISSING', 'کد سیستم مبدأ الزامی است.');
  if (!externalId) push('EXTERNAL_ID_MISSING', 'شناسهٔ اصلی رکورد در سیستم مبدأ الزامی است.');
  if (record?.sourceModifiedAtUtc != null && String(record.sourceModifiedAtUtc).trim() !== '' && !validDate(String(record.sourceModifiedAtUtc))) push('SOURCE_TIMESTAMP_INVALID', 'زمان تغییر در سیستم مبدأ معتبر نیست.');
  for (const rule of ETL_RULES[entityType] || []) { const hit = rule(record); if (hit) push(hit[0], hit[1]); }
  return out;
}

export interface RunEtlOptions { mode?: EtlMode; now?: Date; batchId?: string }

/** Pure batch run: validate → drop in-batch & replay duplicates → apply via the existing upsert engine → update ledger/checkpoint. Re-running the same payload changes nothing. */
export function runEtlBatch(state: Record<string, unknown>, entityType: ErpEntityType, records: ErpImportRecord[], options: RunEtlOptions = {}) {
  const mode = options.mode ?? 'INCREMENTAL';
  const startedAt = (options.now ?? new Date()).toISOString();
  const ledger: EtlLedger = { ...emptyEtlLedger(), ...(state.etl ?? {}) };
  const batchId = options.batchId ?? `batch-${ledger.batches.length + 1}`;
  const rejections: EtlRejection[] = [];
  const accepted = new Map<string, ErpImportRecord>();
  let duplicate = 0, valid = 0;

  for (const record of records) {
    const problems = validateEtlRecord(entityType, record);
    if (problems.length) { rejections.push(...problems); continue; }
    const key = externalIdentityKey({ tenantId: String(record.tenantId), sourceSystemCode: String(record.sourceSystemCode).toUpperCase(), entityType, externalId: String(record.externalId ?? record.externalOrderId ?? record.externalInvoiceId ?? record.externalCreditNoteId) });
    if (!key) continue;
    const hash = stablePayloadHash(record);
    const inBatch = accepted.get(key);
    if (inBatch) {
      duplicate++;
      const a = Date.parse(String(inBatch.sourceModifiedAtUtc ?? '')), b = Date.parse(String(record.sourceModifiedAtUtc ?? ''));
      if (Number.isFinite(a) && Number.isFinite(b) && b > a) accepted.set(key, record); // keep the newer source version
      continue;
    }
    if (ledger.hashes[key] === hash && mode !== 'FULL') { duplicate++; continue; }
    valid++;
    accepted.set(key, record);
  }

  const planned = planErpImport(state, entityType, [...accepted.values()]);
  const hashes = { ...ledger.hashes };
  for (const [key, record] of accepted) hashes[key] = stablePayloadHash(record);
  const cpKey = `${entityType}`;
  const watermark = [...accepted.values()].map(r => String(r.sourceModifiedAtUtc ?? '')).filter(validDate).sort().at(-1);
  const rejected = rejections.length ? new Set(rejections.map(r => `${r.externalId ?? ''}|${r.ruleCode}`)).size : 0;
  const rejectedRecords = records.length - valid - duplicate;
  const summary: EtlBatchSummary = {
    batchId, entityType, mode, startedAt, received: records.length, valid, rejected: rejectedRecords, duplicate,
    inserted: planned.summary.inserted, updated: planned.summary.updated, skippedStale: planned.summary.skippedStale, conflicts: planned.summary.conflicts,
    status: rejectedRecords === 0 && planned.summary.conflicts === 0 ? 'SUCCEEDED' : valid > 0 ? 'PARTIAL' : records.length === 0 ? 'SUCCEEDED' : 'FAILED',
  };
  void rejected;
  const nextLedger: EtlLedger = {
    hashes,
    checkpoints: { ...ledger.checkpoints, [cpKey]: { ...ledger.checkpoints[cpKey], ...(watermark && summary.status !== 'FAILED' ? { watermarkUtc: watermark } : {}), lastBatchId: batchId } },
    batches: [...ledger.batches, summary],
    rejections: [...ledger.rejections, ...rejections],
  };
  return { nextState: { ...planned.nextState, etl: nextLedger }, summary, rejections, collection: erpCollectionFor(entityType) };
}

// ───────────────────────── Ledger-code mapping (source coding → CRM standard coding) ─────────────────────────
export interface LedgerAccountDef { id: string; accountCode: string; titleFa: string; levelCode: string; levelNo: number; natureCode: 'DEBIT' | 'CREDIT'; parentCode?: string | null; reportBucketCode?: string | null; expenseCategoryCode?: string | null }
export interface LedgerSourceMap { sourceSystemCode: string; externalAccountCode: string; ledgerAccountId?: string | null; mapStatus: 'UNMAPPED' | 'MAPPED' | 'APPROVED' | 'REJECTED'; effectiveFrom?: string; effectiveTo?: string | null }

/** Resolves a source account code to the CRM standard ledger account valid on `asOf`. Only MAPPED/APPROVED maps resolve; anything else stays unmapped (never guessed). */
export function resolveLedgerAccount(sourceSystemCode: string, externalAccountCode: string, maps: LedgerSourceMap[], asOf: string): string | null {
  const day = asOf.slice(0, 10);
  const hit = maps.filter(m => m.sourceSystemCode.toUpperCase() === sourceSystemCode.toUpperCase() && m.externalAccountCode === externalAccountCode && ['MAPPED', 'APPROVED'].includes(m.mapStatus) && m.ledgerAccountId
    && (!m.effectiveFrom || m.effectiveFrom <= day) && (!m.effectiveTo || m.effectiveTo >= day)).sort((a, b) => String(b.effectiveFrom ?? '').localeCompare(String(a.effectiveFrom ?? '')))[0];
  return hit?.ledgerAccountId ?? null;
}

export function mapJournalLines<T extends { sourceSystemCode: string; externalAccountCode: string; documentDate: string }>(lines: T[], maps: LedgerSourceMap[]) {
  const mapped = lines.map(l => ({ ...l, ledgerAccountId: resolveLedgerAccount(l.sourceSystemCode, l.externalAccountCode, maps, l.documentDate) }));
  const unmapped = mapped.filter(l => !l.ledgerAccountId);
  return { lines: mapped, unmappedCodes: [...new Set(unmapped.map(l => `${l.sourceSystemCode}:${l.externalAccountCode}`))].sort(), mappedPct: lines.length ? Math.round((1000 * (lines.length - unmapped.length)) / lines.length) / 10 : null };
}

// ───────────────────────── Control-total reconciliation ─────────────────────────
export type ReconStatus = 'MATCHED' | 'MISMATCH' | 'SOURCE_UNAVAILABLE' | 'NOT_COMPARABLE';
/** A value is MATCHED only when the source actually supplied a comparable number; absence of a source is never reported as a match. */
export function reconcileControlTotal(input: { metricCode: string; crmValue: number | null; sourceValue: number | null | undefined; tolerance?: number; sameBasis?: boolean }) {
  const tol = Math.max(0, input.tolerance ?? 0);
  let status: ReconStatus;
  if (input.sourceValue === null || input.sourceValue === undefined || !Number.isFinite(Number(input.sourceValue))) status = 'SOURCE_UNAVAILABLE';
  else if (input.crmValue === null || !Number.isFinite(input.crmValue) || input.sameBasis === false) status = 'NOT_COMPARABLE';
  else status = Math.abs(input.crmValue - Number(input.sourceValue)) <= tol ? 'MATCHED' : 'MISMATCH';
  const delta = status === 'MATCHED' || status === 'MISMATCH' ? input.crmValue! - Number(input.sourceValue) : null;
  return { metricCode: input.metricCode, crmValue: input.crmValue, sourceValue: input.sourceValue ?? null, delta, tolerance: tol, status };
}
