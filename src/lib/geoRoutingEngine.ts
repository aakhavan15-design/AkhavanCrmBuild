import type { GeoPoint } from '../types.ts';

export interface RouteStop {
  id: string;
  name: string;
  point: GeoPoint;
  priority?: number;
}

export interface OptimizedRouteResult {
  orderedStops: RouteStop[];
  totalDistanceKm: number;
  estimatedDriveMinutes: number;
}

/**
 * فرمول دقیق هاورساین (Haversine Formula) برای محاسبه فاصله دو نقطه بر روی کره زمین به کیلومتر
 */
export function calculateHaversineDistanceKm(p1: GeoPoint, p2: GeoPoint): number {
  const R = 6371; // شعاع زمین به کیلومتر
  const dLat = ((p2.latitude - p1.latitude) * Math.PI) / 180;
  const dLon = ((p2.longitude - p1.longitude) * Math.PI) / 180;
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.latitude * Math.PI) / 180) *
      Math.cos((p2.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

/**
 * الگوریتم نزدیک‌ترین همسایه (Nearest-Neighbor Heuristic) برای ترتیب‌بندی بهینه مراجعات ویزیتور و خودروی توزیع
 */
export function optimizeRouteStops(
  origin: GeoPoint,
  stops: RouteStop[]
): OptimizedRouteResult {
  if (!stops || stops.length === 0) {
    return { orderedStops: [], totalDistanceKm: 0, estimatedDriveMinutes: 0 };
  }

  const unvisited = [...stops];
  const ordered: RouteStop[] = [];
  let currentPoint = origin;
  let totalDistance = 0;

  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const d = calculateHaversineDistanceKm(currentPoint, unvisited[i].point);
      if (d < minDistance) {
        minDistance = d;
        nearestIndex = i;
      }
    }

    const nextStop = unvisited.splice(nearestIndex, 1)[0];
    ordered.push(nextStop);
    totalDistance += minDistance;
    currentPoint = nextStop.point;
  }

  // سرعت متوسط شهری در پخش مویرگی: ۲۵ کیلومتر بر ساعت + ۵ دقیقه زمان توقف در هر ایستگاه
  const driveMinutes = Math.round((totalDistance / 25) * 60) + (ordered.length * 5);

  return {
    orderedStops: ordered,
    totalDistanceKm: Math.round(totalDistance * 10) / 10,
    estimatedDriveMinutes: driveMinutes
  };
}
