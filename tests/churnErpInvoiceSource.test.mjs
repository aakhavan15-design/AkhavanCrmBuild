import assert from 'node:assert/strict';
import { getChurnThresholdOverrides, getMetricThresholds, isChurnThresholdsDefault } from '../src/lib/metricConfig.ts';
import { predictAccountChurn, evaluatePortfolioChurn } from '../src/services/churnPredictionService.ts';

const refDate = new Date('2026-06-15T12:00:00Z');
const account = {
  id: 'acc-1',
  name: 'فروشگاه تست ریزش',
  createdAt: '2025-01-01T00:00:00Z',
  ownerId: 'u1',
};

// ۱. پیش‌فاکتور (Quote) نباید مانع تشخیص بی‌سابقه‌بودن خرید یا افت خرید شود؛ فقط فاکتور معتبر ERP مبناست.
const stateWithQuoteOnly = {
  users: [{ id: 'u1', name: 'کاربر' }],
  accounts: [account],
  quotes: [
    {
      id: 'q1',
      accountId: 'acc-1',
      status: 'ACCEPTED',
      totalAmount: 500_000_000,
      createdAt: '2026-06-10T10:00:00Z',
    },
  ],
  invoices: [],
  activities: [],
  cheques: [],
  cases: [],
  settings: {},
};

const quoteOnlyResult = predictAccountChurn(account, stateWithQuoteOnly, refDate);
assert.equal(quoteOnlyResult.daysSinceLastOrder, null, 'Quote must not be treated as realized purchase');
assert.ok(quoteOnlyResult.reasons.some(r => r.includes('فاکتور خرید معتبر')));

// ۲. فاکتور معتبر ERP باید recency و افت خرید را محاسبه کند؛ فاکتور CANCELLED/DRAFT و چک ضمانتی نباید لحاظ شوند.
const stateWithInvoices = {
  ...stateWithQuoteOnly,
  invoices: [
    { id: 'inv-prev', accountId: 'acc-1', status: 'PAID', totalAmount: 200_000_000, date: '2026-03-01', dueDate: '2026-03-15', balance: 0 },
    { id: 'inv-recent', accountId: 'acc-1', status: 'UNPAID', totalAmount: 50_000_000, date: '2026-05-01', dueDate: '2026-05-15', balance: 50_000_000 },
    { id: 'inv-void', accountId: 'acc-1', status: 'CANCELLED', totalAmount: 900_000_000, date: '2026-06-14', dueDate: '2026-06-20', balance: 900_000_000 },
  ],
  cheques: [
    { id: 'chq-guarantee', accountId: 'acc-1', status: 'BOUNCED', isGuarantee: true, amount: 100_000_000 },
    { id: 'chq-real', accountId: 'acc-1', status: 'BOUNCED', isGuarantee: false, amount: 40_000_000 },
  ],
};

const unverifiedResult = predictAccountChurn(account, stateWithInvoices, refDate);
assert.equal(unverifiedResult.revenueDropPercent, null, 'Gross invoices alone do not establish verified net sales');
assert.equal(unverifiedResult.unpaidOverdueAmount, null, 'Invoice balance cannot substitute for the ledger');
const ledgerBalances = {
  status: 'LIVE', source: 'SQLSERVER_BACKEND', sourceSystem: 'TEST_ERP', currency: 'IRR',
  balances: [{
    detailKey: 'acc-1', accountId: 'acc-1', status: 'COMPLETE',
    subsidiaries: [{subsidiaryCode:'AR',periodCode:null,debit:250_000_000,credit:200_000_000,balance:50_000_000,nature:'DEBIT',lineCount:2}],
    total: {debit:250_000_000,credit:200_000_000,balance:50_000_000,nature:'DEBIT',lineCount:2},
  }],
};
const verifiedNetSalesByPeriod = {previous:200_000_000,recent:50_000_000,ledgerReconciled:true};
const invoiceResult = predictAccountChurn(account, stateWithInvoices, refDate, {ledgerBalances, verifiedNetSalesByPeriod});
assert.equal(invoiceResult.daysSinceLastOrder, 45, 'Must ignore CANCELLED invoice from 2026-06-14');
assert.equal(invoiceResult.revenueDropPercent, 75, 'Must compute 75% revenue drop from reconciled net sales (200M -> 50M)');
assert.equal(invoiceResult.bouncedChequesCount, 1, 'Guarantee cheque must be excluded');
assert.equal(invoiceResult.unpaidOverdueAmount, 50_000_000);
const uncovered = {...ledgerBalances, balances: [{...ledgerBalances.balances[0], total: {...ledgerBalances.balances[0].total,balance:300_000_000}}]};
assert.equal(predictAccountChurn(account,stateWithInvoices,refDate,{ledgerBalances:uncovered}).unpaidOverdueAmount,null);
const partial = {...ledgerBalances, balances: [{...ledgerBalances.balances[0],status:'HAS_UNMAPPED'}]};
assert.equal(predictAccountChurn(account,stateWithInvoices,refDate,{ledgerBalances:partial}).unpaidOverdueAmount,null);

// ۳. آستانه‌ها باید از تنظیمات سازمان خوانده شوند (نه عدد ثابت).
const customSettingsState = {
  ...stateWithInvoices,
  settings: {
    orgConfig: {
      churnThresholds: {
        daysCritical: 40,
        scoreCritical: 60,
      },
    },
  },
};
const customResult = predictAccountChurn(account, customSettingsState, refDate);
assert.ok(customResult.churnScore >= 60);
assert.equal(customResult.riskTier, 'CRITICAL');

const summary = evaluatePortfolioChurn(customSettingsState, refDate);
assert.equal(summary.totalAccounts, 1);
assert.equal(summary.criticalCount, 1);

console.log('churnErpInvoiceSource: OK');

// Null/empty configuration must not silently become a zero risk threshold.
const defaults = getMetricThresholds({});
const invalid = getMetricThresholds({ orgConfig: { churnThresholds: { daysCritical: null, daysHigh: '' }, quoteMarginFloorPercent: null, agingBucketDays: [null, '30'] } });
assert.equal(invalid.churnThresholds.daysCritical, defaults.churnThresholds.daysCritical);
assert.equal(invalid.churnThresholds.daysHigh, defaults.churnThresholds.daysHigh);
assert.equal(invalid.quoteMarginFloorPercent, defaults.quoteMarginFloorPercent);
assert.deepEqual(invalid.agingBucketDays, defaults.agingBucketDays);
const invalidOverrides = { orgConfig: { churnThresholds: { daysCritical: false, daysHigh: '  ', daysWatch: [], unknown: 99 } } };
assert.deepEqual(getChurnThresholdOverrides(invalidOverrides), {});
assert.equal(isChurnThresholdsDefault(invalidOverrides), true);
const actualOverrides = { orgConfig: { churnThresholds: { daysCritical: 0, daysHigh: '65' } } };
assert.deepEqual(getChurnThresholdOverrides(actualOverrides), { daysCritical: 0, daysHigh: 65 });
assert.equal(isChurnThresholdsDefault(actualOverrides), false);
assert.equal(getMetricThresholds(actualOverrides).churnThresholds.daysCritical, 0);
