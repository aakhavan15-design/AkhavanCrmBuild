/**
 * AKHAVAN CRM — Metric Registry (spec §27.2). Single formal definition per KPI; reports must reference these codes.
 * The SQL catalog seed (database/sqlserver/v1/019_kpi_catalog_v2_generated.sql) is GENERATED from this file
 * (scripts/generate_kpi_seed_sql.mjs) so the two cannot drift; tests/metricRegistryContracts.test.mjs enforces it.
 * `status` is honest: IMPLEMENTED_APP = TS engine + passing test exists; DEFINED_SQL = SQL view/function exists but not run on a live DB;
 * NOT_IMPLEMENTED = definition only (no UI/engine yet).
 */
export type MetricStatus = 'IMPLEMENTED_APP' | 'DEFINED_SQL' | 'NOT_IMPLEMENTED';
export interface MetricDef {
  code: string; version: number; nameFa: string; definitionFa: string; formula: string; grain: string; unit: 'IRR' | 'COUNT' | 'PERCENT' | 'DAYS' | 'RATIO' | 'QUANTITY';
  reports: number[]; sources: string[]; engine?: string; sqlObject?: string; requiresCost: boolean; requiresSource: string[]; owner: 'FINANCE' | 'SALES_MANAGER' | 'OPERATIONS' | 'CRM_ADMIN';
  refresh: 'AFTER_EACH_SYNC' | 'ON_CHANGE' | 'DAILY'; status: MetricStatus; basisNote?: string;
}
const M = (m: Omit<MetricDef, 'version' | 'requiresCost' | 'requiresSource' | 'refresh' | 'owner' | 'status'> & Partial<MetricDef>): MetricDef =>
  ({ version: 1, requiresCost: false, requiresSource: [], owner: 'FINANCE', refresh: 'AFTER_EACH_SYNC', status: 'NOT_IMPLEMENTED', ...m });

export const METRIC_REGISTRY: MetricDef[] = [
  // 1 هوش مالی و سودآوری
  M({ code: 'REVENUE_RECOGNIZED', nameFa: 'درآمد شناسایی‌شده', definitionFa: 'مانده سطوح درآمدی دفتر کل (نگاشت‌شده به فروش ناخالص منهای برگشت از فروش) در دوره؛ مستقل از وصول و سفارش.', formula: 'NET_SALES = GROSS_SALES − SALES_RETURNS (ledger buckets)', grain: 'MONTH', unit: 'IRR', reports: [1], sources: ['crm.JournalLineMirror', 'crm.LedgerAccount'], engine: 'src/lib/ledgerPnl.ts', sqlObject: 'analytics.vw_PnlBucketMonth', requiresSource: ['JOURNAL_LINE', 'LEDGER_ACCOUNT'], status: 'IMPLEMENTED_APP' }),
  M({ code: 'COGS', nameFa: 'بهای تمام‌شدهٔ کالای فروش‌رفته', definitionFa: 'فقط از سند/منبع هزینه؛ در نبود منبع، مقدار نامشخص است.', formula: 'bucket COGS', grain: 'MONTH', unit: 'IRR', reports: [1, 3], sources: ['crm.JournalLineMirror', 'crm.ProductCostMirror'], engine: 'src/lib/ledgerPnl.ts', sqlObject: 'analytics.vw_PnlBucketMonth', requiresCost: true, requiresSource: ['JOURNAL_LINE', 'PRODUCT_COST'], status: 'IMPLEMENTED_APP' }),
  M({ code: 'GROSS_PROFIT_LEDGER', nameFa: 'سود ناخالص (دفتری)', definitionFa: 'فروش خالص − بهای تمام‌شده؛ در نبود هر یک نامشخص.', formula: 'NET_SALES − COGS', grain: 'MONTH', unit: 'IRR', reports: [1], sources: ['crm.JournalLineMirror'], engine: 'src/lib/ledgerPnl.ts', requiresCost: true, requiresSource: ['JOURNAL_LINE', 'LEDGER_ACCOUNT'], status: 'IMPLEMENTED_APP' }),
  M({ code: 'OPERATING_PROFIT_LEDGER', nameFa: 'سود عملیاتی (دفتری)', definitionFa: 'GROSS_PROFIT − OPERATING_EXPENSES.', formula: 'GROSS_PROFIT − OPERATING_EXPENSES', grain: 'MONTH', unit: 'IRR', reports: [1], sources: ['crm.JournalLineMirror'], engine: 'src/lib/ledgerPnl.ts', requiresCost: true, requiresSource: ['JOURNAL_LINE', 'LEDGER_ACCOUNT'], status: 'IMPLEMENTED_APP' }),
  M({ code: 'EXPENSE_BY_CATEGORY', nameFa: 'ترکیب هزینه', definitionFa: 'هزینه به تفکیک دستهٔ قابل‌تنظیم متصل به کدینگ حسابداری (نه دستهٔ نمونه).', formula: 'SUM(Debit−Credit) per ExpenseCategory', grain: 'MONTH_CATEGORY', unit: 'IRR', reports: [1], sources: ['analytics.vw_FactExpenses'], sqlObject: 'analytics.vw_FactExpenses', requiresSource: ['JOURNAL_LINE', 'LEDGER_ACCOUNT'], status: 'DEFINED_SQL' }),
  M({ code: 'LEDGER_MAPPING_COVERAGE', nameFa: 'پوشش نگاشت کدینگ', definitionFa: 'درصد ردیف‌های سند که به کدینگ استاندارد نگاشت شده‌اند؛ هشدار کیفیت داده برای گزارش مالی.', formula: 'mapped lines / all lines', grain: 'TENANT', unit: 'PERCENT', reports: [1], sources: ['crm.JournalLineMirror'], engine: 'src/lib/etlPipeline.ts', sqlObject: 'analytics.vw_LedgerMappingCoverage', owner: 'CRM_ADMIN', status: 'IMPLEMENTED_APP' }),
  // 2 عملکرد فروش
  M({ code: 'SALES_REALIZED_NET', nameFa: 'فروش خالص تحقق‌یافته', definitionFa: 'جمع فروش خالص ردیف فاکتورهای قطعی و غیرابطال‌شده؛ پیش‌فاکتور و فرصت خارج است.', formula: 'SUM(NetLineAmount) WHERE invoice posted/confirmed/closed AND IsVoided=0', grain: 'INVOICE_LINE_DAY', unit: 'IRR', reports: [2, 3, 5], sources: ['crm.InvoiceMirror', 'crm.InvoiceLineMirror'], sqlObject: 'analytics.vw_SalesKpiDaily', requiresSource: ['INVOICE'], status: 'DEFINED_SQL', owner: 'FINANCE' }),
  M({ code: 'SALES_TARGET_ACHIEVEMENT', nameFa: 'درصد تحقق هدف فروش', definitionFa: 'فروش واقعی ÷ هدف قابل‌تنظیم.', formula: 'SALES_REALIZED_NET / TargetValue × 100', grain: 'SCOPE_PERIOD', unit: 'PERCENT', reports: [2], sources: ['crm.SalesTarget', 'analytics.vw_SalesKpiDaily'], requiresSource: ['INVOICE', 'SALES_TARGET'], owner: 'SALES_MANAGER' , engine: 'src/lib/reportAnalytics.ts', status: 'IMPLEMENTED_APP', basisNote: 'موتور محاسباتی خالص و تست‌شده با داده کنترل‌شده؛ رابط/نمودار و تأیید با داده واقعی انجام نشده' }),
  M({ code: 'ORDER_COUNT', nameFa: 'تعداد سفارش', definitionFa: 'سفارش‌های سامانه مالی با وضعیت فعال؛ لغو/باطل شمرده نمی‌شود؛ جدا از تعداد فاکتور.', formula: 'COUNT(SalesOrder) status active', grain: 'DAY', unit: 'COUNT', reports: [2, 9], sources: ['analytics.vw_FactOrders'], sqlObject: 'analytics.vw_FactOrders', requiresSource: ['SALES_ORDER'], status: 'DEFINED_SQL', owner: 'SALES_MANAGER' }),
  M({ code: 'SALES_FORECAST', nameFa: 'پیش‌بینی فروش', definitionFa: 'ارزش فرصت‌های باز؛ از فروش تحقق‌یافته جداست.', formula: 'SUM(ExpectedAmount) open opportunities', grain: 'OPPORTUNITY', unit: 'IRR', reports: [2], sources: ['crm.Opportunity'], requiresSource: [], owner: 'SALES_MANAGER', refresh: 'ON_CHANGE' }),
  // 3 محصول
  M({ code: 'PRODUCT_SALES_SHARE', nameFa: 'سهم فروش محصول/برند', definitionFa: 'فروش خالص تحقق‌یافته هر برند/گروه/محصول ÷ کل.', formula: 'SALES_REALIZED_NET by product ÷ total', grain: 'PRODUCT_PERIOD', unit: 'PERCENT', reports: [3], sources: ['analytics.vw_FactSalesLineEnriched'], sqlObject: 'analytics.vw_FactSalesLineEnriched', requiresSource: ['INVOICE', 'PRODUCT'], owner: 'SALES_MANAGER' , engine: 'src/lib/reportAnalytics.ts', status: 'IMPLEMENTED_APP', basisNote: 'موتور محاسباتی خالص و تست‌شده با داده کنترل‌شده؛ رابط/نمودار و تأیید با داده واقعی انجام نشده' }),
  M({ code: 'GROSS_PROFIT_KNOWN_COST', nameFa: 'سود ناخالص با بهای معتبر', definitionFa: 'فقط ردیف‌های دارای مبلغ بهای تمام‌شدهٔ معتبر؛ سود کل در پوشش ناقص ادعا نمی‌شود.', formula: 'SUM(NetLineAmount−CostAmount) lines with cost', grain: 'INVOICE_LINE_DAY', unit: 'IRR', reports: [1, 3], sources: ['analytics.vw_SalesProfitCoverage'], sqlObject: 'analytics.vw_SalesProfitCoverage', requiresCost: true, requiresSource: ['INVOICE', 'PRODUCT_COST'], status: 'DEFINED_SQL' }),
  // 4 مشتری
  M({ code: 'CUSTOMER_PURCHASE_CYCLE_DAYS', nameFa: 'چرخهٔ خرید مشتری', definitionFa: 'میانه فاصلهٔ خرید هر مشتری (یا گروه مشابه)؛ آستانهٔ ریزش از همین چرخه، نه عدد ثابت.', formula: 'median(gap between consecutive realized invoices)', grain: 'CUSTOMER', unit: 'DAYS', reports: [4], sources: ['crm.InvoiceMirror'], requiresSource: ['INVOICE'], owner: 'SALES_MANAGER', refresh: 'DAILY' , engine: 'src/lib/reportAnalytics.ts', status: 'IMPLEMENTED_APP', basisNote: 'موتور محاسباتی خالص و تست‌شده با داده کنترل‌شده؛ رابط/نمودار و تأیید با داده واقعی انجام نشده' }),
  // 5 تمرکز
  M({ code: 'REVENUE_CONCENTRATION_TOP_SHARE', nameFa: 'سهم مشتریان برتر', definitionFa: 'سهم تجمعی مشتریان برتر (پارتو) از فروش خالص تحقق‌یافته.', formula: 'cumulative share of top customers', grain: 'CUSTOMER_PERIOD', unit: 'PERCENT', reports: [5], sources: ['analytics.vw_SalesKpiDaily'], requiresSource: ['INVOICE'], owner: 'SALES_MANAGER' , engine: 'src/lib/reportAnalytics.ts', status: 'IMPLEMENTED_APP', basisNote: 'موتور محاسباتی خالص و تست‌شده با داده کنترل‌شده؛ رابط/نمودار و تأیید با داده واقعی انجام نشده' }),
  // 6 ویزیت
  M({ code: 'VISIT_TO_ORDER_RATE', nameFa: 'نرخ تبدیل ویزیت به سفارش', definitionFa: 'ویزیت‌های واقعی دارای سفارش ÷ ویزیت‌های واقعی (ورود ثبت‌شده).', formula: 'SUM(HasOrder)/SUM(IsActual)', grain: 'USER_DAY', unit: 'PERCENT', reports: [6], sources: ['analytics.vw_FactVisits'], sqlObject: 'analytics.vw_FactVisits', requiresSource: ['VISIT'], owner: 'SALES_MANAGER' , engine: 'src/lib/reportAnalytics.ts', status: 'IMPLEMENTED_APP', basisNote: 'موتور محاسباتی خالص و تست‌شده با داده کنترل‌شده؛ رابط/نمودار و تأیید با داده واقعی انجام نشده' }),
  // 7 مطالبات
  M({ code: 'AR_OUTSTANDING', nameFa: 'مانده مطالبات', definitionFa: 'مبلغ فاکتور معتبر منهای تخصیص‌های پرداخت و بستانکاری معتبر.', formula: 'InvoiceGrossAmount − ValidAllocatedAmount − ValidCreditAmount', grain: 'ACCOUNT_CURRENCY_ASOF', unit: 'IRR', reports: [7, 4], sources: ['analytics.fn_InvoiceBalanceAsOf'], engine: 'src/lib/receivableReconciliation.ts', sqlObject: 'analytics.fn_InvoiceBalanceAsOf', requiresSource: ['INVOICE', 'PAYMENT', 'PAYMENT_ALLOCATION', 'CREDIT_NOTE'], status: 'IMPLEMENTED_APP' }),
  M({ code: 'AR_OVERDUE', nameFa: 'مطالبات سررسیدگذشته', definitionFa: 'مانده مثبت فاکتور با سررسید قبل از تاریخ مبنا.', formula: 'SUM(Outstanding) WHERE DaysPastDue>0', grain: 'ACCOUNT_CURRENCY_ASOF', unit: 'IRR', reports: [7], sources: ['analytics.fn_InvoiceBalanceAsOf'], engine: 'src/lib/receivableReconciliation.ts', sqlObject: 'analytics.fn_InvoiceBalanceAsOf', requiresSource: ['INVOICE', 'PAYMENT_ALLOCATION'], status: 'IMPLEMENTED_APP' }),
  M({ code: 'AR_AGING_BUCKETS', nameFa: 'سنی مطالبات', definitionFa: 'بازه‌بندی قابل‌تنظیم؛ جمع بازه‌ها = کل مطالبات واجد شرایط؛ پیش‌فرض ۳۰/۶۰/۹۰ فقط پیش‌فرض است.', formula: 'buildAgingBuckets(items, settings.agingBucketBounds)', grain: 'INVOICE_ASOF', unit: 'IRR', reports: [7], sources: ['analytics.fn_InvoiceBalanceAsOf'], engine: 'src/services/agingBuckets.ts', requiresSource: ['INVOICE'], status: 'IMPLEMENTED_APP' }),
  // 8 نقدینگی
  M({ code: 'CASH_RECEIVED', nameFa: 'دریافت واقعی', definitionFa: 'پرداخت‌های ثبت‌شده و نهایی؛ مستقل از درآمد و از چک سررسیدنشده.', formula: 'SUM(Amount) IsRealizedCash=1', grain: 'DAY', unit: 'IRR', reports: [8], sources: ['analytics.vw_FactPayments'], sqlObject: 'analytics.vw_FactPayments', requiresSource: ['PAYMENT'], status: 'DEFINED_SQL' }),
  M({ code: 'CHEQUES_OPERATIONAL', nameFa: 'چک‌های عملیاتی', definitionFa: 'چک دریافتی/پرداختی بدون ضمانتی و باطل.', formula: 'SUM(Amount) WHERE IsGuarantee=0 AND IsVoided=0', grain: 'DUE_DATE', unit: 'IRR', reports: [8, 7], sources: ['analytics.vw_ChequeOperational'], sqlObject: 'analytics.vw_ChequeOperational', requiresSource: ['CHEQUE'], status: 'DEFINED_SQL' }),
  // 9 مذاکره
  M({ code: 'NEGOTIATION_ERP_APPLIED_AMOUNT', nameFa: 'مبلغ اعمال‌شده در سامانه مالی', definitionFa: 'فقط پس از پاسخ موفق سامانه مالی؛ تا پیش از آن تأییدشده محسوب نمی‌شود.', formula: 'SUM(amount) WHERE erpStatus=ACCEPTED', grain: 'ORDER', unit: 'IRR', reports: [9], sources: ['crm.SalesOrder'], requiresSource: ['SALES_ORDER'], owner: 'SALES_MANAGER' , engine: 'src/lib/negotiationErpLifecycle.ts', status: 'IMPLEMENTED_APP', basisNote: 'موتور محاسباتی خالص و تست‌شده با داده کنترل‌شده؛ رابط/نمودار و تأیید با داده واقعی انجام نشده' }),
  // 10 توزیع
  M({ code: 'ON_TIME_DELIVERY_RATE', nameFa: 'نرخ تحویل به‌موقع', definitionFa: 'تحویل‌های با زمان تحویل ≤ زمان وعده ÷ تحویل‌های دارای هر دو زمان؛ رکورد بدون زمان وعده شمرده نمی‌شود.', formula: 'SUM(IsOnTime=1)/COUNT(IsOnTime IS NOT NULL)', grain: 'DAY', unit: 'PERCENT', reports: [10], sources: ['analytics.vw_FactDeliveries'], sqlObject: 'analytics.vw_FactDeliveries', requiresSource: ['DELIVERY_EVENT'], owner: 'OPERATIONS' , engine: 'src/lib/reportAnalytics.ts', status: 'IMPLEMENTED_APP', basisNote: 'موتور محاسباتی خالص و تست‌شده با داده کنترل‌شده؛ رابط/نمودار و تأیید با داده واقعی انجام نشده' }),
  // 11 مرجوعی
  M({ code: 'RETURN_RATE_AMOUNT', nameFa: 'نرخ مرجوعی مبلغی', definitionFa: 'مبلغ مرجوعی مؤثر ÷ فروش واجد شرایط (مبنا قابل‌تنظیم)؛ جدا از نرخ تعدادی.', formula: 'SUM(ReturnedAmount IsEffective=1)/SALES_REALIZED_NET', grain: 'CUSTOMER_PRODUCT_PERIOD', unit: 'PERCENT', reports: [11], sources: ['analytics.vw_FactReturns'], sqlObject: 'analytics.vw_FactReturns', requiresSource: ['SALES_RETURN', 'INVOICE'], owner: 'OPERATIONS' , engine: 'src/lib/reportAnalytics.ts', status: 'IMPLEMENTED_APP', basisNote: 'موتور محاسباتی خالص و تست‌شده با داده کنترل‌شده؛ رابط/نمودار و تأیید با داده واقعی انجام نشده' }),
  M({ code: 'RETURN_RATE_QUANTITY', nameFa: 'نرخ مرجوعی تعدادی', definitionFa: 'تعداد اقلام برگشتی ÷ تعداد اقلام فروخته‌شده؛ با نرخ مبلغی مخلوط نمی‌شود.', formula: 'SUM(ReturnedQuantity)/SUM(Quantity)', grain: 'CUSTOMER_PRODUCT_PERIOD', unit: 'PERCENT', reports: [11], sources: ['analytics.vw_FactReturns', 'analytics.vw_FactSalesLine'], sqlObject: 'analytics.vw_FactReturns', requiresSource: ['SALES_RETURN', 'INVOICE'], owner: 'OPERATIONS' , engine: 'src/lib/reportAnalytics.ts', status: 'IMPLEMENTED_APP', basisNote: 'موتور محاسباتی خالص و تست‌شده با داده کنترل‌شده؛ رابط/نمودار و تأیید با داده واقعی انجام نشده' }),
];

export const getMetric = (code: string) => METRIC_REGISTRY.find(m => m.code === code);
export const metricsForReport = (reportNo: number) => METRIC_REGISTRY.filter(m => m.reports.includes(reportNo));

export function validateMetricRegistry(registry: MetricDef[] = METRIC_REGISTRY): string[] {
  const errors: string[] = []; const seen = new Set<string>();
  for (const m of registry) {
    const id = `${m.code}@${m.version}`;
    if (seen.has(id)) errors.push(`تعریف تکراری: ${id}`); seen.add(id);
    if (!/^[A-Z][A-Z0-9_]+$/.test(m.code)) errors.push(`کد نامعتبر: ${m.code}`);
    for (const f of ['nameFa', 'definitionFa', 'formula', 'grain'] as const) if (!String(m[f] ?? '').trim()) errors.push(`${m.code}: فیلد ${f} خالی است`);
    if (!m.sources.length) errors.push(`${m.code}: منبع داده مشخص نیست`);
    if (m.status === 'IMPLEMENTED_APP' && !m.engine) errors.push(`${m.code}: وضعیت IMPLEMENTED_APP بدون موتور`);
    if (m.status === 'DEFINED_SQL' && !m.sqlObject) errors.push(`${m.code}: وضعیت DEFINED_SQL بدون شیء پایگاه داده`);
    if (m.requiresCost && !m.requiresSource.some(s => s === 'PRODUCT_COST' || s === 'JOURNAL_LINE')) errors.push(`${m.code}: نیازمند بها ولی منبع بها اعلام نشده`);
  }
  for (let r = 1; r <= 11; r++) if (!registry.some(m => m.reports.includes(r))) errors.push(`گزارش ${r} هیچ شاخص ثبت‌شده‌ای ندارد`);
  return errors;
}
