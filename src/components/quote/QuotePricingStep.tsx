import React, { useEffect, useMemo, useState } from 'react';
import { Package, Plus, Trash2, Lightbulb, Check } from 'lucide-react';
import type { DraftQuoteState, ExternalProduct } from '../../types';
import {
  computeOrderBalance, suggestLineRecovery,
  type BalanceLineInput, type LineBalance, type LineRecoverySuggestion, type PriceClassLabelRow
} from '../../lib/cpqEngine';
import { SearchableSelect, type SelectOption } from '../ui/SearchableSelect';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { formatNumber } from '../../lib/format';
import { NumericField } from './NumericField';
import { OrderBalanceBar, formatSignedAmount } from './OrderBalanceBar';

type DraftLine = DraftQuoteState['lines'][number];
const fa = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? formatNumber(n) : '—');

/** قیمت مقایسه از کلاس سراسری سفارش می‌آید؛ فقط مقدار همان کالا در کلاس منتخب snapshot می‌شود. */
export const lineToBalanceInput = (l: DraftLine, key: string): BalanceLineInput => ({
  key, comparisonPrice: l.erpClassUnitPrice ?? null, floorPrice: l.floorUnitPrice ?? null, currencyCode: l.erpClassCurrencyCode ?? null, unitPrice: l.unitPrice, baseQuantity: l.quantity, unitsPerCarton: l.unitsPerCarton ?? null
});

/** تعداد واحد پایه از ورودی کاربر: کارتن × تعداد در کارتن؛ اگر تعداد در کارتن نامعلوم باشد ورودی همان واحد پایه است (۱ فرض نمی‌شود، حالت واحد صریح نمایش داده می‌شود). */
const baseFrom = (entered: number | null, upc: number | null | undefined, mode: 'CARTON' | 'BASE_UNIT'): number => {
  if (entered === null || !Number.isSafeInteger(entered) || entered <= 0) return 0;
  if (mode === 'BASE_UNIT') return entered;
  return upc && Number.isSafeInteger(upc) && upc > 0 ? entered * upc : 0;
};

interface Props {
  products: ExternalProduct[];
  priceClassLabels: PriceClassLabelRow[];
  priceClassCode: string;
  onPriceClassChange: (code: string) => void;
  lines: DraftLine[];
  setLines: React.Dispatch<React.SetStateAction<DraftLine[]>>;
  /** پیام هشدار قلم نامعتبر (همان اعلان قبلی ویزارد) */
  onInvalidAdd: () => void;
}

function SuggestionStrip({ s, line, onApplyPrice, onApplyQty }: { s: LineRecoverySuggestion; line: LineBalance; onApplyPrice: () => void; onApplyQty: () => void }) {
  if (s.status !== 'AVAILABLE' || !s.price) return null;
  const q = s.quantity;
  return (
    <div className="rounded-xl bg-sunken border border-border p-2 space-y-1.5" aria-label="پیشنهاد جبران کسری">
      <div className="flex items-center gap-1 text-micro font-bold text-ink-soft"><Lightbulb size={12} aria-hidden /> پیشنهاد برای رسیدن تراز کل سفارش به صفر (فقط پیشنهاد؛ اعمال با شماست)</div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-caption text-ink">
          فی پیشنهادی: <b className="font-mono">{fa(s.price.unitPrice)}</b>
          <span className="text-micro text-ink-soft"> ({formatSignedAmount(s.price.delta)} {line.currencyCode || 'واحد پول نامشخص'}{s.price.deltaPercent !== null ? ` · ${formatSignedAmount(s.price.deltaPercent)}٪` : ''})</span>
        </div>
        <Button size="xs" variant="soft" onClick={onApplyPrice}><Check size={12} className="ml-1" />اعمال فی</Button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-caption text-ink">
          {q && q.unavailableReason === 'PRICE_NOT_ABOVE_REFERENCE' && <span className="text-ink-soft">با همین فی (قیمت کلاس منتخب یا کمتر) افزایش تعداد کمکی نمی‌کند.</span>}
          {q && !q.unavailableReason && q.cartons !== null && (
            <>با همین فی: <b className="font-mono">{fa(q.cartons)}</b> کارتن <span className="text-micro text-ink-soft">({q.extraCartons ? `${formatSignedAmount(q.extraCartons)} کارتن · ` : ''}{fa(q.effectiveBaseQuantity)} واحد)</span></>
          )}
          {q && !q.unavailableReason && q.cartons === null && (
            <>با همین فی: <b className="font-mono">{fa(q.baseQuantity)}</b> واحد <span className="text-micro text-ink-soft">(تعداد در کارتن از ERP نیامده؛ تبدیل به کارتن انجام نشد)</span></>
          )}
        </div>
        {q && !q.unavailableReason && <Button size="xs" variant="soft" onClick={onApplyQty}><Check size={12} className="ml-1" />اعمال تعداد</Button>}
      </div>
      <div className="text-micro text-ink-soft">اختلاف فعلی سفارش: {fa(s.orderDeficit)} {line.currencyCode || 'واحد پول نامشخص'}</div>
    </div>
  );
}

export function QuotePricingStep({ products, priceClassLabels, priceClassCode, onPriceClassChange, lines, setLines, onInvalidAdd }: Props) {
  const [productId, setProductId] = useState('');
  const [cartons, setCartons] = useState<number | null>(1);
  const [price, setPrice] = useState<number | null>(null);

  const product = products.find(p => p.id === productId);
  const classEntry = product?.priceClasses?.[priceClassCode as keyof NonNullable<ExternalProduct['priceClasses']>];
  const classPrice = classEntry?.unitPrice ?? null;
  const classCurrencyCode = classEntry?.currencyCode ?? product?.currencyCode ?? null;
  const classLabel = priceClassLabels.find(c => c.code === priceClassCode)?.label || priceClassCode;
  const upc = product?.unitsPerCarton ?? null;

  // با تغییر کالا یا کلاس، فی از ERP همان کلاس پیشنهاد می‌شود؛ نبودنش خالی می‌ماند (صفر/کلاس دیگر جایگزین نمی‌شود).
  useEffect(() => { setPrice(classPrice); }, [productId, priceClassCode, classPrice]);

  const priceClassOptions: SelectOption[] = useMemo(() => priceClassLabels.map(c => ({ value: c.code, label: c.label })), [priceClassLabels]);
  const productOptions: SelectOption[] = useMemo(() => products.map(p => ({
    value: p.id, label: p.name, subLabel: [p.sku || p.code, p.category, p.brand].filter(Boolean).join(' · '), keywords: [p.erpId, p.description].filter(Boolean).join(' ')
  })), [products]);

  const quantityMode = upc ? 'CARTON' : 'BASE_UNIT';
  const pendingBase = baseFrom(cartons, upc, quantityMode);
  const pendingValid = !!product && pendingBase > 0 && !!price && price > 0;
  const pendingInput: BalanceLineInput | null = pendingValid
    ? { key: 'pending', comparisonPrice: classPrice, floorPrice: product!.floorPrice ?? null, currencyCode: classCurrencyCode, unitPrice: price, baseQuantity: pendingBase, unitsPerCarton: upc }
    : null;

  const savedInputs = lines.map((l, i) => lineToBalanceInput(l, String(i)));
  const allInputs = pendingInput ? [...savedInputs, pendingInput] : savedInputs;
  const balance = useMemo(() => computeOrderBalance(allInputs), [JSON.stringify(allInputs)]); // eslint-disable-line react-hooks/exhaustive-deps
  const byKey = new Map(balance.lines.map(l => [l.key, l]));
  const suggestFor = (key: string) => suggestLineRecovery(allInputs, key);

  const patchLine = (i: number, patch: { cartons?: number | null; unitPrice?: number | null }) => setLines(prev => prev.map((l, idx) => {
    if (idx !== i) return l;
    const upcSnap = l.unitsPerCarton ?? null;
    const nextCartons = 'cartons' in patch ? patch.cartons ?? null : (l.cartonQuantity ?? l.quantity);
    const quantity = baseFrom(nextCartons, upcSnap, upcSnap ? 'CARTON' : 'BASE_UNIT');
    const unitPrice = 'unitPrice' in patch ? patch.unitPrice ?? 0 : l.unitPrice;
    const calc = computeOrderBalance([{ key: 'x', comparisonPrice: l.erpClassUnitPrice ?? null, floorPrice: l.floorUnitPrice ?? null, currencyCode: l.erpClassCurrencyCode ?? null, unitPrice, baseQuantity: quantity }]).lines[0];
    return {
      ...l, quantity, unitPrice, lineTotal: quantity * unitPrice,
      cartonQuantity: upcSnap ? (nextCartons && nextCartons > 0 ? nextCartons : null) : null,
      lineVariance: calc.variance, balanceStatus: calc.status
    };
  }));

  const addLine = () => {
    if (!product || !pendingValid || !price) { onInvalidAdd(); return; }
    const calc = computeOrderBalance([{ key: 'x', comparisonPrice: classPrice, floorPrice: product.floorPrice ?? null, currencyCode: classCurrencyCode, unitPrice: price, baseQuantity: pendingBase }]).lines[0];
    // افزودن با تراز منفی مجاز است؛ فروشنده می‌تواند در کالای بعدی جبران کند (هشدار فقط هنگام ذخیره).
    setLines(prev => [...prev, {
      productId: product.id, productName: product.name, productCode: product.sku || product.code || '',
      quantity: pendingBase, unitPrice: price, costPrice: product.costPrice, lineTotal: pendingBase * price,
      erpClassUnitPrice: classPrice, erpClassCurrencyCode: classCurrencyCode, floorUnitPrice: product.floorPrice ?? null,
      cartonQuantity: upc ? cartons : null, unitsPerCarton: upc, lineVariance: calc.variance, balanceStatus: calc.status
    }]);
    setCartons(1);
  };

  const rowTone = (state: LineBalance['state'] | undefined) =>
    state === 'NEGATIVE' ? 'border-danger-line bg-danger-soft/50'
      : state === 'POSITIVE' || state === 'ZERO' ? 'border-success-line bg-success-soft/50'
        : 'border-border bg-surface';
  const stateText = (l: LineBalance | undefined) => !l || l.variance === null
    ? (l?.status === 'REFERENCE_UNKNOWN' ? 'قیمت کلاس منتخب یا واحد پول ERP نامعلوم؛ در تراز لحاظ نشد' : 'ورودی نامعتبر')
    : l.state === 'NEGATIVE' ? `پایین‌تر از کلاس منتخب: ${formatSignedAmount(l.variance)} ${l.currencyCode || 'واحد پول نامشخص'}`
      : l.state === 'POSITIVE' ? `بالاتر از کلاس منتخب: ${formatSignedAmount(l.variance)} ${l.currencyCode || 'واحد پول نامشخص'}` : 'برابر کلاس منتخب';

  const pendingLine = byKey.get('pending');
  const cartonLabel = (u: number | null | undefined) => (u ? `تعداد کارتن (هر کارتن ${fa(u)} واحد)` : 'تعداد (واحد پایه؛ ضریب بسته‌بندی نامشخص است)');

  return (
    <div className="space-y-3">
      <OrderBalanceBar balance={balance} includesPending={!!pendingInput} />

      <div className="grid grid-cols-1 gap-1.5">
        <label className="block text-caption font-bold text-text-secondary">کلاس قیمت سفارش</label>
        <SearchableSelect options={priceClassOptions} value={priceClassCode} onChange={onPriceClassChange}
          placeholder="انتخاب کلاس قیمت" searchPlaceholder="نام کلاس قیمت..." ariaLabel="کلاس قیمت سفارش" />
      </div>

      <div className="bg-canvas p-3 rounded-2xl border border-border space-y-2.5">
        <span className="text-xs font-bold text-text-main flex items-center gap-1.5"><Package size={15} className="text-primary" aria-hidden /> افزودن کالا</span>
        <SearchableSelect options={productOptions} value={productId} onChange={setProductId}
          placeholder="انتخاب کالا" searchPlaceholder="نام، کد یا شناسه کالا..." emptyText="کالایی پیدا نشد" ariaLabel="جست‌وجوی کالا" />
        {product && (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-micro font-bold text-text-secondary mb-1">{cartonLabel(upc)}</label>
                <NumericField ariaLabel="تعداد" value={cartons} onCommit={setCartons} grouped={false} />
              </div>
              <div>
                <label className="block text-micro font-bold text-text-secondary mb-1">فی هر واحد ({classCurrencyCode || 'واحد پول نامشخص'})</label>
                <NumericField ariaLabel="فی هر واحد" value={price} onCommit={setPrice} />
              </div>
            </div>
            <div className="text-micro text-ink-soft space-y-0.5">
              <div>حداقل قیمت مرجع: <b className="font-mono">{product.floorPrice ? fa(product.floorPrice) : 'نامشخص'}</b> · {classLabel}: <b className="font-mono">{classPrice ? fa(classPrice) : 'دریافت نشده'}</b>{upc ? <> · مجموع: <b className="font-mono">{fa(pendingBase)}</b> واحد</> : null}</div>
              {!classPrice && <div className="text-warning">قیمت کلاس منتخب این کالا دریافت نشده است؛ تراز این قلم محاسبه نمی‌شود.</div>}{!classCurrencyCode && <div className="text-warning">واحد پول این قیمت مشخص نیست؛ مقایسه و تراز قابل محاسبه نیست.</div>}
              {(!classPrice || !classCurrencyCode) && <div className="text-warning">قیمت «{classLabel}» برای این کالا دریافت نشده؛ فی را دستی وارد کنید (جایگزین خودکار اعمال نشد).</div>}
            </div>
            {pendingLine && (
              <div className={cn('rounded-xl border px-2.5 py-1.5 text-caption font-bold', rowTone(pendingLine.state))} data-testid="pending-balance">
                تراز این قلم: {stateText(pendingLine)}
              </div>
            )}
            {pendingLine && pendingInput && <SuggestionStrip s={suggestFor('pending')} line={pendingLine}
              onApplyPrice={() => { const s = suggestFor('pending'); if (s.price) setPrice(s.price.unitPrice); }}
              onApplyQty={() => { const s = suggestFor('pending'); const q = s.quantity; if (q && !q.unavailableReason) setCartons(q.cartons ?? q.baseQuantity); }} />}
          </>
        )}
        <Button size="sm" variant="primary" onClick={addLine} disabled={!product} className="w-full flex items-center justify-center gap-1">
          <Plus size={14} /> درج در پیش‌فاکتور
        </Button>
      </div>

      <div className="space-y-2.5" aria-label="اقلام سفارش">
        {lines.map((l, i) => {
          const lb = byKey.get(String(i));
          const sug = suggestFor(String(i));
          return (
            <div key={i} data-testid="balance-line" data-balance-state={lb?.state} className={cn('rounded-2xl border p-3 space-y-2', rowTone(lb?.state))}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-compact font-bold text-text-main truncate">{l.productName}</div>
                  <div className="text-micro text-ink-soft">{l.productCode || '—'} · کف ERP: <span className="font-mono">{l.floorUnitPrice ? fa(l.floorUnitPrice) : 'نامعلوم'}</span></div>
                </div>
                <button aria-label="حذف قلم" onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))} className="text-danger p-2 -m-1 rounded-md cursor-pointer min-w-(--size-touch) min-h-(--size-touch) flex items-center justify-center"><Trash2 size={15} /></button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-micro font-bold text-text-secondary mb-1">{cartonLabel(l.unitsPerCarton)}</label>
                  <NumericField ariaLabel={`تعداد ${l.productName}`} value={(l.unitsPerCarton ? l.cartonQuantity : l.quantity) || null} grouped={false} onCommit={(n) => patchLine(i, { cartons: n })} />
                </div>
                <div>
                  <label className="block text-micro font-bold text-text-secondary mb-1">فی هر واحد ({classCurrencyCode || 'واحد پول نامشخص'})</label>
                  <NumericField ariaLabel={`فی ${l.productName}`} value={l.unitPrice || null} onCommit={(n) => patchLine(i, { unitPrice: n })} />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 text-caption">
                <span className="text-ink-soft">مبلغ ردیف ({fa(l.quantity)} واحد): <b className="font-mono text-ink">{fa(l.lineTotal)}</b></span>
                <span className={cn('font-bold', lb?.state === 'NEGATIVE' ? 'text-danger' : lb?.state === 'UNKNOWN' ? 'text-ink-soft' : 'text-success')}>{stateText(lb)}</span>
              </div>
              {lb && <SuggestionStrip s={sug} line={lb}
                onApplyPrice={() => sug.price && patchLine(i, { unitPrice: sug.price.unitPrice })}
                onApplyQty={() => { const q = sug.quantity; if (q && !q.unavailableReason) patchLine(i, { cartons: q.cartons ?? q.baseQuantity }); }} />}
            </div>
          );
        })}
        {lines.length === 0 && <div className="text-center text-caption text-ink-soft py-6">هنوز قلمی اضافه نشده است.</div>}
      </div>
    </div>
  );
}
