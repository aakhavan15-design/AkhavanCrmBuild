import assert from 'node:assert/strict';
import test from 'node:test';
import { ClientStorageDataProvider, HttpBackendDataProvider } from '../src/services/dataProvider.ts';

test('Data Provider Parity - Interface compliance across providers', () => {
  const clientProvider = new ClientStorageDataProvider();
  const apiProvider = new HttpBackendDataProvider();

  const requiredMethods = [
    'getAccounts', 'getAccountById', 'createAccount', 'updateAccount',
    'getQuotes', 'getQuoteById', 'createQuote', 'updateQuote',
    'getTasks', 'getTaskById', 'createTask', 'updateTask',
    'getInvoices', 'getPayments', 'getCheques', 'createPayment',
    'getPayslips', 'getAdvanceRequests', 'createAdvanceRequest', 'executePayrollRun',
    'getGeoZones', 'saveGeoZone', 'getAnalyticsReport'
  ];

  for (const method of requiredMethods) {
    assert.equal(typeof clientProvider[method], 'function', `Client provider must implement ${method}`);
    assert.equal(typeof apiProvider[method], 'function', `API provider must implement ${method}`);
  }
});

test('Data Provider Parity - ClientStorageDataProvider executes deterministic pagination', async () => {
  const provider = new ClientStorageDataProvider();
  const result = await provider.getAccounts(undefined, { page: 1, pageSize: 1 });
  
  assert.ok(result.items.length <= 1);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 1);
  assert.ok(Number.isInteger(result.total));
});
