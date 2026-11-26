/**
 * AKHAVAN CRM — canonical ETL pipeline (pure, storage-agnostic).
 * Wraps the EXISTING identity/stale engine (erpImportService.planErpImport → phase2Flow.upsertExternalRecords);
 * adds: per-entity validation, replay-safe dedupe by payload hash, rejection ledger, checkpoints,
 * ledger-code mapping and control-total reconciliation. Storage-neutral: works on plain state objects so the
 * same code runs on IndexedDB (test) and on a Backend adapter (production). See docs/MASTER_SPEC_FA.md پیوست ب.
 */
import { planErpImport, erpCollectionFor, type ErpEntityType, type ErpImportRecord } from './erpImportService.ts';
import { externalIdentityKey } from './phase2Flow.ts';
import { normalizeErpPositiveInt } from './cpqEngine.ts';

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
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (!v || typeof v !== 'object') return v;
    const fields = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(fields).sort().map(key => [key, norm(fields[key])]));
  };
  const str = JSON.stringify(norm(value)) ?? 'null';
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

const num = (v: unknown) => (v === null || v === undefined || v === '' ? NaN : Number(v));
const validDate = (v: unknown) => typeof v === 'string' && v.trim() !== '' && Number.isFinite(Date.parse(v));
const isBlank = (v: unknown) => v === null || v === undefined || String(v).trim() === '';
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
  PRODUCT: [
    // کف/تعداد در کارتن/کلاس‌های قیمت اختیاری‌اند؛ اگر آمدند باید عدد صحیح مثبت ریالی باشند (رکورد نامعتبر در staging می‌ماند و قیمت معتبر قبلی را عوض نمی‌کند).
    r => (isBlank(r.floorPrice) || normalizeErpPositiveInt(r.floorPrice) !== null ? null : ['PRODUCT_FLOOR_PRICE_INVALID', 'کف قیمت کالا باید عدد صحیح مثبت (ریال) باشد؛ خالی = نامعلوم.']),
    r => (isBlank(r.unitsPerCarton) || normalizeErpPositiveInt(r.unitsPerCarton) !== null ? null : ['PRODUCT_UNITS_PER_CARTON_INVALID', 'تعداد در کارتن باید عدد صحیح مثبت باشد؛ خالی = نامعلوم (۱ فرض نمی‌شود).']),
    r => (isBlank(r.currencyCode) || /^[A-Z0-9_-]{2,10}$/i.test(String(r.currencyCode).trim()) ? null : ['PRODUCT_CURRENCY_CODE_INVALID', 'کد واحد پول ERP نامعتبر است.']),
    r => {
      const bad = [1, 2, 3, 4, 5].filter(i => !isBlank(r[`priceClass${i}`]) && normalizeErpPositiveInt(r[`priceClass${i}`]) === null);
      return bad.length ? ['PRODUCT_PRICE_CLASS_INVALID', `قیمت کلاس ${bad.join('، ')} باید عدد صحیح مثبت (ریال) باشد؛ صفر/منفی/اعشار پذیرفته نمی‌شود.`] : null;
    },
    r => (r.taxRatePercent == null || String(r.taxRatePercent).trim() === '' || (Number.isFinite(Number(r.taxRatePercent)) && Number(r.taxRatePercent) >= 0 && Number(r.taxRatePercent) <= 100) ? null : ['PRODUCT_TAX_RATE_INVALID', 'نرخ مالیات کالا باید عددی بین ۰ تا ۱۰۰ باشد (خالی = نامشخص).'])
  ],
  PRODUCT_COST: [anyOf(['externalProductId'], 'COST_PRODUCT_MISSING'), nonNegative('unitCost', 'COST_VALUE_INVALID'), dateRule('effectiveFrom', 'COST_EFFECTIVE_FROM_INVALID')],
  SALES_RETURN: [dateRule('returnDate', 'RETURN_DATE_INVALID'), nonNegative('totalAmount', 'RETURN_AMOUNT_INVALID')],
  VISIT_ROUTE: [
    anyOf(['routeCode'], 'VISIT_ROUTE_CODE_MISSING'),
    anyOf(['routeName'], 'VISIT_ROUTE_NAME_MISSING'),
  ],
  VISIT_TOUR: [
    dateRule('tourDate', 'VISIT_TOUR_DATE_INVALID'),
    anyOf(['routeExternalId'], 'VISIT_TOUR_ROUTE_MISSING'),
    anyOf(['salesRepExternalId'], 'VISIT_TOUR_REP_MISSING'),
    r => {
      if (!Array.isArray(r.stops) || r.stops.length === 0) return ['VISIT_TOUR_STOPS_MISSING', 'تور ERP باید حداقل یک ایستگاه معتبر داشته باشد.'];
      const stops = r.stops as Array<Record<string, unknown>>;
      const seenSequences = new Set<number>();
      const seenCustomers = new Set<string>();
      for (const stop of stops) {
        const customerId = String(stop?.externalCustomerId ?? '').trim();
        const sequence = Number(stop?.stopSequence);
        if (!customerId || !Number.isSafeInteger(sequence) || sequence < 1)
          return ['VISIT_TOUR_STOP_INVALID', 'شناسه مشتری و ترتیب مثبت ایستگاه در تور ERP الزامی است.'];
        if (seenSequences.has(sequence) || seenCustomers.has(customerId))
          return ['VISIT_TOUR_STOP_DUPLICATE', 'ترتیب ایستگاه یا مشتری تکراری در تور ERP پذیرفته نمی‌شود.'];
        seenSequences.add(sequence);
        seenCustomers.add(customerId);
      }
      return null;
    },
  ],
  VISIT_ROUTE_CUSTOMER: [
    anyOf(['routeExternalId'], 'VISIT_MEMBERSHIP_ROUTE_MISSING'),
    anyOf(['externalCustomerId'], 'VISIT_MEMBERSHIP_CUSTOMER_MISSING'),
    dateRule('effectiveFrom','VISIT_MEMBERSHIP_DATE_INVALID'),
    r => r.effectiveTo && Number.isFinite(Date.parse(String(r.effectiveTo))) && String(r.effectiveTo) < String(r.effectiveFrom)
      ? ['VISIT_MEMBERSHIP_RANGE_INVALID','تاریخ پایان عضویت قبل از آغاز است.'] : null,
  ],
  VISIT_ROUTE_STAFF: [
    anyOf(['routeExternalId'], 'VISIT_STAFF_ROUTE_MISSING'),
    anyOf(['externalStaffId'], 'VISIT_STAFF_ID_MISSING'),
    dateRule('effectiveFrom','VISIT_STAFF_DATE_INVALID'),
    r => ['SALES_REP','SUPERVISOR'].includes(String(r.staffRoleCode)) ? null : ['VISIT_STAFF_ROLE_INVALID','نقش فروشنده یا سرپرست معتبر نیست.'],
  ],
  VISIT_NO_ORDER_REASON: [
    anyOf(['reasonCode'], 'VISIT_REASON_CODE_MISSING'),
    anyOf(['reasonTitleFa'], 'VISIT_REASON_TITLE_MISSING'),
  ],
  VISIT_EVENT: [
    anyOf(['externalCustomerId'], 'VISIT_EVENT_CUSTOMER_MISSING'),
    anyOf(['externalSalesRepId'], 'VISIT_EVENT_REP_MISSING'),
    dateRule('visitedAtUtc','VISIT_EVENT_DATE_INVALID'),
    r => ((r.latitude==null && r.longitude==null) || (r.latitude!=null && r.longitude!=null
      && Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude))
      && Math.abs(Number(r.latitude))<=90 && Math.abs(Number(r.longitude))<=180))
        ? null : ['VISIT_EVENT_GEO_INVALID','مختصات ویزیت باید هر دو معتبر یا هر دو نامشخص باشند.'],
  ],
  SALES_REP_GPS: [
    anyOf(['externalSalesRepId'], 'GPS_REP_MISSING'),
    dateRule('recordedAtUtc','GPS_TIME_INVALID'),
    r => (r.latitude!=null && r.longitude!=null && Number.isFinite(Number(r.latitude))
      && Number.isFinite(Number(r.longitude)) && Math.abs(Number(r.latitude))<=90
      && Math.abs(Number(r.longitude))<=180 && !(Number(r.latitude)===0 && Number(r.longitude)===0))
        ? null : ['GPS_COORDINATE_INVALID','مختصات ثبت‌شده فروشنده معتبر نیست.'],
  ],
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

type FeedIdentity = { tenantId: string; sourceSystemCode: string };
export interface RunEtlOptions { mode?: EtlMode; now?: Date; batchId?: string; feed?: FeedIdentity }
export const checkpointKey = (feed: FeedIdentity, entityType: ErpEntityType) =>
  JSON.stringify([String(feed.tenantId).trim(), String(feed.sourceSystemCode).trim().toUpperCase(), entityType]);

/** Plan one import. The adapter can persist the result and checkpoint in the same transaction. */
export function runEtlBatch(state: Record<string, unknown>, entityType: ErpEntityType, records: ErpImportRecord[], options: RunEtlOptions = {}) {
  const mode = options.mode ?? 'INCREMENTAL';
  const startedAt = (options.now ?? new Date()).toISOString();
  const ledger: EtlLedger = { ...emptyEtlLedger(), ...(state.etl ?? {}) };
  const batchId = options.batchId ?? `batch-${ledger.batches.length + 1}`;
  const rejections: EtlRejection[] = [];
  const accepted = new Map<string, { record: ErpImportRecord; hash: string }>();
  const replayed: ErpImportRecord[] = [];
  const held = new Set<string>();
  const expectedFeed = options.feed ? checkpointKey(options.feed, entityType) : null;
  let duplicate = 0;

  for (const record of records) {
    const problems = validateEtlRecord(entityType, record);
    if (problems.length) { rejections.push(...problems); continue; }
    const externalId = String(record.externalId ?? record.externalOrderId ?? record.externalInvoiceId ?? record.externalCreditNoteId);
    if (expectedFeed && checkpointKey(record, entityType) !== expectedFeed) {
      rejections.push({ entityType, externalId, ruleCode: 'FEED_SCOPE_MISMATCH', severity: 'ERROR', messageFa: 'مستأجر یا منبع رکورد با دستهٔ ورودی سازگار نیست.' });
      continue;
    }
    const key = externalIdentityKey({ tenantId: String(record.tenantId), sourceSystemCode: String(record.sourceSystemCode), entityType, externalId });
    if (!key || held.has(key)) continue;
    const hash = stablePayloadHash(record);
    const inBatch = accepted.get(key);
    if (inBatch) {
      const previousTime = Date.parse(inBatch.record.sourceModifiedAtUtc ?? '');
      const candidateTime = Date.parse(record.sourceModifiedAtUtc ?? '');
      if (inBatch.hash !== hash && (!Number.isFinite(previousTime) || !Number.isFinite(candidateTime) || previousTime === candidateTime)) {
        accepted.delete(key);
        held.add(key);
        rejections.push({ entityType, externalId, ruleCode: 'SOURCE_VERSION_CONFLICT', severity: 'ERROR', messageFa: 'برای یک رکورد، نسخه‌های متفاوت بدون ترتیب قطعی دریافت شدند.' });
      } else {
        duplicate++;
        if (candidateTime > previousTime) accepted.set(key, { record, hash });
      }
      continue;
    }
    if (ledger.hashes[key] === hash && mode !== 'FULL') {
      duplicate++;
      replayed.push(record);
      continue;
    }
    accepted.set(key, { record, hash });
  }

  const planned = planErpImport(state, entityType, [...accepted.values()].map(entry => entry.record));
  const hashes = { ...ledger.hashes };
  const checkpoints = { ...ledger.checkpoints };
  const applied: ErpImportRecord[] = [];
  for (const key of planned.appliedKeys) {
    const entry = accepted.get(key);
    if (!entry) continue;
    hashes[key] = entry.hash;
    applied.push(entry.record);
  }
  for (const key of planned.conflictKeys) {
    const record = accepted.get(key)?.record;
    if (record) rejections.push({
      entityType, externalId: record.externalId, ruleCode: 'SOURCE_VERSION_CONFLICT',
      severity: 'ERROR', messageFa: 'نسخهٔ ورودی با رکورد ذخیره‌شده قابل تطبیق نیست.',
    });
  }
  const valid = accepted.size - planned.summary.conflicts;
  const rejectedRecords = records.length - valid - duplicate;
  const summary: EtlBatchSummary = {
    batchId, entityType, mode, startedAt, received: records.length, valid, rejected: rejectedRecords, duplicate,
    inserted: planned.summary.inserted, updated: planned.summary.updated, skippedStale: planned.summary.skippedStale, conflicts: planned.summary.conflicts,
    status: rejectedRecords === 0 && planned.summary.conflicts === 0 ? 'SUCCEEDED'
      : applied.length || replayed.length ? 'PARTIAL' : 'FAILED',
  };
  if (summary.status === 'SUCCEEDED' && mode !== 'REPLAY') {
    for (const record of [...applied, ...replayed]) {
      const time = Date.parse(record.sourceModifiedAtUtc ?? '');
      if (!Number.isFinite(time)) continue;
      const key = checkpointKey(record, entityType);
      const previous = checkpoints[key];
      if (previous?.watermarkUtc && Date.parse(previous.watermarkUtc) >= time) continue;
      checkpoints[key] = { watermarkUtc: new Date(time).toISOString(), lastBatchId: batchId };
    }
  }
  const nextLedger: EtlLedger = {
    hashes,
    checkpoints,
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
