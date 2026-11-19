/**
 * semanticSearch — lightweight intent + synonym expansion for Command Palette (2026)
 * No vector DB required. Deterministic, fast, Edge-ready.
 */
export type IntentRoute = {
  id: string;
  title: string;
  subtitle: string;
  path: string;
  keywords: string[];
  scoreBoost: number;
};

const INTENT_ROUTES: IntentRoute[] = [
  {
    id: 'intent-overdue',
    title: 'وظایف معوق',
    subtitle: 'نمایش تسک‌های گذشته از مهلت',
    path: '/tasks?filter=overdue',
    keywords: ['معوق', 'دیرکرد', 'overdue', 'سررسید گذشته', 'عقب افتاده', 'sla'],
    scoreBoost: 40,
  },
  {
    id: 'intent-high-priority',
    title: 'وظایف با اولویت بالا',
    subtitle: 'تسک‌های فوری و اولویت‌دار',
    path: '/tasks?priority=HIGH',
    keywords: ['فوری', 'اولویت', 'urgent', 'high', 'مهم', 'بحرانی'],
    scoreBoost: 35,
  },
  {
    id: 'intent-finance',
    title: 'مرکز مالی و وصول',
    subtitle: 'خزانه، اسناد و مطالبات',
    path: '/finance',
    keywords: ['مالی', 'وصول', 'نقدینگی', 'finance', 'خزانه', 'مطالبات', 'دریافتنی', 'پرداخت'],
    scoreBoost: 30,
  },
  {
    id: 'intent-customers',
    title: 'مشتریان',
    subtitle: 'فهرست حساب‌ها و مشتری ۳۶۰',
    path: '/customers',
    keywords: ['مشتری', 'حساب', 'customer', 'account', 'کلاینت'],
    scoreBoost: 25,
  },
  {
    id: 'intent-quotes',
    title: 'پیش‌فاکتورها',
    subtitle: 'قیمت‌گذاری و پیشنهادهای قیمت',
    path: '/quotes',
    keywords: ['پیش فاکتور', 'پیش‌فاکتور', 'quote', 'پیشنهاد', 'قیمت', 'cpq'],
    scoreBoost: 25,
  },
  {
    id: 'intent-command',
    title: 'مرکز فرماندهی',
    subtitle: 'داشبورد مدیریتی و اولویت‌های عملیاتی',
    path: '/command',
    keywords: ['فرمان', 'داشبورد', 'command', 'مدیریت', 'overview'],
    scoreBoost: 20,
  },
  {
    id: 'intent-activities',
    title: 'فعالیت‌ها',
    subtitle: 'ثبت و مشاهده فعالیت‌های روز',
    path: '/activities',
    keywords: ['فعالیت', 'activity', 'تماس', 'ویزیت', 'لاگ'],
    scoreBoost: 20,
  },
  {
    id: 'intent-geo',
    title: 'هوش جغرافیایی',
    subtitle: 'مناطق، مسیر و پوشش',
    path: '/geo',
    keywords: ['جغرافیا', 'منطقه', 'مسیر', 'geo', 'zone', 'مسیریابی'],
    scoreBoost: 18,
  },
  {
    id: 'intent-new-task',
    title: 'ایجاد وظیفه جدید',
    subtitle: 'ثبت سریع تسک',
    path: '/tasks?new=1',
    keywords: ['تسک جدید', 'وظیفه جدید', 'ایجاد تسک', 'new task', 'ثبت وظیفه'],
    scoreBoost: 45,
  },
];

/** Simple score: exact / includes / synonym hit */
export function scoreText(haystack: string, needle: string): number {
  const h = (haystack || '').toLowerCase();
  const n = (needle || '').toLowerCase().trim();
  if (!n || !h) return 0;
  if (h === n) return 100;
  if (h.startsWith(n)) return 80;
  if (h.includes(n)) return 60;
  // token overlap
  const hTokens = h.split(/[\s\-_./]+/).filter(Boolean);
  const nTokens = n.split(/[\s\-_./]+/).filter(Boolean);
  let hits = 0;
  for (const t of nTokens) {
    if (hTokens.some((ht) => ht.includes(t) || t.includes(ht))) hits++;
  }
  if (hits === 0) return 0;
  return Math.min(55, 20 + hits * 15);
}

export function matchIntentRoutes(query: string): Array<IntentRoute & { score: number }> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return INTENT_ROUTES.map((route) => {
    let best = scoreText(route.title, q);
    for (const kw of route.keywords) {
      best = Math.max(best, scoreText(kw, q), scoreText(q, kw));
    }
    // soft boost when query looks like an intent phrase
    if (best > 0) best += route.scoreBoost * 0.15;
    return { ...route, score: best };
  })
    .filter((r) => r.score >= 25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
