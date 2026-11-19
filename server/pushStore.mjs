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
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return { subscriptions: [] };
  }
}

function writeStore(store) {
  ensureDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

let vapid = {
  publicKey: process.env.VAPID_PUBLIC_KEY || '',
  privateKey: process.env.VAPID_PRIVATE_KEY || '',
  subject: process.env.VAPID_SUBJECT || 'mailto:crm-admin@localhost',
};

/** Generate VAPID-like key pair for dev if none configured (not for production identity stability) */
function ensureVapid() {
  if (vapid.publicKey && vapid.privateKey) return vapid;
  // Prefer web-push generate if available at runtime
  return vapid;
}

export function getVapidPublicKey() {
  ensureVapid();
  return vapid.publicKey || null;
}

export function setVapidKeys(publicKey, privateKey, subject) {
  vapid = {
    publicKey: publicKey || vapid.publicKey,
    privateKey: privateKey || vapid.privateKey,
    subject: subject || vapid.subject,
  };
}

export function saveSubscription(subscription, userId) {
  if (!subscription?.endpoint) return false;
  const store = readStore();
  const idx = store.subscriptions.findIndex((s) => s.endpoint === subscription.endpoint);
  const row = {
    endpoint: subscription.endpoint,
    keys: subscription.keys || {},
    expirationTime: subscription.expirationTime ?? null,
    userId: userId || null,
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) store.subscriptions[idx] = row;
  else store.subscriptions.push(row);
  writeStore(store);
  return true;
}

export function removeSubscription(endpoint) {
  const store = readStore();
  store.subscriptions = store.subscriptions.filter((s) => s.endpoint !== endpoint);
  writeStore(store);
  return true;
}

export function listSubscriptions(userId) {
  const store = readStore();
  if (!userId) return store.subscriptions;
  return store.subscriptions.filter((s) => !s.userId || s.userId === userId);
}

/**
 * Send push to all matching subscriptions.
 * Uses `web-push` package when installed; otherwise returns { sent: 0, reason: 'no-web-push' }.
 */
export async function sendPushToUser(userId, payload) {
  const subs = listSubscriptions(userId);
  if (!subs.length) return { sent: 0, reason: 'no-subscribers' };

  let webpush;
  try {
    webpush = (await import('web-push')).default;
  } catch {
    return { sent: 0, reason: 'web-push-not-installed', subscribers: subs.length };
  }

  if (!vapid.publicKey || !vapid.privateKey) {
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
        removeSubscription(sub.endpoint);
      }
    }
  }
  return { sent, errors, subscribers: subs.length };
}

export async function sendPushBroadcast(payload) {
  return sendPushToUser(null, payload);
}

/** Init: try load web-push and ensure keys */
export async function initPushModule() {
  try {
    const webpush = (await import('web-push')).default;
    if (!vapid.publicKey || !vapid.privateKey) {
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
