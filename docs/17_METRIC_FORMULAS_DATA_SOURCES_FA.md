# مستند فرمول و منبع داده شاخص‌ها (تولیدشده از `metricRegistry.ts` — دستی ویرایش نشود)

> وضعیت هر شاخص صادقانه است: «موتور اپ + تست» یعنی محاسبه با داده کنترل‌شده تست شده، نه اینکه با داده واقعی ERP تأیید شده باشد.

## گزارش 1

| کد | نام | فرمول | منبع داده | واحد | نیاز به بها | وضعیت | موتور/SQL |
|---|---|---|---|---|---|---|---|
| REVENUE_RECOGNIZED | درآمد شناسایی‌شده | NET_SALES = GROSS_SALES − SALES_RETURNS (ledger buckets) | crm.JournalLineMirror، crm.LedgerAccount | IRR | خیر | موتور اپ + تست | src/lib/ledgerPnl.ts / analytics.vw_PnlBucketMonth |
| COGS | بهای تمام‌شدهٔ کالای فروش‌رفته | bucket COGS | crm.JournalLineMirror، crm.ProductCostMirror | IRR | بله | موتور اپ + تست | src/lib/ledgerPnl.ts / analytics.vw_PnlBucketMonth |
| GROSS_PROFIT_LEDGER | سود ناخالص (دفتری) | NET_SALES − COGS | crm.JournalLineMirror | IRR | بله | موتور اپ + تست | src/lib/ledgerPnl.ts |
| OPERATING_PROFIT_LEDGER | سود عملیاتی (دفتری) | GROSS_PROFIT − OPERATING_EXPENSES | crm.JournalLineMirror | IRR | بله | موتور اپ + تست | src/lib/ledgerPnl.ts |
| EXPENSE_BY_CATEGORY | ترکیب هزینه | SUM(Debit−Credit) per ExpenseCategory | analytics.vw_FactExpenses | IRR | خیر | تعریف SQL (اجرا نشده) | analytics.vw_FactExpenses |
| LEDGER_MAPPING_COVERAGE | پوشش نگاشت کدینگ | mapped lines / all lines | crm.JournalLineMirror | PERCENT | خیر | موتور اپ + تست | src/lib/etlPipeline.ts / analytics.vw_LedgerMappingCoverage |
| GROSS_PROFIT_KNOWN_COST | سود ناخالص با بهای معتبر | SUM(NetLineAmount−CostAmount) lines with cost | analytics.vw_SalesProfitCoverage | IRR | بله | تعریف SQL (اجرا نشده) | analytics.vw_SalesProfitCoverage |

## گزارش 2

| کد | نام | فرمول | منبع داده | واحد | نیاز به بها | وضعیت | موتور/SQL |
|---|---|---|---|---|---|---|---|
| SALES_REALIZED_NET | فروش خالص تحقق‌یافته | SUM(NetLineAmount) WHERE invoice posted/confirmed/closed AND IsVoided=0 | crm.InvoiceMirror، crm.InvoiceLineMirror | IRR | خیر | تعریف SQL (اجرا نشده) | analytics.vw_SalesKpiDaily |
| SALES_TARGET_ACHIEVEMENT | درصد تحقق هدف فروش | SALES_REALIZED_NET / TargetValue × 100 | crm.SalesTarget، analytics.vw_SalesKpiDaily | PERCENT | خیر | موتور اپ + تست | src/lib/reportAnalytics.ts |
| ORDER_COUNT | تعداد سفارش | COUNT(SalesOrder) status active | analytics.vw_FactOrders | COUNT | خیر | تعریف SQL (اجرا نشده) | analytics.vw_FactOrders |
| SALES_FORECAST | پیش‌بینی فروش | SUM(ExpectedAmount) open opportunities | crm.Opportunity | IRR | خیر | فقط تعریف | — |

## گزارش 3

| کد | نام | فرمول | منبع داده | واحد | نیاز به بها | وضعیت | موتور/SQL |
|---|---|---|---|---|---|---|---|
| COGS | بهای تمام‌شدهٔ کالای فروش‌رفته | bucket COGS | crm.JournalLineMirror، crm.ProductCostMirror | IRR | بله | موتور اپ + تست | src/lib/ledgerPnl.ts / analytics.vw_PnlBucketMonth |
| SALES_REALIZED_NET | فروش خالص تحقق‌یافته | SUM(NetLineAmount) WHERE invoice posted/confirmed/closed AND IsVoided=0 | crm.InvoiceMirror، crm.InvoiceLineMirror | IRR | خیر | تعریف SQL (اجرا نشده) | analytics.vw_SalesKpiDaily |
| PRODUCT_SALES_SHARE | سهم فروش محصول/برند | SALES_REALIZED_NET by product ÷ total | analytics.vw_FactSalesLineEnriched | PERCENT | خیر | موتور اپ + تست | src/lib/reportAnalytics.ts / analytics.vw_FactSalesLineEnriched |
| GROSS_PROFIT_KNOWN_COST | سود ناخالص با بهای معتبر | SUM(NetLineAmount−CostAmount) lines with cost | analytics.vw_SalesProfitCoverage | IRR | بله | تعریف SQL (اجرا نشده) | analytics.vw_SalesProfitCoverage |

## گزارش 4

| کد | نام | فرمول | منبع داده | واحد | نیاز به بها | وضعیت | موتور/SQL |
|---|---|---|---|---|---|---|---|
| CUSTOMER_PURCHASE_CYCLE_DAYS | چرخهٔ خرید مشتری | median(gap between consecutive realized invoices) | crm.InvoiceMirror | DAYS | خیر | موتور اپ + تست | src/lib/reportAnalytics.ts |
| AR_OUTSTANDING | مانده مطالبات | InvoiceGrossAmount − ValidAllocatedAmount − ValidCreditAmount | analytics.fn_InvoiceBalanceAsOf | IRR | خیر | موتور اپ + تست | src/lib/receivableReconciliation.ts / analytics.fn_InvoiceBalanceAsOf |

## گزارش 5

| کد | نام | فرمول | منبع داده | واحد | نیاز به بها | وضعیت | موتور/SQL |
|---|---|---|---|---|---|---|---|
| SALES_REALIZED_NET | فروش خالص تحقق‌یافته | SUM(NetLineAmount) WHERE invoice posted/confirmed/closed AND IsVoided=0 | crm.InvoiceMirror، crm.InvoiceLineMirror | IRR | خیر | تعریف SQL (اجرا نشده) | analytics.vw_SalesKpiDaily |
| REVENUE_CONCENTRATION_TOP_SHARE | سهم مشتریان برتر | cumulative share of top customers | analytics.vw_SalesKpiDaily | PERCENT | خیر | موتور اپ + تست | src/lib/reportAnalytics.ts |

## گزارش 6

| کد | نام | فرمول | منبع داده | واحد | نیاز به بها | وضعیت | موتور/SQL |
|---|---|---|---|---|---|---|---|
| VISIT_TO_ORDER_RATE | نرخ تبدیل ویزیت به سفارش | SUM(HasOrder)/SUM(IsActual) | analytics.vw_FactVisits | PERCENT | خیر | موتور اپ + تست | src/lib/reportAnalytics.ts / analytics.vw_FactVisits |

## گزارش 7

| کد | نام | فرمول | منبع داده | واحد | نیاز به بها | وضعیت | موتور/SQL |
|---|---|---|---|---|---|---|---|
| AR_OUTSTANDING | مانده مطالبات | InvoiceGrossAmount − ValidAllocatedAmount − ValidCreditAmount | analytics.fn_InvoiceBalanceAsOf | IRR | خیر | موتور اپ + تست | src/lib/receivableReconciliation.ts / analytics.fn_InvoiceBalanceAsOf |
| AR_OVERDUE | مطالبات سررسیدگذشته | SUM(Outstanding) WHERE DaysPastDue>0 | analytics.fn_InvoiceBalanceAsOf | IRR | خیر | موتور اپ + تست | src/lib/receivableReconciliation.ts / analytics.fn_InvoiceBalanceAsOf |
| AR_AGING_BUCKETS | سنی مطالبات | buildAgingBuckets(items, settings.agingBucketBounds) | analytics.fn_InvoiceBalanceAsOf | IRR | خیر | موتور اپ + تست | src/services/agingBuckets.ts |
| CHEQUES_OPERATIONAL | چک‌های عملیاتی | SUM(Amount) WHERE IsGuarantee=0 AND IsVoided=0 | analytics.vw_ChequeOperational | IRR | خیر | تعریف SQL (اجرا نشده) | analytics.vw_ChequeOperational |

## گزارش 8

| کد | نام | فرمول | منبع داده | واحد | نیاز به بها | وضعیت | موتور/SQL |
|---|---|---|---|---|---|---|---|
| CASH_RECEIVED | دریافت واقعی | SUM(Amount) IsRealizedCash=1 | analytics.vw_FactPayments | IRR | خیر | تعریف SQL (اجرا نشده) | analytics.vw_FactPayments |
| CHEQUES_OPERATIONAL | چک‌های عملیاتی | SUM(Amount) WHERE IsGuarantee=0 AND IsVoided=0 | analytics.vw_ChequeOperational | IRR | خیر | تعریف SQL (اجرا نشده) | analytics.vw_ChequeOperational |

## گزارش 9

| کد | نام | فرمول | منبع داده | واحد | نیاز به بها | وضعیت | موتور/SQL |
|---|---|---|---|---|---|---|---|
| ORDER_COUNT | تعداد سفارش | COUNT(SalesOrder) status active | analytics.vw_FactOrders | COUNT | خیر | تعریف SQL (اجرا نشده) | analytics.vw_FactOrders |
| NEGOTIATION_ERP_APPLIED_AMOUNT | مبلغ اعمال‌شده در سامانه مالی | SUM(amount) WHERE erpStatus=ACCEPTED | crm.SalesOrder | IRR | خیر | موتور اپ + تست | src/lib/negotiationErpLifecycle.ts |

## گزارش 10

| کد | نام | فرمول | منبع داده | واحد | نیاز به بها | وضعیت | موتور/SQL |
|---|---|---|---|---|---|---|---|
| ON_TIME_DELIVERY_RATE | نرخ تحویل به‌موقع | SUM(IsOnTime=1)/COUNT(IsOnTime IS NOT NULL) | analytics.vw_FactDeliveries | PERCENT | خیر | موتور اپ + تست | src/lib/reportAnalytics.ts / analytics.vw_FactDeliveries |

## گزارش 11

| کد | نام | فرمول | منبع داده | واحد | نیاز به بها | وضعیت | موتور/SQL |
|---|---|---|---|---|---|---|---|
| RETURN_RATE_AMOUNT | نرخ مرجوعی مبلغی | SUM(ReturnedAmount IsEffective=1)/SALES_REALIZED_NET | analytics.vw_FactReturns | PERCENT | خیر | موتور اپ + تست | src/lib/reportAnalytics.ts / analytics.vw_FactReturns |
| RETURN_RATE_QUANTITY | نرخ مرجوعی تعدادی | SUM(ReturnedQuantity)/SUM(Quantity) | analytics.vw_FactReturns، analytics.vw_FactSalesLine | PERCENT | خیر | موتور اپ + تست | src/lib/reportAnalytics.ts / analytics.vw_FactReturns |

