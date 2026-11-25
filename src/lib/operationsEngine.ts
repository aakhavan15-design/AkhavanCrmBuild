import { calculateNetSales } from './financialMetricKernel.ts';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
export interface RiskSignal { code: string; level: RiskLevel; title: string; reason: string; blocking?: boolean }
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const finiteAmount = (value: unknown): number | null => {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const isVoidedRecord = (record: { isVoided?: boolean; isDeleted?: boolean; deletedAt?: unknown; status?: unknown } | null | undefined): boolean =>
  record?.isVoided === true || record?.isDeleted === true || !!record?.deletedAt ||
  ['VOID', 'VOIDED', 'CANCELLED', 'CANCELED'].includes(String(record?.status || '').toUpperCase());
const validFinancialRecord = (record: { isVoided?: boolean; isDeleted?: boolean; deletedAt?: unknown; status?: unknown } | null | undefined): boolean => !!record && !isVoidedRecord(record);

/** محاسبات تحلیلی خالص؛ بدون ایجاد سند مالی یا تغییر خودکار مانده مشتری. */
export function assessOrderRisk(input: {
  order: Record<string, unknown> & { totalAmount?: unknown; costAmount?: unknown; costKnown?: boolean; customerId?: string; zone?: string; lines?: Array<Record<string, unknown>> }; customer?: Record<string, unknown> & { id?: string; balance?: unknown; creditLimit?: unknown }; orders?: Array<Record<string, unknown>>; policies?: Array<Record<string, unknown> & { enabled?: boolean; type?: string; scope?: string; value?: unknown; enforcement?: string }>; invoices?: Array<Record<string, unknown> & { customerId?: string; balance?: unknown }>; returns?: Array<Record<string, unknown>>;
  officialReceivableBalance?: number | null; ledgerVerified?: boolean;
}): RiskSignal[] {
  const { order, customer, orders = [], policies = [], invoices = [], returns = [] } = input;
  const signals: RiskSignal[] = [];
  const appliesToOrder = (policy: { scope?: string; value?: unknown }) => !policy.scope || policy.scope === 'COMPANY' || policy.scope === 'CUSTOMER' && policy.value === customer?.id || policy.scope === 'PRODUCT' && (order?.lines || []).some((line) => line.productId === policy.value) || policy.scope === 'PRODUCT_GROUP' && (order?.lines || []).some((line) => line.productGroupId === policy.value) || policy.scope === 'ZONE' && order?.zone === policy.value;
  const balance = input.ledgerVerified === true ? finiteAmount(input.officialReceivableBalance) : null;
  const limit = finiteAmount(customer?.creditLimit);
  const orderAmount = finiteAmount(order?.totalAmount);
  if (!customer) signals.push({ code: 'CUSTOMER_UNKNOWN', level: 'UNKNOWN', title: 'پروفایل مشتری ناقص', reason: 'مشتری به سفارش متصل نیست یا در داده محلی یافت نشد.' });
  else if (balance !== null && limit !== null && orderAmount !== null && limit > 0 && balance + orderAmount > limit) {
    signals.push({ code: 'CREDIT_LIMIT', level: 'HIGH', title: 'عبور احتمالی از سقف اعتبار', reason: `مانده فعلی به‌علاوه سفارش از سقف اعتبار تعریف‌شده بیشتر می‌شود.`, blocking: policies.some(p => p.enabled && p.type === 'CREDIT_LIMIT' && p.enforcement === 'CRM_TEST_ONLY') });
  } else if (balance === null || limit === null || limit <= 0 || orderAmount === null) {
    signals.push({ code: 'CREDIT_UNKNOWN', level: 'UNKNOWN', title: 'اعتبار قابل ارزیابی نیست', reason: 'مانده یا سقف اعتبار معتبر در داده موجود نیست.' });
  }
  if (order?.costKnown === true && finite(order.totalAmount) && finite(order.costAmount) && order.totalAmount > 0) {
    const margin = ((order.totalAmount - order.costAmount) / order.totalAmount) * 100;
    const minPolicy = policies.find(p => p.enabled && p.type === 'MIN_MARGIN' && p.value != null && appliesToOrder(p));
    if (minPolicy && Number.isFinite(Number(minPolicy.value)) && margin < Number(minPolicy.value)) signals.push({ code: 'LOW_MARGIN', level: 'HIGH', title: 'حاشیه سود کمتر از سیاست', reason: `حاشیه محاسبه‌شده ${margin.toFixed(1)}٪ است و از حد تعریف‌شده ${Number(minPolicy.value)}٪ پایین‌تر است.`, blocking: true });
    if (margin < 0) signals.push({ code: 'NEGATIVE_MARGIN', level: 'HIGH', title: 'سفارش زیان‌ده در سطح بهای ثبت‌شده', reason: 'مبلغ سفارش از بهای تمام‌شده ثبت‌شده کمتر است.', blocking: true });
  } else signals.push({ code: 'COST_UNKNOWN', level: 'UNKNOWN', title: 'بهای تمام‌شده نامشخص', reason: 'تا دریافت بهای معتبر، سود و حاشیه سود قابل تأیید نیست.' });

  const noCredit = policies.find(p => p.enabled && p.type === 'NO_CREDIT' && appliesToOrder(p));
  if (noCredit && balance !== null && balance > 0) signals.push({
    code: 'NO_CREDIT_POLICY', level: 'HIGH', title: 'مشتری دارای مانده تحت سیاست محدودکننده',
    reason: `مانده دفتری قطعی ${balance} است؛ اجرای منع اعتبار باید سمت سرور هم بررسی شود.`, blocking: true
  });
  else if (noCredit && balance === null) signals.push({
    code: 'NO_CREDIT_EVIDENCE_MISSING', level: 'UNKNOWN', title: 'مانده قطعی برای سیاست فروش اعتباری در دسترس نیست',
    reason: 'جمع مانده فاکتور یا فیلد مشتری جایگزین دفتر مالی نمی‌شود.'
  });
  const maxDiscount = policies.find(p => p.enabled && p.type === 'MAX_DISCOUNT' && p.value != null && appliesToOrder(p));
  if (maxDiscount && Number.isFinite(Number(maxDiscount.value)) && Number(order?.discountPercent || 0) > Number(maxDiscount.value)) signals.push({ code: 'MAX_DISCOUNT', level: 'HIGH', title: 'تخفیف بالاتر از سیاست مجاز', reason: `تخفیف سفارش ${Number(order.discountPercent)}٪ است و از سقف ${Number(maxDiscount.value)}٪ بیشتر است.`, blocking: true });
  const zonePolicy = policies.find(p => p.enabled && p.type === 'ZONE' && p.value != null && appliesToOrder(p));
  if (zonePolicy && order?.zone && order.zone !== zonePolicy.value) signals.push({ code: 'ZONE_POLICY', level: 'HIGH', title: 'مغایرت محدوده توزیع', reason: `زون سفارش ${order.zone} با زون مجاز ${zonePolicy.value} مطابقت ندارد.`, blocking: true });
  const sameCustomer = orders.filter(o => o.id !== order.id && o.customerId === order.customerId && o.status !== 'CANCELLED');
  const sameValueRecent = sameCustomer.find(o => Number(o.totalAmount) === Number(order.totalAmount) && Math.abs(Date.parse(String(o.createdAt || '')) - Date.parse(String(order.createdAt || ''))) < 24 * 60 * 60 * 1000);
  if (sameValueRecent) signals.push({ code: 'POSSIBLE_DUPLICATE', level: 'MEDIUM', title: 'احتمال سفارش تکراری', reason: `سفارش ${sameValueRecent.orderNumber || sameValueRecent.id} با مبلغ برابر برای همین مشتری در بازه نزدیک وجود دارد.` });
  const customerReturns = returns.filter(r => validFinancialRecord(r) && r.customerId === order.customerId);
  if (customerReturns.length >= 3) signals.push({ code: 'RETURN_PATTERN', level: 'MEDIUM', title: 'تکرار برگشتی مشتری', reason: `${customerReturns.length} برگشتی در داده‌های موجود ثبت شده؛ علت نهایی نیازمند بررسی انسانی است.` });
  return signals;
}

export function calculateProfitability(input: { invoices?: Array<Record<string, unknown>>; returns?: Array<Record<string, unknown>>; payments?: Array<Record<string, unknown>>; orders?: Array<Record<string, unknown>>; dispatchPlans?: Array<Record<string, unknown>>; expenses?: Array<Record<string, unknown>>; actualCogs?: number;
  officialLedgerGross?: number | null; officialLedgerReturns?: number | null;
  verifiedLedgerScope?: boolean; returnSourceComplete?: boolean;
  officialReceivableBalance?: number | null; receivableLedgerVerified?: boolean; }) {
  const invoices = (input.invoices || []).filter(validFinancialRecord);
  const returns = (input.returns || []).filter(validFinancialRecord);
  const payments = (input.payments || []).filter(validFinancialRecord);
  const orders = (input.orders || []).filter(order => !isVoidedRecord(order));
  const plans = (input.dispatchPlans || []).filter(plan => !isVoidedRecord(plan));
  const expenses = (input.expenses || []).filter(expense => !isVoidedRecord(expense));
  // Actual COGS is intentionally unavailable unless a verified source is explicitly supplied.
  const actualCogs = input.actualCogs;
  const amountSum = (records: Array<Record<string, unknown>>, selector: (record: Record<string, unknown>) => unknown) =>
    records.reduce((sum, record) => sum + (finiteAmount(selector(record)) ?? 0), 0);
  const invoiceGross = amountSum(invoices, invoice => invoice.totalAmount);
  const confirmedReturns = amountSum(returns.filter(record => record.financialDocumentConfirmed === true), record => record.amount);
  const unconfirmedReturns = amountSum(returns.filter(record => record.financialDocumentConfirmed !== true), record => record.amount);
  const netSales = input.verifiedLedgerScope === true && input.returnSourceComplete === true
    && finiteAmount(input.officialLedgerGross) === invoiceGross
    && finiteAmount(input.officialLedgerReturns) === confirmedReturns
    ? calculateNetSales(invoiceGross, confirmedReturns) : null;
  const clearedPayments = amountSum(payments.filter(payment => payment.status === 'CLEARED'), payment => payment.amount);
  const knownCostOrders = orders.filter(order => order.status !== 'CANCELLED' && order.costKnown === true &&
    finiteAmount(order.costAmount) !== null && finiteAmount(order.totalAmount) !== null);
  const estimatedOrderRevenue = amountSum(knownCostOrders, order => order.totalAmount);
  const estimatedGrossProfit = knownCostOrders.reduce((sum, order) =>
    sum + (finiteAmount(order.totalAmount) ?? 0) - (finiteAmount(order.costAmount) ?? 0), 0);
  const knownDispatchCosts = amountSum(plans.filter(plan => finiteAmount(plan.distributionCost) !== null), plan => plan.distributionCost);
  const knownExpenses = amountSum(expenses.filter(expense => expense.status === 'PAID'), expense => expense.amount);
  const receivableBalance = input.receivableLedgerVerified === true
    ? finiteAmount(input.officialReceivableBalance) : null;
  // Orders are forecasts only; realized profit requires reconciled invoice sales and verified FIFO COGS.
  const realizedGrossProfit = netSales !== null && finite(actualCogs) && actualCogs >= 0 && unconfirmedReturns === 0 ? netSales - actualCogs : null;
  const realizedGrossMarginPercent = realizedGrossProfit !== null && netSales !== null && netSales > 0 ? realizedGrossProfit / netSales * 100 : null;
  const operationalProfitAvailable = realizedGrossProfit !== null && knownDispatchCosts > 0;
  return {
    invoiceGross, confirmedReturns, unconfirmedReturns, netSales, clearedPayments,
    receivableBalance,
    realizedGrossProfit, realizedGrossMarginPercent,
    // Legacy prospective order fields: negotiation/planning only, never realized financial reports.
    estimatedOrderRevenue, estimatedGrossProfit,
    estimatedGrossMarginPercent: estimatedOrderRevenue > 0 ? estimatedGrossProfit / estimatedOrderRevenue * 100 : null,
    costCoveragePercent: orders.length ? knownCostOrders.length / orders.length * 100 : null,
    knownDispatchCosts, knownExpenses,
    operationalProfit: operationalProfitAvailable && realizedGrossProfit !== null ? realizedGrossProfit - knownExpenses - knownDispatchCosts : null,
    operationalProfitStatus: operationalProfitAvailable ? 'CALCULATED_WITH_INPUTS' : 'UNAVAILABLE',
    returnReconciliationStatus: input.returnSourceComplete !== true ? 'SOURCE_UNAVAILABLE' :
      unconfirmedReturns > 0 ? 'PENDING_DOCUMENTS' : netSales === null ? 'LEDGER_UNRECONCILED' : 'RECONCILED',
  };
}

export function buildOperationsMetrics(input: { orders?: Array<Record<string, unknown>>; invoices?: Array<Record<string, unknown>>; returns?: Array<Record<string, unknown>>; dispatchPlans?: Array<Record<string, unknown>>; payments?: Array<Record<string, unknown>> }) {
  const orders = input.orders || [], invoices = input.invoices || [], returns = input.returns || [], plans = input.dispatchPlans || [], payments = input.payments || [];
  const validInvoices = invoices.filter(validFinancialRecord);
  const validReturns = returns.filter(validFinancialRecord);
  const validPayments = payments.filter(validFinancialRecord);
  const convertedQuoteIds = new Set(validInvoices.map(i => i.quoteId).filter(Boolean));
  const invoicedOrderIds = new Set(validInvoices.map(i => i.salesOrderId).filter(Boolean));
  const knownWeights = plans.filter(p => Number(p.capacityKg) > 0 && p.plannedWeightKg != null);
  return {
    orderCount: orders.length,
    approvedOrders: orders.filter(o => ['APPROVED','RELEASED','IN_TRANSIT','DELIVERED'].includes(String(o.status||''))).length,
    cancelledOrders: orders.filter(o => o.status === 'CANCELLED').length,
    orderValue: orders.filter(o => o.status !== 'CANCELLED').reduce((s,o)=>s+Number(o.totalAmount||0),0),
    invoicedOrderCount: orders.filter(o => invoicedOrderIds.has(o.id)).length,
    returnCount: validReturns.length,
    confirmedReturnCount: validReturns.filter(r=>r.financialDocumentConfirmed===true).length,
    unconfirmedReturnAmount: validReturns.filter(r=>r.financialDocumentConfirmed!==true).reduce((sum, record)=>sum+(finiteAmount(record.amount) ?? 0),0),
    paymentAmount: validPayments.filter(p=>p.status==='CLEARED').reduce((sum,p)=>sum+(finiteAmount(p.amount) ?? 0),0),
    dispatchCapacityCoverage: knownWeights.length ? knownWeights.reduce((s,p)=>s+Number(p.plannedWeightKg||0)/Number(p.capacityKg)*100,0)/knownWeights.length : null,
    quoteInvoiceLinkCoverage: convertedQuoteIds.size,
  };
}

export function calculateCreditMetrics(input: { invoices?: Array<Record<string, unknown>>; payments?: Array<Record<string, unknown>>; allocations?: Array<Record<string, unknown>>; cheques?: Array<Record<string, unknown>>; asOf?: Date;
   invoiceOutstandingById?: Record<string, number>; ledgerVerified?: boolean; }) {
  const invoices = (input.invoices || []).filter(validFinancialRecord);
  const payments = (input.payments || []).filter(validFinancialRecord);
  const allocations = (input.allocations || []).filter(allocation =>
    allocation && allocation.isReversed !== true && allocation.isVoided !== true && allocation.isDeleted !== true && !allocation.deletedAt
  );
  const cheques = (input.cheques || []).filter(cheque => !isVoidedRecord(cheque));
  const paymentById = new Map(payments.map(payment => [payment.id, payment]));
  const invoiceById = new Map(invoices.map(invoice => [invoice.id, invoice]));
  const validAllocations = allocations.flatMap(allocation => {
    const payment = paymentById.get(allocation.paymentId) as Record<string, unknown> | undefined;
    const invoice = invoiceById.get(allocation.invoiceId) as Record<string, unknown> | undefined;
    const amount = finiteAmount(allocation.amount);
    if (!payment || !invoice || payment.status !== 'CLEARED' || amount === null || amount <= 0 || !invoice.date || !payment.date) return [];
    const invoiceTime = Date.parse(String(invoice.date));
    const paymentTime = Date.parse(String(payment.date));
    if (!Number.isFinite(invoiceTime) || !Number.isFinite(paymentTime) || paymentTime < invoiceTime) return [];
    return [{ allocation, payment, invoice, amount, days: Math.floor((paymentTime - invoiceTime) / 86400000) }];
  }).sort((a,b)=>a.days-b.days);
  const settlementDays = validAllocations.map(item => item.days);
  const median = settlementDays.length ? settlementDays.length % 2 ? settlementDays[(settlementDays.length-1)/2] : (settlementDays[settlementDays.length/2-1]+settlementDays[settlementDays.length/2])/2 : null;
  const clearedAllocated = validAllocations.reduce((sum, item) => sum + item.amount, 0);
  const invoiceGross = invoices.reduce((sum, invoice) => sum + Math.max(0, finiteAmount(invoice.totalAmount) ?? 0), 0);
  const now = (input.asOf || new Date()).getTime();
  const officialCoverage = input.ledgerVerified === true &&
    invoices.every(inv => typeof inv.id === 'string' && finiteAmount(input.invoiceOutstandingById?.[String(inv.id)]) !== null);
  const overdueRows = officialCoverage ? invoices.filter(invoice => {
    const balance = finiteAmount(input.invoiceOutstandingById?.[String(invoice.id)]);
    if (balance === null || balance <= 0 || !invoice.dueDate) return false;
    const due = Date.parse(String(invoice.dueDate));
    return Number.isFinite(due) && due < now;
  }) : [];
  return {
    averageSettlementDays: settlementDays.length ? settlementDays.reduce((a,b)=>a+b,0)/settlementDays.length : null,
    medianSettlementDays: median,
    settlementSampleSize: settlementDays.length,
    overdueInvoiceCount: officialCoverage ? overdueRows.length : null,
    bouncedChequeCount: cheques.filter(cheque=>cheque.status==='BOUNCED').length,
    unresolvedChequeCount: cheques.filter(cheque=>['PENDING','RECEIVED','DEPOSITED'].includes(String(cheque.status||''))).length,
    clearedAllocatedAmount: clearedAllocated,
    allocatedCollectionRatePercent: invoiceGross>0?clearedAllocated/invoiceGross*100:null,
    overdueBalance: officialCoverage ? overdueRows.reduce((sum,invoice)=>sum+Number(input.invoiceOutstandingById?.[String(invoice.id)]),0) : null,
  };
}

export function analyzeReturns(returns: Array<Record<string, unknown>> = []) {
  const byCause = new Map<string,{reasonCode:string;count:number;amount:number;confirmedCount:number;unconfirmedAmount:number}>();
  for (const item of returns.filter(validFinancialRecord)) {
    const reasonCode = String(item.reasonCode || 'UNKNOWN');
    const entry = byCause.get(reasonCode) || { reasonCode, count: 0, amount: 0, confirmedCount: 0, unconfirmedAmount: 0 };
    const amount = finiteAmount(item.amount) ?? 0;
    entry.count += 1; entry.amount += amount;
    if (item.financialDocumentConfirmed === true) entry.confirmedCount += 1; else entry.unconfirmedAmount += amount;
    byCause.set(reasonCode, entry);
  }
  return [...byCause.values()].sort((a,b)=>b.amount-a.amount);
}

export function evaluateDispatchPlan(plan: Record<string, unknown>, orders: Array<Record<string, unknown>> = []) {
  const assignedIds: string[] = Array.isArray(plan?.orderIds) ? plan.orderIds : [];
  const assigned = orders.filter(o=>assignedIds.includes(String(o.id||'')));
  const signals: RiskSignal[] = [];
  const capacity = Number(plan?.capacityKg), weight = plan?.plannedWeightKg == null ? NaN : Number(plan.plannedWeightKg);
  if (!Number.isFinite(capacity) || capacity <= 0 || !Number.isFinite(weight)) {
    signals.push({ code: 'DISPATCH_WEIGHT_UNKNOWN', level: 'UNKNOWN', title: 'ظرفیت یا وزن بار نامشخص', reason: 'تا زمان ثبت وزن معتبر اقلام و ظرفیت معتبر خودرو، درصد بهره‌برداری قابل محاسبه نیست.' });
  } else if (weight > capacity) {
    signals.push({ code: 'DISPATCH_OVER_CAPACITY', level: 'HIGH', title: 'بار بیش از ظرفیت وزنی', reason: `وزن برنامه ${weight} از ظرفیت مجاز ${capacity} بیشتر است.`, blocking: true });
  }
  const zoneMismatches = assigned.filter(o=>o.zone && plan?.zone && o.zone !== plan.zone);
  if (zoneMismatches.length) signals.push({ code: 'DISPATCH_ZONE_MISMATCH', level: 'HIGH', title: 'مغایرت زون سفارش و مسیر', reason: `${zoneMismatches.length} سفارش با زون برنامه پخش یکسان نیست؛ تأیید استثنا باید ثبت شود.` });
  const duplicateCount = assignedIds.length - new Set(assignedIds).size;
  if (duplicateCount > 0) signals.push({ code: 'DISPATCH_DUPLICATE_ASSIGNMENT', level: 'HIGH', title: 'تخصیص تکراری سفارش', reason: `${duplicateCount} شناسه سفارش بیش از یک‌بار در برنامه آمده است.`, blocking: true });
  return { signals, assignedOrderCount: assigned.length, capacityUtilizationPercent: Number.isFinite(capacity)&&capacity>0&&Number.isFinite(weight)?weight/capacity*100:null, knownWeight: Number.isFinite(weight), zoneMismatchCount: zoneMismatches.length };
}
