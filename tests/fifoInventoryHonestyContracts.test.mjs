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

test('F7-04: InventoryTab reads FIFO and price from recorded fields and retains the unknown state', () => {
  const start = invTab.indexOf('InventoryTab');
  const end = invTab.indexOf('PurchasingTab');
  assert.ok(start > 0 && end > start);
  const fifoSection = invTab.slice(start, end);
  assert.match(fifoSection, /readKnownAmount\(product\.inventoryValueFifo\)/);
  assert.match(fifoSection, /data-testid="product-fifo-value"\>\{money\(fifo\)\}/);
  assert.equal(/lastPurchase|آخرین خرید/i.test(fifoSection), false);
  assert.match(fifoSection, /money\(readKnownAmount\(product\.unitPrice \?\? product\.basePrice\)\)/);
  assert.match(fifoSection, /stock === null.*بدون داده معتبر/);
  assert.match(fifoSection, /minimum === null.*آستانه تعریف نشده/);
});

test('F2-03: InventoryTab identifies sample rows and exposes no product write control', () => {
  const section = invTab.slice(invTab.indexOf('InventoryTab'), invTab.indexOf('PurchasingTab'));
  assert.match(section, /product\.source === 'LOCAL_TEST'/);
  assert.match(section, /آزمایشی/);
  assert.match(section, /تازگی اتصال ERP راستی‌آزمایی نشده است/);
  assert.doesNotMatch(section, /updateState|type="submit"/);
});
