/**
 * Push subscription store + optional web-push send (2026)
 * Subscriptions persisted to data/push-subscriptions.json for local-first dev.
 * Set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY in env for production.
 * If keys missing, generates ephemeral keys for this process (dev only).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'push-subscriptions.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readStore() {
  ensureDir();
  if (!fs.existsSync(STORE_PATH)) return { subscriptions: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return Array.isArray(parsed?.subscriptions) ? parsed : { subscriptions: [] };
  } catch {
    return { subscriptions: [] };
  }
}

function writeStore(store) {
  ensureDir();
  const tempPath = `${STORE_PATH}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tempPath, STORE_PATH);
}

let vapid = {
  publicKey: process.env.VAPID_PUBLIC_KEY || '',
  privateKey: process.env.VAPID_PRIVATE_KEY || '',
  subject: process.env.VAPID_SUBJECT || 'mailto:crm-admin@localhost',
};

export function getVapidPublicKey() {
  return vapid.publicKey && vapid.privateKey ? vapid.publicKey : null;
}

export function setVapidKeys(publicKey, privateKey, subject) {
  vapid = {
    publicKey: publicKey || vapid.publicKey,
    privateKey: privateKey || vapid.privateKey,
    subject: subject || vapid.subject,
  };
}

function browserPushEndpoint(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  let endpoint;
  try { endpoint = new URL(raw); } catch { return null; }
  const host = endpoint.hostname;
  const supported = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com'
    || host === 'web.push.apple.com' || host.endsWith('.web.push.apple.com')
    || host.endsWith('.notify.windows.com');
  return supported && endpoint.protocol === 'https:' && !endpoint.port && !endpoint.username && !endpoint.password && !endpoint.hash
    ? endpoint.href : null;
}

const sameSubscriber = (row, identity) => row.userId === identity?.userId && row.tenantId === identity?.tenantId;

export function saveSubscription(subscription, identity) {
  const endpoint = browserPushEndpoint(subscription?.endpoint);
  const { auth, p256dh } = subscription?.keys || {};
  if (!endpoint || !identity?.userId || !identity?.tenantId
      || typeof auth !== 'string' || !/^[A-Za-z0-9_-]{20,32}$/.test(auth)
      || typeof p256dh !== 'string' || !/^[A-Za-z0-9_-]{84,100}$/.test(p256dh)) return false;
  const store = readStore();
  const idx = store.subscriptions.findIndex(s => s.endpoint === endpoint);
  const previous = store.subscriptions[idx];
  if (previous && !sameSubscriber(previous, identity) && (previous.keys?.auth !== auth || previous.keys?.p256dh !== p256dh)) return false;
  const row = {
    endpoint,
    keys: { auth, p256dh },
    expirationTime: subscription.expirationTime ?? null,
    userId: identity.userId,
    tenantId: identity.tenantId,
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) store.subscriptions[idx] = row;
  else store.subscriptions.push(row);
  writeStore(store);
  return true;
}

export function removeSubscription(rawEndpoint, identity) {
  const endpoint = browserPushEndpoint(rawEndpoint);
  if (!endpoint || !identity?.userId || !identity?.tenantId) return false;
  const store = readStore();
  const index = store.subscriptions.findIndex(s => s.endpoint === endpoint && sameSubscriber(s, identity));
  if (index < 0) return false;
  store.subscriptions.splice(index, 1);
  writeStore(store);
  return true;
}

export function listSubscriptions(identity) {
  if (!identity?.userId || !identity?.tenantId) return [];
  return readStore().subscriptions.filter(s => sameSubscriber(s, identity) && browserPushEndpoint(s.endpoint));
}

/**
 * Send push to all matching subscriptions.
 * Uses `web-push` package when installed; otherwise returns { sent: 0, reason: 'no-web-push' }.
 */
export async function sendPushToUser(identity, payload) {
  return deliverPush(listSubscriptions(identity), payload);
}

async function deliverPush(subs, payload) {
  if (!subs.length) return { sent: 0, reason: 'no-subscribers' };

  let webpush;
  try {
    webpush = (await import('web-push')).default;
  } catch {
    return { sent: 0, reason: 'web-push-not-installed', subscribers: subs.length };
  }

  if (!vapid.publicKey || !vapid.privateKey) {
    if (process.env.NODE_ENV === 'production') return { sent: 0, reason: 'no-vapid' };
    try {
      const keys = webpush.generateVAPIDKeys();
      vapid.publicKey = keys.publicKey;
      vapid.privateKey = keys.privateKey;
      console.warn('[push] Generated ephemeral VAPID keys for this process — set VAPID_* env for production');
    } catch (e) {
      return { sent: 0, reason: 'no-vapid' };
    }
  }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  const body = JSON.stringify(payload);
  let sent = 0;
  const errors = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: sub.keys,
        },
        body,
        { TTL: 60 * 60 }
      );
      sent += 1;
    } catch (e) {
      errors.push(String(e?.message || e));
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        removeSubscription(sub.endpoint, sub);
      }
    }
  }
  return { sent, errors, subscribers: subs.length };
}

export async function sendPushBroadcast(payload, tenantId) {
  const subscribers = tenantId ? readStore().subscriptions.filter(s => s.tenantId === tenantId && s.userId && browserPushEndpoint(s.endpoint)) : [];
  return deliverPush(subscribers, payload);
}

/** Init: try load web-push and ensure keys */
export async function initPushModule() {
  try {
    const webpush = (await import('web-push')).default;
    if (!vapid.publicKey || !vapid.privateKey) {
      if (process.env.NODE_ENV === 'production') return { ok: false, reason: 'no-vapid' };
      const keys = webpush.generateVAPIDKeys();
      vapid.publicKey = process.env.VAPID_PUBLIC_KEY || keys.publicKey;
      vapid.privateKey = process.env.VAPID_PRIVATE_KEY || keys.privateKey;
      if (!process.env.VAPID_PUBLIC_KEY) {
        console.warn('[push] Using generated VAPID keys (dev). Export VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY for stable production keys.');
        console.warn('[push] VAPID_PUBLIC_KEY=' + vapid.publicKey);
      }
    }
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    return { ok: true, publicKey: vapid.publicKey };
  } catch {
    console.warn('[push] web-push package not installed — install with: npm i web-push');
    return { ok: false, reason: 'web-push-not-installed' };
  }
}
