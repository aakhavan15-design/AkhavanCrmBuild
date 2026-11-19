/**
 * webPush — client subscription + local/system notification bridge (2026)
 * Full Web Push when VAPID + server available; local SW showNotification as fallback.
 */
import { AuthService } from '../services/AuthService';

const STORAGE_KEY = 'akhavan-push-subscription-json';
const ENABLED_KEY = 'akhavan-push-enabled';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function getNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/serviceWorker.js');
    await navigator.serviceWorker.ready;
    return reg;
  } catch {
    return null;
  }
}

async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/v1/push/vapid-public-key', { credentials: 'same-origin' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.publicKey || data.vapidPublicKey || null;
  } catch {
    return null;
  }
}

export async function subscribeWebPush(): Promise<{ ok: boolean; reason?: string; subscription?: PushSubscription }> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  const reg = await ensureServiceWorker();
  if (!reg) return { ok: false, reason: 'no-sw' };

  const vapidKey = await fetchVapidPublicKey();
  let sub: PushSubscription | null = null;
  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      sub = existing;
    } else if (vapidKey) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
    } else {
      // No VAPID yet — still grant permission for local SW notifications
      try {
        localStorage.setItem(ENABLED_KEY, '1');
      } catch {
        /* ignore */
      }
      return { ok: true, reason: 'local-only' };
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'subscribe-failed' };
  }

  if (!sub) return { ok: false, reason: 'no-subscription' };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sub.toJSON()));
    localStorage.setItem(ENABLED_KEY, '1');
  } catch {
    /* ignore */
  }

  const token = AuthService.getAccessToken();
  if (!token) return { ok: true, reason: 'local-only', subscription: sub };
  try {
    const response = await fetch('/api/v1/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      credentials: 'same-origin',
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    if (!response.ok) return { ok: true, reason: 'local-only', subscription: sub };
  } catch {
    return { ok: true, reason: 'local-only', subscription: sub };
  }

  return { ok: true, subscription: sub };
}

export async function unsubscribeWebPush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      const token = AuthService.getAccessToken();
      if (token) {
        try {
          await fetch('/api/v1/push/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            credentials: 'same-origin',
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
        } catch {
          /* The browser can still remove its local subscription. */
        }
      }
      await sub.unsubscribe();
    }
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(ENABLED_KEY, '0');
  } catch {
    /* ignore */
  }
}

export function isPushEnabledLocally(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Show a system notification via SW (works when tab is backgrounded).
 * For fully closed app without push service, OS may still limit this.
 */
export async function showSystemNotification(payload: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  id?: string;
}): Promise<boolean> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg?.active) {
    reg.active.postMessage({ type: 'SHOW_LOCAL_NOTIFICATION', ...payload });
    return true;
  }
  // Fallback: page-visible Notification API
  try {
    new Notification(payload.title, {
      body: payload.body,
      tag: payload.tag || payload.id,
      data: { url: payload.url || '/' },
      dir: 'rtl',
      lang: 'fa',
    });
    return true;
  } catch {
    return false;
  }
}

/** Hook new in-app notification → also try system notification if enabled */
export function bridgeInAppToSystem(n: {
  id?: string;
  title?: string;
  message?: string;
  body?: string;
  linkTab?: string;
}): void {
  if (!isPushEnabledLocally()) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    // App focused — in-app UI is enough; optional soft skip
    return;
  }
  void showSystemNotification({
    title: 'اعلان جدید اخوان',
    body: 'برای مشاهده وارد سامانه شوید.',
    url: n.linkTab ? `/?tab=${n.linkTab}` : '/',
    tag: n.id,
    id: n.id,
  });
}
