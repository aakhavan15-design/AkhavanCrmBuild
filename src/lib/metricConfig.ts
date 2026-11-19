/**
 * metricConfig — configurable thresholds (avoid hardcode) 2026 rule #3
 * Read from settings.orgConfig with safe defaults.
 */
export interface ChurnThresholds {
  daysCritical: number;
  daysHigh: number;
  daysWatch: number;
  newAccountGraceDays: number;
  revenueDropHighPercent: number;
  revenueDropMediumPercent: number;
  inactivityDays: number;
  overdueCriticalDays: number;
  overdueWarningDays: number;
  scoreCritical: number;
  scoreHigh: number;
  scoreMedium: number;
}

export interface CollectionRiskThresholds {
  overdueCriticalDays: number;
  overdueHighDays: number;
  overdueMediumDays: number;
  creditRatioCritical: number;
  creditRatioHigh: number;
  creditRatioMedium: number;
  bouncedChequePoints: number;
  maxBouncedPoints: number;
  scoreCritical: number;
  scoreHigh: number;
  scoreMedium: number;
}

export type MetricThresholds = {
  quoteMarginFloorPercent: number;
  slaAtRiskHours: number;
  agingBucketDays: number[];
  churnThresholds: ChurnThresholds;
  collectionRiskThresholds: CollectionRiskThresholds;
};

const DEFAULT_CHURN_THRESHOLDS: ChurnThresholds = {
  daysCritical: 90,
  daysHigh: 60,
  daysWatch: 35,
  newAccountGraceDays: 45,
  revenueDropHighPercent: 60,
  revenueDropMediumPercent: 35,
  inactivityDays: 45,
  overdueCriticalDays: 60,
  overdueWarningDays: 25,
  scoreCritical: 75,
  scoreHigh: 50,
  scoreMedium: 25,
};

const DEFAULT_COLLECTION_RISK_THRESHOLDS: CollectionRiskThresholds = {
  overdueCriticalDays: 60,
  overdueHighDays: 30,
  overdueMediumDays: 15,
  creditRatioCritical: 1.0,
  creditRatioHigh: 0.7,
  creditRatioMedium: 0.4,
  bouncedChequePoints: 15,
  maxBouncedPoints: 30,
  scoreCritical: 70,
  scoreHigh: 45,
  scoreMedium: 20,
};

const DEFAULTS: MetricThresholds = {
  quoteMarginFloorPercent: 15,
  slaAtRiskHours: 24,
  agingBucketDays: [0, 30, 60, 90, 120],
  churnThresholds: DEFAULT_CHURN_THRESHOLDS,
  collectionRiskThresholds: DEFAULT_COLLECTION_RISK_THRESHOLDS,
};

function nonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function numericOverrides<T extends object>(defaults: T, raw: unknown): Partial<T> {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const key of Object.keys(defaults)) {
    const value = nonNegativeNumber(input[key]);
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}

export function getChurnThresholdOverrides(settings?: Record<string, unknown> | null): Partial<ChurnThresholds> {
  const org = settings?.orgConfig as { churnThresholds?: unknown } | undefined;
  return numericOverrides(DEFAULT_CHURN_THRESHOLDS, org?.churnThresholds);
}

export function getMetricThresholds(settings?: Record<string, unknown> | null): MetricThresholds {
  const org = ((settings?.orgConfig && typeof settings.orgConfig === 'object' ? settings.orgConfig : {}) as Record<string, unknown>);
  const margin = nonNegativeNumber(org.quoteMarginFloorPercent);
  const slaHours = nonNegativeNumber(org.slaAtRiskHours);
  return {
    quoteMarginFloorPercent: margin ?? DEFAULTS.quoteMarginFloorPercent,
    slaAtRiskHours: slaHours ?? DEFAULTS.slaAtRiskHours,
    agingBucketDays: Array.isArray(org.agingBucketDays) && org.agingBucketDays.length > 0 && org.agingBucketDays.every(v => typeof v === 'number' && Number.isInteger(v) && v >= 0)
      ? [...new Set(org.agingBucketDays as number[])].sort((a, b) => a - b)
      : [...DEFAULTS.agingBucketDays],
    churnThresholds: { ...DEFAULT_CHURN_THRESHOLDS, ...getChurnThresholdOverrides(settings) },
    collectionRiskThresholds: { ...DEFAULT_COLLECTION_RISK_THRESHOLDS, ...numericOverrides(DEFAULT_COLLECTION_RISK_THRESHOLDS, org.collectionRiskThresholds) },
  };
}

/** true when no org-level churnThresholds recorded — UI must show «پیش‌فرض سیستم». */
export function isChurnThresholdsDefault(settings?: Record<string, unknown> | null): boolean {
  return Object.keys(getChurnThresholdOverrides(settings)).length === 0;
}

export function getChurnThresholdsMeta(settings?: Record<string, unknown> | null): { effectiveFrom?: string; recordedBy?: string; recordedAt?: string } | null {
  const org = ((settings?.orgConfig && typeof settings.orgConfig === 'object' ? settings.orgConfig : {}) as Record<string, unknown>);
  const meta = org.churnThresholdsMeta;
  if (!meta || typeof meta !== 'object') return null;
  return meta as { effectiveFrom?: string; recordedBy?: string; recordedAt?: string };
}

export { DEFAULT_CHURN_THRESHOLDS };


/** Shared aging bounds — prefer this over ad-hoc arrays in Finance/Reports */
export function getAgingBucketDays(settings?: Record<string, unknown> | null): number[] {
  return getMetricThresholds(settings).agingBucketDays;
}
