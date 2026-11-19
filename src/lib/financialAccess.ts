/**
 * دسترسی‌های مؤثر برای Financial Intelligence بر پایه RBACService (تنها موتور مجوز).
 * هشدار: این کنترل سمت کلاینت است؛ enforcement نهایی با پروفایل‌های دسترسی کالکشن در سرور/RLS است
 * (کالکشن‌های غیرمجاز از اسنپ‌شات سرور حذف و در UI «محدود» نشان داده می‌شوند).
 */
import type { AppState } from '../types';
import { RBACService } from './rbac';
import type { ContextOptions, ViewerAccess } from './financialIntelligence';

export function resolveViewerAccess(state: AppState): ViewerAccess {
  const rbac = new RBACService(state);
  return {
    userId: state.currentUserId,
    finance: rbac.hasPermission('finance.view'),
    hr: rbac.can('onboarding', 'VIEW') || rbac.hasPermission('users.manage'),
    sales: rbac.hasPermission('accounts.view'),
    internal: rbac.hasPermission('internal.view') || rbac.hasPermission('internal.manage'),
  };
}
export const withViewer = (state: AppState, opts: ContextOptions = {}): ContextOptions => ({ ...opts, viewer: opts.viewer || resolveViewerAccess(state) });
