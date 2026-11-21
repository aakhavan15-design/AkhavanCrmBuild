import { useEffect, useRef } from 'react';
import type { AppState } from '../types';
import { generateId } from '../lib/utils';
import { processPendingJobs, evaluateAutomations } from '../lib/automation';
import { triggerAgentHooks } from '../lib/agents';
import { getHighValueQuoteThreshold } from '../lib/orgPolicy';
import { computeTaskReminders, isReminderActive, localDateStr, slaFromDue, taskReminderId } from '../lib/reminders';

export function useWorkflowEngine(state: AppState, updateState: (updater: (draft: AppState) => AppState | void) => void) {
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let timeoutId: number;
    let cancelled = false;

    const runEngine = async () => {
      if (!stateRef.current) return;

      // ارزیابی قوانین اتوماسیون برای رویدادهای تازه (یک‌بار؛ رویدادهای قدیمی‌تر از ۲۴ ساعت بی‌صدا علامت می‌خورند تا انبوه اجرا نشود)
      {
        const nowMs = Date.now();
        const fresh = (stateRef.current.businessEvents || []).filter((e: Record<string, unknown>) => !e.automationProcessedAt);
        if (fresh.length > 0) {
          const ids = new Set(fresh.map((e: Record<string, unknown>) => e.id));
          updateState((draft: AppState) => {
            (draft.businessEvents || []).forEach((e: Record<string, unknown>) => { if (ids.has(e.id)) e.automationProcessedAt = new Date().toISOString(); });
          });
          fresh
            .filter((e: Record<string, unknown>) => !e.timestamp || nowMs - new Date(e.timestamp).getTime() < 86400000)
            .forEach((e: Record<string, unknown>) => {
              evaluateAutomations(e, stateRef.current, updateState);
              triggerAgentHooks({ type: e.type, payload: e.payload }, stateRef.current, updateState); // کلید توقف AI داخل خود تابع بررسی می‌شود
            });
        }
      }

      await processPendingJobs(stateRef.current, updateState);

      const snapshot = stateRef.current;
      const now = new Date();
      const tz = (snapshot.settings as Record<string, unknown>)?.timeZone as string | undefined;
      const reminderIds = new Map(await Promise.all(computeTaskReminders(snapshot, now, tz)
        .filter(event => event.recipientId === snapshot.currentUserId)
        .map(async event => [event.key, await taskReminderId(event.key)] as const)));
      if (cancelled) return;

      updateState((draft: AppState) => {
        let stateChanged = false;
        const today = localDateStr(now, tz);

        if (!draft.notifications) draft.notifications = [];
        if (!draft.tasks) draft.tasks = [];

        draft.tasks.filter(isReminderActive).forEach(task => {
          const calculatedSla = slaFromDue(task.dueDate, today);

          if (task.slaStatus !== calculatedSla) {
            task.slaStatus = calculatedSla;
            stateChanged = true;
          }
        });

        for (const event of computeTaskReminders(draft, now, tz)) {
          const id = reminderIds.get(event.key);
          if (!id || event.recipientId !== draft.currentUserId) continue;
          draft.reminderLog ??= {};
          draft.reminderLog[event.key] = now.toISOString();
          draft.notifications.push({
            id, title: event.title, message: event.message, type: event.type, read: false,
            createdAt: now.toISOString(), linkTab: 'tasks', recipientId: event.recipientId,
            dedupeKey: event.key, entityId: event.taskId, taskReminder: { stage: event.stage, dueDate: event.dueDate },
          });
          stateChanged = true;
        }
        const closedIds = new Set(draft.tasks.filter(task => !isReminderActive(task)).map(task => task.id));
        for (const notification of draft.notifications) {
          if (notification.taskReminder && notification.recipientId === draft.currentUserId && !notification.read &&
              notification.entityId && closedIds.has(notification.entityId)) {
            notification.read = true;
            stateChanged = true;
          }
        }

        const threshold = getHighValueQuoteThreshold(draft);
        (draft.quotes || []).filter(q => q.totalAmount > threshold && q.status === 'DRAFT').forEach(quote => {
          const alreadyNotified = draft.notifications!.some(n => n.title?.includes(quote.quoteNumber));
          if (!alreadyNotified) {
            draft.notifications!.push({
              id: generateId(),
              title: `پیش‌فاکتور با ارزش بالا (${quote.quoteNumber})`,
              message: `پیش‌فاکتور جدید به ارزش ${new Intl.NumberFormat('fa-IR').format(quote.totalAmount)} ریال ثبت شده است.`,
              type: 'INFO',
              read: false,
              createdAt: new Date().toISOString(),
              linkTab: 'quotes'
            });
            stateChanged = true;
          }
        });

        if (stateChanged) return draft;
      });

      timeoutId = window.setTimeout(runEngine, 30000);
    };

    timeoutId = window.setTimeout(runEngine, 5000);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [updateState]);
}
