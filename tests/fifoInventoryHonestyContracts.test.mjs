/**
 * F7-04 contracts: inventoryValueFifo is read-only from data; missing => "نامشخص".
 * CRM must not invent FIFO layers or last-purchase cost as FIFO.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const invTab = readFileSync(new URL('../src/components/OperationsSupplementalTabs.tsx', import.meta.url), 'utf8');
const types = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8');

test('F7-04: types declare inventoryValueFifo as optional/nullable (DB-sourced)', () => {
  assert.match(types, /inventoryValueFifo\??\s*:\s*number\s*\|\s*null/);
  assert.match(types, /ارزش موجودی طبق FIFO/);
  assert.match(types, /CRM محاسبه نمی‌کند/);
});

test('F7-04: InventoryTab shows نامشخص when inventoryValueFifo is null/undefined/non-finite', () => {
  assert.match(invTab, /data-testid="product-fifo-value"/);
  assert.match(invTab, /inventoryValueFifo==null\|\|!Number\.isFinite\(Number\(p\.inventoryValueFifo\)\)\s*\?\s*'نامشخص'/);
});

test('F7-04: no client-side last-purchase-as-FIFO; labels DB source', () => {
  const start = invTab.indexOf('InventoryTab');
  const end = invTab.indexOf('PurchasingTab');
  assert.ok(start > 0 && end > start);
  const fifoSection = invTab.slice(start, end);
  assert.equal(/lastPurchase|آخرین خرید/i.test(fifoSection), false);
  assert.match(fifoSection, /FIFO، دیتابیس/);
  assert.match(fifoSection, /inventoryValueFifo/);
});
