/**
 * نقشهٔ حرارتی کالا × زون (گزارش فروش).
 * زون‌ها فقط از `geoZones` و انتساب‌های فعال `zoneAssignments` (مشتری←زون) می‌آیند؛ هیچ نام زون یا شهر هاردکد نیست.
 * مشتری بدون انتساب فعال در ستون «بدون زون» می‌آید تا عدد جایی پنهان نشود.
 */
export const UNASSIGNED_ZONE_LABEL = 'بدون زون';

export type HeatmapCell = { revenue: number; cost: number; profit: number; margin: number; count: number };
export type HeatmapRow = { productName: string; productId: string; zoneStats: Record<string, HeatmapCell> };
type Rec = Record<string, any>;

export function buildProductZoneHeatmap(input: {
  products: Rec[]; orders: Rec[]; zones: Rec[]; assignments: Rec[]; maxProducts?: number;
}): { zones: string[]; rows: HeatmapRow[] } {
  const zoneName = new Map<string, string>();
  for (const z of input.zones || []) if (z?.id && z.status !== 'ARCHIVED') zoneName.set(String(z.id), String(z.name || z.code || z.id));
  const customerZone = new Map<string, string>();
  for (const a of input.assignments || []) {
    if (!a || a.entityType !== 'CUSTOMER' || a.effectiveTo) continue;
    const name = zoneName.get(String(a.zoneId));
    if (name) customerZone.set(String(a.entityId), name);
  }
  const cell = (): HeatmapCell => ({ revenue: 0, cost: 0, profit: 0, margin: 0, count: 0 });
  const products = (input.products || []).slice(0, input.maxProducts ?? 6);
  const used = new Set<string>();
  const rows: HeatmapRow[] = products.map(prod => {
    const zoneStats: Record<string, HeatmapCell> = {};
    for (const ord of input.orders || []) {
      if (String(ord.status || '').toUpperCase() === 'CANCELLED') continue;
      const zone = (ord.customerId && customerZone.get(String(ord.customerId))) || UNASSIGNED_ZONE_LABEL;
      for (const line of ord.lines || []) {
        if (line.productId !== prod.id) continue;
        const rev = Number(line.lineTotal || ((line.quantity || 0) * (line.unitPrice || 0)) || 0);
        if (!(rev > 0)) continue;
        const cost = Number(line.quantity || 1) * Number(prod.costPrice || line.costPrice || 0);
        const c = (zoneStats[zone] ||= cell());
        c.revenue += rev; c.cost += cost; c.count += 1; used.add(zone);
      }
    }
    for (const c of Object.values(zoneStats)) { c.profit = c.revenue - c.cost; c.margin = c.revenue > 0 ? (c.profit / c.revenue) * 100 : 0; }
    return { productName: String(prod.name || ''), productId: String(prod.id), zoneStats };
  });
  const zones = [...zoneName.values()].filter(n => used.has(n));
  if (used.has(UNASSIGNED_ZONE_LABEL)) zones.push(UNASSIGNED_ZONE_LABEL);
  for (const r of rows) for (const z of zones) r.zoneStats[z] ||= cell();
  return { zones, rows };
}
