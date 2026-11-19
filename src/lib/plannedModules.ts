// کاتالوگ واحدهای سازمانی «برنامه‌ریزی‌شده»: ورودی منو وجود دارد ولی ماژول تکمیل نشده است.
// منبع نیازمندی: سند معماری سازمانی مالک محصول. هیچ داده یا وضعیت ساختگی در این فایل نیست.
// وضعیت هر تحویل‌شدنی فقط پس از پیاده‌سازی و آزمون واقعی و ثبت در Checklist تغییر می‌کند.

export type PlannedUnit = 'hr' | 'legal' | 'fin' | 'dist';
export type DeliverableStatus = 'NOT_BUILT' | 'PARTIAL' | 'UNVERIFIED';

export interface PlannedModule {
  id: string;
  title: string;
  unit: PlannedUnit;
  unitLabel: string;
  summary: string;
  perm: string;
  requirements: string[];
  existing?: { label: string; path: string };
}

/** تحویل‌شدنی‌های الزامی هر ماژول (بخش ۷ سند مالک). */
export const PLANNED_DELIVERABLES: string[] = [
  'رابط کاربری کامل', 'منطق اجرایی و گردش کار', 'ساختار پایگاه داده', 'رابط‌های برنامه‌نویسی موردنیاز',
  'گزارش‌ها و داشبورد', 'تست عملکرد و یکپارچگی', 'نقش‌ها، مجوزها و تاریخچه تغییرات',
];

export const PLANNED_MODULES: PlannedModule[] = [
  { id: "hr-recruitment", title: "جذب و استخدام", unit: "hr", unitLabel: "منابع انسانی و آموزش", summary: "نیاز استخدام، مراحل جذب و پذیرش", perm: "onboarding",
    requirements: ["ثبت نیاز استخدام و آگهی", "گردش مراحل جذب: رزومه، مصاحبه، پیشنهاد، پذیرش", "تأیید سازمانی هر مرحله با تاریخچه"] },
  { id: "hr-applicants", title: "متقاضیان و پرونده استخدامی", unit: "hr", unitLabel: "منابع انسانی و آموزش", summary: "بانک متقاضیان و مدارک استخدامی", perm: "onboarding",
    requirements: ["بانک متقاضیان و جست‌وجو", "پرونده استخدامی و پیوست مدارک", "تبدیل متقاضی پذیرفته‌شده به پرونده پرسنلی"],
    existing: { label: "پذیرش و پرونده پرسنلی (موجود، تکمیل‌نشده)", path: "/onboarding" } },
  { id: "hr-payroll", title: "حقوق و دستمزد", unit: "hr", unitLabel: "منابع انسانی و آموزش", summary: "کارکرد، اضافه‌کاری، مساعده و خالص پرداختی", perm: "onboarding",
    requirements: ["حقوق ثابت، کارکرد، اضافه‌کاری و مأموریت", "محاسبه ناخالص، کسورات و خالص قابل پرداخت", "مساعده، بدهی پرسنل و تسویه", "ذخیره دائمی در پایگاه داده با نسخه محاسباتی هر فیش"],
    existing: { label: "موتور حقوق در پرسنلی (موجود، تأییدنشده)", path: "/onboarding" } },
  { id: "hr-payslip", title: "فیش حقوقی، مزایا و کسورات", unit: "hr", unitLabel: "منابع انسانی و آموزش", summary: "صدور فیش ماهانه و تاریخچه فیش‌ها", perm: "onboarding",
    requirements: ["صدور فیش ماهانه با مزایا و کسورات قابل‌تنظیم", "تاریخچه فیش‌های ماه‌های گذشته", "دسترسی محرمانه پرسنلی"] },
  { id: "hr-training", title: "آموزش کارکنان", unit: "hr", unitLabel: "منابع انسانی و آموزش", summary: "دوره‌ها، مراحل آموزش و پیشرفت", perm: "onboarding",
    requirements: ["تعریف دوره و مراحل آموزش", "ثبت‌نام و پیگیری پیشرفت هر فرد", "ارزیابی پایان دوره"] },
  { id: "hr-evaluation", title: "سوابق آموزشی و ارزیابی عملکرد", unit: "hr", unitLabel: "منابع انسانی و آموزش", summary: "سوابق آموزش و ارزیابی دوره‌ای", perm: "onboarding",
    requirements: ["سوابق آموزشی هر فرد", "ارزیابی عملکرد دوره‌ای با عوامل قابل‌تنظیم", "اثر ارزیابی بر پورسانت و کسورات فقط با تأیید مدیر"] },
  { id: "legal-contracts", title: "قراردادها", unit: "legal", unitLabel: "حقوقی و قراردادها", summary: "تنظیم و مدیریت قراردادها", perm: "settings",
    requirements: ["قالب و تنظیم قرارداد", "گردش تأیید و امضا", "پیوند قرارداد به مشتری، تأمین‌کننده یا پرسنل"] },
  { id: "legal-archive", title: "بایگانی قراردادها", unit: "legal", unitLabel: "حقوقی و قراردادها", summary: "ثبت، بایگانی و جست‌وجوی اسناد", perm: "settings",
    requirements: ["ثبت و بایگانی قرارداد و پیوست‌ها", "جست‌وجو و فیلتر", "سطح دسترسی محرمانه حقوقی"] },
  { id: "legal-renewal", title: "تمدید و اعتبار قراردادها", unit: "legal", unitLabel: "حقوقی و قراردادها", summary: "کنترل تاریخ اعتبار و تمدید", perm: "settings",
    requirements: ["کنترل تاریخ شروع و پایان", "گردش تمدید", "هشدار پیش از انقضا با ایجاد وظیفه"] },
  { id: "legal-cases", title: "پرونده‌های حقوقی", unit: "legal", unitLabel: "حقوقی و قراردادها", summary: "پیگیری پرونده‌ها و جلسات", perm: "settings",
    requirements: ["ثبت و پیگیری پرونده حقوقی", "جلسات، مهلت‌ها و مسئول پیگیری", "تاریخچه و اسناد مرتبط"] },
  { id: "legal-expiry", title: "هشدار انقضای اسناد و مجوزها", unit: "legal", unitLabel: "حقوقی و قراردادها", summary: "سررسید مجوزها و اسناد سازمان", perm: "settings",
    requirements: ["ثبت اسناد و مجوزها با تاریخ انقضا", "هشدار و یادآوری چندمرحله‌ای", "اتصال به وظیفه و اعلان"] },
  { id: "fin-credit-scoring", title: "اعتبارسنجی مشتریان", unit: "fin", unitLabel: "معاونت مالی", summary: "امتیاز و سقف اعتبار مشتری", perm: "finance",
    requirements: ["امتیاز اعتباری با قواعد قابل‌تنظیم", "بررسی اعتبار هنگام مذاکره و ارسال سفارش", "تاریخچه تغییر سقف اعتبار"],
    existing: { label: "ریسک اعتباری مشتریان (موجود، تأییدنشده)", path: "/operations?tab=credit" } },
  { id: "fin-liquidity", title: "نقدینگی و حساب‌های بانکی", unit: "fin", unitLabel: "معاونت مالی", summary: "مانده بانک، پیش‌بینی و گردش", perm: "finance",
    requirements: ["حساب‌های بانکی و مانده واقعی", "پیش‌بینی نقدینگی", "انتقال بین بانک و صندوق"],
    existing: { label: "خزانه‌داری (موجود، ناقص)", path: "/finance?tab=treasury" } },
  { id: "fin-payments", title: "مدیریت پرداخت‌ها", unit: "fin", unitLabel: "معاونت مالی", summary: "دستور پرداخت قطعی و غیرقطعی", perm: "finance",
    requirements: ["دستور پرداخت قطعی/غیرقطعی با اسکن فیش", "تسک تأیید حسابداری و ارسال به سامانه مرجع", "نگاشت حساب هنگام ثبت"],
    existing: { label: "دستورهای پرداخت (موجود، ناقص)", path: "/finance?tab=requests" } },
  { id: "fin-cashbox", title: "مدیریت صندوق", unit: "fin", unitLabel: "معاونت مالی", summary: "مانده و گردش صندوق", perm: "finance",
    requirements: ["حساب صندوق و مانده", "ثبت دریافت و پرداخت نقدی", "تطبیق و بستن روزانه"] },
  { id: "fin-budget", title: "بودجه‌ریزی", unit: "fin", unitLabel: "معاونت مالی", summary: "بودجه دوره‌ای هر واحد", perm: "finance",
    requirements: ["تعریف بودجه به‌تفکیک واحد و دوره", "مقایسه بودجه با عملکرد", "گردش تأیید بودجه"] },
  { id: "fin-cost-control", title: "کنترل هزینه‌ها", unit: "fin", unitLabel: "معاونت مالی", summary: "هزینه در برابر بودجه", perm: "finance",
    requirements: ["ثبت و طبقه‌بندی هزینه با کدینگ حسابداری", "هشدار عبور از بودجه", "تحلیل ترکیب هزینه"],
    existing: { label: "هزینه‌ها (موجود)", path: "/finance?tab=expenses" } },
  { id: "fin-reports", title: "گزارش‌های مالی", unit: "fin", unitLabel: "معاونت مالی", summary: "سود و زیان، ترازنامه و نقدینگی", perm: "finance",
    requirements: ["سود و زیان دفتری واقعی", "ترازنامه", "جریان نقدینگی و مطالبات"],
    existing: { label: "نمای کلی مالی (موجود)", path: "/finance?tab=overview" } },
  { id: "fin-commission", title: "محاسبه پورسانت", unit: "fin", unitLabel: "معاونت مالی", summary: "هدف، پلکان و ضرایب پورسانت", perm: "finance",
    requirements: ["انواع پورسانت: درصدی، ثابت، پلکانی، سودمحور", "ضرایب مسیر، صنف، برند و کالا", "سه وضعیت تخمینی، تأییدشده و پرداخت‌شده", "تعدیل بابت مرجوعی و ابطال"] },
  { id: "fin-invoice-discount", title: "تخفیفات فاکتور", unit: "fin", unitLabel: "معاونت مالی", summary: "ثبت و کنترل تخفیف هر فاکتور", perm: "finance",
    requirements: ["تخفیف به‌تفکیک فاکتور", "سقف و تأیید تخفیف", "گزارش اثر تخفیف بر سود"] },
  { id: "fin-invoice-profit", title: "سود فاکتور", unit: "fin", unitLabel: "معاونت مالی", summary: "سود هر فاکتور بر مبنای بهای تمام‌شده", perm: "finance",
    requirements: ["محاسبه سود هر فاکتور", "وابستگی به بهای تمام‌شده معتبر", "نمایش وضعیت تأییدنشده تا کامل‌بودن بها"] },
  { id: "fin-dispatch-profit", title: "سود برنامه توزیع", unit: "fin", unitLabel: "معاونت مالی", summary: "سود هر برنامه توزیع", perm: "finance",
    requirements: ["تجمیع سود فاکتورهای برنامه", "کسر هزینه پخش", "مقایسه برنامه‌ها"] },
  { id: "fin-cash-discount", title: "تخفیف نقد فاکتور و برنامه توزیع", unit: "fin", unitLabel: "معاونت مالی", summary: "میزان تخفیف نقد در هر فاکتور و برنامه", perm: "finance",
    requirements: ["تخفیف نقد به‌تفکیک فاکتور", "تجمیع در سطح برنامه توزیع", "اتصال به تسویه برنامه"] },
  { id: "fin-targets", title: "اهداف و تحقق فروش", unit: "fin", unitLabel: "معاونت مالی", summary: "تعریف هدف و پایش تحقق", perm: "finance",
    requirements: ["تعریف هدف ریالی، تعدادی، برند، کالا، مشتری و مسیر", "تخصیص به فروشنده یا تیم", "درصد تحقق و پیش‌بینی پایان دوره"] },
  { id: "dist-route-planning", title: "برنامه‌ریزی مسیر و تور ویزیت", unit: "dist", unitLabel: "برنامه‌ریزی و توزیع", summary: "مسیرها و تور ویزیت روزانه", perm: "ops.dispatch",
    requirements: ["تعریف مسیر و تور ویزیت", "تخصیص ویزیتور و خودرو", "مقایسه برنامه با مسیر واقعی"],
    existing: { label: "هوش مکانی و زون‌ها (موجود)", path: "/geo-intelligence" } },
  { id: "dist-settlement-sales", title: "هماهنگی تسویه و برگشتی با واحد فروش", unit: "dist", unitLabel: "برنامه‌ریزی و توزیع", summary: "تسویه یا برگشتی هر فاکتور", perm: "ops.dispatch",
    requirements: ["وضعیت تسویه یا برگشتی هر فاکتور", "اطلاع‌رسانی و وظیفه برای واحد فروش", "بسته‌شدن فقط با سند معتبر"],
    existing: { label: "برگشتی‌ها (موجود)", path: "/operations?tab=returns" } },
  { id: "dist-operations", title: "یکپارچگی عملیات توزیع", unit: "dist", unitLabel: "برنامه‌ریزی و توزیع", summary: "فاکتور، موجودی، خودرو، راننده و تسویه", perm: "ops.dispatch",
    requirements: ["اتصال برنامه توزیع به فاکتورهای ثبت‌شده", "اتصال به موجودی انبار، خودروها و رانندگان", "اتصال به اطلاعات مشتری، تسویه‌ها و برگشتی‌ها"],
    existing: { label: "برنامه پخش (موجود، داده نمونه)", path: "/operations?tab=dispatch" } },
];

export const getPlannedModule = (id: string | null | undefined): PlannedModule | undefined => PLANNED_MODULES.find(item => item.id === id);
