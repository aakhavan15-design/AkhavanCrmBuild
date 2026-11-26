import React, { useMemo, useState } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { InputControl, Select } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
import { NumericField } from '../quote/NumericField';
import { PurchaseProductHints } from '../reports/PurchaseCycleFollowUp';
import { formatCount, formatNumber } from '../../lib/format';
import { generateSecureId } from '../../lib/secureId';
import { requireActiveUser } from '../../hooks/useCan';
import { getActiveDataProvider } from '../../services/dataProvider';
import { isNegotiableErpOrder } from '../../lib/phase2Flow';
import { PRICE_CLASS_CODES, resolvePriceClassLabels } from '../../lib/cpqEngine';
import { buildNormalOrderDraftRecord, calculateNormalOrderLine, validateNormalOrderLines, type NormalOrderLineDraft, type NormalOrderQuantityMode } from '../../lib/normalOrderBasket';
import type { AppState } from '../../types';

type RecordRow = Record<string, any>;
type EditableLine = NormalOrderLineDraft & { enteredQuantity: number | null };

interface Props {
  state: AppState;
  updateState: (updater: (draft: AppState) => void | Partial<AppState>) => void;
  erpOrders: RecordRow[];
  crmDrafts: RecordRow[];
  customers: RecordRow[];
  canCreate: boolean;
  canViewCpq: boolean;
  onOpenCpq: (orderId: string) => void;
}

const safePositiveInt = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};
const validClass = (value: unknown): string => typeof value === 'string' && (PRICE_CLASS_CODES as readonly string[]).includes(value) ? value : '';

function productForLine(products: RecordRow[], line: RecordRow) {
  const externalId = String(line.externalProductId ?? line.productId ?? line.productCode ?? '').trim();
  return products.find(product => [product.id, product.erpId, product.externalId, product.code, product.sku].some(value => String(value ?? '') === externalId));
}
function customerForOrder(customers: RecordRow[], order: RecordRow) {
  const id = String(order.accountId ?? order.customerId ?? '');
  return customers.find(customer => [customer.id, customer.externalId, customer.erpId, customer.code].some(value => String(value ?? '') === id));
}
function classPrice(product: RecordRow | undefined, code: string): number | null {
  if (!product || !code) return null;
  const entry = product.priceClasses?.[code];
  const currency = String(entry?.currencyCode ?? product.currencyCode ?? 'IRR').trim().toUpperCase();
  if (!['IRR', 'RIAL', 'RIALS', 'ریال'].includes(currency)) return null;
  return safePositiveInt(entry?.unitPrice);
}
function toEditableLine(source: RecordRow, products: RecordRow[], priceClassCode: string, index: number): EditableLine {
  const product = productForLine(products, source);
  const externalId = String(source.externalProductId ?? source.productId ?? source.productCode ?? '');
  const unitsPerCarton = safePositiveInt(source.unitsPerCarton ?? product?.unitsPerCarton);
  const explicitCartons = safePositiveInt(source.cartonQuantity);
  const sourceMode = String(source.quantityMode || '').toUpperCase();
  const quantityMode: NormalOrderQuantityMode = sourceMode === 'CARTON' || (explicitCartons !== null && unitsPerCarton !== null) ? 'CARTON' : 'BASE_UNIT';
  const enteredQuantity = quantityMode === 'CARTON' ? (explicitCartons ?? safePositiveInt(source.quantity)) : safePositiveInt(source.quantity);
  const rawCurrency = String(source.currencyCode ?? source.currency ?? 'IRR').trim().toUpperCase();
  const sourcePriceIsRial = ['IRR', 'RIAL', 'RIALS', 'ریال'].includes(rawCurrency);
  const unitPrice = (sourcePriceIsRial ? safePositiveInt(source.unitPrice ?? source.netUnitPrice) : null) ?? classPrice(product, priceClassCode) ?? 0;
  const calculated = calculateNormalOrderLine({ enteredQuantity, quantityMode, unitsPerCarton, unitPrice });
  const baseQuantity = calculated.baseQuantity ?? (quantityMode === 'BASE_UNIT' ? enteredQuantity ?? 0 : 0);
  const lineTotalRaw = sourcePriceIsRial ? safePositiveInt(source.lineTotal ?? source.netLineAmount) : null;
  const lineTotal = lineTotalRaw ?? (Number.isSafeInteger(baseQuantity * unitPrice) ? baseQuantity * unitPrice : 0);
  return {
    id: String(source.id ?? generateSecureId('order-line')),
    productId: product?.id ? String(product.id) : '',
    productName: String(product?.name ?? source.productName ?? source.name ?? 'کالای نامشخص'),
    productCode: String(product?.sku ?? product?.code ?? source.productCode ?? externalId),
    quantity: baseQuantity,
    unitPrice,
    lineTotal,
    quantityMode,
    cartonQuantity: quantityMode === 'CARTON' ? (calculated.cartonQuantity ?? enteredQuantity) : null,
    unitsPerCarton: unitsPerCarton,
    currencyCode: 'IRR',
    enteredQuantity,
  };
}

export function NormalOrderBasket({ state, updateState, erpOrders, crmDrafts, customers, canCreate, canViewCpq, onOpenCpq }: Props) {
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'NEW' | 'ERP_AMENDMENT' | 'CRM_DRAFT'>('NEW');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sourceOrderId, setSourceOrderId] = useState<string | null>(null);
  const [sourceOrderNumber, setSourceOrderNumber] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [priceClassCode, setPriceClassCode] = useState('');
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [addQuantity, setAddQuantity] = useState<number | null>(1);
  const [addMode, setAddMode] = useState<NormalOrderQuantityMode>('BASE_UNIT');
  const [notes, setNotes] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const products = (state.externalProducts || []) as unknown as RecordRow[];
  const orgConfig = ((state.settings as Record<string, unknown> | undefined)?.orgConfig ?? {}) as Record<string, unknown>;
  const classLabels = resolvePriceClassLabels(orgConfig.priceClassLabels as Record<string, unknown> | undefined, state.externalProducts);
  const selectedCustomer = customers.find(customer => String(customer.id) === customerId);
  const selectedProduct = products.find(product => String(product.id) === selectedProductId);
  const selectedClassPrice = classPrice(selectedProduct, priceClassCode);
  const selectedPackSize = safePositiveInt(selectedProduct?.unitsPerCarton);
  const selectedClassLabel = classLabels[priceClassCode as keyof typeof classLabels] || priceClassCode;
  const customerOptions = customers.map(customer => ({ value: String(customer.id), label: String(customer.name || customer.code || customer.id), subLabel: [customer.code, customer.city, customer.phone].filter(Boolean).join(' · ') }));
  const classOptions = PRICE_CLASS_CODES.map(code => ({ value: code, label: classLabels[code] || code }));
  const productOptions = products.map(product => ({ value: String(product.id), label: String(product.name || product.sku || product.id), subLabel: [product.sku || product.code, product.category, product.brand].filter(Boolean).join(' · ') }));

  const totalAmount = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const totalUnits = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalCartons = lines.every(line => line.quantityMode === 'CARTON')
    ? lines.reduce((sum, line) => sum + (line.cartonQuantity || 0), 0) : null;
  const totalWeightKg = useMemo(() => {
    if (!lines.length) return null;
    let total = 0;
    for (const line of lines) {
      const product = products.find(item => String(item.id) === line.productId);
      const weight = Number(product?.unitWeightKg);
      if (!Number.isFinite(weight) || weight <= 0) return null;
      total += line.quantity * weight;
    }
    return Number.isFinite(total) ? total : null;
  }, [lines, products]);
  const lineErrors = validateNormalOrderLines(lines);
  const canSave = canCreate && Boolean(customerId && priceClassCode && state.currentUserId)
    && lineErrors.length === 0 && Number.isSafeInteger(totalAmount) && totalAmount > 0;

  const resetEditor = () => {
    setEditorOpen(false);
    setEditingId(null);
    setSourceOrderId(null);
    setSourceOrderNumber(null);
    setCustomerId('');
    setPriceClassCode('');
    setLines([]);
    setSelectedProductId('');
    setAddQuantity(1);
    setAddMode('BASE_UNIT');
    setNotes('');
    setNotice(null);
  };
  const openNew = () => {
    if (!canCreate) return;
    setEditorMode('NEW');
    setEditingId(null);
    setSourceOrderId(null);
    setSourceOrderNumber(null);
    setCustomerId('');
    setPriceClassCode('');
    setLines([]);
    setNotes('');
    setNotice(null);
    setEditorOpen(true);
  };
  const openOrderDraft = (order: RecordRow, isDraft: boolean) => {
    if (!canCreate) return;
    const customer = customerForOrder(customers, order);
    const customerKey = String(customer?.id ?? '');
    const selectedClass = validClass(order.priceClassCode) || validClass(customer?.priceClassCode);
    const sourceId = String(order.sourceOrderId ?? order.externalOrderId ?? order.externalId ?? order.id ?? '');
    const sourceNumber = String(order.sourceOrderNumber ?? order.orderNumber ?? order.documentNumber ?? '');
    setEditorMode(isDraft ? 'CRM_DRAFT' : 'ERP_AMENDMENT');
    setEditingId(isDraft ? String(order.id) : null);
    setSourceOrderId(isDraft ? (String(order.sourceOrderId || '') || null) : sourceId);
    setSourceOrderNumber(isDraft ? (String(order.sourceOrderNumber || '') || sourceNumber || null) : sourceNumber || null);
    setCustomerId(customerKey);
    setPriceClassCode(selectedClass);
    setLines((Array.isArray(order.lines) ? order.lines : []).map((line: RecordRow, index: number) => toEditableLine(line, products, selectedClass, index)));
    setNotes(String(order.notes || ''));
    setSelectedProductId('');
    setAddQuantity(1);
    setAddMode('BASE_UNIT');
    setNotice(null);
    setEditorOpen(true);
  };

  const handlePriceClassChange = (nextCode: string) => {
    const code = validClass(nextCode);
    setPriceClassCode(code);
    setLines(previous => previous.map(line => {
      const product = products.find(item => String(item.id) === line.productId);
      const price = classPrice(product, code) ?? 0;
      const calc = calculateNormalOrderLine({ enteredQuantity: line.enteredQuantity, quantityMode: line.quantityMode, unitsPerCarton: line.unitsPerCarton, unitPrice: price });
      return { ...line, unitPrice: price, quantity: calc.baseQuantity ?? 0, cartonQuantity: calc.cartonQuantity, lineTotal: calc.lineTotal ?? 0, currencyCode: 'IRR' };
    }));
  };
  const handleCustomerChange = (nextId: string) => {
    setCustomerId(nextId);
    const customer = customers.find(row => String(row.id) === nextId);
    const customerClass = validClass(customer?.priceClassCode);
    handlePriceClassChange(customerClass);
  };
  const addProduct = () => {
    if (!selectedProduct || !priceClassCode) { setNotice('ابتدا مشتری و کلاس قیمت را انتخاب کنید.'); return; }
    const price = classPrice(selectedProduct, priceClassCode);
    const packSize = safePositiveInt(selectedProduct.unitsPerCarton);
    const calculated = calculateNormalOrderLine({ enteredQuantity: addQuantity, quantityMode: addMode, unitsPerCarton: packSize, unitPrice: price });
    if (!calculated.valid) {
      const message = calculated.reason === 'PACK_SIZE_UNKNOWN' ? 'ضریب تعداد در کارتن از ERP دریافت نشده؛ حالت واحد پایه را انتخاب کنید.'
        : calculated.reason === 'ERP_CLASS_PRICE_UNAVAILABLE' ? `قیمت کلاس «${selectedClassLabel}» این کالا از ERP دریافت نشده است.`
        : 'تعداد یا قیمت کالا نامعتبر است؛ مقدار پیش‌فرض جایگزین نمی‌شود.';
      setNotice(message); return;
    }
    setLines(previous => [...previous, {
      id: generateSecureId('order-line'), productId: String(selectedProduct.id), productName: String(selectedProduct.name),
      productCode: String(selectedProduct.sku ?? selectedProduct.code ?? ''), quantity: calculated.baseQuantity!,
      unitPrice: price!, lineTotal: calculated.lineTotal!, quantityMode: addMode,
      cartonQuantity: calculated.cartonQuantity, unitsPerCarton: packSize, currencyCode: 'IRR', enteredQuantity: addQuantity,
    }]);
    setSelectedProductId('');
    setAddQuantity(1);
    setNotice(null);
  };
  const updateLineQuantity = (id: string, entered: number | null) => {
    setLines(previous => previous.map(line => {
      if (line.id !== id) return line;
      const calculated = calculateNormalOrderLine({ enteredQuantity: entered, quantityMode: line.quantityMode, unitsPerCarton: line.unitsPerCarton, unitPrice: line.unitPrice });
      return { ...line, enteredQuantity: entered, quantity: calculated.baseQuantity ?? 0, cartonQuantity: calculated.cartonQuantity, lineTotal: calculated.lineTotal ?? 0 };
    }));
  };
  const saveDraft = () => {
    if (!canCreate) { setNotice('مجوز ثبت پیش‌نویس سفارش را ندارید.'); return; }
    if (!requireActiveUser(state, updateState, 'ذخیره پیش‌نویس سفارش')) return;
    const existing = editingId ? (state.salesOrders || []).find((row: RecordRow) => String(row.id) === editingId) : undefined;
    const built = buildNormalOrderDraftRecord({
      id: editingId || generateSecureId('crm-order'),
      orderNumber: existing?.orderNumber,
      sourceOrderId,
      sourceOrderNumber,
      customerId,
      customerName: String(selectedCustomer?.name ?? ''),
      priceClassCode,
      lines: lines.map(({ enteredQuantity: _entered, ...line }) => line),
      ownerId: String(state.currentUserId || ''),
      createdAt: typeof existing?.createdAt === 'string' ? existing.createdAt : undefined,
      updatedAt: new Date().toISOString(),
      notes,
    });
    if (!built.ok) {
      setNotice(built.errors.map(code => ({
        NO_LINES: 'حداقل یک قلم معتبر لازم است.', CUSTOMER_REQUIRED: 'انتخاب مشتری الزامی است.',
        PRICE_CLASS_REQUIRED: 'انتخاب کلاس قیمت الزامی است.', ACTIVE_USER_REQUIRED: 'کاربر فعال معتبر نیست.',
        ORDER_TOTAL_INVALID: 'مبلغ کل خارج از محدوده امن است.',
      }[code] || 'یک یا چند قلم سفارش نامعتبر است.')).join(' '));
      return;
    }
    updateState(draft => {
      const all = (draft.salesOrders || []) as RecordRow[];
      if (editingId) draft.salesOrders = all.map(row => String(row.id) === editingId ? { ...row, ...built.record } : row);
      else draft.salesOrders = [built.record, ...all];
      if (!draft.auditLogs) draft.auditLogs = [];
      draft.auditLogs.push({
        id: generateSecureId('audit-order'), action: editingId ? 'CRM_ORDER_DRAFT_UPDATED' : 'CRM_ORDER_DRAFT_CREATED',
        entityType: 'SALES_ORDER_DRAFT', entityId: built.record.id,
        details: sourceOrderId ? 'پیش‌نویس اصلاحی سفارش ERP ذخیره شد؛ سفارش اصلی تغییر نکرد.' : 'پیش‌نویس سفارش عادی CRM ذخیره شد؛ ارسال ERP انجام نشده است.',
        actor: String(draft.currentUserId || ''), createdAt: new Date().toISOString(),
      });
    });
    resetEditor();
  };

  const renderOrder = (order: RecordRow, isDraft: boolean) => {
    const account = customerForOrder(customers, order);
    const source = String(order.sourceSystemCode || (isDraft ? 'CRM' : 'ERP'));
    const externalId = String(order.sourceOrderId ?? order.externalOrderId ?? order.externalId ?? order.id ?? '');
    const accountId = String(account?.id ?? '');
    const relevant = !isDraft && canViewCpq && getActiveDataProvider().name === 'SQLSERVER_BACKEND'
      && Boolean(externalId.trim()) && isNegotiableErpOrder(order)
      && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(accountId);
    const existingProducts = new Set<string>(Array.isArray(order.lines) ? order.lines.flatMap((line: RecordRow) => typeof line?.externalProductId === 'string' ? [line.externalProductId] : []) : []);
    return <article key={String(order.id)} className="space-y-2 rounded-xl border border-border bg-surface p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold font-mono text-text-main">{String(order.orderNumber || (isDraft ? 'پیش‌نویس CRM' : 'شماره سفارش نامشخص'))}</span>
            <Badge color={isDraft ? 'warning' : 'neutral'}>{isDraft ? (order.origin === 'ERP_AMENDMENT' ? 'پیش‌نویس اصلاح ERP' : 'پیش‌نویس CRM') : 'ERP'}</Badge>
            {isDraft && <span className="text-micro text-warning">ارسال‌نشده به ERP</span>}
          </div>
          <span className="block text-mini text-text-secondary mt-0.5">{String(order.notes || order.sourceOrderNumber || 'سفارش ثبت شده')}</span>
        </div>
        <span className="shrink-0 font-bold font-mono text-text-main">{order.totalAmount == null || order.totalAmount === '' ? 'مبلغ نامشخص' : `${formatNumber(Number(order.totalAmount))} ریال`}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setExpandedOrderId(expandedOrderId === String(order.id) ? null : String(order.id))}>{expandedOrderId === String(order.id) ? 'بستن جزئیات' : 'مشاهده اقلام'}</Button>
        {isDraft && canCreate && <Button size="sm" variant="outline" onClick={() => openOrderDraft(order, true)}>ویرایش پیش‌نویس</Button>}
        {!isDraft && canCreate && isNegotiableErpOrder(order) && <Button size="sm" variant="outline" onClick={() => openOrderDraft(order, false)}>ویرایش در سبد عادی</Button>}
        {relevant && <Button size="sm" onClick={() => onOpenCpq(externalId)}>پیشنهاد فروش CPQ</Button>}
      </div>
      {expandedOrderId === String(order.id) && <div className="rounded-lg bg-canvas p-2 space-y-1.5">
        <div className="text-micro text-text-secondary">مشتری: {String(account?.name || 'نامشخص')} · منبع: {source} · شناسه: {externalId || 'نامشخص'}</div>
        {Array.isArray(order.lines) && order.lines.length ? order.lines.map((line: RecordRow, index: number) => <div key={String(line.id ?? index)} className="flex items-center justify-between gap-2 border-t border-border/60 py-1.5"><span className="text-caption text-text-main">{String(line.productName ?? line.name ?? line.externalProductId ?? 'کالای نامشخص')}</span><span className="text-caption font-mono text-text-secondary">{String(line.quantity ?? '—')} × {String(line.unitPrice ?? '—')} ریال</span></div>) : <p className="text-caption text-text-secondary">ردیف‌های سفارش از ERP دریافت نشده‌اند.</p>}
      </div>}
      {relevant && <PurchaseProductHints key={`${state.currentUserId}:${accountId}:${source}`} account={accountId} source={source} excludeProductIds={existingProducts} />}
    </article>;
  };

  const orderProducts = lines.map(line => products.find(product => String(product.id) === line.productId));
  const orderWeight = totalWeightKg === null ? 'نامشخص' : `${formatNumber(totalWeightKg)} کیلوگرم`;
  const orderCanSave = canSave && orderProducts.every(Boolean);
  return (
    <section className="space-y-3" aria-label="سبد سفارش عادی">
      <div className="flex items-center justify-between gap-2">
        <div><h3 className="text-sm font-bold text-text-main">سبد سفارش عادی</h3><p className="text-micro text-text-secondary">مشاهده سفارش ERP و ثبت پیش‌نویس عادی یا اصلاحی؛ CPQ مسیر مستقل پیشنهاد فروش است.</p></div>
        {canCreate && <Button size="sm" onClick={openNew}>+ سفارش جدید</Button>}
      </div>
      {crmDrafts.length > 0 && <div className="space-y-2"><div className="text-caption font-bold text-warning">پیش‌نویس‌های CRM · هنوز در ERP ثبت نشده‌اند</div>{crmDrafts.map(order => renderOrder(order, true))}</div>}
      <div className="space-y-2"><div className="flex items-center justify-between gap-2"><span className="text-caption font-bold text-text-main">سفارش‌های رسمی ERP</span><span className="text-micro text-text-secondary">{formatCount(erpOrders.length)} سفارش</span></div>{erpOrders.map(order => renderOrder(order, false))}</div>
      {erpOrders.length === 0 && crmDrafts.length === 0 && <p className="py-6 text-center text-xs text-text-secondary">سفارشی برای نمایش وجود ندارد.</p>}

      <Modal isOpen={editorOpen} onClose={resetEditor} title={editorMode === 'NEW' ? 'ثبت سفارش عادی' : editorMode === 'ERP_AMENDMENT' ? 'پیش‌نویس اصلاح سفارش ERP' : 'ویرایش پیش‌نویس سفارش'} subtitle="فی هر واحد پایه و همه مبالغ به ریال است؛ قیمت کالا از کلاس منتخب ERP خوانده می‌شود." size="2xl" hasUnsavedChanges footer={<div className="w-full space-y-2"><div className="grid grid-cols-2 sm:grid-cols-5 gap-2 rounded-lg bg-canvas p-2 text-center"><div><span className="block text-micro text-text-secondary">اقلام</span><b className="text-caption">{formatCount(lines.length)}</b></div><div><span className="block text-micro text-text-secondary">کارتن</span><b className="text-caption">{totalCartons === null ? '—' : formatCount(totalCartons)}</b></div><div><span className="block text-micro text-text-secondary">واحد پایه</span><b className="text-caption">{formatCount(totalUnits)}</b></div><div><span className="block text-micro text-text-secondary">وزن</span><b className="text-caption">{orderWeight}</b></div><div><span className="block text-micro text-text-secondary">قابل پرداخت</span><b className="text-caption font-mono">{formatNumber(totalAmount)} ریال</b></div></div><div className="flex items-center justify-between gap-2"><Button size="sm" variant="outline" onClick={resetEditor}>انصراف</Button><Button size="sm" onClick={saveDraft} disabled={!orderCanSave}>ذخیره پیش‌نویس CRM</Button></div></div>}>
        <div className="space-y-3 pb-3">
          {sourceOrderId && <div className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-caption text-warning">این یک پیش‌نویس CRM برای سفارش {sourceOrderNumber || sourceOrderId} است. سفارش رسمی ERP تغییر نمی‌کند و هنوز ارسال/تأیید نشده است.</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <SearchableSelect label="مشتری" ariaLabel="انتخاب مشتری" placeholder="انتخاب مشتری…" value={customerId} options={customerOptions} onChange={handleCustomerChange} className="w-full" />
            <SearchableSelect label="کلاس قیمت سفارش" ariaLabel="انتخاب کلاس قیمت سفارش" placeholder="انتخاب کلاس قیمت…" value={priceClassCode} options={classOptions} onChange={handlePriceClassChange} className="w-full" />
          </div>

          <div className="rounded-xl border border-border bg-canvas p-3 space-y-2">
            <div className="flex items-center justify-between gap-2"><b className="text-xs">افزودن کالا</b><span className="text-micro text-text-secondary">قیمت مرجع فقط از ERP</span></div>
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_120px_112px_auto] gap-2 items-end">
              <SearchableSelect label="کالا" ariaLabel="انتخاب کالا برای سفارش" placeholder="انتخاب کالا…" value={selectedProductId} options={productOptions} onChange={value => { setSelectedProductId(value); const product = products.find(item => String(item.id) === value); setAddMode(safePositiveInt(product?.unitsPerCarton) ? 'CARTON' : 'BASE_UNIT'); setAddQuantity(1); }} className="w-full" />
              <Select label="نوع تعداد" value={addMode} onChange={event => setAddMode(event.target.value as NormalOrderQuantityMode)}>
                <option value="CARTON">کارتن</option><option value="BASE_UNIT">واحد پایه</option>
              </Select>
              <div><label className="mb-1 block text-caption font-semibold">تعداد</label><NumericField value={addQuantity} onCommit={setAddQuantity} ariaLabel="تعداد کارتن یا واحد پایه" /></div>
              <Button size="sm" onClick={addProduct} disabled={!selectedProductId || !priceClassCode}>افزودن</Button>
            </div>
            {selectedProduct && <div className="flex flex-wrap items-center justify-between gap-2 text-caption"><span className="text-text-secondary">فی پایه کلاس {selectedClassLabel}: <bdi className="font-mono font-bold text-text-main">{selectedClassPrice === null ? 'ناموجود' : `${formatNumber(selectedClassPrice)} ریال`}</bdi></span><span className="text-text-secondary">تعداد در کارتن: {selectedPackSize === null ? 'نامشخص' : formatCount(selectedPackSize)}</span></div>}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between"><b className="text-xs">اقلام سفارش</b><span className="text-micro text-text-secondary">{formatCount(lines.length)} قلم</span></div>
            {lines.map(line => {
              const product = products.find(item => String(item.id) === line.productId);
              const entered = line.quantityMode === 'CARTON' ? line.cartonQuantity : line.quantity;
              const invalid = validateNormalOrderLines([line]).length > 0 || !product;
              return <article key={line.id} className={`rounded-xl border p-2.5 space-y-2 transition-colors duration-200 ${invalid ? 'border-warning/40 bg-warning-soft/30' : 'border-border bg-surface'}`}>
                <div className="flex items-center justify-between gap-2"><div className="min-w-0"><b className="block truncate text-caption">{line.productName}</b><span className="text-micro text-text-secondary">{line.productCode || 'کد کالا نامشخص'} · فی پایه: {formatNumber(line.unitPrice)} ریال</span></div><Button size="sm" variant="ghost" onClick={() => setLines(previous => previous.filter(item => item.id !== line.id))}>حذف</Button></div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2"><div><label className="mb-1 block text-micro font-semibold">{line.quantityMode === 'CARTON' ? 'تعداد کارتن' : 'تعداد واحد پایه'}</label><NumericField value={entered} onCommit={next => updateLineQuantity(line.id, next)} ariaLabel={`تعداد ${line.productName}`} /></div><div className="text-left"><span className="block text-micro text-text-secondary">{line.quantityMode === 'CARTON' ? `${line.cartonQuantity ?? '—'} × ${line.unitsPerCarton ?? '؟'} = ${line.quantity} واحد پایه` : `${line.quantity} واحد پایه`}</span><bdi className="text-caption font-bold tabular-nums">{formatNumber(line.lineTotal)} ریال</bdi></div></div>
                {invalid && <p className="text-micro text-warning">قلم معتبر نیست؛ محصول، ضریب بسته‌بندی، قیمت مرجع ERP و واحد پول ریالی را بررسی کنید.</p>}
              </article>;
            })}
            {lines.length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-center text-caption text-text-secondary">هنوز قلمی به سبد اضافه نشده است.</p>}
          </div>
          <div><label className="mb-1 block text-caption font-semibold">یادداشت سفارش</label><InputControl value={notes} onChange={event => setNotes(event.target.value)} aria-label="یادداشت سفارش" placeholder="یادداشت داخلی CRM (اختیاری)" /></div>
          {notice && <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-caption text-warning">{notice}</p>}
        </div>
      </Modal>
    </section>
  );
}
