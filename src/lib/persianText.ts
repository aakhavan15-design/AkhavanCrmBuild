/**
 * نرمال‌سازی متن فارسی برای جستجو و مقایسه — مرجع واحد (بدون وابستگی).
 * ی/ي/ى، ک/ك، نیم‌فاصله و کشیده، همزه، اعراب و ارقام فارسی/عربی یکسان می‌شوند.
 */
const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';

export function digitsToLatin(value: string): string {
  return value.replace(/[۰-۹]/g, d => String(FA.indexOf(d))).replace(/[٠-٩]/g, d => String(AR.indexOf(d)));
}

export function normalizeSearchText(input: unknown): string {
  if (input === null || input === undefined) return '';
  return digitsToLatin(String(input))
    .replace(/[يىئ]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ؤ]/g, 'و')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // اعراب و کشیده
    .replace(/[\u200c\u200d\u200e\u200f]/g, ' ') // نیم‌فاصله و نشانه‌های جهت
    .replace(/[\-_/\\.,،؛:;()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function tokenize(input: unknown): string[] {
  const n = normalizeSearchText(input);
  return n ? n.split(' ') : [];
}
