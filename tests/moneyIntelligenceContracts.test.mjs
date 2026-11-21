import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseMoneyReportQuery, projectMoneyReport } from '../server/moneyIntelligence.mjs';

const filter = parseMoneyReportQuery({ from: '2026-11-01', to: '2026-11-10' });
const metadata = {
  openingDate: '2026-01-01', verifiedThrough: '2026-11-10', openingDocuments: 1,
  excludedOpening: 0, excludedPeriod: 0, excludedPrior: 0, mixedDocuments: 0,
};
const trend = [{ date: '2026-11-02', inflow: '100', outflow: '30', transfers: '250', unresolved: '0', net: '70' }];
const balances = [
  { role: 'CASH', opening: '150', closing: '220', effect: '-70' },
  { role: 'PNL_INCOME', opening: '0', closing: '-160', effect: '160' },
  { role: 'PNL_EXPENSE', opening: '0', closing: '40', effect: '-40' },
  { role: 'RECEIVABLE', opening: '0', closing: '50', effect: '-50' },
];

test('dates, report modes and evidence pagination reject invalid input', () => {
  assert.equal(filter.priorStart, '2026-10-22');
  assert.equal(parseMoneyReportQuery({ from: '2026-02-30', to: '2026-11-10' }), null);
  assert.equal(parseMoneyReportQuery({ from: '2026-10-01', to: '2026-11-10', page: '1001' }), null);
  assert.equal(parseMoneyReportQuery({ from: '2026-10-01', to: '2026-11-10', mode: 'unrecognized' }), null);
});

test('flagged evidence requires the same group and an eligible report mode', () => {
  const input = { from: '2026-11-01', to: '2026-11-10', mode: 'expense', dimension: 'category' };
  assert.equal(parseMoneyReportQuery({ ...input, signal: 'repeat', key: 'FREIGHT' }), null);
  assert.equal(parseMoneyReportQuery({ ...input, signal: 'unusual' }), null);
  assert.equal(parseMoneyReportQuery({ ...input, signal: 'unusual', dimension: 'month', key: '1405-08' }), null);
  assert.equal(parseMoneyReportQuery({ ...input, signal: 'unusual', key: '' }).signal, 'unusual');
  const report = projectMoneyReport([[metadata], trend, balances, [{ unusualDocuments: null, repeatCount: 0 }], [], []], filter);
  assert.equal(report.grouped[0].unusualDocuments, null);
});

test('internal transfer is disclosed but stays out of net cash and profit reconciliation', () => {
  const report = projectMoneyReport([[metadata], trend, balances, [], [], []], filter);
  assert.equal(report.cash.transfers, '250.00000000000000');
  assert.equal(report.cash.net, '70.00000000000000');
  assert.equal(report.netProfit, '120.00000000000000');
  assert.deepEqual(report.bridge, [{ role: 'RECEIVABLE', amount: '-50' }]);
  assert.equal(report.workingCapital.closing, null);
  assert.equal(report.bank.closing, null);
});

test('unknown accounting coverage disables closing and profit while retaining observed movement', () => {
  const report = projectMoneyReport([[{ ...metadata, excludedPeriod: 1 }], trend, balances, [], [], []], filter);
  assert.equal(report.status, 'PARTIAL');
  assert.equal(report.cash.net, '70.00000000000000');
  assert.equal(report.cash.closing, null);
  assert.equal(report.netProfit, null);
  assert.deepEqual(report.bridge, []);
});

test('FIFO working capital and independent bank evidence preserve distinct meanings and precise amounts', () => {
  const bank = [
    { metric: 'BANK_CLOSING_IRR', result: 'MATCHED', amount: '220.0000' },
    { metric: 'BANK_UNMATCHED_GROSS_IRR', result: 'MISMATCH', amount: '25.0000' },
  ];
  const fifo = [
    { side: 'opening', amount: '9007199254740993.00000000000001' },
    { side: 'closing', amount: '9007199254740995.00000000000007' },
  ];
  const report = projectMoneyReport([[metadata], trend, balances, [], [], fifo, bank], filter);
  assert.equal(report.workingCapital.change, '52.00000000000006');
  assert.equal(report.bank.status, 'MISMATCH');
  assert.equal(report.bank.closing, '220.0000');
  assert.equal(report.bank.unmatched, '25.0000');
});
