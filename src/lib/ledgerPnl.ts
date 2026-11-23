/**
 * Ledger-based P&L by report bucket (spec §8.6, §10). Source = mapped journal lines only.
 * A bucket with no mapped postings is NULL (unknown), never 0; derived buckets are NULL if any operand is NULL.
 * Bucket keys/expressions are the existing DEFAULT_REPORT_BUCKETS (accountingMapping.ts) — no second definition.
 */
import type { LedgerAccountDef } from './etlPipeline.ts';
import { calculateNetSales, isLedgerArticleIncluded } from './financialMetricKernel.ts';

export interface PnlJournalLine { ledgerAccountId: string | null; debitAmount: number; creditAmount: number; documentDate: string; isVoided?: boolean; status?: string }
export interface BucketDef { key: string; calculationExpression?: string }
// The posted-status policy is owned by financialMetricKernel.

export function computeLedgerPnl(lines: PnlJournalLine[], accounts: LedgerAccountDef[], buckets: BucketDef[], period?: { from?: string; to?: string }) {
  const byId = new Map(accounts.map(a => [a.id, a]));
  const raw = new Map<string, number>(); let unmappedLines = 0, used = 0;
  for (const l of lines) {
    if (!isLedgerArticleIncluded(l, 'POSTED_ONLY')) continue;
    const d = l.documentDate.slice(0, 10);
    if ((period?.from && d < period.from) || (period?.to && d > period.to)) continue;
    const acc = l.ledgerAccountId ? byId.get(l.ledgerAccountId) : undefined;
    if (!acc) { unmappedLines++; continue; }
    if (!acc.reportBucketCode) continue;
    const signed = acc.natureCode === 'CREDIT' ? l.creditAmount - l.debitAmount : l.debitAmount - l.creditAmount;
    raw.set(acc.reportBucketCode, (raw.get(acc.reportBucketCode) ?? 0) + signed); used++;
  }
  const values: Record<string, number | null> = {};
  const evalBucket = (key: string, seen: string[] = []): number | null => {
    if (key in values) return values[key];
    const def = buckets.find(b => b.key === key);
    if (def?.calculationExpression) {
      if (seen.includes(key)) return null;
      const m = def.calculationExpression.match(/^\s*([A-Z_]+)\s*([+-])\s*([A-Z_]+)\s*$/);
      if (!m) return (values[key] = null);
      const a = evalBucket(m[1], [...seen, key]), b = evalBucket(m[3], [...seen, key]);
      if (key === 'NET_SALES' && m[1] === 'GROSS_SALES' && m[3] === 'SALES_RETURNS' && m[2] === '-')
        return (values[key] = calculateNetSales(a, b));
      return (values[key] = a === null || b === null ? null : m[2] === '+' ? a + b : a - b);
    }
    return (values[key] = raw.has(key) ? raw.get(key)! : null);
  };
  for (const b of buckets) evalBucket(b.key);
  return { values, unmappedLines, usedLines: used, complete: unmappedLines === 0 && Object.values(values).every(v => v !== null) };
}

/* ───────── ورودی‌های P&L از state و سری‌های جلالی (F0-09) — مرجع یگانه؛ هیچ عدد نمونه‌ای وجود ندارد ───────── */
interface JournalLineInput { ledgerAccountId?: string | null; debitAmount?: unknown; creditAmount?: unknown; documentDate?: string; status?: unknown; isVoided?: boolean; isDeleted?: boolean }
interface CoaInput { id: string; code?: string; name?: string; level?: number; nature?: string }

/** پیشوندهای معین P&L — مشتق از همان COA_PREFIX_BUCKETS، بدون تکرار تعریف. */
export const COA_PREFIX_BUCKETS: Array<[string, string]> = [['41', 'GROSS_SALES'], ['42', 'SALES_RETURNS'], ['51', 'COGS'], ['52', 'OPERATING_EXPENSES']];
export const PNL_ACCOUNT_PREFIXES: string[] = COA_PREFIX_BUCKETS.map(([p]) => p);

/**
 * تبدیل ردیف‌های تجمیعی SQL (کد معین + تاریخ/ماه + بدهکار/بستانکار) به PnlJournalLine.
 * ردیف بدون نگاشت ledgerAccountId=null می‌شود تا در unmappedLines شمارش شود.
 */
export function normalizeSqlPnlRows(
  rows: Array<Record<string, unknown>>,
  coaMirror: Array<{ id: string; code?: string }>
): PnlJournalLine[] {
  const byCode = new Map<string, string>();
  for (const a of coaMirror || []) {
    const code = String(a.code || '').trim();
    if (code) byCode.set(code, a.id);
  }
  const out: PnlJournalLine[] = [];
  for (const r of rows || []) {
    const code = String(r.accountCode || r.ExternalAccountCode || r.ExternalDetailCode || '').trim();
    const ledgerAccountId = code ? (byCode.get(code) ?? null) : null;
    const documentDate = String(r.documentDate || r.DocumentDate || r.periodMonth || r.ExternalPeriodCode || '').slice(0, 10);
    if (!documentDate) continue;
    out.push({
      ledgerAccountId,
      debitAmount: Number(r.debitAmount ?? r.TotalDebit ?? r.debit ?? 0) || 0,
      creditAmount: Number(r.creditAmount ?? r.TotalCredit ?? r.credit ?? 0) || 0,
      documentDate,
      status: String(r.status || r.StatusCode || 'POSTED'),
      isVoided: r.isVoided === true || r.IsVoided === true
    });
  }
  return out;
}

export function buildLedgerPnlInputs(journalLines: unknown, coaMirror: unknown): { rawLines: PnlJournalLine[]; accounts: LedgerAccountDef[] } {
  const accounts = ((Array.isArray(coaMirror) ? coaMirror : []) as CoaInput[]).map(account => ({
    id: account.id, accountCode: account.code, titleFa: account.name,
    levelCode: 'DETAIL', levelNo: account.level || 4, natureCode: account.nature || 'DEBIT',
    reportBucketCode: COA_PREFIX_BUCKETS.find(([prefix]) => String(account.code || '').startsWith(prefix))?.[1]
  })) as unknown as LedgerAccountDef[];

  // شکل SQL تجمیعی (دارای accountCode/TotalDebit) یا شکل محلی (ledgerAccountId)
  const arr = Array.isArray(journalLines) ? journalLines : [];
  if (arr.some(row => typeof row?.reportBucketCode === 'string')) {
    const ledger = new Map<string, LedgerAccountDef>();
    const lines: PnlJournalLine[] = [];
    for (const row of arr) {
      if (typeof row?.reportBucketCode !== 'string' || !['DEBIT','CREDIT'].includes(row.nature)
          || typeof row.documentDate !== 'string') continue;
      const id = JSON.stringify([row.reportBucketCode,row.nature]);
      const debit = Number(row.debitAmount), credit = Number(row.creditAmount);
      if (!Number.isFinite(debit) || !Number.isFinite(credit)) continue;
      ledger.set(id,{ id,accountCode:row.reportBucketCode,titleFa:'',levelCode:'GROUP',levelNo:1,
        natureCode:row.nature,reportBucketCode:row.reportBucketCode });
      lines.push({ ledgerAccountId:id,debitAmount:debit,creditAmount:credit,documentDate:row.documentDate,status:'POSTED' });
    }
    return { rawLines:lines,accounts:[...ledger.values()] };
  }
  const looksSql = arr.length > 0 && (arr[0] as any)?.accountCode != null || (arr[0] as any)?.ExternalAccountCode != null || (arr[0] as any)?.TotalDebit != null;
  let rawLines: PnlJournalLine[];
  if (looksSql) {
    rawLines = normalizeSqlPnlRows(arr as Array<Record<string, unknown>>, (coaMirror as any[]) || []);
  } else {
    rawLines = (arr as JournalLineInput[]).map(line => ({
      ledgerAccountId: line.ledgerAccountId || null,
      debitAmount: Number(line.debitAmount) || 0,
      creditAmount: Number(line.creditAmount) || 0,
      documentDate: line.documentDate || '',
      status: String(line.status || 'UNVERIFIED'),
      isVoided: line.isVoided === true || line.isDeleted === true
    })).filter(line => Boolean(line.documentDate));
  }
  return { rawLines, accounts };
}

export type PnlGranularity = 'month' | 'quarter' | 'year';
const JALALI_PARTS = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric' });
const FA_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const FA_QUARTERS = ['بهار', 'تابستان', 'پاییز', 'زمستان'];
const faNum = (n: number) => n.toLocaleString('fa-IR', { useGrouping: false });

/** گروه‌بندی سطرهای سند بر پایهٔ ماه/فصل/سال جلالی؛ فقط دوره‌هایی که سند دارند (دورهٔ خالی ساخته نمی‌شود). آخرین `limit` دوره. */
export function pnlSeriesByJalali(lines: PnlJournalLine[], accounts: LedgerAccountDef[], buckets: BucketDef[], granularity: PnlGranularity, limit: number) {
  const groups = new Map<string, { sort: number; label: string; lines: PnlJournalLine[] }>();
  for (const l of lines) {
    const d = new Date(`${l.documentDate.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) continue;
    const parts = JALALI_PARTS.formatToParts(d);
    const y = Number(parts.find(p => p.type === 'year')?.value), m = Number(parts.find(p => p.type === 'month')?.value);
    if (!Number.isFinite(y) || !Number.isFinite(m)) continue;
    const q = Math.ceil(m / 3);
    const key = granularity === 'month' ? `${y}-${m}` : granularity === 'quarter' ? `${y}-Q${q}` : `${y}`;
    const label = granularity === 'month' ? `${FA_MONTHS[m - 1]} ${faNum(y)}` : granularity === 'quarter' ? `${FA_QUARTERS[q - 1]} ${faNum(y)}` : faNum(y);
    const sort = granularity === 'month' ? y * 100 + m : granularity === 'quarter' ? y * 10 + q : y;
    const g = groups.get(key) ?? { sort, label, lines: [] };
    g.lines.push(l); groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => a.sort - b.sort).slice(-limit).map(g => {
    const v = computeLedgerPnl(g.lines, accounts, buckets).values;
    return { label: g.label, revenue: v.NET_SALES ?? null, expenses: v.OPERATING_EXPENSES ?? null, profit: v.OPERATING_PROFIT ?? null };
  });
}
