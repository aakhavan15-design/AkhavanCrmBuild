/**
 * موتور یگانهٔ «ممیزی کیفیت داده ERP» (F2-19).
 * تابع خالص: از روی داده‌های آینه‌شده/محلی، اشتباهات احتمالی ERP را شناسایی می‌کند؛ هیچ داده‌ای را تغییر نمی‌دهد.
 * اصل‌ها: ۱) هر یافته ruleCode، شاهد (evidence) و درجهٔ اطمینان دارد (DETERMINISTIC = قطعی، HEURISTIC = نیازمند بازبینی انسان)
 *         ۲) منبعِ ناموجود ⇒ در notEvaluated می‌آید، نه «صفر مشکل»  ۳) قواعد کلمه‌کلیدی قابل‌بازنویسی با options هستند.
 */
import type { GeoPoint, GeoPolygonGeometry } from '../types';
import { readCustomerGeoPoint, isPointInsideZone } from './geoIntelligence.ts';
import { calculateHaversineDistanceKm } from './geoRoutingEngine';

export type QualitySeverity = 'HIGH' | 'MEDIUM' | 'LOW';
export type QualityDomain = 'CUSTOMER' | 'ROUTE' | 'PRODUCT' | 'COA' | 'JOURNAL';
export type QualityConfidence = 'DETERMINISTIC' | 'HEURISTIC';

export interface QualityIssue {
  id: string;
  ruleCode: string;
  domain: QualityDomain;
  severity: QualitySeverity;
  confidence: QualityConfidence;
  entityType: string;
  entityId: string;
  entityLabel: string;
  message: string;
  suggestion?: string;
  evidence?: Record<string, unknown>;
}

export interface NotEvaluated { domain: QualityDomain; rule?: string; reason: string }

export interface QualityAuditResult {
  issues: QualityIssue[];
  byDomain: Record<QualityDomain, number>;
  byRule: Record<string, number>;
  coverage: Record<string, number>;
  notEvaluated: NotEvaluated[];
}

/* ───────── اعتبارسنجی هویت و تماس ───────── */
const FA = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩';
export function toLatinDigits(v: unknown): string {
  return String(v ?? '').replace(/[۰-۹]/g, d => String(FA.indexOf(d))).replace(/[٠-٩]/g, d => String(AR.indexOf(d)));
}
const digitsOnly = (v: unknown) => toLatinDigits(v).replace(/\D/g, '');

/** کد ملی ۱۰رقمی (حقیقی) یا شناسهٔ ملی ۱۱رقمی (حقوقی). null = ناشناخته/خالی. */
export function checkIranNationalId(raw: unknown): { kind: 'NATURAL' | 'LEGAL' | null; valid: boolean } {
  const d = digitsOnly(raw);
  if (!d) return { kind: null, valid: false };
  if (d.length === 10) {
    if (/^(\d)\1{9}$/.test(d)) return { kind: 'NATURAL', valid: false };
    const n = d.split('').map(Number);
    const s = n.slice(0, 9).reduce((acc, x, i) => acc + x * (10 - i), 0) % 11;
    return { kind: 'NATURAL', valid: s < 2 ? n[9] === s : n[9] === 11 - s };
  }
  if (d.length === 11) {
    const n = d.split('').map(Number);
    const coef = [29, 27, 23, 19, 17, 29, 27, 23, 19, 17];
    const c = n[9] + 2;
    let r = n.slice(0, 10).reduce((acc, x, i) => acc + (x + c) * coef[i], 0) % 11;
    if (r === 10) r = 0;
    return { kind: 'LEGAL', valid: r === n[10] };
  }
  return { kind: null, valid: false };
}

/** موبایل ایران → ‎09xxxxxxxxx‎ یا null. */
export function normalizeIranMobile(raw: unknown): string | null {
  const d = digitsOnly(raw).replace(/^(0098|98)/, '0');
  if (/^09\d{9}$/.test(d)) return d;
  if (/^9\d{9}$/.test(d)) return '0' + d;
  return null;
}
/** شبیه شمارهٔ موبایل است (با 9/09/98 شروع می‌شود) ولی ممکن است ناقص/اضافه باشد. */
const looksLikeMobile = (raw: unknown) => /^(0098|98|0)?9/.test(digitsOnly(raw));

/* ───────── قواعد ماهیت حساب (کلیدواژه‌ای؛ قابل‌بازنویسی) ───────── */
export interface NatureRule { keywords: string[]; expected: 'DEBIT' | 'CREDIT'; label: string }
/** حساب‌های مقابل (contra) از قاعده مستثنا می‌شوند: مثل استهلاک انباشته. */
export const CONTRA_KEYWORDS = ['استهلاک انباشته', 'ذخیره کاهش', 'ذخیره مطالبات', 'برگشت از فروش', 'تخفیفات فروش', 'برداشت'];
export const DEFAULT_NATURE_RULES: NatureRule[] = [
  { keywords: ['جاری شرکا', 'جاری شریک', 'جاری سهامداران', 'جاری مدیران'], expected: 'CREDIT', label: 'جاری شرکا' },
  { keywords: ['پرداختنی', 'بستانکاران', 'پیش دریافت', 'پیش‌دریافت', 'ذخیره', 'سرمایه', 'سود انباشته', 'وام دریافتی', 'تسهیلات دریافتی', 'مالیات پرداختنی'], expected: 'CREDIT', label: 'بدهی/حقوق صاحبان سهام' },
  { keywords: ['درآمد', 'فروش', 'سود سپرده'], expected: 'CREDIT', label: 'درآمد' },
  { keywords: ['دریافتنی', 'بدهکاران', 'پیش پرداخت', 'پیش‌پرداخت', 'موجودی', 'صندوق', 'بانک', 'تنخواه', 'اسناد دریافتنی', 'دارایی', 'هزینه', 'بهای تمام'], expected: 'DEBIT', label: 'دارایی/هزینه' },
];

const norm = (s: unknown) => toLatinDigits(s).replace(/[\u200c\u200f\u200e]/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim();
const hasAny = (text: string, keys: string[]) => keys.some(k => text.includes(norm(k)));

/* ───────── قواعد شرح سند ↔ حساب (کلیدواژه‌ای؛ هیوریستیک) ───────── */
export interface DescriptionRule { topic: string; descAny: string[]; accountAny: string[] }
export const DEFAULT_DESCRIPTION_RULES: DescriptionRule[] = [
  { topic: 'حقوق و دستمزد', descAny: ['حقوق', 'دستمزد', 'مزایا'], accountAny: ['حقوق', 'دستمزد', 'مزایا', 'پرسنل', 'کارکنان', 'پرداختنی'] },
  { topic: 'اجاره', descAny: ['اجاره', 'اجارهٔ', 'رهن'], accountAny: ['اجاره', 'رهن', 'پرداختنی', 'پیش پرداخت'] },
  { topic: 'بیمه', descAny: ['بیمه'], accountAny: ['بیمه', 'تامین اجتماعی', 'تأمین اجتماعی', 'پرداختنی'] },
  { topic: 'مالیات و عوارض', descAny: ['مالیات', 'ارزش افزوده', 'عوارض'], accountAny: ['مالیات', 'ارزش افزوده', 'عوارض'] },
  { topic: 'حمل و کرایه', descAny: ['کرایه', 'حمل', 'باربری'], accountAny: ['حمل', 'کرایه', 'باربری', 'توزیع'] },
  { topic: 'کارمزد بانکی', descAny: ['کارمزد'], accountAny: ['کارمزد', 'بانک', 'مالی'] },
  { topic: 'تلفن و اینترنت', descAny: ['تلفن', 'اینترنت', 'مخابرات'], accountAny: ['تلفن', 'اینترنت', 'مخابرات', 'ارتباطات', 'عمومی'] },
  { topic: 'آب، برق و گاز', descAny: ['قبض برق', 'قبض آب', 'قبض گاز', 'برق', 'گاز'], accountAny: ['برق', 'آب', 'گاز', 'انرژی', 'عمومی'] },
  { topic: 'تبلیغات', descAny: ['تبلیغ'], accountAny: ['تبلیغ', 'بازاریابی', 'فروش'] },
];

export interface QualityOptions {
  natureRules?: NatureRule[];
  descriptionRules?: DescriptionRule[];
  /** مرز جغرافیایی معتبر (پیش‌فرض: محدودهٔ ایران) */
  bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  /** دورافتاده بودن مشتری از هم‌مسیری‌ها: فاصله > farFactor × میانهٔ فاصلهٔ اعضا تا مرکز (و حداقل minFarKm). */
  farFactor?: number; minFarKm?: number; minPeers?: number;
  /** پایین‌ترین نسبت اکثریت برای تشخیص گروه‌بندی اشتباه کالا و حداقل نمونه. */
  productMajority?: number; productMinSamples?: number;
  /** سقف تعداد یافته به‌ازای هر قاعده در خروجی (تعداد واقعی در byRule می‌آید). */
  maxPerRule?: number;
}
const D = { bounds: { minLat: 24, maxLat: 40, minLng: 44, maxLng: 64 }, farFactor: 3, minFarKm: 5, minPeers: 5, productMajority: 0.75, productMinSamples: 4, maxPerRule: 500 };

type Rec = Record<string, any>;
const arr = (v: unknown): Rec[] => (Array.isArray(v) ? (v as Rec[]) : []);
const alive = (r: Rec) => !(r.deletedAt || r.isDeleted);

export function auditErpDataQuality(state: Rec, options: QualityOptions = {}): QualityAuditResult {
  const o = { ...D, ...options };
  const issues: QualityIssue[] = [];
  const notEvaluated: NotEvaluated[] = [];
  const coverage: Record<string, number> = {};
  const ruleCounts: Record<string, number> = {};
  let seq = 0;
  const add = (i: Omit<QualityIssue, 'id'>) => {
    ruleCounts[i.ruleCode] = (ruleCounts[i.ruleCode] || 0) + 1;
    if (ruleCounts[i.ruleCode] <= o.maxPerRule) issues.push({ ...i, id: `${i.ruleCode}:${i.entityId}:${seq++}` });
  };

  /* ═════ مشتریان ═════ */
  // مجموعهٔ اصلی مشتری در AppState «accounts» است (Account = Customer)؛ customers فقط در نبود آن.
  const customers = (arr(state.accounts).length ? arr(state.accounts) : arr(state.customers)).filter(alive);
  coverage.customers = customers.length;
  if (!customers.length) notEvaluated.push({ domain: 'CUSTOMER', reason: 'هیچ مشتری‌ای در داده موجود نیست.' });
  const label = (c: Rec) => String(c.name || c.company || c.code || c.id);
  const natId = (c: Rec) => c.nationalCode ?? c.nationalId;
  const mobilesOf = (c: Rec): string[] => [c.mobile, c.phone, ...arr(c.contacts).flatMap(x => [x.mobile, x.phone])].filter(v => v && looksLikeMobile(v)).map(String);

  for (const c of customers) {
    const nid = natId(c);
    if (nid !== undefined && nid !== null && String(nid).trim() !== '') {
      const r = checkIranNationalId(nid);
      if (!r.valid) add({ ruleCode: 'CUST_NATIONAL_ID_INVALID', domain: 'CUSTOMER', severity: 'HIGH', confidence: 'DETERMINISTIC', entityType: 'customer', entityId: c.id, entityLabel: label(c),
        message: r.kind ? 'کد/شناسهٔ ملی چک‌سام معتبر ندارد.' : 'طول کد ملی نه ۱۰ رقم است نه ۱۱ رقم.', evidence: { value: String(nid), length: digitsOnly(nid).length }, suggestion: 'اصلاح در ERP و همگام‌سازی مجدد.' });
    }
    for (const m of mobilesOf(c)) {
      if (!normalizeIranMobile(m)) add({ ruleCode: 'CUST_MOBILE_INVALID', domain: 'CUSTOMER', severity: 'MEDIUM', confidence: 'DETERMINISTIC', entityType: 'customer', entityId: c.id, entityLabel: label(c), message: 'شمارهٔ موبایل ناقص/نامعتبر است.', evidence: { value: m } });
    }
    if ((nid === undefined || nid === null || String(nid).trim() === '') && !c.economicCode) {
      add({ ruleCode: 'CUST_IDENTITY_MISSING', domain: 'CUSTOMER', severity: 'LOW', confidence: 'DETERMINISTIC', entityType: 'customer', entityId: c.id, entityLabel: label(c), message: 'نه کد ملی ثبت شده نه کد اقتصادی.' });
    }
  }

  // تکراری‌ها: کلید سخت (کد ملی، کد اقتصادی، موبایل معتبر) و کلید نرم (نام)
  const groups = new Map<string, { rule: string; hard: boolean; ids: Set<string> }>();
  const push = (key: string, rule: string, hard: boolean, id: string) => { const g = groups.get(key) || { rule, hard, ids: new Set<string>() }; g.ids.add(id); groups.set(key, g); };
  for (const c of customers) {
    const nd = digitsOnly(natId(c)); if (nd.length >= 10) push('N:' + nd, 'CUST_DUPLICATE_NATIONAL_ID', true, c.id);
    const ec = digitsOnly(c.economicCode); if (ec.length >= 8) push('E:' + ec, 'CUST_DUPLICATE_ECONOMIC_CODE', true, c.id);
    for (const m of new Set(mobilesOf(c).map(normalizeIranMobile).filter(Boolean) as string[])) push('M:' + m, 'CUST_DUPLICATE_MOBILE', true, c.id);
    const nm = norm(c.name || c.company); if (nm.length >= 4) push('T:' + nm, 'CUST_DUPLICATE_NAME', false, c.id);
  }
  const byId = new Map(customers.map(c => [c.id, c]));
  for (const [key, g] of groups) {
    if (g.ids.size < 2) continue;
    const ids = [...g.ids];
    add({ ruleCode: g.rule, domain: 'CUSTOMER', severity: g.hard ? 'HIGH' : 'MEDIUM', confidence: g.hard ? 'DETERMINISTIC' : 'HEURISTIC', entityType: 'customer', entityId: ids[0],
      entityLabel: ids.map(i => label(byId.get(i)!)).join(' ، '), message: `${ids.length} مشتری با یک ${g.hard ? 'شناسهٔ یکسان' : 'نام یکسان'} ثبت شده‌اند.`, evidence: { key: key.slice(2), customerIds: ids }, suggestion: 'ادغام یا اصلاح در ERP.' });
  }

  /* ═════ مسیر/زون مشتری ═════ */
  const zones = arr(state.geoZones).filter(z => z.status !== 'ARCHIVED' && alive(z));
  const assignments = arr(state.zoneAssignments).filter(a => a.entityType === 'CUSTOMER' && !a.effectiveTo);
  if (!customers.length) { /* پیش‌تر ثبت شد */ }
  else if (!zones.length) notEvaluated.push({ domain: 'ROUTE', reason: 'هیچ مسیر/زون فعالی تعریف نشده؛ بررسی مسیر مشتریان ممکن نیست.' });
  else {
    const geomOf = new Map<string, GeoPolygonGeometry>();
    const versions = arr(state.zoneGeometryVersions);
    for (const z of zones) {
      const v = versions.find(x => x.id === z.currentGeometryVersionId) || versions.filter(x => x.zoneId === z.id && !x.effectiveTo).sort((a, b) => b.version - a.version)[0];
      if (v?.geometry) geomOf.set(z.id, v.geometry);
    }
    const zoneById = new Map(zones.map(z => [z.id, z]));
    const zoneOfCustomer = new Map<string, string>();
    for (const a of assignments) if (zoneById.has(a.zoneId)) zoneOfCustomer.set(a.entityId, a.zoneId);
    for (const c of customers) if (!zoneOfCustomer.has(c.id) && c.territoryId && zoneById.has(c.territoryId)) zoneOfCustomer.set(c.id, c.territoryId);
    coverage.zones = zones.length; coverage.customersWithZone = zoneOfCustomer.size;

    const points = new Map<string, GeoPoint>();
    for (const c of customers) {
      const p = readCustomerGeoPoint(c);
      if (p) points.set(c.id, p);
    }
    const inBounds = (p: GeoPoint) => p.latitude >= o.bounds.minLat && p.latitude <= o.bounds.maxLat && p.longitude >= o.bounds.minLng && p.longitude <= o.bounds.maxLng;

    for (const c of customers) {
      const zoneId = zoneOfCustomer.get(c.id);
      const p = points.get(c.id);
      if (!zoneId) add({ ruleCode: 'CUST_NO_ROUTE', domain: 'ROUTE', severity: 'HIGH', confidence: 'DETERMINISTIC', entityType: 'customer', entityId: c.id, entityLabel: label(c), message: 'مشتری به هیچ مسیر/زونی تخصیص ندارد.', suggestion: 'تخصیص دستی یا خودکار بر پایهٔ مختصات.' });
      if (!p) { add({ ruleCode: 'CUST_NO_COORDS', domain: 'ROUTE', severity: 'LOW', confidence: 'DETERMINISTIC', entityType: 'customer', entityId: c.id, entityLabel: label(c), message: 'مختصات معتبر ندارد؛ تطبیق مسیر ممکن نیست (نامشخص).' }); continue; }
      if (!inBounds(p)) { add({ ruleCode: 'CUST_COORDS_SUSPECT', domain: 'ROUTE', severity: 'MEDIUM', confidence: 'HEURISTIC', entityType: 'customer', entityId: c.id, entityLabel: label(c), message: 'مختصات خارج از محدودهٔ جغرافیایی تعریف‌شده است (احتمال جابه‌جایی طول/عرض).', evidence: { ...p } }); continue; }
      const g = zoneId ? geomOf.get(zoneId) : undefined;
      if (zoneId && g && !isPointInsideZone(p, g)) {
        const ring = g.coordinates?.[0] || [];
        const cx = ring.reduce((s, q) => s + q[0], 0) / (ring.length || 1), cy = ring.reduce((s, q) => s + q[1], 0) / (ring.length || 1);
        add({ ruleCode: 'CUST_OUTSIDE_ROUTE_ZONE', domain: 'ROUTE', severity: 'HIGH', confidence: 'DETERMINISTIC', entityType: 'customer', entityId: c.id, entityLabel: label(c),
          message: `مشتری خارج از محدودهٔ مسیر «${zoneById.get(zoneId)?.name || zoneId}» قرار دارد.`, evidence: { zoneId, distanceToZoneCenterKm: Math.round(calculateHaversineDistanceKm(p, { longitude: cx, latitude: cy }) * 10) / 10 }, suggestion: 'انتقال به مسیر درست یا اصلاح مختصات.' });
      }
    }
    // دورافتاده نسبت به هم‌مسیری‌ها (برای مسیرهای بدون چندضلعی یا مکمل آن)
    const members = new Map<string, string[]>();
    for (const [cid, zid] of zoneOfCustomer) if (points.has(cid) && inBounds(points.get(cid)!)) members.set(zid, [...(members.get(zid) || []), cid]);
    for (const [zid, ids] of members) {
      if (ids.length < o.minPeers) continue;
      const lat = median(ids.map(i => points.get(i)!.latitude)), lng = median(ids.map(i => points.get(i)!.longitude));
      const center = { latitude: lat, longitude: lng };
      const dist = ids.map(i => ({ id: i, km: calculateHaversineDistanceKm(points.get(i)!, center) }));
      const med = median(dist.map(d => d.km));
      const limit = Math.max(o.minFarKm, med * o.farFactor);
      for (const d of dist) if (d.km > limit && !issues.some(x => x.ruleCode === 'CUST_OUTSIDE_ROUTE_ZONE' && x.entityId === d.id)) {
        const c = byId.get(d.id)!;
        add({ ruleCode: 'CUST_FAR_FROM_ROUTE_PEERS', domain: 'ROUTE', severity: 'MEDIUM', confidence: 'HEURISTIC', entityType: 'customer', entityId: c.id, entityLabel: label(c),
          message: `مشتری از مرکز مسیر «${zoneById.get(zid)?.name || zid}» بسیار دورتر از سایر مشتریان همان مسیر است.`, evidence: { zoneId: zid, distanceKm: Math.round(d.km * 10) / 10, medianKm: Math.round(med * 10) / 10, limitKm: Math.round(limit * 10) / 10 } });
      }
    }
  }

  /* ═════ کالا: گروه‌بندی و ناسازگاری‌ها ═════ */
  const products = arr(state.externalProducts).filter(alive);
  coverage.products = products.length;
  if (!products.length) notEvaluated.push({ domain: 'PRODUCT', reason: 'کالایی (externalProducts) در داده موجود نیست.' });
  else {
    const pl = (p: Rec) => String(p.name || p.code || p.id);
    const grp = (p: Rec) => norm(p.category ?? p.groupName ?? p.productGroupId);
    for (const p of products) if (!grp(p)) add({ ruleCode: 'PROD_NO_GROUP', domain: 'PRODUCT', severity: 'MEDIUM', confidence: 'DETERMINISTIC', entityType: 'product', entityId: p.id, entityLabel: pl(p), message: 'کالا گروه ندارد.' });
    const codeMap = new Map<string, string[]>();
    for (const p of products) { const k = norm(p.sku || p.code); if (k) codeMap.set(k, [...(codeMap.get(k) || []), p.id]); }
    for (const [k, ids] of codeMap) if (ids.length > 1) add({ ruleCode: 'PROD_DUPLICATE_CODE', domain: 'PRODUCT', severity: 'HIGH', confidence: 'DETERMINISTIC', entityType: 'product', entityId: ids[0], entityLabel: ids.join(' ، '), message: `${ids.length} کالا کد/SKU یکسان دارند.`, evidence: { code: k, productIds: ids } });
    for (const p of products) {
      const price = Number(p.basePrice ?? p.unitPrice), cost = Number(p.costPrice);
      if (Number.isFinite(price) && price <= 0) add({ ruleCode: 'PROD_PRICE_NONPOSITIVE', domain: 'PRODUCT', severity: 'MEDIUM', confidence: 'DETERMINISTIC', entityType: 'product', entityId: p.id, entityLabel: pl(p), message: 'قیمت پایه صفر یا منفی است.', evidence: { price } });
      if (Number.isFinite(price) && Number.isFinite(cost) && price > 0 && cost > price) add({ ruleCode: 'PROD_COST_ABOVE_PRICE', domain: 'PRODUCT', severity: 'LOW', confidence: 'DETERMINISTIC', entityType: 'product', entityId: p.id, entityLabel: pl(p), message: 'بهای تمام‌شده از قیمت فروش بیشتر است.', evidence: { price, cost } });
    }
    // گروه‌بندی مشکوک: توکن نام (کلمهٔ اول/دوم) که اکثریت قاطع کالاهایش در گروه X است ولی این کالا در گروه دیگری است
    const tokens = (p: Rec) => norm(p.name).split(' ').filter(t => t.length >= 3).slice(0, 2);
    const tokenGroups = new Map<string, Map<string, number>>();
    for (const p of products) { const g = grp(p); if (!g) continue; for (const t of tokens(p)) { const m = tokenGroups.get(t) || new Map<string, number>(); m.set(g, (m.get(g) || 0) + 1); tokenGroups.set(t, m); } }
    for (const p of products) {
      const g = grp(p); if (!g) continue;
      let best: { token: string; group: string; share: number; n: number } | null = null;
      for (const t of tokens(p)) {
        const m = tokenGroups.get(t); if (!m) continue;
        const total = [...m.values()].reduce((a, b) => a + b, 0);
        if (total < o.productMinSamples) continue;
        const [topG, topN] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
        const share = topN / total;
        if (topG !== g && share >= o.productMajority && (!best || share > best.share)) best = { token: t, group: topG, share, n: total };
      }
      if (best) add({ ruleCode: 'PROD_GROUP_SUSPECT', domain: 'PRODUCT', severity: 'MEDIUM', confidence: 'HEURISTIC', entityType: 'product', entityId: p.id, entityLabel: pl(p),
        message: `کالاهای با عبارت «${best.token}» عمدتاً در گروه «${best.group}» هستند ولی این کالا در «${g}» ثبت شده.`, evidence: { token: best.token, currentGroup: g, majorityGroup: best.group, share: Math.round(best.share * 100) / 100, samples: best.n }, suggestion: 'بازبینی گروه کالا در ERP.' });
    }
  }

  /* ═════ کدینگ حسابداری ═════ */
  const coa = arr(state.coaMirror);
  coverage.accounts = coa.length;
  const natureRules = o.natureRules || DEFAULT_NATURE_RULES;
  if (!coa.length) notEvaluated.push({ domain: 'COA', reason: 'کدینگ حسابداری (coaMirror) در داده موجود نیست.' });
  else {
    const byCode = new Map<string, Rec[]>();
    for (const a of coa) byCode.set(String(a.code), [...(byCode.get(String(a.code)) || []), a]);
    const al = (a: Rec) => `${a.code} ${a.name}`;
    for (const [code, list] of byCode) if (list.length > 1) add({ ruleCode: 'COA_DUPLICATE_CODE', domain: 'COA', severity: 'HIGH', confidence: 'DETERMINISTIC', entityType: 'ledgerAccount', entityId: list[0].id, entityLabel: list.map(al).join(' ، '), message: 'یک کد حساب برای چند حساب ثبت شده است.', evidence: { code } });
    for (const a of coa) {
      const name = norm(a.name);
      const parent = a.parentCode ? byCode.get(String(a.parentCode))?.[0] : null;
      if (a.parentCode && !parent) add({ ruleCode: 'COA_ORPHAN_PARENT', domain: 'COA', severity: 'MEDIUM', confidence: 'DETERMINISTIC', entityType: 'ledgerAccount', entityId: a.id, entityLabel: al(a), message: 'کد حساب والد در کدینگ نیست.', evidence: { parentCode: a.parentCode } });
      if (parent && Number(a.level) !== Number(parent.level) + 1) add({ ruleCode: 'COA_LEVEL_MISMATCH', domain: 'COA', severity: 'LOW', confidence: 'DETERMINISTIC', entityType: 'ledgerAccount', entityId: a.id, entityLabel: al(a), message: 'سطح حساب با سطح والد سازگار نیست.', evidence: { level: a.level, parentLevel: parent.level } });
      if (parent && a.nature && parent.nature && a.nature !== parent.nature && a.nature !== 'BOTH' && parent.nature !== 'BOTH' && !hasAny(name, CONTRA_KEYWORDS)) {
        add({ ruleCode: 'COA_NATURE_PARENT_CONFLICT', domain: 'COA', severity: 'MEDIUM', confidence: 'HEURISTIC', entityType: 'ledgerAccount', entityId: a.id, entityLabel: al(a), message: `ماهیت حساب (${natureFa(a.nature)}) با ماهیت والد (${natureFa(parent.nature)}) متفاوت است.`, evidence: { nature: a.nature, parentNature: parent.nature } });
      }
      if (hasAny(name, CONTRA_KEYWORDS)) continue;
      const rule = natureRules.find(r => hasAny(name, r.keywords));
      if (rule && a.nature && a.nature !== 'BOTH' && a.nature !== rule.expected) {
        add({ ruleCode: 'COA_NATURE_MISMATCH', domain: 'COA', severity: 'HIGH', confidence: 'HEURISTIC', entityType: 'ledgerAccount', entityId: a.id, entityLabel: al(a),
          message: `«${a.name}» با ماهیت ${natureFa(a.nature)} ثبت شده؛ حساب‌هایی از نوع «${rule.label}» معمولاً ${natureFa(rule.expected)} هستند.`, evidence: { nature: a.nature, expected: rule.expected, group: rule.label }, suggestion: 'بازبینی ماهیت حساب در ERP.' });
      }
    }
  }

  /* ═════ اسناد حسابداری ═════ */
  const lines = arr(state.journalLines).filter(alive);
  coverage.journalLines = lines.length;
  if (!lines.length) notEvaluated.push({ domain: 'JOURNAL', reason: 'سطر سند حسابداری (journalLines) در داده موجود نیست.' });
  else {
    const acctById = new Map<string, Rec>(), acctByCode = new Map<string, Rec>();
    for (const a of coa) { acctById.set(String(a.id), a); acctByCode.set(String(a.code), a); }
    if (!coa.length) notEvaluated.push({ domain: 'JOURNAL', rule: 'JRN_*_ACCOUNT', reason: 'بدون کدینگ، بررسی حساب سطرها ممکن نیست.' });
    const docs = new Map<string, Rec[]>();
    const net = new Map<string, number>();
    for (const l of lines) {
      const doc = String(l.documentId ?? l.journalEntryId ?? l.documentNumber ?? '');
      if (doc) docs.set(doc, [...(docs.get(doc) || []), l]);
      const dr = Number(l.debitAmount) || 0, cr = Number(l.creditAmount) || 0;
      const acc = acctById.get(String(l.ledgerAccountId)) || acctByCode.get(String(l.ledgerAccountCode ?? l.externalAccountCode ?? ''));
      const lid = String(l.id ?? `${doc}:${l.lineNo ?? ''}`);
      if (dr > 0 && cr > 0) add({ ruleCode: 'JRN_LINE_BOTH_SIDES', domain: 'JOURNAL', severity: 'MEDIUM', confidence: 'DETERMINISTIC', entityType: 'journalLine', entityId: lid, entityLabel: doc || lid, message: 'سطر هم بدهکار دارد هم بستانکار.', evidence: { debit: dr, credit: cr } });
      if (dr < 0 || cr < 0) add({ ruleCode: 'JRN_LINE_NEGATIVE', domain: 'JOURNAL', severity: 'MEDIUM', confidence: 'DETERMINISTIC', entityType: 'journalLine', entityId: lid, entityLabel: doc || lid, message: 'مبلغ منفی در سطر سند.', evidence: { debit: dr, credit: cr } });
      if (coa.length) {
        if (!acc) add({ ruleCode: 'JRN_LINE_ACCOUNT_UNKNOWN', domain: 'JOURNAL', severity: 'HIGH', confidence: 'DETERMINISTIC', entityType: 'journalLine', entityId: lid, entityLabel: doc || lid, message: 'حساب سطر در کدینگ حسابداری یافت نشد.', evidence: { ledgerAccountId: l.ledgerAccountId ?? null } });
        else {
          if (acc.isActive === false) add({ ruleCode: 'JRN_LINE_ACCOUNT_INACTIVE', domain: 'JOURNAL', severity: 'LOW', confidence: 'DETERMINISTIC', entityType: 'journalLine', entityId: lid, entityLabel: doc || lid, message: `سند روی حساب غیرفعال «${acc.name}» خورده است.` });
          if (Number(acc.level) && Number(acc.level) < 4 && coa.some(x => x.parentCode === acc.code)) add({ ruleCode: 'JRN_LINE_ON_PARENT_ACCOUNT', domain: 'JOURNAL', severity: 'MEDIUM', confidence: 'DETERMINISTIC', entityType: 'journalLine', entityId: lid, entityLabel: doc || lid, message: `سند روی حساب گروه/کل «${acc.name}» که زیرمجموعه دارد خورده است.` });
          const desc = norm(l.description ?? l.memo ?? l.remarks ?? '');
          if (desc) for (const r of o.descriptionRules || DEFAULT_DESCRIPTION_RULES) {
            if (hasAny(desc, r.descAny) && !hasAny(norm(acc.name), r.accountAny)) {
              add({ ruleCode: 'JRN_DESC_ACCOUNT_MISMATCH', domain: 'JOURNAL', severity: 'MEDIUM', confidence: 'HEURISTIC', entityType: 'journalLine', entityId: lid, entityLabel: doc || lid,
                message: `شرح سطر به «${r.topic}» اشاره دارد ولی حساب «${acc.name}» با آن هم‌خوان به نظر نمی‌رسد.`, evidence: { description: String(l.description ?? l.memo ?? l.remarks), accountCode: acc.code, accountName: acc.name, topic: r.topic }, suggestion: 'بازبینی حساب سند.' });
              break;
            }
          }
          if (acc.nature && acc.nature !== 'BOTH' && !['VOIDED', 'DRAFT'].includes(String(l.status || '').toUpperCase()) && !l.isVoided) net.set(String(acc.id), (net.get(String(acc.id)) || 0) + dr - cr);
        }
      }
    }
    for (const [doc, ls] of docs) {
      const dr = ls.reduce((s, l) => s + (Number(l.debitAmount) || 0), 0), cr = ls.reduce((s, l) => s + (Number(l.creditAmount) || 0), 0);
      if (Math.abs(dr - cr) > 0.5) add({ ruleCode: 'JRN_DOC_UNBALANCED', domain: 'JOURNAL', severity: 'HIGH', confidence: 'DETERMINISTIC', entityType: 'journalDocument', entityId: doc, entityLabel: doc, message: 'جمع بدهکار و بستانکار سند برابر نیست.', evidence: { debit: dr, credit: cr, diff: dr - cr } });
    }
    for (const [aid, v] of net) {
      const a = acctById.get(aid)!;
      if ((a.nature === 'DEBIT' && v < 0) || (a.nature === 'CREDIT' && v > 0)) add({ ruleCode: 'COA_ABNORMAL_BALANCE', domain: 'COA', severity: 'MEDIUM', confidence: 'HEURISTIC', entityType: 'ledgerAccount', entityId: a.id, entityLabel: `${a.code} ${a.name}`, message: `مانده حساب خلاف ماهیت (${natureFa(a.nature)}) است؛ احتمال ثبت در حساب اشتباه یا ماهیت نادرست.`, evidence: { net: v, nature: a.nature } });
    }
  }

  const byDomain: Record<QualityDomain, number> = { CUSTOMER: 0, ROUTE: 0, PRODUCT: 0, COA: 0, JOURNAL: 0 };
  for (const [rule, n] of Object.entries(ruleCounts)) { const d = issues.find(i => i.ruleCode === rule)?.domain; if (d) byDomain[d] += n; }
  return { issues, byDomain, byRule: ruleCounts, coverage, notEvaluated };
}

function median(xs: number[]): number { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; }
const natureFa = (n: string) => (n === 'DEBIT' ? 'بدهکار' : n === 'CREDIT' ? 'بستانکار' : 'هر دو');

/** برچسب فارسی قواعد برای UI. */
export const QUALITY_RULE_LABELS: Record<string, string> = {
  CUST_NATIONAL_ID_INVALID: 'کد/شناسهٔ ملی نامعتبر', CUST_MOBILE_INVALID: 'موبایل نامعتبر', CUST_IDENTITY_MISSING: 'بدون کد ملی/اقتصادی',
  CUST_DUPLICATE_NATIONAL_ID: 'تکراری (کد ملی)', CUST_DUPLICATE_ECONOMIC_CODE: 'تکراری (کد اقتصادی)', CUST_DUPLICATE_MOBILE: 'تکراری (موبایل)', CUST_DUPLICATE_NAME: 'تکراری (نام)',
  CUST_NO_ROUTE: 'مشتری بدون مسیر', CUST_NO_COORDS: 'مشتری بدون مختصات', CUST_COORDS_SUSPECT: 'مختصات مشکوک', CUST_OUTSIDE_ROUTE_ZONE: 'مشتری خارج از محدودهٔ مسیر', CUST_FAR_FROM_ROUTE_PEERS: 'مشتری دورافتاده از مسیر',
  PROD_NO_GROUP: 'کالا بدون گروه', PROD_DUPLICATE_CODE: 'کد کالا تکراری', PROD_PRICE_NONPOSITIVE: 'قیمت غیرمثبت', PROD_COST_ABOVE_PRICE: 'بها بیشتر از قیمت', PROD_GROUP_SUSPECT: 'گروه‌بندی مشکوک کالا',
  COA_DUPLICATE_CODE: 'کد حساب تکراری', COA_ORPHAN_PARENT: 'حساب بدون والد', COA_LEVEL_MISMATCH: 'سطح حساب ناسازگار', COA_NATURE_MISMATCH: 'ماهیت حساب نادرست', COA_NATURE_PARENT_CONFLICT: 'ماهیت مغایر والد', COA_ABNORMAL_BALANCE: 'مانده خلاف ماهیت',
  JRN_DOC_UNBALANCED: 'سند نامتوازن', JRN_LINE_BOTH_SIDES: 'سطر دوطرفه', JRN_LINE_NEGATIVE: 'مبلغ منفی', JRN_LINE_ACCOUNT_UNKNOWN: 'حساب سطر ناشناخته', JRN_LINE_ACCOUNT_INACTIVE: 'حساب غیرفعال', JRN_LINE_ON_PARENT_ACCOUNT: 'سند روی حساب کل', JRN_DESC_ACCOUNT_MISMATCH: 'شرح و حساب ناهم‌خوان'
};
