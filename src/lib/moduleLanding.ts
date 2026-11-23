import {
  Activity, Archive, ArrowDownLeft, ArrowLeftRight, Banknote, BarChart2, BarChart3,
  BellRing, BookOpen, Bot, Boxes, Building2, CalendarDays, ChartNoAxesCombined,
  CheckSquare, ClipboardList, Coins, Compass, CreditCard, Database, FileCheck,
  FileSpreadsheet, FileText, Gauge, GraduationCap, Home, Landmark, Layers,
  LayoutGrid, LifeBuoy, Link2, MapPinned, Megaphone, MessageSquare, Package,
  Percent, PieChart, Receipt, RefreshCw, RotateCcw, Route, Scale, SearchCheck,
  Settings2, Shield, ShieldCheck, ShoppingCart, Sliders, Tag, Target, TrendingUp,
  Truck, UserCheck, UserPlus, Users, Wallet, Workflow, type LucideIcon,
} from 'lucide-react';

export interface ModuleLandingTile {
  id: string;
  label: string;
  description: string;
  path: string;
  perm: string;
  icon: LucideIcon;
}

export interface ModuleLandingGroup {
  title: string;
  tiles: ModuleLandingTile[];
}

export interface ModuleLandingDefinition {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  groups: ModuleLandingGroup[];
}

const tile = (
  id: string,
  label: string,
  description: string,
  path: string,
  perm: string,
  icon: LucideIcon
): ModuleLandingTile => ({ id, label, description, path, perm, icon });

/**
 * F1-01 / F1-02 / F1-03 / F1-06 / F1-07 / F3-02:
 * کاتالوگ یگانهٔ هشت فضای کاری نهایی (طبق MASTER_SPEC §3).
 * تمام Routeها و Deep Linkهای قبلی حفظ شده‌اند و هر فضا آیکون یکتا برای هر کاشی دارد.
 */
export const MODULE_LANDINGS: ModuleLandingDefinition[] = [
  {
    id: 'home',
    title: 'خانه و کارهای من',
    description: 'نمای کلی مدیریت، کارتابل روزانه، زمان‌بندی جلسات و ارتباطات سازمانی',
    icon: Home,
    groups: [
      {
        title: 'پایش',
        tiles: [
          tile('dashboard', 'داشبورد مدیریتی', 'شاخص‌ها و وضعیت کلی سازمان', '/dashboard', 'dashboard', ChartNoAxesCombined),
          tile('command', 'مرکز فرماندهی', 'پایش رویدادها، نقدینگی و تصمیم‌های کلیدی', '/command', 'command', Compass),
          tile('audit-home', 'پایش سلامت سازمان', 'یافته‌ها و کنترل کیفیت داده‌های قابل ارزیابی', '/audit?module=home', 'dashboard', SearchCheck),
        ],
      },
      {
        title: 'کار روزانه',
        tiles: [
          tile('tasks', 'تسک‌ها و پیگیری‌ها', 'وظایف، ارجاع و مهلت انجام', '/tasks', 'tasks', CheckSquare),
          tile('requests', 'درخواست‌های سازمانی', 'کارتابل و ثبت درخواست‌های داخلی', '/internal_automation', 'internal_automation', Workflow),
        ],
      },
      {
        title: 'زمان‌بندی',
        tiles: [
          tile('calendar', 'تقویم کاری', 'رویدادها، مهلت‌ها و برنامه روزانه', '/calendar', 'calendar', CalendarDays),
          tile('meetings', 'جلسات و مصوبات', 'برنامه جلسات و پیگیری مصوبات', '/calendar?tab=meetings', 'calendar', Users),
        ],
      },
      {
        title: 'ارتباط',
        tiles: [
          tile('messages', 'پیام‌ها و گروه‌ها', 'گفت‌وگوهای مستقیم و گروهی همکاران', '/groups', 'groups', MessageSquare),
          tile('activities', 'تاریخچه فعالیت', 'سوابق تماس، ویزیت و رویدادهای ثبت‌شده', '/activities', 'activities', Activity),
        ],
      },
    ],
  },
  {
    id: 'master',
    title: 'تعاریف پایه و داده',
    description: 'مرکز داده، هویت طرف‌حساب‌ها، کالا، جغرافیا، کدینگ مالی و اهداف پایه',
    icon: Database,
    groups: [
      {
        title: 'مرکز داده و همگام‌سازی',
        tiles: [
          tile('sync-center', 'مرکز داده و همگام‌سازی', 'وضعیت پایگاه داده مرکزی، همگام‌سازی و کیفیت داده', '/sync-center', 'settings', RefreshCw),
          tile('audit-master', 'پایش کیفیت داده', 'کنترل مغایرت و یکپارچگی اطلاعات پایه', '/audit?module=organization', 'settings', SearchCheck),
        ],
      },
      {
        title: 'هویت و سازمان',
        tiles: [
          tile('master-users', 'کاربران و نقش‌ها', 'مدیریت کاربران، نقش‌ها و زنجیره گزارش‌دهی', '/settings?tab=users', 'users', Users),
          tile('master-teams', 'تیم‌ها و گروه‌های کاری', 'ساختار تیمی و شعب سازمان', '/settings?tab=groups', 'settings', Building2),
          tile('master-personnel', 'پرسنل و پرونده‌ها', 'مدیریت پرونده کارکنان و کدهای پرسنلی', '/onboarding', 'onboarding', UserCheck),
        ],
      },
      {
        title: 'کالا و بازار',
        tiles: [
          tile('master-products', 'کالا و کاتالوگ', 'اقلام کالایی مرجع سامانه مالی', '/operations?tab=inventory', 'ops.inventory', Package),
          tile('master-promotions', 'طرح پروموشن و بودجه', 'پیشنهادهای تشویقی و کمپین‌ها', '/marketing', 'marketing', Megaphone),
        ],
      },
      {
        title: 'جغرافیا و مالی پایه',
        tiles: [
          tile('master-geo', 'زون‌ها و مسیرهای جغرافیایی', 'تعریف محدوده‌ها و مرزهای توزیع', '/geo-intelligence', 'geo_intelligence', MapPinned),
          tile('master-coding', 'کدینگ، بانک و خزانه پایه', 'نمای کدینگ، حساب‌های بانکی و خزانه', '/finance?tab=treasury', 'finance', Landmark),
        ],
      },
    ],
  },
  {
    id: 'sales',
    title: 'مشتریان و فروش',
    description: 'پرونده مشتریان، خدمات، قیف فروش، مذاکره، اهداف و گزارش‌های فروش',
    icon: Users,
    groups: [
      {
        title: 'مشتریان',
        tiles: [
          tile('accounts', 'پرونده مشتریان', 'بانک مشتریان و پرونده ۳۶۰ درجه', '/accounts', 'accounts', Users),
          tile('fin-credit-scoring', 'اعتبارسنجی مشتریان', 'امتیاز و سقف اعتبار مشتری', '/planned?item=fin-credit-scoring', 'finance', ShieldCheck),
        ],
      },
      {
        title: 'خدمات و بازار',
        tiles: [
          tile('cases', 'تیکت‌ها و خدمات', 'درخواست‌ها و پرونده‌های پشتیبانی', '/cases', 'cases', LifeBuoy),
          tile('knowledge', 'پایگاه دانش', 'مقالات، بخشنامه‌ها و راهنماهای سازمانی', '/knowledge', 'knowledge', BookOpen),
          tile('marketing', 'کمپین‌ها و بازاریابی', 'مدیریت کمپین‌ها و بخش‌بندی مشتریان', '/marketing', 'marketing', Megaphone),
        ],
      },
      {
        title: 'قیف فروش و مذاکره',
        tiles: [
          tile('leads', 'سرنخ‌های فروش', 'ثبت و پیگیری سرنخ‌های ورودی', '/leads', 'leads', UserPlus),
          tile('opportunities', 'فرصت‌های فروش', 'پایپ‌لاین و مراحل مذاکره', '/opportunities', 'leads', TrendingUp),
          tile('quotes', 'میز مذاکره و قیمت‌گذاری', 'پیشنهاد قیمت و تحلیل حاشیه سود', '/quotes', 'quotes', FileSpreadsheet),
        ],
      },
      {
        title: 'اهداف، گزارش و پایش فروش',
        tiles: [
          tile('sales-reports', 'گزارش‌های فروش و درآمد', 'عملکرد فروش، محصولات، مشتریان و ویزیت', '/reports?tab=sales', 'reports', ChartNoAxesCombined),
          tile('advanced-analytics', 'بینش‌های عمیق مالی و بازرگانی', 'گزارش‌های تحلیلی با شواهد، فیلتر و جزئیات', '/reports?view=analytical', 'reports', TrendingUp),
          tile('audit-sales', 'پایش مغایرت فروش', 'کنترل کیفیت و مغایرت‌های فروش و مشتری', '/audit?module=sales', 'leads', SearchCheck),
          tile('fin-targets', 'اهداف و تحقق فروش', 'تعریف هدف و پایش تحقق', '/planned?item=fin-targets', 'finance', Target),
          tile('fin-commission', 'محاسبه پورسانت', 'هدف، پلکان و ضرایب پورسانت', '/planned?item=fin-commission', 'finance', Percent),
        ],
      },
    ],
  },
  {
    id: 'commerce',
    title: 'بازرگانی و توزیع',
    description: 'سفارشات سامانه مرجع، فاکتورها، موجودی، برنامه پخش، برگشتی و کیفیت تحویل',
    icon: Truck,
    groups: [
      {
        title: 'سفارش و فاکتور',
        tiles: [
          tile('ops-overview', 'نمای کلی عملیات', 'خلاصه وضعیت چرخه سفارش و توزیع', '/operations?tab=overview', 'operations_control', LayoutGrid),
          tile('orders', 'سفارشات سامانه مرجع', 'سفارش‌های واردشده از سامانه مالی', '/operations?tab=orders', 'ops.orders', Package),
          tile('invoices', 'فاکتورها', 'فاکتورهای رسمی و وضعیت آن‌ها', '/finance?tab=invoices', 'finance', Receipt),
          tile('fin-invoice-discount', 'تخفیفات فاکتور', 'ثبت و کنترل تخفیف هر فاکتور', '/planned?item=fin-invoice-discount', 'finance', Tag),
        ],
      },
      {
        title: 'انبار و کالا',
        tiles: [
          tile('inventory', 'کالا و موجودی', 'نمای فقط‌خواندنی کالا، موجودی و ارزش FIFO', '/operations?tab=inventory', 'ops.inventory', Boxes),
        ],
      },
      {
        title: 'توزیع و مسیرها',
        tiles: [
          tile('dispatch', 'برنامه پخش', 'برنامه‌ریزی خودروها، ظرفیت و مسیر ارسال', '/operations?tab=dispatch', 'ops.dispatch', Truck),
          tile('geo', 'هوش مکانی و زون‌ها', 'محدوده‌های جغرافیایی و پوشش مشتریان', '/geo-intelligence', 'geo_intelligence', MapPinned),
          tile('dist-route-planning', 'تور و مسیر ویزیت ERP', 'مسیر و تور رسمی از ERP؛ بررسی مکانی فقط ابزار کمکی است', '/geo-intelligence?mode=operations', 'geo_intelligence', Route),
          tile('dist-operations', 'یکپارچگی عملیات توزیع', 'فاکتور، موجودی، خودرو، راننده و تسویه', '/planned?item=dist-operations', 'ops.dispatch', Layers),
        ],
      },
      {
        title: 'برگشتی و گزارش توزیع',
        tiles: [
          tile('returns', 'برگشتی‌ها', 'پایش برگشت از فروش و اسناد مرتبط', '/operations?tab=returns', 'ops.returns', RotateCcw),
          tile('operations-quality', 'کیفیت چرخه سفارش', 'پوشش بهای تمام‌شده و سلامت چرخه', '/operations?tab=reports', 'ops.reports', ShieldCheck),
          tile('distribution-reports', 'گزارش توزیع و مسیرها', 'تحلیل تحویل به‌موقع و برگشتی‌ها', '/reports?tab=distribution', 'reports', BarChart3),
          tile('audit-commerce', 'پایش مغایرت بازرگانی', 'کنترل کیفیت کالا، مسیر و اسناد بازرگانی', '/audit?module=commerce', 'ops.orders', SearchCheck),
          tile('dist-settlement-sales', 'هماهنگی تسویه و برگشتی با فروش', 'تسویه یا برگشتی هر فاکتور', '/planned?item=dist-settlement-sales', 'ops.dispatch', ArrowLeftRight),
        ],
      },
    ],
  },
  {
    id: 'procurement',
    title: 'خرید و تأمین',
    description: 'درخواست تأمین بار، سفارش خرید، دریافت کالا و پیگیری تعهدات تأمین‌کنندگان',
    icon: ShoppingCart,
    groups: [
      {
        title: 'تأمین و سفارش خرید',
        tiles: [
          tile('purchasing', 'درخواست و سفارش خرید', 'ثبت و پیگیری درخواست تأمین و سفارش خرید', '/operations?tab=purchasing', 'ops.purchasing', ShoppingCart),
          tile('proc-inventory', 'وضعیت موجودی کالاها', 'کالاهای زیر نقطه سفارش و نیاز تأمین', '/operations?tab=inventory', 'ops.inventory', Package),
        ],
      },
      {
        title: 'اسناد و پایش تأمین',
        tiles: [
          tile('proc-expenses', 'هزینه‌ها و پرداخت تأمین', 'پایش اسناد هزینه و تعهدات مرتبط', '/finance?tab=expenses', 'finance', Receipt),
          tile('audit-procurement', 'پایش مغایرت تأمین', 'کنترل کیفیت داده‌های کالا و تأمین', '/audit?module=commerce', 'ops.purchasing', SearchCheck),
        ],
      },
    ],
  },
  {
    id: 'finance',
    title: 'مالی و خزانه‌داری',
    description: 'خزانه، دریافتی‌ها، چک‌ها، مطالبات، اعتبار مشتریان، سودآوری و گزارش‌های مالی',
    icon: Wallet,
    groups: [
      {
        title: 'خزانه و بانک',
        tiles: [
          tile('finance-overview', 'نمای کلی مالی', 'خلاصه مطالبات، سررسیدها و وضعیت مالی', '/finance?tab=overview', 'finance', Gauge),
          tile('treasury', 'خزانه‌داری', 'نمای تجمیعی گردش وجوه و حساب‌ها', '/finance?tab=treasury', 'finance', Landmark),
          tile('fin-liquidity', 'نقدینگی و حساب‌های بانکی', 'مانده بانک، پیش‌بینی و گردش', '/finance?tab=treasury', 'finance', Coins),
          tile('fin-cashbox', 'مدیریت صندوق', 'مانده و گردش صندوق', '/planned?item=fin-cashbox', 'finance', Wallet),
        ],
      },
      {
        title: 'دریافت و پرداخت',
        tiles: [
          tile('payments', 'دریافتی‌ها و رسیدها', 'ثبت، تطبیق و تخصیص دریافتی‌ها', '/finance?tab=payments', 'finance', Banknote),
          tile('cheques', 'چک‌ها', 'چک‌های دریافتی و پرداختی صیادی', '/finance?tab=cheques', 'finance', FileText),
          tile('finance-payment-requests', 'دستورهای پرداخت و تسویه', 'درخواست‌های پرداخت و تأیید حسابداری', '/finance?tab=requests', 'finance', ClipboardList),
          tile('fin-payments', 'مدیریت پرداخت‌ها', 'دستور پرداخت قطعی و غیرقطعی', '/planned?item=fin-payments', 'finance', CreditCard),
        ],
      },
      {
        title: 'مطالبات و اعتبار',
        tiles: [
          tile('collection', 'مطالبات و وصول', 'مانده دفتری، سنی تخمینی و پیگیری وصول', '/finance?tab=collection', 'finance', ArrowDownLeft),
          tile('credit-risk', 'ریسک اعتباری مشتریان', 'پایش اعتبار، چک برگشتی و نرخ تسویه', '/operations?tab=credit', 'ops.credit', ShieldCheck),
          tile('receivables-reports', 'گزارش‌های مطالبات', 'تحلیل سنی و تمرکز مطالبات', '/reports?tab=receivables', 'finance.reports', BarChart2),
        ],
      },
      {
        title: 'حسابداری، سودآوری و پایش',
        tiles: [
          tile('credits', 'اسناد بستانکاری', 'اعلامیه‌ها و درخواست‌های بستانکاری', '/finance?tab=credits', 'finance', FileCheck),
          tile('expenses', 'هزینه‌ها', 'ثبت و بررسی اسناد هزینه', '/finance?tab=expenses', 'finance', Receipt),
          tile('profitability', 'سودآوری عملیات', 'تحلیل سودآوری فروش و هزینه‌های پخش', '/operations?tab=profitability', 'ops.profitability', TrendingUp),
          tile('finance-reports', 'گزارش‌های مالی', 'سود و زیان دفتری و جریان نقدینگی', '/reports?tab=finance', 'finance.reports', PieChart),
          tile('finance-intelligence', 'هوش مالی و تحلیل نقدینگی', '۱۱ گزارش بینشی با سود و زیان دفتری و شواهد قابل پیگیری', '/reports?view=analytical&report=1', 'finance.reports', TrendingUp),
          tile('audit-finance', 'پایش مغایرت مالی', 'کنترل کدینگ، ماهیت حساب و توازن اسناد', '/audit?module=finance', 'finance', SearchCheck),
          tile('fin-budget', 'بودجه‌ریزی', 'بودجه دوره‌ای هر واحد', '/planned?item=fin-budget', 'finance', Target),
          tile('fin-cost-control', 'کنترل هزینه‌ها', 'هزینه در برابر بودجه', '/planned?item=fin-cost-control', 'finance', Sliders),
          tile('fin-invoice-profit', 'سود فاکتور', 'سود هر فاکتور بر مبنای بهای تمام‌شده', '/finance?tab=invoices&view=margin', 'finance.invoiceMargin', Percent),
          tile('fin-dispatch-profit', 'سود برنامه توزیع', 'سود هر برنامه توزیع', '/planned?item=fin-dispatch-profit', 'finance', Truck),
          tile('fin-cash-discount', 'تخفیف نقد فاکتور و پخش', 'کنترل تخفیف نقد در فاکتور و برنامه توزیع', '/planned?item=fin-cash-discount', 'finance', Tag),
        ],
      },
    ],
  },
  {
    id: 'hr',
    title: 'منابع انسانی و حقوقی',
    description: 'جذب و استخدام، پرونده پرسنلی، حقوق و دستمزد، آموزش، ارزیابی و امور حقوقی',
    icon: UserCheck,
    groups: [
      {
        title: 'جذب و پرسنل',
        tiles: [
          tile('hr-recruitment', 'جذب و پروندهٔ متقاضیان', 'بررسی درخواست همکاری، مصاحبه و پذیرش', '/onboarding?tab=apps', 'onboarding', UserPlus),
          tile('onboarding', 'پرونده‌های پرسنلی', 'بررسی و تکمیل پروندهٔ کارکنان', '/onboarding?tab=files', 'onboarding', Users),
        ],
      },
      {
        title: 'حقوق و دستمزد',
        tiles: [
          tile('hr-payroll', 'حقوق و دستمزد', 'کارکرد، اضافه‌کاری، مساعده و خالص پرداختی', '/planned?item=hr-payroll', 'onboarding', Banknote),
          tile('hr-payslip', 'فیش حقوقی، مزایا و کسورات', 'صدور فیش ماهانه و تاریخچه فیش‌ها', '/planned?item=hr-payslip', 'onboarding', Receipt),
        ],
      },
      {
        title: 'آموزش و رشد',
        tiles: [
          tile('hr-training', 'مدیریت آموزش کارکنان', 'انتشار دوره و تخصیص آزمون به کارکنان', '/onboarding?tab=learning', 'hr.learningCatalog', GraduationCap),
          tile('hr-evaluation', 'سوابق آموزشی و ارزیابی عملکرد', 'سوابق آموزش و ارزیابی دوره‌ای', '/planned?item=hr-evaluation', 'onboarding', ChartNoAxesCombined),
          tile('audit-hr', 'پایش امور پرسنلی', 'کنترل گردش کار و دسترسی‌های مرتبط', '/audit?module=work', 'onboarding', SearchCheck),
        ],
      },
      {
        title: 'حقوقی و قراردادها',
        tiles: [
          tile('legal-contracts', 'قراردادها', 'تنظیم و مدیریت قراردادها', '/planned?item=legal-contracts', 'settings', FileText),
          tile('legal-archive', 'بایگانی قراردادها', 'ثبت، بایگانی و جست‌وجوی اسناد', '/planned?item=legal-archive', 'settings', Archive),
          tile('legal-renewal', 'تمدید و اعتبار قراردادها', 'کنترل تاریخ اعتبار و تمدید', '/planned?item=legal-renewal', 'settings', CalendarDays),
          tile('legal-cases', 'پرونده‌های حقوقی', 'پیگیری پرونده‌ها و جلسات', '/planned?item=legal-cases', 'settings', Scale),
          tile('legal-expiry', 'هشدار انقضای اسناد و مجوزها', 'سررسید مجوزها و اسناد سازمان', '/planned?item=legal-expiry', 'settings', BellRing),
        ],
      },
    ],
  },
  {
    id: 'organization',
    title: 'سازمان و تنظیمات',
    description: 'سیاست‌های سازمان، دسترسی‌ها و نقش‌ها، قوانین گردش‌کار، اتصال‌ها و زبان',
    icon: Settings2,
    groups: [
      {
        title: 'سازمان و دسترسی',
        tiles: [
          tile('settings', 'تنظیمات سازمان', 'اطلاعات پایه و سیاست‌های کلان سازمان', '/settings', 'settings', Settings2),
          tile('permissions', 'پروفایل دسترسی و مجوزها', 'مدیریت مجموعه مجوزها و سطح دسترسی', '/settings?tab=users&sub=permissions', 'users', Shield),
          tile('teams', 'تیم‌ها و گروه‌های کاری', 'تنظیم ساختار تیمی و عضویت', '/settings?tab=groups', 'settings', Building2),
        ],
      },
      {
        title: 'قواعد و سیاست‌ها',
        tiles: [
          tile('workflows', 'قوانین و گردش کار', 'قوانین اتوماسیون و زنجیره تأییدها', '/settings?tab=rules', 'settings', Workflow),
          tile('sales-policies', 'قوانین تجاری فروش', 'سیاست‌های اعتبار، تخفیف و حاشیه سود', '/operations?tab=policies', 'ops.policies', FileSpreadsheet),
          tile('locale', 'زبان و تقویم', 'تنظیمات زبان، تقویم شمسی و چگالی رابط', '/settings?tab=locale', 'settings', CalendarDays),
        ],
      },
      {
        title: 'اتصال، دستیارها و پایش',
        tiles: [
          tile('integrations', 'یکپارچه‌سازی‌ها', 'پیکربندی منابع و سرویس‌های خارجی', '/settings?tab=integrations', 'settings', Link2),
          tile('agents', 'دستیاران و کانال‌ها', 'تنظیم دستیارهای هوشمند و کانال‌ها', '/settings?tab=agents', 'settings', Bot),
          tile('audit-org', 'پایش پیکربندی و کدینگ', 'کنترل کیفیت داده‌های پایه و سرفصل‌ها', '/audit?module=organization', 'settings', SearchCheck),
        ],
      },
    ],
  },
];

const LEGACY_MODULE_ALIASES: Record<string, string> = {
  customers: 'sales',
  work: 'home',
  reports: 'sales',
};

/** نگاشت شناسه‌های قدیمی فضاها برای حفظ Deep Linkهای قبلی */
export function resolveModuleLandingId(moduleId: string | undefined): string | undefined {
  if (!moduleId) return undefined;
  return LEGACY_MODULE_ALIASES[moduleId] || moduleId;
}

/** ورودی‌های «در دست تکمیل» به صفحه یکسان وضعیت می‌روند؛ ماژول واقعی نیستند. */
export const isPlannedTile = (item: Pick<ModuleLandingTile, 'path'>): boolean => item.path.startsWith('/planned');

export function getModuleLanding(moduleId: string | undefined): ModuleLandingDefinition | undefined {
  const resolved = resolveModuleLandingId(moduleId);
  return MODULE_LANDINGS.find(module => module.id === resolved);
}

export const MODULE_ACCESS_PERMS: Record<string, string[]> = Object.fromEntries(
  MODULE_LANDINGS.map(module => [
    module.id,
    [...new Set(module.groups.flatMap(group => group.tiles.map(item => item.perm)))],
  ])
);
