/**
 * Task circulation / visible workflow stages from status + activityHistory
 */
import type { CustomerTask } from '../types';
import { getLatestTaskActivity } from '../services/taskActivity';

export interface CirculationNode {
  id: string;
  label: string;
  state: 'done' | 'active' | 'pending' | 'rejected';
  meta?: string;
  at?: string;
}

const STAGE_ORDER = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'] as const;

const LABELS: Record<string, string> = {
  OPEN: 'ثبت / باز',
  PENDING: 'در انتظار',
  IN_PROGRESS: 'در حال اجرا',
  BLOCKED: 'متوقف (مانع)',
  COMPLETED: 'تکمیل‌شده',
  CANCELLED: 'لغو',
  CANCELED: 'لغو',
};

export function buildTaskCirculation(task: CustomerTask): CirculationNode[] {
  const status = String(task.status || 'OPEN').toUpperCase();
  const history = Array.isArray(task.activityHistory) ? [...task.activityHistory] : [];
  history.sort((a: unknown, b: unknown) => Date.parse(a.at || '') - Date.parse(b.at || ''));

  // Base path without BLOCKED unless relevant
  const path =
    status === 'BLOCKED'
      ? ['OPEN', 'IN_PROGRESS', 'BLOCKED']
      : status === 'COMPLETED'
        ? ['OPEN', 'IN_PROGRESS', 'COMPLETED']
        : status === 'IN_PROGRESS'
          ? ['OPEN', 'IN_PROGRESS', 'COMPLETED']
          : ['OPEN', 'IN_PROGRESS', 'COMPLETED'];

  const statusIndex = path.indexOf(status === 'PENDING' ? 'OPEN' : status);

  const nodes: CirculationNode[] = path.map((key, i) => {
    let state: CirculationNode['state'] = 'pending';
    if (status === 'CANCELLED' || status === 'CANCELED') {
      state = i === 0 ? 'done' : 'rejected';
    } else if (statusIndex < 0) {
      state = i === 0 ? 'active' : 'pending';
    } else if (i < statusIndex) state = 'done';
    else if (i === statusIndex) state = 'active';
    else state = 'pending';

    const related = history.filter((h: Record<string, unknown>) => {
      const s = String(h.summary || h.action || '').toUpperCase();
      if (key === 'OPEN') return /ایجاد|ثبت|باز|CREATED|REOPEN/.test(s);
      if (key === 'IN_PROGRESS') return /آغاز|اجرا|START|UNBLOCK/.test(s);
      if (key === 'BLOCKED') return /مانع|توقف|BLOCK/.test(s);
      if (key === 'COMPLETED') return /تکمیل|COMPLETE|نتیجه/.test(s);
      return false;
    });
    const last = related[related.length - 1];

    return {
      id: `${task.id}-${key}`,
      label: LABELS[key] || key,
      state,
      meta:
        key === 'BLOCKED' && task.blockReason
          ? task.blockReason
          : key === 'COMPLETED' && (task as Record<string, unknown>).result
            ? String((task as Record<string, unknown>).result)
            : last?.summary,
      at: last?.at || (state === 'active' ? task.updatedAt || task.createdAt : undefined),
    };
  });

  // Append latest activity as detail node if rich history
  const latest = getLatestTaskActivity(task as Record<string, unknown>);
  if (latest && history.length > 1) {
    nodes.push({
      id: `${task.id}-latest`,
      label: 'آخرین رویداد',
      state: 'done',
      meta: latest.summary,
      at: latest.at,
    });
  }

  return nodes;
}
