export type NormalOrderQuantityMode = 'CARTON' | 'BASE_UNIT';

export interface NormalOrderLineDraft {
  id: string;
  productId: string;
  productName: string;
  productCode?: string;
  quantity: number; // always base units
  unitPrice: number; // always IRR per base unit
  lineTotal: number; // always IRR
  quantityMode: NormalOrderQuantityMode;
  cartonQuantity: number | null;
  unitsPerCarton: number | null;
  currencyCode: 'IRR';
}

const positiveSafeInteger = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};

/** No implicit carton multiplier: CARTON mode is valid only with a real ERP pack size. */
export function calculateNormalOrderLine(input: {
  enteredQuantity: unknown;
  quantityMode: NormalOrderQuantityMode;
  unitsPerCarton?: unknown;
  unitPrice: unknown;
}) {
  const enteredQuantity = positiveSafeInteger(input.enteredQuantity);
  if (enteredQuantity === null) return { valid: false as const, reason: 'QUANTITY_INVALID' as const, baseQuantity: null, cartonQuantity: null, lineTotal: null };
  const unitsPerCarton = positiveSafeInteger(input.unitsPerCarton);
  if (input.quantityMode === 'CARTON' && unitsPerCarton === null) {
    return { valid: false as const, reason: 'PACK_SIZE_UNKNOWN' as const, baseQuantity: null, cartonQuantity: null, lineTotal: null };
  }
  const baseQuantity = input.quantityMode === 'CARTON' ? enteredQuantity * (unitsPerCarton as number) : enteredQuantity;
  if (!Number.isSafeInteger(baseQuantity) || baseQuantity <= 0) return { valid: false as const, reason: 'QUANTITY_OVERFLOW' as const, baseQuantity: null, cartonQuantity: null, lineTotal: null };
  const unitPrice = positiveSafeInteger(input.unitPrice);
  if (unitPrice === null) return { valid: false as const, reason: 'ERP_CLASS_PRICE_UNAVAILABLE' as const, baseQuantity, cartonQuantity: input.quantityMode === 'CARTON' ? enteredQuantity : null, lineTotal: null };
  const lineTotal = baseQuantity * unitPrice;
  if (!Number.isSafeInteger(lineTotal) || lineTotal <= 0) return { valid: false as const, reason: 'LINE_TOTAL_OVERFLOW' as const, baseQuantity, cartonQuantity: input.quantityMode === 'CARTON' ? enteredQuantity : null, lineTotal: null };
  return { valid: true as const, reason: null, baseQuantity, cartonQuantity: input.quantityMode === 'CARTON' ? enteredQuantity : null, lineTotal };
}

export function validateNormalOrderLines(lines: readonly NormalOrderLineDraft[]): string[] {
  const errors: string[] = [];
  if (!lines.length) errors.push('NO_LINES');
  for (const [index, line] of lines.entries()) {
    if (!line.productId) errors.push(`LINE_${index + 1}_PRODUCT_MISSING`);
    if (positiveSafeInteger(line.quantity) === null) errors.push(`LINE_${index + 1}_QUANTITY_INVALID`);
    if (positiveSafeInteger(line.unitPrice) === null) errors.push(`LINE_${index + 1}_ERP_PRICE_MISSING`);
    if (line.currencyCode !== 'IRR') errors.push(`LINE_${index + 1}_CURRENCY_NOT_IRR`);
    if (line.quantityMode === 'CARTON') {
      const cartons = positiveSafeInteger(line.cartonQuantity);
      const pack = positiveSafeInteger(line.unitsPerCarton);
      if (cartons === null || pack === null || cartons * pack !== line.quantity) errors.push(`LINE_${index + 1}_PACK_CONVERSION_INVALID`);
    }
    const expectedTotal = line.quantity * line.unitPrice;
    if (!Number.isSafeInteger(expectedTotal) || expectedTotal <= 0 || expectedTotal !== line.lineTotal) errors.push(`LINE_${index + 1}_TOTAL_INVALID`);
  }
  return errors;
}

/** Creates a CRM draft only. It never assigns an ERP order number or claims ERP acceptance. */
export function buildNormalOrderDraftRecord(input: {
  id: string;
  orderNumber?: string;
  sourceOrderId?: string | null;
  sourceOrderNumber?: string | null;
  customerId: string;
  customerName?: string;
  priceClassCode: string;
  lines: NormalOrderLineDraft[];
  ownerId: string;
  createdAt?: string;
  updatedAt?: string;
  notes?: string;
}) {
  const errors = validateNormalOrderLines(input.lines);
  if (!input.customerId) errors.push('CUSTOMER_REQUIRED');
  if (!input.priceClassCode) errors.push('PRICE_CLASS_REQUIRED');
  if (!input.ownerId) errors.push('ACTIVE_USER_REQUIRED');
  const totalAmount = input.lines.reduce((sum, line) => sum + line.lineTotal, 0);
  if (!Number.isSafeInteger(totalAmount) || totalAmount <= 0) errors.push('ORDER_TOTAL_INVALID');
  if (errors.length) return { ok: false as const, errors };
  const now = input.updatedAt || new Date().toISOString();
  const sourceOrderId = input.sourceOrderId || undefined;
  return {
    ok: true as const,
    errors: [] as string[],
    record: {
      id: input.id,
      orderNumber: input.orderNumber || `CRM-DRAFT-${input.id.slice(0, 8)}`,
      sourceOrderId,
      sourceOrderNumber: input.sourceOrderNumber || undefined,
      customerId: input.customerId,
      accountId: input.customerId,
      customerName: input.customerName || undefined,
      priceClassCode: input.priceClassCode,
      lines: input.lines.map(line => ({ ...line })),
      totalAmount,
      currencyCode: 'IRR' as const,
      sourceSystemCode: 'CRM',
      origin: sourceOrderId ? 'ERP_AMENDMENT' : 'CRM_ORDER',
      isErpMirror: false,
      status: 'DRAFT',
      approvalStatus: 'DRAFT',
      syncStatus: 'NOT_SENT',
      erpSyncStatus: 'NOT_SENT',
      createdBy: input.ownerId,
      ownerId: input.ownerId,
      createdAt: input.createdAt || now,
      updatedAt: now,
      notes: input.notes || (sourceOrderId ? 'پیش‌نویس اصلاح سفارش ERP؛ سفارش اصلی تغییر نکرده است.' : 'پیش‌نویس سفارش عادی CRM؛ هنوز به ERP ارسال نشده است.'),
    }
  };
}
