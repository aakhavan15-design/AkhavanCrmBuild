/**
 * موتور خالص پیش‌بینی نقدینگی (گزارش R8 / F6-04).
 * - بدون وابستگی به State/Provider/تاریخ سیستم: همه‌چیز از ورودی (asOf) می‌آید تا تست‌پذیر و قطعی باشد.
 * - داده ناقص هرگز صفر نمی‌شود: ردیف بدون مبلغ/سررسید معتبر در `excluded` با علت ثبت می‌شود؛
 *   مانده افتتاحیهٔ نامشخص `null` است و پیش‌بینی مانده «نامشخص» می‌ماند.
 * - چک ضمانتی/باطل و چک وصول‌شده/برگشتی از محاسبه خارج است؛ چک پرداختنیِ متصل به فاکتور خرید دوبار شمرده نمی‌شود.
 */

export type CashItemKind = 'CHEQUE_IN' | 'CHEQUE_OUT' | 'SUPPLIER_BILL' | 'EXPENSE';

export interface CashFlowInput {
  /** تاریخ مبنا (YYYY-MM-DD) */
  asOf: string;
  /** تعداد روزهای افق (از asOf، شامل روز اول) */
  horizonDays: number;
  cheques?: Array<Record<string, unknown>>;
  supplierBills?: Array<Record<string, unknown>>;
  expenses?: Array<Record<string, unknown>>;
  treasuryAccounts?: Array<Record<string, unknown>>;
  treasuryTransactions?: Array<Record<string, unknown>>;
  /**
   * رفتار اقلام سررسیدگذشته:
   * SEPARATE: در ردیف روزانه نمی‌آیند و جداگانه گزارش می‌شوند (پیش‌فرض)
   * FIRST_DAY: همه به روز اول منتقل می‌شوند (سازگار با نمای فرماندهی قدیمی)
   */
  overdueTreatment?: 'SEPARATE' | 'FIRST_DAY';
  includeIncoming?: boolean;
}

export interface CashItem {
  id: string;
  accountId?: string;
  kind: CashItemKind;
  direction: 'IN' | 'OUT';
  dueDate: string;
  amount: number;
  overdue: boolean;
  label: string;
}

export interface CashDayRow {
  date: string;
  inflow: number;
  outflow: number;
  net: number;
  /** مانده پیش‌بینی‌شدهٔ پایان روز؛ null اگر مانده افتتاحیه نامشخص است */
  projectedBalance: number | null;
}

export interface CashExcluded {
  id: string;
  source: 'cheques' | 'supplierBills' | 'expenses';
  reason: 'NO_DUE_DATE' | 'BAD_DUE_DATE' | 'BAD_AMOUNT' | 'GUARANTEE' | 'VOIDED' | 'SETTLED' | 'LINKED_TO_BILL';
}

export type OpeningBalanceStatus = 'KNOWN' | 'PARTIAL' | 'UNKNOWN';

export interface CashFlowProjection {
  asOf: string;
  horizonDays: number;
  days: CashDayRow[];
  items: CashItem[];
  overdue: { inflow: number; outflow: number; items: CashItem[] };
  totals: { inflow: number; outflow: number; net: number };
  opening: { status: OpeningBalanceStatus; balance: number | null; knownAccounts: number; unknownAccounts: number };
  /** کمینهٔ مانده پیش‌بینی‌شده و روز آن؛ null اگر مانده نامشخص است */
  lowest: { date: string; balance: number } | null;
  /** اولین روزی که مانده پیش‌بینی‌شده منفی می‌شود */
  firstShortfallDate: string | null;
  excluded: CashExcluded[];
}

const DAY_MS = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** فقط YYYY-MM-DD معتبر را برمی‌گرداند؛ در غیر این صورت null */
export function normalizeIsoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = ISO_RE.exec(v.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function addDaysIso(iso: string, days: number): string {
  const m = ISO_RE.exec(iso)!;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + days * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** عدد معتبر و متناهی؛ در غیر این صورت null (نه صفر) */
function numOrNull(v: unknown): number | null {
  if (typeof v !== 'number' && (typeof v !== 'string' || !v.trim())) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));
const isVoided = (row: Record<string, unknown>) => row.isVoided === true || row.isDeleted === true || Boolean(row.deletedAt)
  || ['VOID', 'VOIDED', 'CANCELLED', 'CANCELED', 'REVERSED'].includes(str(row.status).toUpperCase());
const isRial = (row: Record<string, unknown>) => !row.currencyCode || str(row.currencyCode).toUpperCase() === 'IRR';

/** مانده هر حساب خزانه = افتتاحیه + Σورودی − Σخروجی تا asOf؛ بدون افتتاحیه، فقط currentBalance معتبر (و گرنه نامشخص) */
export function computeTreasuryOpening(
  accounts: Array<Record<string, unknown>>,
  txs: Array<Record<string, unknown>>,
  asOf: string
): CashFlowProjection['opening'] {
  let sum = 0, known = 0, unknown = 0;
  const active = accounts.filter(account => account.isActive !== false && !isVoided(account));
  const accountIds = new Set(active.map(account => str(account.id)).filter(Boolean));
  const seenAccounts = new Set<string>();
  const perAccount = new Map<string, Array<Record<string, unknown>>>();
  for (const row of txs) {
    if (isVoided(row) || ['DRAFT', 'PENDING'].includes(str(row.status).toUpperCase())) continue;
    const accountId = str(row.accountId);
    if (!accountIds.has(accountId)) { unknown++; continue; }
    const rows = perAccount.get(accountId) || [];
    rows.push(row);
    perAccount.set(accountId, rows);
  }
  for (const account of active) {
    const id = str(account.id);
    if (!id || seenAccounts.has(id) || !isRial(account)) { unknown++; continue; }
    seenAccounts.add(id);
    const opening = numOrNull(account.openingBalance);
    const opened = normalizeIsoDate(account.openingDate);
    if (account.openingDate && (!opened || opened > asOf)) { unknown++; continue; }
    const records = perAccount.get(id) || [];
    if (opening === null) {
      const current = numOrNull(account.currentBalance);
      const currentDate = normalizeIsoDate(account.balanceDate);
      if (current !== null && !records.length && (!account.balanceDate || currentDate === asOf)) {
        sum += current; known++;
      } else unknown++;
      continue;
    }
    let balance = opening;
    let valid = true;
    const seen = new Set<string>();
    for (const row of records) {
      const date = normalizeIsoDate(row.date);
      if (date && (date > asOf || (opened && date < opened))) continue;
      const amount = numOrNull(row.amount);
      const key = str(row.id);
      const direction = str(row.direction).toUpperCase();
      if (!date || amount === null || amount <= 0 || !isRial(row) || (key && seen.has(key))
        || (direction !== 'IN' && direction !== 'OUT')) {
        valid = false;
        break;
      }
      if (key) seen.add(key);
      balance += direction === 'IN' ? amount : -amount;
    }
    if (valid) { sum += balance; known++; } else unknown++;
  }
  const status: OpeningBalanceStatus = known === 0 ? 'UNKNOWN' : unknown > 0 ? 'PARTIAL' : 'KNOWN';
  return { status, balance: known === 0 ? null : sum, knownAccounts: known, unknownAccounts: unknown };
}

const SETTLED_CHEQUE = new Set(['CLEARED', 'BOUNCED', 'CANCELLED', 'CANCELED', 'VOID', 'VOIDED']);

export function buildCashFlowProjection(input: CashFlowInput): CashFlowProjection {
  const asOf = normalizeIsoDate(input.asOf);
  if (!asOf) throw new Error('cashFlowEngine: asOf must be YYYY-MM-DD');
  const horizon = Math.max(1, Math.floor(input.horizonDays));
  const last = addDaysIso(asOf, horizon - 1);
  const firstDayMode = input.overdueTreatment === 'FIRST_DAY';
  const excluded: CashExcluded[] = [];
  const items: CashItem[] = [];

  const push = (it: Omit<CashItem, 'overdue'>) => {
    const overdue = it.dueDate < asOf;
    if (!overdue && it.dueDate > last) return; // خارج از افق: نه خطا، نه شمارش
    items.push({ ...it, overdue });
  };

  /* چک‌ها */
  const cheques = input.cheques || [];
  const payableBillAmounts = new Map<string, number>();
  for (const c of cheques) {
    const id = str(c.id);
    const isOut = c.direction === 'PAYABLE';
    const status = str(c.status).toUpperCase();
    if (c.isGuarantee === true) { excluded.push({ id, source: 'cheques', reason: 'GUARANTEE' }); continue; }
    if (isVoided(c)) { excluded.push({ id, source: 'cheques', reason: 'VOIDED' }); continue; }
    if (SETTLED_CHEQUE.has(status)) { excluded.push({ id, source: 'cheques', reason: 'SETTLED' }); continue; }
    const amount = numOrNull(c.amount);
    if (!isRial(c) || amount === null || amount <= 0 || !['PAYABLE', 'RECEIVABLE'].includes(str(c.direction))) { excluded.push({ id, source: 'cheques', reason: 'BAD_AMOUNT' }); continue; }
    if (c.dueDate === undefined || c.dueDate === null || c.dueDate === '') { excluded.push({ id, source: 'cheques', reason: 'NO_DUE_DATE' }); continue; }
    const due = normalizeIsoDate(c.dueDate);
    if (!due) { excluded.push({ id, source: 'cheques', reason: 'BAD_DUE_DATE' }); continue; }
    if (isOut && c.billId) {
      const billId = str(c.billId);
      payableBillAmounts.set(billId, (payableBillAmounts.get(billId) || 0) + amount);
    }
    if (!isOut && input.includeIncoming === false) continue;
    push({
      id, kind: isOut ? 'CHEQUE_OUT' : 'CHEQUE_IN', direction: isOut ? 'OUT' : 'IN', dueDate: due, amount,
      accountId: typeof c.accountId === 'string' && c.accountId ? c.accountId : undefined,
      label: `${isOut ? 'چک پرداختنی' : 'چک دریافتنی'} ${str(c.chequeNumber)}`.trim()
    });
  }

  /* فاکتور خرید (مانده قابل پرداخت)؛ اگر چک پرداختنی همان فاکتور را پوشش می‌دهد دوباره نمی‌شمارد */
  for (const b of input.supplierBills || []) {
    const id = str(b.id);
    if (str(b.status).toUpperCase() === 'PAID') { excluded.push({ id, source: 'supplierBills', reason: 'SETTLED' }); continue; }
    if (isVoided(b)) { excluded.push({ id, source: 'supplierBills', reason: 'VOIDED' }); continue; }
    const total = numOrNull(b.amount);
    const paid = numOrNull(b.paidAmount);
    if (!isRial(b) || total === null || paid === null || paid < 0) { excluded.push({ id, source: 'supplierBills', reason: 'BAD_AMOUNT' }); continue; }
    const outstanding = total - paid;
    if (outstanding <= 0) { excluded.push({ id, source: 'supplierBills', reason: 'SETTLED' }); continue; }
    const remaining = outstanding - (payableBillAmounts.get(id) || 0);
    if (remaining <= 0) { excluded.push({ id, source: 'supplierBills', reason: 'LINKED_TO_BILL' }); continue; }
    if (b.dueDate === undefined || b.dueDate === null || b.dueDate === '') { excluded.push({ id, source: 'supplierBills', reason: 'NO_DUE_DATE' }); continue; }
    const due = normalizeIsoDate(b.dueDate);
    if (!due) { excluded.push({ id, source: 'supplierBills', reason: 'BAD_DUE_DATE' }); continue; }
    push({ id, kind: 'SUPPLIER_BILL', direction: 'OUT', dueDate: due, amount: remaining, label: `فاکتور خرید ${str(b.billNumber || b.number || id)}`.trim() });
  }

  /* هزینه‌های سررسیددار (فقط وضعیت DUE؛ پرداخت‌شده از خزانه کسر شده است) */
  for (const e of input.expenses || []) {
    if (str(e.status).toUpperCase() !== 'DUE') continue;
    const id = str(e.id);
    if (isVoided(e)) { excluded.push({ id, source: 'expenses', reason: 'VOIDED' }); continue; }
    const amount = numOrNull(e.amount);
    if (!isRial(e) || amount === null || amount <= 0) { excluded.push({ id, source: 'expenses', reason: 'BAD_AMOUNT' }); continue; }
    if (e.dueDate === undefined || e.dueDate === null || e.dueDate === '') { excluded.push({ id, source: 'expenses', reason: 'NO_DUE_DATE' }); continue; }
    const due = normalizeIsoDate(e.dueDate);
    if (!due) { excluded.push({ id, source: 'expenses', reason: 'BAD_DUE_DATE' }); continue; }
    push({ id, kind: 'EXPENSE', direction: 'OUT', dueDate: due, amount, label: str(e.title) || 'هزینه' });
  }

  const overdueItems = items.filter(i => i.overdue);
  const overdue = {
    inflow: overdueItems.filter(i => i.direction === 'IN').reduce((s, i) => s + i.amount, 0),
    outflow: overdueItems.filter(i => i.direction === 'OUT').reduce((s, i) => s + i.amount, 0),
    items: overdueItems
  };

  const opening = computeTreasuryOpening(input.treasuryAccounts || [], input.treasuryTransactions || [], asOf);

  /* ردیف روزانه */
  const days: CashDayRow[] = [];
  const scheduledByDay = new Map<string, { inflow:number; outflow:number }>();
  for (const item of items) {
    if (item.overdue) continue;
    const daily = scheduledByDay.get(item.dueDate) ?? { inflow:0, outflow:0 };
    if (item.direction === 'IN') daily.inflow += item.amount;
    else daily.outflow += item.amount;
    scheduledByDay.set(item.dueDate,daily);
  }
  let running: number | null = opening.status === 'KNOWN' ? opening.balance : null;
  // سناریوی محافظه‌کارانه برای مانده: تعهدات پرداختنی سررسیدگذشته روز اول پرداخت می‌شود؛ مطالبات سررسیدگذشته وصول‌شده فرض نمی‌شود.
  if (running !== null && !firstDayMode) running -= overdue.outflow;
  for (let i = 0; i < horizon; i++) {
    const date = addDaysIso(asOf, i);
    const today = scheduledByDay.get(date);
    let inflow = today?.inflow ?? 0;
    let outflow = today?.outflow ?? 0;
    if (i === 0 && firstDayMode) { inflow += overdue.inflow; outflow += overdue.outflow; }
    const net = inflow - outflow;
    if (running !== null) running += net;
    days.push({ date, inflow, outflow, net, projectedBalance: running });
  }

  let lowest: CashFlowProjection['lowest'] = null;
  let firstShortfallDate: string | null = null;
  if (opening.balance !== null) {
    for (const d of days) {
      if (d.projectedBalance === null) continue;
      if (!lowest || d.projectedBalance < lowest.balance) lowest = { date: d.date, balance: d.projectedBalance };
      if (firstShortfallDate === null && d.projectedBalance < 0) firstShortfallDate = d.date;
    }
  }

  const totals = {
    inflow: days.reduce((s, d) => s + d.inflow, 0),
    outflow: days.reduce((s, d) => s + d.outflow, 0),
    net: 0
  };
  totals.net = totals.inflow - totals.outflow;

  return {
    asOf, horizonDays: horizon, days,
    items: items.filter(i => !i.overdue).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id)),
    overdue, totals, opening, lowest, firstShortfallDate, excluded
  };
}

/** جمع افق‌های کوتاه (مثلاً ۳/۷/۱۴ روز) برای نمای فرماندهی */
export function horizonTotals(p: CashFlowProjection, n: number): { inflow: number; outflow: number; gap: number } {
  const s = p.days.slice(0, Math.max(0, n));
  const inflow = s.reduce((a, d) => a + d.inflow, 0);
  const outflow = s.reduce((a, d) => a + d.outflow, 0);
  return { inflow, outflow, gap: Math.max(0, outflow - inflow) };
}

export interface PayabilityResult {
  /** true/false؛ null اگر مانده افتتاحیه نامشخص است (نه «ممکن» و نه «ناممکن») */
  feasible: boolean | null;
  date: string;
  projectedBefore: number | null;
  projectedAfter: number | null;
  shortfall: number | null;
  reason?: 'OPENING_UNKNOWN' | 'DATE_OUT_OF_HORIZON' | 'INCOMPLETE_INPUT' | 'INVALID_AMOUNT';
}

/**
 * سناریوی «آیا در تاریخ آینده می‌توان مبلغ X را پرداخت/چک صادر کرد؟»
 * پرداخت در پایان آن روز اعمال و مانده روزهای بعد نیز بررسی می‌شود؛ حداقل ذخیره از تنظیمات می‌آید (هاردکد نیست).
 */
export function evaluatePayability(p: CashFlowProjection, date: string, amount: number, minReserve: number): PayabilityResult {
  if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(minReserve) || minReserve < 0) {
    return { feasible: null, date, projectedBefore: null, projectedAfter: null, shortfall: null, reason: 'INVALID_AMOUNT' };
  }
  if (p.excluded.some(row => ['NO_DUE_DATE', 'BAD_DUE_DATE', 'BAD_AMOUNT'].includes(row.reason))) {
    return { feasible: null, date, projectedBefore: null, projectedAfter: null, shortfall: null, reason: 'INCOMPLETE_INPUT' };
  }
  const d = normalizeIsoDate(date);
  const idx = d ? p.days.findIndex(x => x.date === d) : -1;
  if (!d || idx < 0) return { feasible: null, date: date, projectedBefore: null, projectedAfter: null, shortfall: null, reason: 'DATE_OUT_OF_HORIZON' };
  if (p.opening.status !== 'KNOWN' || p.opening.balance === null || p.days[idx].projectedBalance === null) {
    return { feasible: null, date: d, projectedBefore: null, projectedAfter: null, shortfall: null, reason: 'OPENING_UNKNOWN' };
  }
  const before = p.days[idx].projectedBalance as number;
  let worst = Infinity;
  for (let i = idx; i < p.days.length; i++) {
    const b = p.days[i].projectedBalance;
    if (b !== null) worst = Math.min(worst, b - amount);
  }
  const shortfall = Math.max(0, minReserve - worst);
  return { feasible: shortfall === 0, date: d, projectedBefore: before, projectedAfter: before - amount, shortfall };
}
