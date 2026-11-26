import type { AppState } from '../types.ts';

export type TourRole = 'admin' | 'manager' | 'sales' | 'finance' | 'operations' | 'all';

export interface TourStep {
  id: string;
  module: string;
  title: string;
  content: string;
  targetSelector?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  roles?: TourRole[];
  actionLabel?: string;
  actionRoute?: string;
  isNewFeature?: boolean;
}

export interface WhatsNewItem {
  id: string;
  version: string;
  title: string;
  description: string;
  tag: 'NEW' | 'IMPROVED' | 'SECURITY';
  module: string;
  route?: string;
}

export const ALL_TOUR_STEPS: TourStep[] = [
  {
    id: 'shell-header',
    module: 'global',
    title: 'هدر معلق و عنوان پویا',
    content: 'هدر معلق با پوشش شیشه‌ای عنوان صفحه جاری، دکمه ایجاد متناسب با صفحه و دسترسی اعلان‌ها و گفتگو را نمایش می‌دهد.',
    targetSelector: '#ttl',
    placement: 'bottom',
    roles: ['all'],
  },
  {
    id: 'shell-menu',
    module: 'global',
    title: 'منوی ناوبری کپسولی',
    content: 'دسترسی سریع به ۸ فضای کاری اصلی و زیرمجموعه‌های متمرکز سامانه.',
    targetSelector: '#mb0, #sb0',
    placement: 'bottom',
    roles: ['all'],
  },
  {
    id: 'shell-nav',
    module: 'global',
    title: 'نوار ناوبری کپسولی شناور',
    content: 'دسترسی سریع به بخش‌های محوری (خانه، مشتریان، فروش، پیگیری، توزیع) در موبایل.',
    targetSelector: '#nav',
    placement: 'top',
    roles: ['all'],
  },
  {
    id: 'workspace-landing',
    module: 'workspace',
    title: 'ورودی فضای کاری',
    content: 'از این صفحه، قابلیت‌های مجاز هر حوزه را با کاشی‌های دسته‌بندی‌شده جست‌وجو و باز کنید.',
    targetSelector: '#module-landing-heading',
    placement: 'bottom',
    roles: ['all'],
  },
  {
    id: 'workspace-search',
    module: 'workspace',
    title: 'جست‌وجوی حوزه',
    content: 'برای یافتن سریع قابلیت‌ها، نام مقصد را در همین فضا جست‌وجو کنید.',
    targetSelector: '#module-landing-search',
    placement: 'bottom',
    roles: ['all'],
  },
  {
    id: 'home-hero',
    module: 'home',
    title: 'کارت درآمد و وصولی ماهانه',
    content: 'روند ماهانه فروش و وصولی واقعی با مقایسه دوره‌ای.',
    targetSelector: '#home-hero',
    placement: 'bottom',
    roles: ['all'],
  },
  {
    id: 'home-portfolio',
    module: 'home',
    title: 'سهم سبد و مشتریان',
    content: 'تحلیل ترکیب فروش و وضعیت مشتریان فعال و در معرض ریزش.',
    targetSelector: '#home-portfolio',
    placement: 'bottom',
    roles: ['all'],
  },
  {
    id: 'home-actions',
    module: 'home',
    title: 'اقدامات و پیگیری‌های امروز',
    content: 'فهرست وظایف دارای اولویت و جلسات کاری برنامه‌ریزی‌شده.',
    targetSelector: '#home-actions',
    placement: 'top',
    roles: ['all'],
  },
  {
    id: 'dash-kpis',
    module: 'dashboard',
    title: 'شاخص‌های کلیدی عملکرد',
    content: 'نمای متمرکز از وظایف، فرصت‌های باز، گفتگوهای کاری و مشتریان فعال.',
    targetSelector: '#dash-kpis',
    placement: 'bottom',
    roles: ['all'],
  },
  {
    id: 'dash-trend',
    module: 'dashboard',
    title: 'روند پیگیری و فعالیت‌های تجاری',
    content: 'منحنی فعالیت و پیگیری‌های دوره انتخاب‌شده.',
    targetSelector: '#dash-trend',
    placement: 'bottom',
    roles: ['admin', 'manager', 'sales'],
  },
  {
    id: 'dash-donut',
    module: 'dashboard',
    title: 'توزیع وضعیت وظایف',
    content: 'تفکیک وظایف بر اساس انجام‌شده، در جریان، معوق و نرخ تحقق.',
    targetSelector: '#dash-donut',
    placement: 'top',
    roles: ['all'],
  },
  {
    id: 'dash-churn-portfolio',
    module: 'dashboard',
    title: 'پایش هوشمند احتمال ریزش',
    content: 'شناسایی و تفکیک مشتریان در معرض ریزش بر پایه فاکتورهای معتبر.',
    targetSelector: '#dash-churn-card, .churn-widget',
    placement: 'top',
    roles: ['admin', 'manager', 'sales'],
    isNewFeature: true,
  },
  {
    id: 'command-cash',
    module: 'command',
    title: 'برآورد جریان نقدی کوتاه‌مدت',
    content: 'برآورد کسری یا مازاد نقدینگی بر اساس سررسید چک‌ها، فاکتورها و هزینه‌های ثبت‌شده.',
    targetSelector: '#command-cash',
    placement: 'bottom',
    roles: ['admin', 'manager', 'finance'],
  },
  {
    id: 'command-kpis',
    module: 'command',
    title: 'شاخص‌های کلان مالی و فروش',
    content: 'ارزش پیشنهادها، وصولی، مانده و حاشیه برآوردی.',
    targetSelector: '#command-kpis',
    placement: 'bottom',
    roles: ['admin', 'manager', 'finance'],
  },
  {
    id: 'command-people',
    module: 'command',
    title: 'عملکرد عملیاتی پرسنل',
    content: 'ارزیابی فعالیت کارشناسان و نسبت وظایف تکمیل‌شده.',
    targetSelector: '#command-people',
    placement: 'top',
    roles: ['admin', 'manager'],
  },
  {
    id: 'command-feed',
    module: 'command',
    title: 'رویدادنگار زنده اقدامات',
    content: 'تاریخچه رویدادها، ویزیت‌ها و اقدامات ثبت‌شده توسط کاربران.',
    targetSelector: '#command-feed',
    placement: 'top',
    roles: ['all'],
  },
  {
    id: 'acc-metrics',
    module: 'accounts',
    title: 'شاخص‌های شناسنامه تجاری مشتری',
    content: 'مانده بدهی دفتری، سقف اعتبار مصوب و پوشش تماس مشتریان.',
    targetSelector: '#acc-metrics',
    placement: 'bottom',
    roles: ['all'],
  },
  {
    id: 'customer-table',
    module: 'accounts',
    title: 'بانک مشتریان و مدیریت پرونده‌ها',
    content: 'فهرست طرف‌های حساب با شماره تماس، نشانی و مانده دفتری تفصیلی.',
    targetSelector: '#customer-table',
    placement: 'top',
    roles: ['all'],
  },
  {
    id: 'acc-churn-prediction',
    module: 'accounts',
    title: 'سلامت اعتباری و ریسک حفظ مشتری',
    content: 'بررسی سقف اعتبار، مانده دفتری و شاخص ریسک وصول مشتری.',
    targetSelector: '#acc-churn-card, #tour-page',
    placement: 'bottom',
    roles: ['admin', 'manager', 'sales'],
    isNewFeature: true,
  },
  {
    id: 'acc-dock',
    module: 'accounts',
    title: 'داک عملیات سریع پرونده ۳۶۰',
    content: 'ثبت فعالیت، یادداشت و وظیفه متصل بدون ترک صفحه پرونده.',
    targetSelector: '#acc-dock',
    placement: 'top',
    roles: ['admin', 'manager', 'sales', 'finance'],
  },
  {
    id: 'leads-heading',
    module: 'leads',
    title: 'مدیریت سرنخ‌های ورودی',
    content: 'ثبت و ساماندهی سرنخ‌های بازاریابی قبل از تبدیل به مشتری.',
    targetSelector: '#leads-heading',
    placement: 'bottom',
    roles: ['admin', 'manager', 'sales'],
  },
  {
    id: 'leads-filters',
    module: 'leads',
    title: 'فیلتر مراحل صلاحیت',
    content: 'دسته‌بندی سرنخ‌ها بر اساس مراحل تماس، ارزیابی و تبدیل.',
    targetSelector: '#leads-filters',
    placement: 'bottom',
    roles: ['admin', 'manager', 'sales'],
  },
  {
    id: 'leads-list',
    module: 'leads',
    title: 'کارت سرنخ و تبدیل به مشتری',
    content: 'ثبت تاریخچه تعامل و تبدیل سرنخ‌های واجد شرایط به پیش‌نویس مشتری.',
    targetSelector: '#leads-list',
    placement: 'top',
    roles: ['admin', 'manager', 'sales'],
  },
  {
    id: 'opp-toolbar',
    module: 'opportunities',
    title: 'میز مذاکره و پایپ‌لاین فروش',
    content: 'مجموع ارزش معاملات در جریان و پایش فرصت‌های راهبردی.',
    targetSelector: '#opp-toolbar',
    placement: 'bottom',
    roles: ['admin', 'manager', 'sales'],
  },
  {
    id: 'opp-stages',
    module: 'opportunities',
    title: 'مراحل قیف فروش',
    content: 'دسته‌بندی فرصت‌ها از مرحله کشف نیاز تا مذاکره نهایی.',
    targetSelector: '#opp-stages',
    placement: 'bottom',
    roles: ['admin', 'manager', 'sales'],
  },
  {
    id: 'opp-list',
    module: 'opportunities',
    title: 'فهرست فرصت‌ها و تعیین سرنوشت',
    content: 'پیگیری مراحل مذاکره و تعیین وضعیت موفقیت یا باخت معامله.',
    targetSelector: '#opp-list',
    placement: 'top',
    roles: ['admin', 'manager', 'sales'],
  },
  {
    id: 'quote-actions',
    module: 'quotes',
    title: 'ابزارهای صدور و ویزارد قیمت‌گذاری',
    content: 'تنظیم پیشنهاد قیمت و پیش‌فاکتور با کنترل مارجین سود.',
    targetSelector: '#quote-actions',
    placement: 'bottom',
    roles: ['admin', 'manager', 'sales'],
  },
  {
    id: 'quote-summary-tiles',
    module: 'quotes',
    title: 'خلاصه وضعیت پیشنهادها',
    content: 'کل ارزش پیشنهادها، اسناد تأییدشده و موارد منتظر مجوز.',
    targetSelector: '#quote-summary-tiles',
    placement: 'bottom',
    roles: ['admin', 'manager', 'sales'],
  },
  {
    id: 'quote-waterfall',
    module: 'quotes',
    title: 'تحلیل آبشار قیمت و سودآوری',
    content: 'محاسبه شفاف قیمت پایه، تخفیف‌ها و حاشیه سود خالص.',
    targetSelector: '#quote-waterfall',
    placement: 'top',
    roles: ['admin', 'manager', 'sales'],
  },
  {
    id: 'activities-toolbar',
    module: 'activities',
    title: 'فیلتر تعاملات و ویزیت‌ها',
    content: 'جست‌وجو و دسته‌بندی تماس‌ها، جلسات کاری و ویزیت‌ها.',
    targetSelector: '#activities-toolbar',
    placement: 'bottom',
    roles: ['all'],
  },
  {
    id: 'activities-timeline',
    module: 'activities',
    title: 'گاه‌شمار فعالیت‌های ثبت‌شده',
    content: 'تاریخچه زنجیره‌ای تعاملات با مشتری همراه با زمان و شرح.',
    targetSelector: '#activities-timeline',
    placement: 'top',
    roles: ['all'],
  },
  {
    id: 'task-filters',
    module: 'tasks',
    title: 'ابزارهای تریاژ و جست‌وجوی کارتابل',
    content: 'ساماندهی وظایف بر اساس مسئول، اولویت و وضعیت پیگیری.',
    targetSelector: '#task-filters',
    placement: 'bottom',
    roles: ['all'],
  },
  {
    id: 'task-sla-cards',
    module: 'tasks',
    title: 'پایش مهلت تعهد و دیرکرد',
    content: 'تفکیک وظایف دارای دیرکرد، در آستانه مهلت و متوقف‌شده.',
    targetSelector: '#task-sla-cards',
    placement: 'bottom',
    roles: ['all'],
  },
  {
    id: 'task-list',
    module: 'tasks',
    title: 'فهرست وظایف و گردش کار اقدام',
    content: 'ثبت نتیجه پیگیری، مانع کار، پیوست فایل و ارجاع با تاریخچه.',
    targetSelector: '#task-list',
    placement: 'top',
    roles: ['all'],
  },
  {
    id: 'fin-kpis',
    module: 'finance',
    title: 'شاخص‌های مطالبات و خزانه‌داری',
    content: 'کل مطالبات دفتری، معوقات تخمینی و چک‌های در جریان وصول.',
    targetSelector: '#fin-kpis',
    placement: 'bottom',
    roles: ['admin', 'manager', 'finance'],
  },
  {
    id: 'fin-aging',
    module: 'finance',
    title: 'گزارش سنی مطالبات',
    content: 'دسته‌بندی سنی بدهی‌ها بر پایه مانده دفتری و سیاست LIFO.',
    targetSelector: '#fin-aging',
    placement: 'bottom',
    roles: ['admin', 'manager', 'finance'],
  },
  {
    id: 'fin-trend',
    module: 'finance',
    title: 'تحلیل روند سود و زیان',
    content: 'پایش روند درآمدها، هزینه‌ها و سود عملیاتی از دفترکل.',
    targetSelector: '#fin-trend',
    placement: 'top',
    roles: ['admin', 'manager', 'finance'],
  },
  {
    id: 'fin-tabs',
    module: 'finance',
    title: 'حوزه‌های تخصصی مالی',
    content: 'جست‌وجو و جابه‌جایی بین خزانه، دریافتی‌ها، چک‌ها، فاکتورها و مطالبات.',
    targetSelector: '#fin-tabs',
    placement: 'top',
    roles: ['admin', 'manager', 'finance'],
  },
  {
    id: 'ops-summary',
    module: 'operations',
    title: 'خلاصه عملیات و زنجیره پخش',
    content: 'پایش سفارش‌ها، برگشتی‌ها و برنامه‌های پخش فعال.',
    targetSelector: '#ops-summary',
    placement: 'bottom',
    roles: ['admin', 'manager', 'operations'],
  },
  {
    id: 'ops-tabs',
    module: 'operations',
    title: 'نماهای عملیات و ناوگان',
    content: 'مشاهده سفارش‌ها، ناوگان توزیع، برگشتی‌ها و کیفیت چرخه.',
    targetSelector: '#ops-tabs',
    placement: 'bottom',
    roles: ['admin', 'manager', 'operations'],
  },
  {
    id: 'ops-reconciliation',
    module: 'operations',
    title: 'برگشتی و انطباق اسناد',
    content: 'پایش علل برگشتی و تطبیق با اسناد مالی.',
    targetSelector: '#ops-reconciliation',
    placement: 'top',
    roles: ['admin', 'manager', 'operations'],
  },
  {
    id: 'geo-header',
    module: 'geo-intelligence',
    title: 'اطلاعات مکانی و زون‌بندی',
    content: 'آمار زون‌های فعال، نسخه‌های هندسه و مشتریان دارای مختصات.',
    targetSelector: '#geo-header',
    placement: 'bottom',
    roles: ['admin', 'manager', 'operations'],
  },
  {
    id: 'geo-tabs',
    module: 'geo-intelligence',
    title: 'حالت‌های کاربری نقشه',
    content: 'جابه‌جایی بین تعریف زون، تحلیل تراکم و انتساب مشتریان.',
    targetSelector: '#geo-tabs',
    placement: 'bottom',
    roles: ['admin', 'manager', 'operations'],
  },
  {
    id: 'geo-editor',
    module: 'geo-intelligence',
    title: 'ویرایشگر ترسیم نقشه و چندضلعی',
    content: 'ترسیم لمسی چندضلعی مرزهای توزیع و ثبت نسخه‌دار.',
    targetSelector: '#geo-editor',
    placement: 'top',
    roles: ['admin', 'manager', 'operations'],
  },
  {
    id: 'cases-header',
    module: 'cases',
    title: 'میز خدمات و رسیدگی به شکایات',
    content: 'ثبت و پایش درخواست‌ها و شکایات مشتریان.',
    targetSelector: '#cases-header',
    placement: 'bottom',
    roles: ['all'],
  },
  {
    id: 'cases-list',
    module: 'cases',
    title: 'کارتابل تیکت‌های پشتیبانی',
    content: 'رسیدگی به پرونده‌ها بر اساس اولویت و مشتری.',
    targetSelector: '#cases-list',
    placement: 'top',
    roles: ['all'],
  },
  {
    id: 'campaigns-toolbar',
    module: 'marketing',
    title: 'برنامه‌ریزی کمپین‌ها',
    content: 'مدیریت پویش‌های فروش فصلی و پروموشن‌ها.',
    targetSelector: '#campaigns-toolbar',
    placement: 'bottom',
    roles: ['admin', 'manager', 'sales'],
  },
  {
    id: 'campaigns-list',
    module: 'marketing',
    title: 'فهرست کمپین‌ها و وضعیت اجرا',
    content: 'پایش وضعیت فعال، متوقف یا پایان‌یافته کمپین‌ها.',
    targetSelector: '#campaigns-list',
    placement: 'bottom',
    roles: ['admin', 'manager', 'sales'],
  },
  {
    id: 'campaigns-detail',
    module: 'marketing',
    title: 'جزئیات کمپین و سگمنت متصل',
    content: 'بررسی جامعه هدف و ارزیابی محلی سگمنت.',
    targetSelector: '#campaigns-detail',
    placement: 'top',
    roles: ['admin', 'manager', 'sales'],
  },
  {
    id: 'knowledge-search',
    module: 'knowledge',
    title: 'جست‌وجو در مقالات و شیوه‌نامه‌ها',
    content: 'یافتن سریع آیین‌نامه‌ها، بخشنامه‌ها و رویه‌ها.',
    targetSelector: '#knowledge-search',
    placement: 'bottom',
    roles: ['all'],
  },
  {
    id: 'knowledge-grid',
    module: 'knowledge',
    title: 'مخزن مستندات سازمانی',
    content: 'مطالعه و دسترسی به مقالات آموزشی شرکت.',
    targetSelector: '#knowledge-grid',
    placement: 'top',
    roles: ['all'],
  },
  {
    id: 'automation-tabs',
    module: 'internal_automation',
    title: 'کارتابل اداری و درخواست‌ها',
    content: 'تفکیک کارتابل تأیید، درخواست‌های من و جلسات اداری.',
    targetSelector: '#automation-tabs',
    placement: 'bottom',
    roles: ['all'],
  },
  {
    id: 'automation-inbox',
    module: 'internal_automation',
    title: 'جریان تأیید و گردش‌کار',
    content: 'بررسی درخواست‌های مرخصی، مأموریت و مساعده با سابقه مالی.',
    targetSelector: '#automation-inbox',
    placement: 'top',
    roles: ['all'],
  },
  {
    id: 'chat-inbox',
    module: 'groups',
    title: 'صندوق گفتگوها و کانال‌ها',
    content: 'پیام‌های مستقیم و گروه‌های کاری با فیلتر خوانده‌نشده و منشن.',
    targetSelector: '#chat-inbox',
    placement: 'bottom',
    roles: ['all'],
  },
  {
    id: 'chat-conversation',
    module: 'groups',
    title: 'محیط تعاملی گفتگو',
    content: 'مشاهده پیام‌ها همراه با پیوند رکوردهای سامانه و واکنش‌ها.',
    targetSelector: '#chat-conversation',
    placement: 'top',
    roles: ['all'],
  },
  {
    id: 'chat-composer',
    module: 'groups',
    title: 'ارسال پیام و ساخت تسک',
    content: 'منشن با @، پیوست مدارک و تبدیل پیام به وظیفه پیگیری.',
    targetSelector: '#chat-composer',
    placement: 'top',
    roles: ['all'],
  },
  {
    id: 'calendar-grid',
    module: 'calendar',
    title: 'گاه‌شمار هجری شمسی',
    content: 'نمای تقویمی ماه با علامت‌گذاری وظایف، جلسات و سررسید چک‌ها.',
    targetSelector: '#calendar-grid',
    placement: 'bottom',
    roles: ['all'],
  },
  {
    id: 'calendar-agenda',
    module: 'calendar',
    title: 'برنامه روزانه و جلسات',
    content: 'مشاهده رویدادها و ثبت مصوبه و وظیفه پیگیری.',
    targetSelector: '#calendar-agenda',
    placement: 'top',
    roles: ['all'],
  },
  {
    id: 'reports-overview',
    module: 'reports',
    title: 'گزارش‌های تحلیلی',
    content: 'انتخاب حوزه گزارش برای مشاهده تحلیل‌های مرتبط.',
    targetSelector: '#reports-domain-selector',
    placement: 'bottom',
    roles: ['all'],
  },
  {
    id: 'settings-nav',
    module: 'settings',
    title: 'سرفصل‌های تنظیمات سیستم',
    content: 'دسترسی منظم به اطلاعات سازمان، دسترسی‌ها، فرایندها و اتصال‌ها.',
    targetSelector: '#settings-nav',
    placement: 'bottom',
    roles: ['admin', 'manager'],
  },
  {
    id: 'settings-content',
    module: 'settings',
    title: 'پیکربندی ساختار و دسترسی‌ها',
    content: 'مدیریت سیاست‌های تجاری، قوانین اتوماسیون و زنجیره تأیید.',
    targetSelector: '#settings-content',
    placement: 'top',
    roles: ['admin', 'manager'],
  },
  {
    id: 'onboarding-tabs',
    module: 'onboarding',
    title: 'کارتابل منابع انسانی',
    content: 'بررسی متقاضیان استخدام، پرونده پرسنلی و محاسبه حقوق.',
    targetSelector: '#onboarding-tabs',
    placement: 'bottom',
    roles: ['admin', 'manager'],
  },
  {
    id: 'onboarding-content',
    module: 'onboarding',
    title: 'محاسبه حقوق و خروجی پایا',
    content: 'اجرای محاسبات دوره و خروجی فایل بانکی پایا.',
    targetSelector: '#onboarding-content',
    placement: 'top',
    roles: ['admin', 'manager'],
  },
  {
    id: 'personnel-nav',
    module: 'personnel-file',
    title: 'مراحل تکمیل پرونده استخدامی',
    content: 'مشاهده وضعیت تکمیل اطلاعات هویتی، بانکی، نشانی و مدارک.',
    targetSelector: '#personnel-nav',
    placement: 'bottom',
    roles: ['all'],
  },
  {
    id: 'personnel-form',
    module: 'personnel-file',
    title: 'فیش حقوقی و ثبت مساعده',
    content: 'مشاهده فیش حقوقی صادرشده و ثبت درخواست مساعده.',
    targetSelector: '#personnel-form',
    placement: 'top',
    roles: ['all'],
  },
  {
    id: 'profile-card',
    module: 'profile',
    title: 'شناسنامه کاربری و قلمرو دید',
    content: 'مشاهده مشخصات فردی، نقش سازمانی و محدوده دید اطلاعاتی.',
    targetSelector: '#profile-card',
    placement: 'bottom',
    roles: ['all'],
  },
  {
    id: 'profile-stats',
    module: 'profile',
    title: 'آمار عملکرد شخصی',
    content: 'تعداد وظایف، پیش‌فاکتورها و فرصت‌های تجاری شما.',
    targetSelector: '#profile-stats',
    placement: 'bottom',
    roles: ['all'],
  },
  {
    id: 'profile-switch',
    module: 'profile',
    title: 'شبیه‌ساز سوییچ نقش‌ها',
    content: 'آزمون رفتار سامانه و محدوده‌های مختلف داده با سوییچ بین کاربران.',
    targetSelector: '#profile-switch',
    placement: 'top',
    roles: ['all'],
  },
  {
    id: 'sync-center-overview',
    module: 'sync-center',
    title: 'مرکز همگام‌سازی داده‌ها',
    content: 'وضعیت ذخیره و بازیابی اطلاعات پایگاه داده مرکزی و کنترل کیفیت داده.',
    targetSelector: '#sync-center-heading',
    placement: 'bottom',
    roles: ['all'],
  },
  {
    id: 'audit-overview',
    module: 'audit',
    title: 'پایش مغایرت و کیفیت داده',
    content: 'مشاهده یافته‌ها، شدت، شواهد فنی و دامنه‌های ارزیابی‌نشده هر حوزه.',
    targetSelector: '#audit-heading',
    placement: 'bottom',
    roles: ['all'],
  },
];

export const WHATS_NEW_ITEMS: WhatsNewItem[] = [
  {
    id: 'wn-unified-workspaces',
    version: '0.12.62',
    title: 'بازآرایی ۸ فضای کاری یکپارچه و کاتالوگ یگانه',
    description: 'ساختاردهی همه امکانات در ۸ فضای کاری با صفحه ورود آیکونی کم‌تراکم و اقدام + زمینه‌مند در هدر.',
    tag: 'IMPROVED',
    module: 'workspace',
    route: '/workspace/home',
  },
  {
    id: 'wn-churn-erp',
    version: '0.12.62',
    title: 'اتصال پیش‌بینی ریزش به فاکتورهای واقعی و تنظیمات سازمان',
    description: 'محاسبه افت خرید و کهنگی سفارش از فاکتورهای معتبر با آستانه‌های قابل پیکربندی.',
    tag: 'IMPROVED',
    module: 'accounts',
    route: '/accounts',
  },
  {
    id: 'wn-churn-engine',
    version: '0.12.63',
    title: 'ویرایش آستانه‌های ریزش در تنظیمات سازمان',
    description: 'آستانهٔ ریزش با رقم فارسی ثبت می‌شود. برای بازگشت به پیش‌فرض، مقدار سفارشی را پاک کنید.',
    tag: 'IMPROVED',
    module: 'settings',
    route: '/definitions?tab=org',
  },
  {
    id: 'wn-paya-banking',
    version: '0.12.48',
    title: 'محاسبه حقوق و خروجی فایل بانکی پایا',
    description: 'موتور استاندارد محاسبه کارکرد، کسر مساعده و مالیات پلکانی همراه با خروجی واریز گروهی پایا.',
    tag: 'NEW',
    module: 'onboarding',
    route: '/onboarding',
  },
  {
    id: 'wn-sayad-validation',
    version: '0.12.31',
    title: 'اعتبارسنجی ۱۶ رقمی چک صیادی',
    description: 'ثبت چک‌های دریافتی تنها با شناسه ۱۶ رقمی عددی معتبر و جلوگیری از ثبت تکراری.',
    tag: 'SECURITY',
    module: 'finance',
    route: '/finance',
  },
];

export interface TourStorageState {
  activeModule: string | null;
  currentStepIndex: number;
  isPaused: boolean;
  completedModules: Record<string, boolean>;
  dismissedWhatsNewVersion?: string;
}

const STORAGE_KEY = 'akhavan_interactive_tour_state';

export function loadTourState(): TourStorageState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return {
    activeModule: null,
    currentStepIndex: 0,
    isPaused: false,
    completedModules: {},
  };
}

export function saveTourState(state: TourStorageState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // fallback
  }
}

export function getStepsForModuleAndRole(module: string, roleName?: string): TourStep[] {
  const normRole = (roleName || '').toLowerCase();
  let userRole: TourRole = 'all';
  if (normRole.includes('admin') || normRole.includes('مدیر کل') || normRole.includes('مدیر سیستم')) userRole = 'admin';
  else if (normRole.includes('فروش') || normRole.includes('sales')) userRole = 'sales';
  else if (normRole.includes('مالی') || normRole.includes('finance') || normRole.includes('حسابدار')) userRole = 'finance';
  else if (normRole.includes('عملیات') || normRole.includes('پخش') || normRole.includes('لجستیک')) userRole = 'operations';
  else if (normRole.includes('سرپرست') || normRole.includes('manager')) userRole = 'manager';

  return ALL_TOUR_STEPS.filter(step => {
    if (module !== 'all' && step.module !== module) return false;
    if (!step.roles || step.roles.includes('all')) return true;
    return step.roles.includes(userRole) || userRole === 'admin';
  });
}

export interface TourModuleInfo {
  id: string;
  label: string;
  icon: string;
  route: string;
}

/** هر مسیر برنامه دارای نگاشت پایدار است. */
export const TOUR_MODULES: TourModuleInfo[] = [
  { id: 'global', label: 'راهنمای عمومی و ناوبری', icon: 'Compass', route: '/' },
  { id: 'workspace', label: 'فضاهای کاری و صفحه‌های ورودی', icon: 'LayoutDashboard', route: '/workspace/home' },
  { id: 'home', label: 'صفحهٔ خانه', icon: 'Home', route: '/' },
  { id: 'dashboard', label: 'داشبورد مدیریتی و شاخص‌ها', icon: 'Gauge', route: '/dashboard' },
  { id: 'command', label: 'مرکز فرماندهی', icon: 'Gauge', route: '/command' },
  { id: 'accounts', label: 'پرونده ۳۶۰ درجه مشتریان', icon: 'Users', route: '/accounts' },
  { id: 'leads', label: 'سرنخ‌ها', icon: 'UserPlus', route: '/leads' },
  { id: 'opportunities', label: 'فرصت‌ها و مذاکرات', icon: 'TrendingUp', route: '/opportunities' },
  { id: 'quotes', label: 'میز مذاکره و قیمت‌گذاری', icon: 'FileSpreadsheet', route: '/quotes' },
  { id: 'activities', label: 'فعالیت‌ها و ویزیت‌ها', icon: 'Activity', route: '/activities' },
  { id: 'tasks', label: 'پیگیری و کارتابل وظایف', icon: 'CheckSquare', route: '/tasks' },
  { id: 'finance', label: 'امور مالی، خزانه‌داری و چک', icon: 'Wallet', route: '/finance' },
  { id: 'operations', label: 'بازرگانی و توزیع', icon: 'Truck', route: '/operations' },
  { id: 'geo-intelligence', label: 'هوش مکانی و زون‌ها', icon: 'MapPinned', route: '/geo-intelligence' },
  { id: 'cases', label: 'تیکت‌ها و شکایات', icon: 'LifeBuoy', route: '/cases' },
  { id: 'marketing', label: 'کمپین‌ها', icon: 'Megaphone', route: '/marketing' },
  { id: 'knowledge', label: 'پایگاه دانش', icon: 'BookOpen', route: '/knowledge' },
  { id: 'internal_automation', label: 'اتوماسیون داخلی', icon: 'GitBranch', route: '/internal_automation' },
  { id: 'groups', label: 'گفتگوها و گروه‌ها', icon: 'MessageSquare', route: '/groups' },
  { id: 'calendar', label: 'تقویم', icon: 'Calendar', route: '/calendar' },
  { id: 'reports', label: 'گزارش‌ها', icon: 'BarChart3', route: '/reports' },
  { id: 'settings', label: 'تنظیمات', icon: 'Settings', route: '/settings' },
  { id: 'sync-center', label: 'مرکز داده و همگام‌سازی', icon: 'Database', route: '/sync-center' },
  { id: 'audit', label: 'پایش مغایرت و کیفیت داده', icon: 'SearchCheck', route: '/audit' },
  { id: 'onboarding', label: 'پذیرش و پرونده پرسنل', icon: 'ClipboardCheck', route: '/onboarding' },
  { id: 'personnel-file', label: 'پرونده پرسنلی من', icon: 'UserCheck', route: '/personnel-file' },
  { id: 'profile', label: 'پروفایل من', icon: 'User', route: '/profile' },
];

export function getAvailableModules(): { id: string; label: string; icon: string }[] {
  return TOUR_MODULES.map(({ id, label, icon }) => ({ id, label, icon }));
}

/** ماژول تور مربوط به مسیر جاری. */
export function moduleForPath(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)[0] || '';
  if (!seg) return 'home';
  if (seg === 'workspace' || seg === 'planned') return 'workspace';
  return TOUR_MODULES.some(m => m.id === seg) ? seg : 'global';
}

export function routeForModule(moduleId: string): string | null {
  return TOUR_MODULES.find(m => m.id === moduleId)?.route ?? null;
}
