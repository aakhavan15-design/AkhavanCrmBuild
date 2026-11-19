/**
 * ورودی ممیزی کیفیت داده از خروجی DataProvider (`getStateSnapshot`) ساخته می‌شود، نه از خواندن مستقیم state (F0-14 / قانون اساسی §D).
 * مجموعه‌های پنهان‌شده توسط Provider (RLS/دسترسی) و مجموعه‌های خارج از مجوز کاربر، خالی و در `restricted` گزارش می‌شوند؛
 * خالی‌بودن به‌معنای «بدون مشکل» نیست و موتور آن را «ارزیابی‌نشده» اعلام می‌کند.
 */
export const QUALITY_COLLECTIONS = [
  'accounts', 'customers', 'geoZones', 'zoneAssignments', 'zoneGeometryVersions', 'externalProducts', 'coaMirror', 'journalLines'
] as const;

type Snapshot = { collections?: Record<string, unknown[]>; singletons?: Record<string, unknown>; hiddenCollections?: string[] } | null | undefined;

export function buildQualityAuditInput(
  snapshot: Snapshot,
  access: { canFinance: boolean; canAccounts: boolean }
): { input: Record<string, unknown>; restricted: string[] } {
  const hidden = new Set(Array.isArray(snapshot?.hiddenCollections) ? snapshot!.hiddenCollections : []);
  const blocked = new Set<string>(hidden);
  if (!access.canFinance) { blocked.add('coaMirror'); blocked.add('journalLines'); }
  if (!access.canAccounts) { blocked.add('accounts'); blocked.add('customers'); }
  const input: Record<string, unknown> = { ...(snapshot?.singletons || {}) };
  for (const name of QUALITY_COLLECTIONS) {
    const rows = snapshot?.collections?.[name];
    input[name] = blocked.has(name) || !Array.isArray(rows) ? [] : rows;
  }
  return { input, restricted: QUALITY_COLLECTIONS.filter(name => blocked.has(name)) };
}
