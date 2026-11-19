/**
 * Create in-app notification + attempt system push (2026)
 */
import type { AppState } from '../types';
import { generateId } from './utils';
import { bridgeInAppToSystem, isPushEnabledLocally } from './webPush';

export function pushNotification(
  draft: AppState,
  input: {
    title: string;
    message: string;
    type?: string;
    linkTab?: string;
    entityId?: string;
    recipientId?: string;
  }
) {
  if (!draft.notifications) draft.notifications = [];
  const n = {
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
  draft.notifications.push(n as Record<string, unknown>);

  // Fire-and-forget system notification / server push
  if (typeof window !== 'undefined' && isPushEnabledLocally()) {
    bridgeInAppToSystem(n);
    const userId = input.recipientId || draft.currentUserId;
    void fetch('/api/v1/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        userId,
        title: n.title,
        body: n.message,
        url: n.linkTab ? `/?tab=${n.linkTab}` : '/',
        id: n.id,
        linkTab: n.linkTab,
      }),
    }).catch(() => {});
  }
  return n;
}
