import { useDataQuery } from './useDataProvider';
import type { ApprovalRef, SubjectRef, ContextOptions } from '../lib/financialIntelligence';

/**
 * هوک‌های Financial Intelligence — فقط از طریق DataProvider (IndexedDB محلی یا SQL Server).
 * refreshKey را با تغییر داده‌های مرتبط عوض کنید تا نتیجه دوباره محاسبه شود.
 */
export function useApprovalContext(ref: ApprovalRef | null, refreshKey: unknown = 0, opts?: ContextOptions) {
  return useDataQuery(p => (ref ? p.getApprovalContext(ref, opts) : Promise.resolve(null)), [ref?.kind, ref?.id, refreshKey, opts?.avgMethod]);
}
export function useFinancial360(subject: SubjectRef | null, refreshKey: unknown = 0, opts?: ContextOptions) {
  return useDataQuery(p => (subject ? p.getFinancial360(subject, opts) : Promise.resolve(null)), [subject?.kind, subject?.id, refreshKey, opts?.avgMethod]);
}
