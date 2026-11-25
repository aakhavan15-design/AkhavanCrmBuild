/**
 * AKHAVAN CRM — Report analytics core (spec §10–§20, §27.1, §35). Pure functions, no IndexedDB / React.
 * ONE implementation of each shared calculation (Pareto, share, growth bridge, purchase cycle, funnel) so chart,
 * card, export and drill-down cannot diverge. Missing inputs yield `null`/`UNAVAILABLE`, never 0 and never invented.
 * Metric definitions live in metricRegistry.ts; this file is the engine behind the report codes listed there.
 */
export type Num = number | null;
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const ratio = (n: number, d: number): Num => (d > 0 ? n / d : null);
const day = (iso: string) => Math.floor(Date.parse(iso) / 86400000);
const ym = (iso: string) => iso.slice(0, 7);

/** Shared Pareto (reports 1 cost, 5 customers, 10 exceptions, 11 return reasons). Negative/NaN ignored. */
export function pareto<T extends { key: string; value: number }>(items: T[]) {
  const rows = items.filter(i => fin(i.value) && i.value > 0).sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
  const total = rows.reduce((a, r) => a + r.value, 0); let run = 0;
  return { total, rows: rows.map(r => { run += r.value; return { ...r, share: r.value / total, cumulativeShare: run / total }; }) };
}
/** Top-N% contribution (report 5: "سهم ۲۰ درصد مشتریان برتر"). */
export function topPercentShare(items: { key: string; value: number }[], pct = 20): Num {
  const p = pareto(items); if (!p.rows.length) return null;
  const n = Math.max(1, Math.ceil(p.rows.length * pct / 100)); return p.rows[n - 1].cumulativeShare;
}
/** Treemap / share (report 3, 5). Shares sum to 1 over positive values. */
export const shares = (items: { key: string; value: number }[]) => pareto(items).rows.map(r => ({ key: r.key, value: r.value, share: r.share }));

/** Report 2: target is a configured setting; no target ⇒ achievement is null (not 0 %). */
export function targetAchievement(actual: Num, target: Num) {
  if (!fin(actual) || !fin(target) || target <= 0) return { actual: fin(actual) ? actual : null, target: fin(target) ? target : null, achievementPct: null as Num, gap: null as Num };
  return { actual, target, achievementPct: actual / target * 100, gap: Math.max(0, target - actual) };
}
/** Compare reconciled month-to-date sales with an explicit full-month, unsegmented target.
 * A duplicate, absent, invalid, brand-specific or territory-specific target is not a zero target.
 * Caller must supply verified facts for the exact target month; no invoice-gross fallback.
 */
export function sellerMonthlyAchievement(
  reconciledSales: readonly {key:string;value:number}[],
  targets: readonly {userId:string;periodMonth:string;revenueTargetRials:number;productBrand?:string;territoryId?:string}[],
  month:string
) {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return [];
  const salesCounts=new Map<string,number>();
  for(const row of reconciledSales)salesCounts.set(row.key,(salesCounts.get(row.key)||0)+1);
  return reconciledSales.flatMap(row=>{
    if(!row.key||row.key==='UNASSIGNED'||salesCounts.get(row.key)!==1||!fin(row.value))return [];
    const matches=targets.filter(t=>t.userId===row.key&&t.periodMonth===month&&!t.productBrand&&!t.territoryId);
    if(matches.length!==1||!fin(matches[0].revenueTargetRials)||matches[0].revenueTargetRials<=0)return [];
    const target=matches[0].revenueTargetRials;
    const calculated=targetAchievement(row.value,target);
    return calculated.achievementPct===null?[]:[{key:row.key,actual:row.value,target,achievementPct:calculated.achievementPct}];
  }).sort((a,b)=>b.achievementPct-a.achievementPct||a.key.localeCompare(b.key));
}

/** Linear end-of-period projection; always labelled forecast by the UI (spec §17). */
export function projectPeriodEnd(actualToDate: number, elapsedDays: number, totalDays: number): Num {
  return elapsedDays > 0 && totalDays >= elapsedDays ? actualToDate / elapsedDays * totalDays : null;
}
/** Growth bridge (report 2 waterfall): per-key delta prev→curr; steps sum exactly to total delta. */
export function growthBridge(prev: Record<string, number>, curr: Record<string, number>) {
  const keys = [...new Set([...Object.keys(prev), ...Object.keys(curr)])];
  const steps = keys.map(k => ({ key: k, delta: (curr[k] ?? 0) - (prev[k] ?? 0) })).filter(s => s.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const start = Object.values(prev).reduce((a, b) => a + b, 0), end = Object.values(curr).reduce((a, b) => a + b, 0);
  return { start, end, steps, balanced: Math.abs(start + steps.reduce((a, s) => a + s.delta, 0) - end) < 1e-6 };
}

export interface SalesInvoice { customerId: string; date: string; amount: number; isVoided?: boolean; isFinal?: boolean }
const realized = (xs: SalesInvoice[]) => xs.filter(i => !i.isVoided && i.isFinal !== false && fin(i.amount) && i.amount > 0);

/** Report 4: purchase cycle PER CUSTOMER (median gap). Fewer than 3 purchases ⇒ cycle null (cannot judge churn). */
export function purchaseCycle(invoices: SalesInvoice[]) {
  const byC = new Map<string, number[]>();
  for (const i of realized(invoices)) (byC.get(i.customerId) ?? byC.set(i.customerId, []).get(i.customerId)!).push(day(i.date));
  const out = new Map<string, { purchases: number; lastDay: number; cycleDays: Num }>();
  for (const [c, ds] of byC) {
    ds.sort((a, b) => a - b); const gaps = ds.slice(1).map((d, k) => d - ds[k]).filter(g => g > 0).sort((a, b) => a - b);
    const med = gaps.length ? (gaps.length % 2 ? gaps[(gaps.length - 1) / 2] : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2) : null;
    out.set(c, { purchases: ds.length, lastDay: ds[ds.length - 1], cycleDays: ds.length >= 3 ? med : null });
  }
  return out;
}
export type Lifecycle = 'NEW' | 'ACTIVE' | 'LOW_ACTIVITY' | 'AT_RISK' | 'LOST' | 'UNKNOWN';
/** Thresholds are multiples of each customer's OWN cycle (settings), not a global constant. */
export function lifecycleSegments(invoices: SalesInvoice[], asOf: string, cfg = { lowMultiple: 1.5, riskMultiple: 2, lostMultiple: 4, newWithinDays: 60 }) {
  const t = day(asOf), cyc = purchaseCycle(invoices), seg: Record<string, Lifecycle> = {};
  for (const [c, v] of cyc) {
    const since = t - v.lastDay;
    if (v.cycleDays == null) { seg[c] = v.purchases <= 2 && since <= cfg.newWithinDays ? 'NEW' : 'UNKNOWN'; continue; }
    const m = since / v.cycleDays;
    seg[c] = m <= cfg.lowMultiple ? 'ACTIVE' : m <= cfg.riskMultiple ? 'LOW_ACTIVITY' : m <= cfg.lostMultiple ? 'AT_RISK' : 'LOST';
  }
  const counts = Object.values(seg).reduce<Record<string, number>>((m, s) => (m[s] = (m[s] || 0) + 1, m), {});
  return { segments: seg, counts };
}
/** RFM with rank-based quintiles (R: fewer days = better). Customers with no purchase are absent. */
/** Monetary amount may be externally normalized by the canonical net-sales
 * calculator, while purchase frequency/recency remain invoice-based. */
export function rfm(invoices: SalesInvoice[], asOf: string, netCustomerAmounts?: Map<string, number>) {
  const t = day(asOf), rows = new Map<string, { r: number; f: number; m: number }>();
  for (const i of realized(invoices)) { const c = rows.get(i.customerId) ?? { r: Infinity, f: 0, m: 0 }; c.r = Math.min(c.r, t - day(i.date)); c.f++; c.m += i.amount; rows.set(i.customerId, c); }
  if (netCustomerAmounts) {
    for (const [customerId, value] of netCustomerAmounts)
      if (rows.has(customerId)) rows.get(customerId)!.m = value;
  }
  const ids = [...rows.keys()], n = ids.length;
  const score = (sel: (x: { r: number; f: number; m: number }) => number, higherBetter: boolean) => {
    const ord = [...ids].sort((a, b) => (higherBetter ? 1 : -1) * (sel(rows.get(a)!) - sel(rows.get(b)!)) || a.localeCompare(b));
    const s: Record<string, number> = {}; ord.forEach((id, k) => { s[id] = Math.min(5, Math.floor(k * 5 / n) + 1); }); return s;
  };
  const R = score(x => x.r, false), F = score(x => x.f, true), M = score(x => x.m, true);
  return ids.map(id => ({ customerId: id, ...rows.get(id)!, rScore: R[id], fScore: F[id], mScore: M[id] }));
}
/** Cohort retention heatmap: cohort = first-purchase month; cell = share of cohort buying in month+k. */
export function cohortRetention(invoices: SalesInvoice[]) {
  const first = new Map<string, string>(), active = new Map<string, Set<string>>();
  for (const i of realized(invoices).sort((a, b) => a.date.localeCompare(b.date))) { if (!first.has(i.customerId)) first.set(i.customerId, ym(i.date)); (active.get(i.customerId) ?? active.set(i.customerId, new Set()).get(i.customerId)!).add(ym(i.date)); }
  const off = (a: string, b: string) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5) - +a.slice(5));
  const cohorts = new Map<string, string[]>(); for (const [c, m] of first) (cohorts.get(m) ?? cohorts.set(m, []).get(m)!).push(c);
  return [...cohorts.entries()].sort().map(([month, cs]) => {
    const maxK = Math.max(0, ...cs.flatMap(c => [...active.get(c)!].map(m => off(month, m))));
    return { cohort: month, size: cs.length, retention: Array.from({ length: maxK + 1 }, (_, k) => cs.filter(c => [...active.get(c)!].some(m => off(month, m) === k)).length / cs.length) };
  });
}
/** Growth-opportunity quadrant (report 5): axes are medians of supplied values; growth null ⇒ unclassified. */
export function opportunityQuadrant(items: { key: string; value: number; growth: Num }[]) {
  const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const mv = med(items.map(i => i.value)), mg = med(items.filter(i => i.growth != null).map(i => i.growth!));
  return items.map(i => ({ key: i.key, quadrant: i.growth == null || mv == null || mg == null ? 'UNCLASSIFIED' : `${i.value >= mv ? 'HIGH' : 'LOW'}_VALUE_${i.growth >= mg ? 'HIGH' : 'LOW'}_GROWTH` }));
}

/** Report 6: field funnel. A visit counts as actual only with a recorded check-in; manual/approx location is flagged. */
export interface VisitRow { planned: boolean; checkInAt?: string; locationSource?: 'GPS' | 'MANUAL' | 'APPROX'; success?: boolean; hasOrder?: boolean; hasInvoice?: boolean }
export function visitFunnel(visits: VisitRow[]) {
  const actual = visits.filter(v => !!v.checkInAt), planned = visits.filter(v => v.planned);
  const gps = actual.filter(v => v.locationSource === 'GPS').length;
  return { planned: planned.length, actual: actual.length, successful: actual.filter(v => v.success).length, withOrder: actual.filter(v => v.hasOrder).length, invoiced: actual.filter(v => v.hasInvoice).length,
    visitToOrderRate: ratio(actual.filter(v => v.hasOrder).length, actual.length), unplannedVisits: actual.filter(v => !v.planned).length,
    gpsVerifiedShare: ratio(gps, actual.length) /* دستی/تقریبی جدا از GPS واقعی */ };
}

/** Report 10: delivery. On-time uses only rows with BOTH promised & delivered time (spec metric ON_TIME_DELIVERY_RATE). */
export interface DeliveryRow { loaded?: boolean; shipped?: boolean; delivered?: 'FULL' | 'PARTIAL' | 'FAILED' | null; promisedAt?: string; deliveredAt?: string; exceptionReason?: string; vehicleLoad?: Num; vehicleCapacity?: Num }
export function deliveryPerformance(rows: DeliveryRow[]) {
  const timed = rows.filter(r => r.promisedAt && r.deliveredAt);
  const cap = rows.filter(r => fin(r.vehicleLoad) && fin(r.vehicleCapacity) && r.vehicleCapacity! > 0);
  return { funnel: { ready: rows.length, loaded: rows.filter(r => r.loaded).length, shipped: rows.filter(r => r.shipped).length, deliveredFull: rows.filter(r => r.delivered === 'FULL').length },
    partial: rows.filter(r => r.delivered === 'PARTIAL').length, failed: rows.filter(r => r.delivered === 'FAILED').length,
    onTimeRate: ratio(timed.filter(r => Date.parse(r.deliveredAt!) <= Date.parse(r.promisedAt!)).length, timed.length), onTimeBasis: timed.length,
    capacityUtilization: cap.length ? cap.reduce((a, r) => a + r.vehicleLoad!, 0) / cap.reduce((a, r) => a + r.vehicleCapacity!, 0) : null,
    exceptions: pareto(Object.entries(rows.filter(r => r.exceptionReason).reduce<Record<string, number>>((m, r) => (m[r.exceptionReason!] = (m[r.exceptionReason!] || 0) + 1, m), {})).map(([key, value]) => ({ key, value }))) };
}

/** Report 11: amount-based and quantity-based return rates are separate (never mixed). Only effective returns count. */
export interface ReturnRow { amount: Num; quantity: Num; reason?: string; effective?: boolean }
export function returnsAnalytics(returns: ReturnRow[], eligibleSalesAmount: Num, soldQuantity: Num) {
  const eff = returns.filter(r => r.effective !== false), amt = eff.filter(r => fin(r.amount)), qty = eff.filter(r => fin(r.quantity));
  const A = amt.reduce((a, r) => a + r.amount!, 0), Q = qty.reduce((a, r) => a + r.quantity!, 0);
  return { returnedAmount: amt.length ? A : null, returnedQuantity: qty.length ? Q : null,
    amountRate: amt.length && fin(eligibleSalesAmount) ? ratio(A, eligibleSalesAmount) : null, quantityRate: qty.length && fin(soldQuantity) ? ratio(Q, soldQuantity) : null,
    reasons: pareto(Object.entries(eff.filter(r => r.reason && fin(r.amount)).reduce<Record<string, number>>((m, r) => (m[r.reason!] = (m[r.reason!] || 0) + r.amount!, m), {})).map(([key, value]) => ({ key, value }))) };
}
