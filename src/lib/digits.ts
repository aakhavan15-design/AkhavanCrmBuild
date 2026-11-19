/** تبدیل ارقام فارسی/عربی به لاتین — تنها پیاده‌سازی canonical؛ بدون هیچ وابستگی. */
const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';

export function toLatinDigits(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/[۰-۹]/g, d => String(FA.indexOf(d)))
    .replace(/[٠-٩]/g, d => String(AR.indexOf(d)));
}

export function toPersianDigits(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/[0-9]/g, d => FA[Number(d)] ?? d);
}

