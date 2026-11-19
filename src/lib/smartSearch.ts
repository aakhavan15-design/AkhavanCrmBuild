/**
 * موتور جستجوی هوشمند مشترک (تنها پیاده‌سازی) — فارسی‌محور، بدون وابستگی.
 * ترتیب رتبه‌بندی: تطابق دقیق ← ابتدای عبارت ← ابتدای واژه ← شامل‌شدن جزئی.
 * همهٔ واژه‌های جستجو باید در متن رکورد باشند (AND).
 */
import { normalizeSearchText, tokenize } from './persianText';

export const SMART_SEARCH_DEBOUNCE_MS = 250;

export interface SearchField { text: string; weight?: number }
export interface SearchResult<T> { item: T; score: number }

const RANK = { exact: 1000, prefix: 600, wordPrefix: 300, partial: 100 } as const;

function scoreField(field: string, query: string, tokens: string[]): number {
  if (!field) return 0;
  if (field === query) return RANK.exact;
  if (field.startsWith(query)) return RANK.prefix;
  const words = field.split(' ');
  if (tokens.every(t => words.some(w => w.startsWith(t)))) return RANK.wordPrefix;
  if (tokens.every(t => field.includes(t))) return RANK.partial;
  return 0;
}

export function smartSearch<T>(items: readonly T[], rawQuery: string, getFields: (item: T) => Array<string | SearchField | undefined | null>, opts: { limit?: number } = {}): SearchResult<T>[] {
  const query = normalizeSearchText(rawQuery);
  if (!query) return items.slice(0, opts.limit ?? items.length).map(item => ({ item, score: 0 }));
  const tokens = tokenize(rawQuery);
  const out: SearchResult<T>[] = [];
  for (const item of items) {
    const fields = getFields(item).filter(Boolean).map(f => typeof f === 'string' ? { text: f, weight: 1 } : { text: f!.text, weight: f!.weight ?? 1 });
    const normalized = fields.map(f => ({ text: normalizeSearchText(f.text), weight: f.weight }));
    const joined = normalized.map(f => f.text).join(' ');
    // هر واژه باید در مجموعهٔ فیلدها پیدا شود
    if (!tokens.every(t => joined.includes(t))) continue;
    let best = 0;
    for (const f of normalized) best = Math.max(best, scoreField(f.text, query, tokens) * f.weight);
    if (best === 0) best = RANK.partial / 2; // واژه‌ها در فیلدهای مختلف پراکنده‌اند
    out.push({ item, score: best });
  }
  out.sort((a, b) => b.score - a.score);
  return opts.limit ? out.slice(0, opts.limit) : out;
}

/** بازهٔ هایلایت در متن اصلی؛ بر پایهٔ نرمال‌سازی هم‌طول (حرف‌به‌حرف) انجام می‌شود. */
export function highlightRanges(text: string, rawQuery: string): Array<[number, number]> {
  const tokens = tokenize(rawQuery);
  if (!tokens.length) return [];
  const lower = Array.from(text).map(ch => normalizeSearchText(ch) || ' ').map(s => (s.length === 1 ? s : ch0(s)));
  const flat = lower.join('');
  const ranges: Array<[number, number]> = [];
  for (const t of tokens) {
    let from = 0;
    for (;;) { const i = flat.indexOf(t, from); if (i < 0) break; ranges.push([i, i + t.length]); from = i + t.length; }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) { const last = merged[merged.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push([...r] as [number, number]); }
  return merged;
}
const ch0 = (s: string) => s[0] ?? ' ';
