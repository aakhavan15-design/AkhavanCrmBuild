import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('finance never treats provider errors as perpetual loading or real zero balances', () => {
  const code = read('src/components/FinanceWorkspace.tsx');
  assert.match(code, /error: ledgerError/);
  assert.match(code, /ledgerError \? \{ status: 'UNAVAILABLE'/);
  assert.match(code, /summarizeCustomerLedgerReceivables\(ledgerResult, ledgerAccounts\)/);
  assert.match(code, /refreshLedgerBalances\(\)/);
});
test('order drawer does not query ledger while closed and does not reuse failed result', () => {
  const code = read('src/components/shared/OrderDetailsDrawer.tsx');
  assert.match(code, /canSeeLedger && isOpen && quote \? provider\.getDetailSubsidiaryBalances\(\)/);
  assert.match(code, /ledgerError \? \{ status: 'UNAVAILABLE'/);
  assert.match(code, /estimateInvoiceRemaining\(availableLedgerBalances,/);
});
