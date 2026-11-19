/**
 * Create in-app notification + attempt system push (2026)
 */
import type { AppState, Notification } from '../types';
import { generateId } from './utils';
import { bridgeInAppToSystem, isPushEnabledLocally } from './webPush';
import { AuthService } from '../services/AuthService';

export function pushNotification(
  draft: AppState,
  input: {
    title: string;
    message: string;
    type?: Notification['type'];
    linkTab?: string;
    entityId?: string;
    recipientId?: string;
  }
) {
  if (!draft.notifications) draft.notifications = [];
  const n: Notification = {
    id: generateId(),
    title: input.title,
    message: input.message,
    type: input.type || 'INFO',
    read: false,
    createdAt: new Date().toISOString(),
    linkTab: input.linkTab,
    entityId: input.entityId,
    recipientId: input.recipientId,
  };
  draft.notifications.push(n);

  // Fire-and-forget system notification / server push
  if (typeof window !== 'undefined' && isPushEnabledLocally() && (!n.recipientId || n.recipientId === draft.currentUserId)) {
    bridgeInAppToSystem(n);
    const token = AuthService.getAccessToken();
    if (!token) return n;
    void fetch('/api/v1/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      credentials: 'same-origin',
      body: JSON.stringify({
        title: 'اعلان جدید اخوان',
        body: 'برای مشاهده وارد سامانه شوید.',
        url: n.linkTab ? `/?tab=${n.linkTab}` : '/',
        id: n.id,
        linkTab: n.linkTab,
      }),
    }).catch(() => {});
  }
  return n;
}
