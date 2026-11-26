import type { DraftQuoteState, ExternalProduct } from '../types';
import { computeOrderBalance } from './cpqEngine';

type ErpOrderLineRecord = Record<string, unknown>;
const safePositiveOrderInt = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};
const isRialOrderCurrency = (value: unknown) => ['IRR', 'RIAL', 'RIALS', 'ریال'].includes(String(value ?? 'IRR').trim().toUpperCase());

export function prefillQuoteLinesFromErpOrder(
  order: Record<string, unknown>,
  products: ExternalProduct[],
  priceClassCode: string
): { lines: DraftQuoteState['lines']; sourceLineCount: number; unmappedCount: number } {
  const sourceLines = Array.isArray(order.lines) ? order.lines as ErpOrderLineRecord[] : [];
  let unmappedCount = 0;
  const lines: DraftQuoteState['lines'] = [];
  for (const source of sourceLines) {
    const productKey = String(source.externalProductId ?? source.productId ?? source.productCode ?? source.sku ?? '').trim();
    const product = products.find(item => [item.id, item.erpId, item.externalId, item.code, item.sku]
      .some(value => String(value ?? '') === productKey));
    if (!product) { unmappedCount += 1; continue; }

    const classEntry = product.priceClasses?.[priceClassCode as keyof NonNullable<ExternalProduct['priceClasses']>];
    const classPrice = safePositiveOrderInt(classEntry?.unitPrice);
    const classCurrency = classEntry?.currencyCode ?? product.currencyCode ?? order.currencyCode ?? 'IRR';
    const sourceCurrency = source.currencyCode ?? source.currency ?? order.currencyCode ?? 'IRR';
    if (!isRialOrderCurrency(classCurrency) || !isRialOrderCurrency(sourceCurrency) || classPrice === null) { unmappedCount += 1; continue; }

    const unitsPerCarton = safePositiveOrderInt(source.unitsPerCarton ?? product.unitsPerCarton);
    const explicitCartons = safePositiveOrderInt(source.cartonQuantity);
    const sourceMode = String(source.quantityMode ?? '').toUpperCase();
    const quantityMode = sourceMode === 'CARTON' || (explicitCartons !== null && unitsPerCarton !== null) ? 'CARTON' as const : 'BASE_UNIT' as const;
    const enteredQuantity = quantityMode === 'CARTON'
      ? (explicitCartons ?? safePositiveOrderInt(source.quantity))
      : safePositiveOrderInt(source.quantity);
    const quantity = quantityMode === 'CARTON'
      ? (enteredQuantity !== null && unitsPerCarton !== null ? enteredQuantity * unitsPerCarton : null)
      : enteredQuantity;
    if (quantity === null || !Number.isSafeInteger(quantity) || quantity <= 0) { unmappedCount += 1; continue; }

    const sourcePrice = safePositiveOrderInt(source.unitPrice ?? source.netUnitPrice);
    const unitPrice = sourcePrice ?? classPrice;
    if (unitPrice === null) { unmappedCount += 1; continue; }
    const lineTotal = quantity * unitPrice;
    if (!Number.isSafeInteger(lineTotal) || lineTotal <= 0) { unmappedCount += 1; continue; }
    const balance = computeOrderBalance([{
      key: 'source',
      comparisonPrice: classPrice,
      currencyCode: 'IRR',
      unitPrice,
      baseQuantity: quantity,
      unitsPerCarton
    }]).lines[0];
    const cost = Number(source.costPrice ?? product.costPrice);
    lines.push({
      productId: product.id,
      productName: product.name,
      productCode: product.sku || product.code || String(source.productCode ?? ''),
      quantity,
      unitPrice,
      costPrice: Number.isFinite(cost) && cost > 0 ? cost : 0,
      lineTotal,
      erpClassUnitPrice: classPrice,
      erpClassCurrencyCode: 'IRR',
      floorUnitPrice: product.floorPrice ?? null,
      cartonQuantity: quantityMode === 'CARTON' ? enteredQuantity : null,
      unitsPerCarton,
      quantityMode,
      lineVariance: balance.variance,
      balanceStatus: balance.status
    });
  }
  return { lines, sourceLineCount: sourceLines.length, unmappedCount };
}

