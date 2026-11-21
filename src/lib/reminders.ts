import type { AppState, Notification, Task } from '../types';

export type ReminderStage = 'D7' | 'D2' | 'D0' | 'OVERDUE' | 'ESCALATION';
export interface ReminderEvent {
  key: string;
  stage: ReminderStage;
  taskId: string;
  dueDate: string;
  recipientId: string;
  title: string;
  message: string;
  type: Notification['type'];
}

export const localDateStr = (date: Date, timeZone?: string): string => {
  const format = (zone?: string) => new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
  try { return format(timeZone); } catch { return format(); }
};

function calendarDate(value?: string): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const time = Date.parse(day);
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(day) ? day : null;
}

export const dayDiff = (due: string, today: string): number => {
  const dueDate = calendarDate(due);
  const currentDate = calendarDate(today);
  return dueDate && currentDate ? Math.round((Date.parse(dueDate) - Date.parse(currentDate)) / 86400000) : NaN;
};

export const slaFromDue = (due: string | undefined, today: string): 'ON_TRACK' | 'AT_RISK' | 'BREACHED' => {
  const diff = due ? dayDiff(due, today) : NaN;
  return diff < 0 ? 'BREACHED' : diff <= 1 ? 'AT_RISK' : 'ON_TRACK';
};

export function isReminderActive(task: Task): boolean {
  return !task.deletedAt && !task.isDeleted &&
    !['COMPLETED', 'CANCELLED', 'CANCELED', 'VOID', 'DELETED'].includes(String(task.status).toUpperCase());
}

function activeUser(state: AppState, id?: string) {
  return id ? (state.users || []).find(user => user.id === id && (user.isActive ?? user.active) !== false) : undefined;
}

export function resolveEscalationTarget(state: AppState, assigneeId?: string): string | undefined {
  const assignee = activeUser(state, assigneeId);
  if (!assignee) return undefined;
  const branches = (state as Record<string, unknown>).branches;
  const branch = Array.isArray(branches) ? branches.find(item => item?.id === assignee.branchId) : undefined;
  const candidates: unknown[] = [assignee.managerId, branch?.managerId];
  return candidates.find((id): id is string => typeof id === 'string' && id !== assigneeId && Boolean(activeUser(state, id)));
}

const receivedKey = (recipientId: string, key: string) => JSON.stringify([recipientId, key]);
export function computeTaskReminders(state: AppState, now: Date, timeZone?: string): ReminderEvent[] {
  const today = localDateStr(now, timeZone);
  const log = state.reminderLog || {};
  const known = new Set((state.notifications || []).flatMap(notification =>
    notification.recipientId && notification.dedupeKey ? [receivedKey(notification.recipientId, notification.dedupeKey)] : [],
  ));
  const generated = new Map<string, ReminderEvent>();
  for (const task of state.tasks || []) {
    const dueDate = calendarDate(task.dueDate);
    if (!isReminderActive(task) || !dueDate) continue;
    const diff = dayDiff(dueDate, today);
    const group = task.assigneeType === 'GROUP' ? state.groups?.find(item => item.id === task.assigneeId && item.active !== false) : null;
    const recipients = task.assigneeType === 'GROUP' ? group?.memberIds ?? [] : [task.assigneeId || task.assignedTo];
    const push = (stage: ReminderStage, recipientId: string, title: string, message: string, type: ReminderEvent['type']) => {
      const legacyKey = `${task.id}|${stage}|${dueDate}`;
      const key = JSON.stringify([task.id, stage, dueDate, recipientId]);
      if (log[key] || known.has(receivedKey(recipientId, key)) || known.has(receivedKey(recipientId, legacyKey))) return;
      generated.set(key, { key, stage, taskId: task.id, dueDate, recipientId, title, message, type });
    };

    for (const recipientId of new Set(recipients)) {
      if (typeof recipientId !== 'string' || !activeUser(state, recipientId)) continue;
      if (diff === 7) push('D7', recipientId, 'یادآوری سررسید', `هفت روز تا سررسید «${task.title}» باقی مانده است.`, 'INFO');
      if (diff === 2) push('D2', recipientId, 'یادآوری سررسید', `دو روز تا سررسید «${task.title}» باقی مانده است.`, 'WARNING');
      if (diff === 0) push('D0', recipientId, 'سررسید امروز', `مهلت وظیفهٔ «${task.title}» امروز است.`, 'WARNING');
      if (diff < 0) push('OVERDUE', recipientId, 'وظیفهٔ معوق', `${Math.abs(diff).toLocaleString('fa-IR')} روز از مهلت «${task.title}» گذشته است.`, 'ERROR');
    }
    if (diff < 0 && task.assigneeType !== 'GROUP') {
      const managerId = resolveEscalationTarget(state, task.assigneeId || task.assignedTo);
      if (managerId) push('ESCALATION', managerId, 'پیگیری تأخیر وظیفه', `مهلت «${task.title}» گذشته است و باید پیگیری شود.`, 'WARNING');
    }
  }
  return [...generated.values()];
}

export async function taskReminderId(key: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return `task-reminder-${hex}`;
}
