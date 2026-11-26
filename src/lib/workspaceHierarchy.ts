/**
 * AKHAVAN CRM — Workspace hierarchy (single source of truth)
 * -----------------------------------------------------------------------------
 * Route paths, API contracts and RBAC keys are UNCHANGED. This module only maps
 * the already-existing internal views (the old "tabs") to business areas so the
 * menu, page headers and in-page switchers all share one definition.
 *
 * Rule: a view belongs to exactly one area; an in-page switcher only lists the
 * sibling views of the same area (never all 9–11 views of a module).
 */

export interface ViewDef { id: string; label: string }
export interface AreaDef { id: string; title: string; subtitle: string; views: ViewDef[] }

/** Finance (/finance?tab=…) — 9 former tabs regrouped into 4 areas. */
export const FINANCE_AREAS: AreaDef[] = [
  { id: 'overview', title: 'نمای کلی مالی', subtitle: 'شاخص‌های کلیدی، سنی مطالبات و وضعیت وظایف مالی', views: [
    { id: 'overview', label: 'داشبورد مالی و شاخص‌ها' },
  ] },
  { id: 'treasury', title: 'خزانه‌داری', subtitle: 'سررسیدها، دستورهای پرداخت، دریافتی‌ها و چک‌ها', views: [
    { id: 'treasury', label: 'خزانه و سررسیدها' },
    { id: 'requests', label: 'دستورهای پرداخت و تسویه' },
    { id: 'payments', label: 'دریافتی‌ها و رسیدها' },
    { id: 'cheques', label: 'چک‌های دریافتی و پرداختی' },
  ] },
  { id: 'documents', title: 'اسناد مالی', subtitle: 'اسناد فروش، بستانکاری و هزینه (مرجع رسمی: سامانه مالی)', views: [
    { id: 'invoices', label: 'فاکتورها و اسناد فروش' },
    { id: 'credits', label: 'درخواست‌های بستانکاری' },
    { id: 'expenses', label: 'هزینه‌ها و اسناد هزینه' },
  ] },
  { id: 'receivables', title: 'مطالبات و وصول', subtitle: 'مانده مشتریان، سررسید، معوق و پیگیری وصول', views: [
    { id: 'collection', label: 'تحلیل مطالبات و پیگیری' },
  ] },
];

/** Operations (/operations?tab=…) — 11 former tabs regrouped by business meaning. */
export const OPERATIONS_AREAS: AreaDef[] = [
  { id: 'distribution', title: 'توزیع و عملیات', subtitle: 'سفارش‌ها، برنامه پخش و ناوگان، برگشتی‌ها و مغایرت‌های توزیع', views: [
    { id: 'overview', label: 'نمای کلی عملیات' },
    { id: 'orders', label: 'سفارش‌ها و وضعیت تحویل' },
    { id: 'dispatch', label: 'برنامه پخش و ناوگان' },
    { id: 'returns', label: 'برگشتی‌ها و مرجوعی' },
    { id: 'reconciliation', label: 'مغایرت‌های توزیع' },
    { id: 'inventory', label: 'کالا و موجودی' },
    { id: 'reports', label: 'گزارش چرخه سفارش و توزیع' },
  ] },
  { id: 'credit', title: 'وضعیت اعتباری مشتری', subtitle: 'مانده، سقف اعتبار و ریسک مشتریان', views: [
    { id: 'credit', label: 'اعتبار و ریسک مشتری' },
  ] },
  { id: 'finance', title: 'سودآوری و تأمین', subtitle: 'سود عملیاتی پخش و درخواست‌های خرید', views: [
    { id: 'profitability', label: 'سودآوری' },
    { id: 'purchasing', label: 'خرید و تأمین' },
  ] },
  { id: 'settings', title: 'قوانین تجاری فروش', subtitle: 'سیاست‌های اعتبار، تخفیف و کنترل سفارش', views: [
    { id: 'policies', label: 'قوانین تجاری' },
  ] },
];

/** Reports hub (/reports?tab=…) — cross-module comparison. */
export const REPORT_VIEWS: ViewDef[] = [
  { id: 'sales', label: 'فروش و درآمد' },
  { id: 'distribution', label: 'عملکرد مسیرها و توزیع' },
  { id: 'team', label: 'بهره‌وری تیم فروش' },
  { id: 'inventory', label: 'تحلیل کاتالوگ و پیشنهادها' },
];

/** Settings (/settings?tab=…&sub=…) — already one central hub; ids in lower-case URL form. */
export const SETTINGS_TABS = ['org', 'users', 'groups', 'rules', 'agents', 'integrations', 'locale'] as const;
/** Definitions (/definitions?tab=…) — org/users/groups come from the settings engine in definitions mode. */
export const DEFINITIONS_TABS = ['org', 'users', 'groups', 'personnel', 'price-classes', 'products', 'customers'] as const;
export const SETTINGS_USER_SUBS = ['list', 'roles', 'permissions'] as const;

/** Internal automation (/internal_automation?tab=…). */
export const AUTOMATION_TABS = ['inbox', 'my_requests'] as const;

export function areaOf(areas: AreaDef[], viewId: string): AreaDef {
  return areas.find(a => a.views.some(v => v.id === viewId)) || areas[0];
}
