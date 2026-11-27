import assert from 'node:assert/strict';
import { prefillQuoteLinesFromErpOrder } from '../src/lib/cpqOrderPrefill.ts';

const products = [
  { id: 'p1', name: 'کالای یک', sku: 'SKU-1', costPrice: 60, unitsPerCarton: 6, currencyCode: 'IRR',
    priceClasses: { PRICE_CLASS_2: { unitPrice: 100, currencyCode: 'IRR', label: 'عمده' } } },
  { id: 'p2', name: 'کالای دو', code: 'P2', costPrice: 30, unitsPerCarton: 12, currencyCode: 'IRR',
    priceClasses: { PRICE_CLASS_2: { unitPrice: 50, currencyCode: 'IRR' } } }
];
const order = {
  currencyCode: 'IRR',
  lines: [
    { externalProductId: 'SKU-1', quantityMode: 'CARTON', cartonQuantity: 2, unitPrice: 120 },
    { productCode: 'P2', quantity: 3, unitPrice: 55 }
  ]
};
const mapped = prefillQuoteLinesFromErpOrder(order, products, 'PRICE_CLASS_2');
assert.equal(mapped.sourceLineCount, 2);
assert.equal(mapped.unmappedCount, 0);
assert.equal(mapped.lines.length, 2);
assert.equal(mapped.lines[0].quantity, 12);
assert.equal(mapped.lines[0].cartonQuantity, 2);
assert.equal(mapped.lines[0].unitsPerCarton, 6);
assert.equal(mapped.lines[0].unitPrice, 120);
assert.equal(mapped.lines[0].erpClassUnitPrice, 100);
assert.equal(mapped.lines[0].lineTotal, 1440);
assert.equal(mapped.lines[0].lineVariance, 240);
assert.equal(mapped.lines[1].quantity, 3);
assert.equal(mapped.lines[1].erpClassUnitPrice, 50);
assert.equal(mapped.lines[1].lineTotal, 165);

// Missing product, missing selected class, and non-Rial source are not silently priced.
const invalid = prefillQuoteLinesFromErpOrder({
  currencyCode: 'IRR',
  lines: [
    { externalProductId: 'NOT-FOUND', quantity: 1, unitPrice: 10 },
    { externalProductId: 'SKU-1', quantity: 1, unitPrice: 10 }
  ]
}, products, 'PRICE_CLASS_5');
assert.equal(invalid.lines.length, 0);
assert.equal(invalid.unmappedCount, 2);
const nonRial = prefillQuoteLinesFromErpOrder({
  currencyCode: 'TOMAN',
  lines: [{ externalProductId: 'SKU-1', quantity: 1, unitPrice: 10 }]
}, products, 'PRICE_CLASS_2');
assert.equal(nonRial.lines.length, 0);
assert.equal(nonRial.unmappedCount, 1);
console.log('cpqOrderPrefill OK');
