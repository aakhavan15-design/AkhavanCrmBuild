/**
 * AKHAVAN CRM — Lightweight Product Analytics (Audit remediation)
 * --------------------------------------------------------------
 * هدف: پوشش نقاط عطف کلیدی funnel بدون وابستگی به سرویس خارجی.
 * رویدادها در localStorage با cap نگهداری می‌شوند و در صورت وجود
 * window.__AKHAVAN_ANALYTICS__ یا dataLayer به بیرون ارسال می‌گردند.
 *
 * استفاده:
 *   import { track } from '../lib/analytics';
 *   track('cta_click', { surface: 'empty_state', action: 'create_lead' });
 */

export type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

const MAX_BUFFER = 200;
const STORAGE_KEY = 'akhavan_analytics_events_v1';

function safeNow() {
  return new Date().toISOString();
}

function readBuffer(): Array<{ name: string; payload: AnalyticsPayload; ts: string }> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBuffer(events: Array<{ name: string; payload: AnalyticsPayload; ts: string }>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_BUFFER)));
  } catch {
    /* quota or private mode — silent */
  }
}

/**
 * ثبت رویداد محصول. هیچ‌گاه UI را block نمی‌کند.
 */
export function track(name: string, payload: AnalyticsPayload = {}): void {
  if (typeof window === 'undefined') return;

  const event = {
    name: String(name).slice(0, 80),
    payload: { ...payload },
    ts: safeNow(),
  };

  // 1. Buffer محلی
  const buf = readBuffer();
  buf.push(event);
  writeBuffer(buf);

  // 2. Console در حالت توسعه
  if (import.meta.env?.DEV || (window as any).__AKHAVAN_DEBUG_ANALYTICS__) {
    // eslint-disable-next-line no-console
    console.debug('[AKHAVAN][analytics]', event.name, event.payload);
  }

  // 3. Hook خارجی (PostHog / GTM / custom)
  try {
    const external = (window as any).__AKHAVAN_ANALYTICS__;
    if (typeof external === 'function') {
      external(event.name, event.payload);
    } else if (Array.isArray((window as any).dataLayer)) {
      (window as any).dataLayer.push({ event: event.name, ...event.payload });
    }
  } catch {
    /* never break the app */
  }
}

/** رویدادهای استاندارد پیشنهادی برای instrument کردن */
export const AnalyticsEvents = {
  PAGE_VIEW: 'page_view',
  CTA_CLICK: 'cta_click',
  EMPTY_STATE_ACTION: 'empty_state_action',
  ERROR_BOUNDARY: 'error_boundary',
  SEARCH_OPEN: 'search_open',
  COMMAND_PALETTE: 'command_palette',
  THEME_CHANGE: 'theme_change',
  EXPORT: 'export',
  FILTER_APPLY: 'filter_apply',
  RECORD_CREATE: 'record_create',
  RECORD_UPDATE: 'record_update',
  LOGIN_SUCCESS: 'login_success',
  LOGOUT: 'logout',
} as const;

/** پاک‌کردن بافر (برای تست یا GDPR) */
export function clearAnalyticsBuffer(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** خواندن بافر برای دیباگ یا ارسال دسته‌ای */
export function getAnalyticsBuffer() {
  return readBuffer();
}
