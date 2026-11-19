/**
 * dataTrust — 2026 rules for DEMO / Lineage / Source-status enforcement
 * Rule 5: Never present incomplete or unverified demo data as authoritative financial/KPI truth.
 * Rule 7: Prefer shared valid sources; tag every analytical surface.
 * Constitution: LIVE | LOCAL | DEMO | PARTIAL | STALE | UNAVAILABLE must be distinguishable.
 * DEMO has a permanent watermark and is never mixed with real data as authoritative truth.
 */
import type { AppState } from '../types';
import type { DataLineage } from './decisionBriefs';
import { isDemoId } from './seed';

/** Explicit source status — never coerce unknown into LIVE or zero. */
export type DataSourceStatus =
  | 'LIVE'
  | 'LOCAL'
  | 'DEMO'
  | 'PARTIAL'
  | 'STALE'
  | 'UNAVAILABLE';

export const DATA_SOURCE_STATUS_LABELS: Record<DataSourceStatus, string> = {
  LIVE: 'زنده',
  LOCAL: 'محلی',
  DEMO: 'آزمایشی',
  PARTIAL: 'ناقص',
  STALE: 'منقضی',
  UNAVAILABLE: 'در دسترس نیست',
};

export function isDemoContext(state: AppState | null | undefined): boolean {
  if (!state) return false;
  if (state.settings?.demoMode === true) return true;
  if (state.seedMetadata?.mode === 'DEMO' || state.seedMetadata?.mode === 'LOCAL_TEST') return true;
  const users = state.users || [];
  const accounts = state.accounts || [];
  return users.some(u => isDemoId(u.id)) || accounts.some(a => isDemoId(a.id));
}

/**
 * Resolve authoritative source status for an analytical/financial surface.
 * Absence of SQL/ERP connection → LOCAL or UNAVAILABLE, never fabricated LIVE.
 */
export function resolveDataSourceStatus(
  state: AppState | null | undefined,
  options?: {
    hasLiveSql?: boolean;
    hasLiveErp?: boolean;
    partial?: boolean;
    stale?: boolean;
    requiredSourcesPresent?: boolean;
  }
): DataSourceStatus {
  if (!state) return 'UNAVAILABLE';
  if (isDemoContext(state)) return 'DEMO';
  if (options?.stale === true) return 'STALE';
  if (options?.partial === true || options?.requiredSourcesPresent === false) return 'PARTIAL';
  if (options?.hasLiveSql === true || options?.hasLiveErp === true) return 'LIVE';
  // Local AppState / IndexedDB / Memory port — not live enterprise source
  return 'LOCAL';
}

export function defaultLineageForSurface(surface: 'finance' | 'operations' | 'analytics' | 'decision'): DataLineage {
  switch (surface) {
    case 'finance': return 'HYBRID';
    case 'operations': return 'CRM_LOCAL';
    case 'analytics': return 'DERIVED';
    case 'decision': return 'DERIVED';
    default: return 'CRM_LOCAL';
  }
}

export function trustNote(lineage: DataLineage, isDemo: boolean): string {
  if (isDemo) return 'داده آزمایشی — برای تصمیم مالی قطعی استفاده نشود';
  const map: Record<DataLineage, string> = {
    ERP: 'منبع رسمی سامانه مالی (آینه)',
    CRM_LOCAL: 'داده عملیاتی سامانه — سند مالی سامانه مالی نیست',
    HYBRID: 'ترکیبی: پیش‌نویس/عملیات سامانه + قطعیت در سامانه مالی',
    DERIVED: 'محاسبه‌شده از چند منبع — برای تصمیم‌گیری با احتیاط',
  };
  return map[lineage];
}

export function sourceStatusNote(status: DataSourceStatus): string {
  switch (status) {
    case 'LIVE':
      return 'منبع زنده سازمانی — قابل اتکا پس از تأیید تطبیق';
    case 'LOCAL':
      return 'منبع محلی / قرارداد درگاه داده — اتصال پایگاه داده/سامانه مالی برقرار نیست';
    case 'DEMO':
      return 'داده آزمایشی — با نشان دائمی · با داده واقعی مخلوط نشود';
    case 'PARTIAL':
      return 'پوشش ناقص منابع — شاخص‌ها ممکن است نامشخص یا محدود باشند';
    case 'STALE':
      return 'داده منقضی — همگام‌سازی مجدد لازم است';
    case 'UNAVAILABLE':
      return 'منبع در دسترس نیست — مقدار نامشخص نامشخص باقی می‌ماند';
    default:
      return 'وضعیت منبع نامشخص';
  }
}
