/**
 * AKHAVAN CRM — App Shell + Web Push Service Worker (2026)
 * - Cache-first app shell
 * - Business/API/auth data is always network-only (/api/*, /state/*)
 * - Background Sync for offline queue
 * - Web Push → system notification when app is closed/background
 */
const CACHE_NAME = 'akhavan-crm-shell-v0.12.62-push';
const SHELL_ASSETS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

const isApiPath = (pathname) => pathname.startsWith('/api/') || pathname.includes('/state/');

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (isApiPath(url.pathname)) {
    return;
  }
  if (event.request.method === 'GET' && (event.request.mode === 'navigate' || SHELL_ASSETS.includes(url.pathname))) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const network = fetch(event.request)
          .then((res) => {
            if (res && res.ok) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'akhavan-offline-sync') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'OFFLINE_SYNC_REQUEST' }));
      })
    );
  }
});

/** Web Push — fires even when no tab is open */
self.addEventListener('push', (event) => {
  let data = {
    title: 'سامانه اخوان',
    body: 'اعلان جدید',
    url: '/',
    tag: 'akhavan-general',
    id: undefined,
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    try {
      data.body = event.data ? event.data.text() : data.body;
    } catch {
      /* ignore */
    }
  }

  const options = {
    body: data.body || data.message || 'اعلان جدید',
    icon: data.icon || '/icons/akhavan-mark-192.png',
    badge: data.badge || '/icons/akhavan-mark-192.png',
    tag: data.tag || data.id || 'akhavan-general',
    renotify: true,
    dir: 'rtl',
    lang: 'fa',
    data: {
      url: data.url || data.link || '/',
      id: data.id,
      linkTab: data.linkTab,
    },
    vibrate: data.vibrate || [80, 40, 80],
    requireInteraction: !!data.requireInteraction,
  };

  event.waitUntil(self.registration.showNotification(data.title || 'سامانه اخوان', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            url: targetUrl,
            id: event.notification.data && event.notification.data.id,
            linkTab: event.notification.data && event.notification.data.linkTab,
          });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  /** Local fallback: page can ask SW to show a system notification while in background */
  if (event.data?.type === 'SHOW_LOCAL_NOTIFICATION') {
    const { title, body, url, tag, id } = event.data;
    event.waitUntil(
      self.registration.showNotification(title || 'سامانه اخوان', {
        body: body || '',
        icon: '/icons/akhavan-mark-192.png',
        badge: '/icons/akhavan-mark-192.png',
        tag: tag || id || 'akhavan-local',
        dir: 'rtl',
        lang: 'fa',
        data: { url: url || '/', id },
      })
    );
  }
});
