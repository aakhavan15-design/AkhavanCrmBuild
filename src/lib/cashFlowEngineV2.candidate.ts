/**
 * موتور جریان نقدینگی (R8 / F6-04) — تنها منبع محاسبهٔ پیش‌بینی نقدینگی.
 *
 * قواعد (قانون اساسی A/C/D):
 *  - تابع خالص است: هیچ State/IndexedDB/Date.now نمی‌خواند؛ ورودی از DataProvider و «امروز» از فراخوان می‌آید.
 *  - چک ضمانتی/باطل/وصول‌شده/برگشتی در پیش‌بینی نمی‌آید (F6-03)؛ چک برگشتی فقط ریسک جدا گزارش می‌شود.
 *  - موجودی بانکی نامعلوم = null (هرگز صفر)؛ بدون موجودی، فقط «خالص جریان» محاسبه می‌شود.
 *  - ردیف بدون تاریخ سررسید یا مبلغ نامعتبر حذف بی‌صدا نمی‌شود؛ در `unscheduled` شمرده می‌شود.
 *  - منبع غیرقابل‌دسترس (missingSources) ⇒ وضعیت PARTIAL، نه «بدون مشکل».
 *  - آستانه‌ها از `CashFlowConfig` می‌آیند (قابل نسخه‌دار شدن در تنظیمات)، نه هاردکد در UI.
 *  - مطالبات مشتری (فاکتور) عمداً در خروجی نیست: سررسید فاکتور مبنای قطعی ورودی نقد نیست (قاعدهٔ مالک ۱۴۰۵/۰۸/۲۵).
 */

export type CashFlowSourceKind = 'CHEQUE_IN' | 'CHEQUE_OUT' | 'SUPPLIER_BILL' | 'EXPENSE';
export type CashFlowStatus = 'LIVE' | 'PARTIAL' | 'EMPTY' | 'UNAVAILABLE';

export interface CashFlowConfig {
  /** تعداد روز افق پیش‌بینی */
  horizonDays: number;
  /** تعداد روز اول به‌عنوان «ناحیهٔ بحرانی» */
  criticalDays: number;
  /** حداقل ذخیرهٔ نقد که نباید زیر آن رفت (ریال) */
  minReserve: number;
  /** تعهد سررسیدگذشتهٔ پرداختنی در روز اول اعمال شود؟ (محافظه‌کارانه) */
  overduePayableOnDay0: boolean;
  /** چک دریافتی سررسیدگذشته در روز اول ورودی حساب شود؟ (نامطمئن؛ پیش‌فرض خیر) */
  overdueReceivableOnDay0: boolean;
  /** وضعیت‌های هزینه که تعهد پرداخت آتی‌اند */
  expenseOutflowStatuses: string[];
  /** وضعیت‌هایی که چک را از پیش‌بینی خارج می‌کند (وصول/پرداخت‌شده یا برگشتی) */
  chequeClosedStatuses: string[];
  /** وضعیت‌های باطل */
  chequeVoidStatuses: string[];
  /** وضعیت برگشتی (فقط ریسک) */
  chequeBouncedStatuses: string[];
}

export const DEFAULT_CASH_FLOW_CONFIG: CashFlowConfig = {
  horizonDays: 14,
  criticalDays: 3,
  minReserve: 0,
  overduePayableOnDay0: true,
  overdueReceivableOnDay0: false,
  expenseOutflowStatuses: ['DUE'],
  chequeClosedStatuses: ['CLEARED', 'PAID', 'SETTLED'],
  chequeVoidStatuses: ['VOID', 'VOIDED', 'CANCELLED', 'CANCELED'],
  chequeBouncedStatuses: ['BOUNCED', 'RETURNED']
};

/** هر دو سرچشمهٔ پیش‌فرض/نسخه‌دار قابل تشخیص باشد (الگوی آستانه‌های ریزش). */
export function isCashFlowConfigDefault(cfg: CashFlowConfig | undefined | null): boolean {
  return !cfg || cfg === DEFAULT_CASH_FLOW_CONFIG;
}

type Row = Record<string, unknown>;

export interface CashFlowInput {
  /** امروز به‌صورت YYYY-MM-DD (از فراخوان) */
  today: string;
  cheques: Row[];
  supplierBills: Row[];
  expenses: Row[];
  treasuryAccounts: Row[];
  treasuryTransactions: Row[];
  /** منابعی که به‌دلیل مجوز/خطا خوانده نشده‌اند */
  missingSources?: string[];
  config?: Partial<CashFlowConfig>;
}

export interface CashFlowItem {
  kind: CashFlowSourceKind;
  id: string;
  date: string;
  amount: number;
  label?: string;
  /** سررسیدگذشته بوده و به روز اول منتقل شده */
  overdue?: boolean;
}

export interface CashFlowDayPoint {
  date: string;
  inflow: number;
  outflow: number;
  net: number;
  /** جمع تجمعی خالص از ابتدای افق */
  cumulativeNet: number;
  /** موجودی پیش‌بینی‌شده؛ null اگر موجودی اولیه نامعلوم */
  projectedBalance: number | null;
  critical: boolean;
  items: CashFlowItem[];
}

export interface CashFlowResult {
  status: CashFlowStatus;
  asOf: string;
  config: CashFlowConfig;
  openingBalance: number | null;
  /** FULL: همهٔ حساب‌ها معلوم؛ PARTIAL: بعضی نامعلوم؛ UNKNOWN: هیچ‌کدام */
  openingBalanceStatus: 'FULL' | 'PARTIAL' | 'UNKNOWN';
  unknownBalanceAccounts: string[];
  days: CashFlowDayPoint[];
  totals: { inflow: number; outflow: number; net: number };
  /** تعهدات/ورودی‌های سررسیدگذشته (بدون تاریخ آینده) — جدا از روزها */
  overdue: { inflow: number; outflow: number; count: number };
  /** چک‌های برگشتی دریافتی: ریسک، نه ورودی */
  bounced: { receivable: number; count: number };
  /** ردیف‌های فاقد تاریخ/مبلغ معتبر */
  unscheduled: { count: number; sources: CashFlowSourceKind[] };
  /** کمترین موجودی پیش‌بینی‌شده (فقط اگر موجودی معلوم) */
  lowest: { date: string; balance: number } | null;
  firstShortfallDate: string | null;
  missingSources: string[];
  notes: string[];
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const upper = (v: unknown): string => String(v ?? '').toUpperCase();
const ISO = /^\d{4}-\d{2}-\d{2}/;
const day = (v: unknown): string | null => (typeof v === 'string' && ISO.test(v) ? v.slice(0, 10) : null);

export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** موجودی هر حساب خزانه: currentBalance معتبر، وگرنه opening + Σگردش؛ وگرنه null. */
export function treasuryAccountBalance(account: Row, transactions: Row[]): number | null {
  const cur = account.currentBalance;
  if (typeof cur === 'number' && Number.isFinite(cur)) return cur;
  const opening = account.openingBalance;
  if (typeof opening !== 'number' || !Number.isFinite(opening)) return null;
  let bal = opening;
  for (const t of transactions) {
    if (t.accountId !== account.id) continue;
    const a = num(t.amount);
    if (!Number.isFinite(a)) return null; // گردش مخدوش ⇒ مانده قابل‌اتکا نیست
    bal += upper(t.direction) === 'IN' ? a : -a;
  }
  return bal;
}

export function buildCashFlow(input: CashFlowInput): CashFlowResult {
  const cfg: CashFlowConfig = { ...DEFAULT_CASH_FLOW_CONFIG, ...(input.config || {}) };
  const today = input.today;
  const missing = [...(input.missingSources || [])];
  const notes: string[] = [];
  const horizonEnd = addDaysISO(today, cfg.horizonDays - 1);

  const dates = Array.from({ length: cfg.horizonDays }, (_, i) => addDaysISO(today, i));
  const points = new Map<string, CashFlowDayPoint>(dates.map((d, i) => [d, { date: d, inflow: 0, outflow: 0, net: 0, cumulativeNet: 0, projectedBalance: null, critical: i < cfg.criticalDays, items: [] }]));
  const overdue = { inflow: 0, outflow: 0, count: 0 };
  const bounced = { receivable: 0, count: 0 };
  const unsched = new Set<CashFlowSourceKind>();
  let unschedCount = 0;

  const place = (item: CashFlowItem, isIn: boolean) => {
    const p = points.get(item.date);
    if (!p) return; // خارج از افق
    if (isIn) p.inflow += item.amount; else p.outflow += item.amount;
    p.items.push(item);
  };
  const addOverdue = (kind: CashFlowSourceKind, id: string, amount: number, isIn: boolean, label?: string) => {
    overdue.count += 1;
    if (isIn) overdue.inflow += amount; else overdue.outflow += amount;
    const onDay0 = isIn ? cfg.overdueReceivableOnDay0 : cfg.overduePayableOnDay0;
    if (onDay0) place({ kind, id, date: today, amount, label, overdue: true }, isIn);
  };
  const noteUnscheduled = (k: CashFlowSourceKind) => { unschedCount += 1; unsched.add(k); };

  const closed = new Set(cfg.chequeClosedStatuses.map(upper));
  const voided = new Set(cfg.chequeVoidStatuses.map(upper));
  const bouncedSt = new Set(cfg.chequeBouncedStatuses.map(upper));
  const countedPayableBillIds = new Set<string>();

  for (const c of input.cheques || []) {
    if (c.isGuarantee === true || c.isVoided === true) continue; // ضمانتی/باطل خارج از محاسبه
    const st = upper(c.status);
    if (voided.has(st)) continue;
    const isOut = upper(c.direction) === 'PAYABLE' || upper(c.direction) === 'ISSUED';
    const amount = num(c.amount);
    if (bouncedSt.has(st) || c.isBounced === true) {
      if (!isOut && Number.isFinite(amount) && amount > 0) { bounced.receivable += amount; bounced.count += 1; }
      continue;
    }
    if (closed.has(st)) continue; // قبلاً در بانک اثر کرده
    const due = day(c.dueDate);
    const kind: CashFlowSourceKind = isOut ? 'CHEQUE_OUT' : 'CHEQUE_IN';
    if (!due || !Number.isFinite(amount) || amount <= 0) { noteUnscheduled(kind); continue; }
    if (isOut && typeof c.billId === 'string') countedPayableBillIds.add(c.billId);
    const id = String(c.id ?? c.chequeNumber ?? '');
    const label = c.chequeNumber ? `چک ${String(c.chequeNumber)}` : undefined;
    if (due < today) addOverdue(kind, id, amount, !isOut, label);
    else if (due <= horizonEnd) place({ kind, id, date: due, amount, label }, !isOut);
  }

  for (const b of input.supplierBills || []) {
    const st = upper(b.status);
    if (st === 'PAID' || st === 'CANCELLED' || st === 'CANCELED') continue;
    const id = String(b.id ?? '');
    if (countedPayableBillIds.has(id)) continue; // با چک پرداختنی پوشش داده شده؛ دوباره شمرده نشود
    const remaining = num(b.amount) - (Number.isFinite(num(b.paidAmount)) ? num(b.paidAmount) : 0);
    const due = day(b.dueDate);
    if (!due || !Number.isFinite(remaining)) { noteUnscheduled('SUPPLIER_BILL'); continue; }
    if (remaining <= 0) continue;
    if (due < today) addOverdue('SUPPLIER_BILL', id, remaining, false);
    else if (due <= horizonEnd) place({ kind: 'SUPPLIER_BILL', id, date: due, amount: remaining }, false);
  }

  const expSt = new Set(cfg.expenseOutflowStatuses.map(upper));
  for (const e of input.expenses || []) {
    if (!expSt.has(upper(e.status))) continue;
    const amount = num(e.amount), due = day(e.dueDate), id = String(e.id ?? '');
    if (!due || !Number.isFinite(amount) || amount <= 0) { noteUnscheduled('EXPENSE'); continue; }
    if (due < today) addOverdue('EXPENSE', id, amount, false, typeof e.title === 'string' ? e.title : undefined);
    else if (due <= horizonEnd) place({ kind: 'EXPENSE', id, date: due, amount, label: typeof e.title === 'string' ? e.title : undefined }, false);
  }

  // موجودی اولیه
  const accounts = input.treasuryAccounts || [];
  const known: number[] = [];
  const unknownAccounts: string[] = [];
  for (const a of accounts) {
    const b = treasuryAccountBalance(a, input.treasuryTransactions || []);
    if (b === null) unknownAccounts.push(String(a.bankName ?? a.name ?? a.id ?? ''));
    else known.push(b);
  }
  const hiddenTreasury = missing.includes('treasuryAccounts');
  let openingBalanceStatus: CashFlowResult['openingBalanceStatus'];
  let openingBalance: number | null;
  if (hiddenTreasury || accounts.length === 0 || known.length === 0) { openingBalanceStatus = 'UNKNOWN'; openingBalance = null; }
  else if (unknownAccounts.length > 0) { openingBalanceStatus = 'PARTIAL'; openingBalance = known.reduce((a, b) => a + b, 0); }
  else { openingBalanceStatus = 'FULL'; openingBalance = known.reduce((a, b) => a + b, 0); }
  // موجودی ناقص برای تصمیم پرداخت قابل‌اتکا نیست
  const usableBalance = openingBalanceStatus === 'FULL' ? openingBalance : null;
  if (openingBalanceStatus === 'PARTIAL') notes.push('موجودی بعضی حساب‌های بانک/صندوق نامعلوم است؛ موجودی پیش‌بینی‌شده محاسبه نشد.');
  if (openingBalanceStatus === 'UNKNOWN') notes.push('موجودی بانک/صندوق ثبت نشده است؛ فقط خالص ورودی/خروجی نمایش داده می‌شود.');

  let cumulative = 0;
  const days = dates.map(d => {
    const p = points.get(d)!;
    p.net = p.inflow - p.outflow;
    cumulative += p.net;
    p.cumulativeNet = cumulative;
    p.projectedBalance = usableBalance === null ? null : usableBalance + cumulative;
    return p;
  });

  let lowest: CashFlowResult['lowest'] = null;
  let firstShortfallDate: string | null = null;
  if (usableBalance !== null) {
    for (const p of days) {
      const b = p.projectedBalance as number;
      if (!lowest || b < lowest.balance) lowest = { date: p.date, balance: b };
      if (firstShortfallDate === null && b < cfg.minReserve) firstShortfallDate = p.date;
    }
  }

  const totals = days.reduce((a, p) => ({ inflow: a.inflow + p.inflow, outflow: a.outflow + p.outflow, net: a.net + p.net }), { inflow: 0, outflow: 0, net: 0 });
  const hasAnyFlow = days.some(p => p.items.length > 0) || overdue.count > 0;
  let status: CashFlowStatus;
  if (missing.includes('cheques') && missing.includes('supplierBills') && missing.includes('expenses')) status = 'UNAVAILABLE';
  else if (missing.length > 0 || unschedCount > 0 || openingBalanceStatus !== 'FULL') status = hasAnyFlow || known.length ? 'PARTIAL' : 'EMPTY';
  else status = hasAnyFlow || known.length ? 'LIVE' : 'EMPTY';
  if (missing.length) notes.push(`منابع بدون دسترسی/نامعتبر: ${missing.join('، ')}؛ نتیجه ناقص است.`);
  if (unschedCount) notes.push(`${unschedCount} ردیف بدون تاریخ سررسید یا مبلغ معتبر در پیش‌بینی نیامد.`);

  return { status, asOf: today, config: cfg, openingBalance, openingBalanceStatus, unknownBalanceAccounts: unknownAccounts, days, totals, overdue, bounced, unscheduled: { count: unschedCount, sources: [...unsched] }, lowest, firstShortfallDate, missingSources: missing, notes };
}

export type PaymentScenarioVerdict = 'OK' | 'SHORTFALL' | 'UNKNOWN' | 'OUT_OF_HORIZON' | 'INVALID';
export interface PaymentScenarioResult {
  verdict: PaymentScenarioVerdict;
  /** بیشترین مبلغ قابل‌پرداخت در آن تاریخ بدون رفتن زیر حداقل ذخیره */
  maxPayable: number | null;
  /** اولین روزی که پس از این پرداخت موجودی زیر حداقل ذخیره می‌رود */
  breachDate: string | null;
  reason?: string;
}

/** آیا می‌توان مبلغی را در تاریخ مشخص (چک/پرداخت/برداشت) بدون رفتن زیر حداقل ذخیره پرداخت کرد؟ */
export function evaluatePaymentScenario(result: CashFlowResult, scenario: { amount: number; date: string }): PaymentScenarioResult {
  if (!Number.isFinite(scenario.amount) || scenario.amount <= 0 || !day(scenario.date)) return { verdict: 'INVALID', maxPayable: null, breachDate: null, reason: 'مبلغ یا تاریخ نامعتبر است.' };
  const idx = result.days.findIndex(p => p.date === scenario.date);
  if (idx < 0) return { verdict: 'OUT_OF_HORIZON', maxPayable: null, breachDate: null, reason: 'تاریخ خارج از افق پیش‌بینی است.' };
  if (result.openingBalanceStatus !== 'FULL') return { verdict: 'UNKNOWN', maxPayable: null, breachDate: null, reason: 'موجودی کامل بانک/صندوق معلوم نیست.' };
  if (result.missingSources.length > 0) return { verdict: 'UNKNOWN', maxPayable: null, breachDate: null, reason: 'بعضی منابع پیش‌بینی در دسترس نیستند.' };
  const tail = result.days.slice(idx);
  const lowestAfter = Math.min(...tail.map(p => p.projectedBalance as number));
  const maxPayable = Math.max(0, lowestAfter - result.config.minReserve);
  const breach = tail.find(p => (p.projectedBalance as number) - scenario.amount < result.config.minReserve);
  return { verdict: breach ? 'SHORTFALL' : 'OK', maxPayable, breachDate: breach ? breach.date : null };
}
