/**
 * تبدیل تاریخ میلادی ISO یا شمسی (۱۴۰۵/۰۸/۰۱، با ارقام فارسی یا لاتین) به زمان UTC نیمه‌شب.
 * بدون وابستگی؛ برای موتورهای خالص (سنی مطالبات، گزارش‌ها) که نباید به بستهٔ تقویم وابسته باشند.
 */
const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';
const latin = (v: unknown) => String(v ?? '').replace(/[۰-۹]/g, d => String(FA.indexOf(d))).replace(/[٠-٩]/g, d => String(AR.indexOf(d))).trim();

export function jalaliToGregorianParts(jy: number, jm: number, jd: number): [number, number, number] {
  jy += 1595;
  let days = -355668 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const months = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  while (gm < 13 && gd > months[gm]) { gd -= months[gm]; gm++; }
  return [gy, gm, gd];
}

/** null = تاریخ نامعتبر/نبود تاریخ (نامشخص؛ حدس زده نمی‌شود). */
export function parseFlexibleDate(input: unknown): number | null {
  if (input === null || input === undefined || input === '') return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate());
  const text = latin(input);
  const j = text.match(/^(1[34]\d\d)[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (j) {
    const [gy, gm, gd] = jalaliToGregorianParts(Number(j[1]), Number(j[2]), Number(j[3]));
    return Date.UTC(gy, gm - 1, gd);
  }
  const g = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (g) return Date.UTC(Number(g[1]), Number(g[2]) - 1, Number(g[3]));
  const t = new Date(text).getTime();
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export const DAY_MS = 86400000;
