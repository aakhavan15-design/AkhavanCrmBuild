import type { Priority, Account, AppState } from '../types';
import { toLatinDigits } from './digits.ts';

export function parseTaskIntent(text: string): {
  intent: string;
  reason: string;
  priority: Priority;
} {
  const lower = text.toLowerCase();
  if (lower.includes('فوری') || lower.includes('urgent') || lower.includes('سررسید گذشته')) {
    return { intent: 'URGENT_FOLLOWUP', reason: 'کلمه کلیدی فوری تشخیص داده شد', priority: 'URGENT' };
  }
  if (lower.includes('پیش‌فاکتور') || lower.includes('قرارداد') || lower.includes('مذاکره')) {
    return { intent: 'SALES_OPPORTUNITY', reason: 'مرتبط با فرآیند فروش', priority: 'HIGH' };
  }
  return { intent: 'STANDARD_TASK', reason: 'پیگیری عادی', priority: 'NORMAL' };
}

export function findDuplicateAccounts(accounts: Account[]): Array<{ primary: Account; duplicates: Account[] }> {
  const phoneMap: Record<string, Account[]> = {};
  accounts.forEach(a => {
    if (a.phone && a.phone.trim().length > 6) {
      const p = a.phone.trim();
      if (!phoneMap[p]) phoneMap[p] = [];
      phoneMap[p].push(a);
    }
  });

  const duplicatesList: Array<{ primary: Account; duplicates: Account[] }> = [];
  Object.values(phoneMap).forEach(list => {
    if (list.length > 1) {
      duplicatesList.push({
        primary: list[0],
        duplicates: list.slice(1)
      });
    }
  });

  return duplicatesList;
}

export type CustomerMatchReason = 'NATIONAL_CODE' | 'ECONOMIC_CODE' | 'PHONE' | 'NAME';
export interface CustomerMatch { account: Account; reason: CustomerMatchReason; hard: boolean }

const normName = (v: unknown): string => String(v ?? '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\u200c\s]+/g, ' ').trim().toLowerCase();
const normDigits = (v: unknown): string => toLatinDigits(String(v ?? '')).replace(/\D/g, '');

/**
 * تطبیق یک مشتری جدید با مشتریان موجود (F0-07)؛ قبل از ثبت پیش‌نویس/پیشنهاد به ERP.
 * کد ملی/اقتصادی = تطبیق قطعی (hard)؛ تلفن/نام = هشدار (soft). رکوردهای حذف‌شده نادیده گرفته می‌شوند.
 * مکمل findDuplicateAccounts (که فقط کل فهرست را بر اساس تلفن می‌کاود) است، نه موتور موازی.
 */
export function matchExistingCustomers(
  accounts: Account[],
  candidate: { name?: unknown; phone?: unknown; nationalCode?: unknown; economicCode?: unknown }
): CustomerMatch[] {
  const nc = normDigits(candidate.nationalCode);
  const ec = normDigits(candidate.economicCode);
  const ph = normDigits(candidate.phone);
  const nm = normName(candidate.name);
  const out: CustomerMatch[] = [];
  for (const account of accounts || []) {
    const a = account as Account & { deletedAt?: string | null; economicCode?: unknown; nationalCode?: unknown; nationalId?: unknown };
    if (a.deletedAt) continue;
    let reason: CustomerMatchReason | null = null;
    if (nc.length >= 8 && (normDigits(a.nationalCode) === nc || normDigits(a.nationalId) === nc)) reason = 'NATIONAL_CODE';
    else if (ec.length >= 8 && normDigits(a.economicCode) === ec) reason = 'ECONOMIC_CODE';
    else if (ph.length >= 7 && normDigits(a.phone).endsWith(ph.slice(-10))) reason = 'PHONE';
    else if (nm.length >= 3 && (normName(a.name) === nm || normName(a.company) === nm)) reason = 'NAME';
    if (reason) out.push({ account, reason, hard: reason === 'NATIONAL_CODE' || reason === 'ECONOMIC_CODE' });
  }
  return out;
}

export function mergeAccounts(
  primaryId: string, 
  dupId: string, 
  state: AppState, 
  updateState: (updater: (draft: AppState) => AppState | void) => void
): void {
  updateState(draft => {
    // Re-point quotes
    (draft.quotes || []).forEach((q: Record<string, unknown>) => {
      if (q.accountId === dupId || q.customerId === dupId) {
        q.accountId = primaryId;
        q.customerId = primaryId;
      }
    });

    // Re-point tasks
    (draft.tasks || []).forEach((t: Record<string, unknown>) => {
      if (t.accountId === dupId || t.customerId === dupId) {
        t.accountId = primaryId;
        t.customerId = primaryId;
      }
    });

    // Re-point activities
    (draft.activities || []).forEach((a: Record<string, unknown>) => {
      if (a.accountId === dupId || a.customerId === dupId) {
        a.accountId = primaryId;
        a.customerId = primaryId;
      }
    });

    // Re-point payments
    (draft.payments || []).forEach((p: Record<string, unknown>) => {
      if (p.accountId === dupId || p.customerId === dupId) {
        p.accountId = primaryId;
        p.customerId = primaryId;
      }
    });

    // Re-point opportunities
    (draft.opportunities || []).forEach((o: Record<string, unknown>) => {
      if (o.accountId === dupId) {
        o.accountId = primaryId;
      }
    });

    // Re-point cases
    (draft.cases || []).forEach((c: Record<string, unknown>) => {
      if (c.accountId === dupId) {
        c.accountId = primaryId;
      }
    });

    // Remove duplicate account
    draft.accounts = (draft.accounts || []).filter((a: Record<string, unknown>) => a.id !== dupId);
  });
}

export function exportCsv(rows: Array<Record<string, unknown>>, headers: string[]): string {
  if (!rows || rows.length === 0) return headers.join(',') + '\n';
  
  let csv = headers.join(',') + '\n';
  rows.forEach(row => {
    const values = headers.map(h => {
      const val = row[h] !== undefined && row[h] !== null ? String(row[h]) : '';
      return `"${val.replace(/"/g, '""')}"`;
    });
    csv += values.join(',') + '\n';
  });
  
  return csv;
}
