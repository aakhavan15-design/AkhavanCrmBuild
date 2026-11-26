// موتور تراز لحظه‌ای سفارش: کف ERP، کارتن، پیشنهاد فی/تعداد، کلاس‌های قیمت (عدد صحیح با واحد پول ERP؛ بدون Float).
import assert from 'node:assert/strict';
import {
  computeLineBalance, computeOrderBalance, suggestLineRecovery,
  normalizeErpPriceClasses, resolvePriceClassLabels, PRICE_CLASS_CODES
} from '../src/lib/cpqEngine.ts';

// ── تراز ردیف: (فی − کف) × تعداد پایه
const l1 = computeLineBalance({ key: 'a', comparisonPrice: 100, currencyCode: 'IRR', unitPrice: 300, baseQuantity: 10 });
assert.equal(l1.variance, 2000); assert.equal(l1.state, 'POSITIVE'); assert.equal(l1.referenceAmount, 1000); assert.equal(l1.enteredAmount, 3000);
assert.equal(computeLineBalance({ key: 'b', comparisonPrice: 100, currencyCode: 'IRR', unitPrice: 100, baseQuantity: 5 }).state, 'ZERO');
assert.equal(computeLineBalance({ key: 'c', comparisonPrice: 100, currencyCode: 'IRR', unitPrice: 90, baseQuantity: 5 }).variance, -50);
// کف نامعلوم: صفر فرض نمی‌شود؛ از تراز بیرون است
const unk = computeLineBalance({ key: 'u', comparisonPrice: null, currencyCode: 'IRR', unitPrice: 90, baseQuantity: 5 });
assert.equal(unk.status, 'REFERENCE_UNKNOWN'); assert.equal(unk.variance, null);
assert.equal(computeLineBalance({ key: 'z', comparisonPrice: 0, currencyCode: 'IRR', unitPrice: 90, baseQuantity: 5 }).status, 'REFERENCE_UNKNOWN');
assert.equal(computeLineBalance({ key: 'no-currency', comparisonPrice: 100, unitPrice: 120, baseQuantity: 1 }).status, 'REFERENCE_UNKNOWN');
// ورودی نامعتبر (اعشار/صفر/منفی)
for (const bad of [{ unitPrice: 10.5, baseQuantity: 1 }, { unitPrice: 0, baseQuantity: 1 }, { unitPrice: 10, baseQuantity: 0 }, { unitPrice: 10, baseQuantity: -2 }, { unitPrice: undefined, baseQuantity: 2 }])
  assert.equal(computeLineBalance({ key: 'x', comparisonPrice: 5, currencyCode: 'IRR', ...bad }).status, 'INVALID');

// ── تراز سفارش: جمع ردیف‌ها، تغییر تعداد بلافاصله تراز را دو برابر می‌کند
const mk = (q) => [{ key: 'a', comparisonPrice: 100, currencyCode: 'IRR', unitPrice: 300, baseQuantity: q }];
assert.equal(computeOrderBalance(mk(10)).total, 2000);
assert.equal(computeOrderBalance(mk(20)).total, 4000);
const mixed = computeOrderBalance([
  { key: 'a', comparisonPrice: 100, currencyCode: 'IRR', unitPrice: 300, baseQuantity: 10 },
  { key: 'b', comparisonPrice: 1000, currencyCode: 'IRR', unitPrice: 900, baseQuantity: 30 },
  { key: 'u', comparisonPrice: null, currencyCode: 'IRR', unitPrice: 50, baseQuantity: 3 }
]);
assert.equal(mixed.total, 2000 - 3000); assert.equal(mixed.state, 'NEGATIVE');
assert.equal(mixed.surplus, 2000); assert.equal(mixed.deficit, 3000);
assert.equal(mixed.negativeLineCount, 1); assert.equal(mixed.excludedLineCount, 1); assert.equal(mixed.countedLineCount, 2);
assert.equal(mixed.ratioPercent, Math.round((-1000 / 31000) * 1000) / 10);
assert.equal(computeOrderBalance([]).state, 'UNKNOWN');
const mixedCurrency = computeOrderBalance([
  { key: 'irr', comparisonPrice: 10, currencyCode: 'IRR', unitPrice: 12, baseQuantity: 1 },
  { key: 'usd', comparisonPrice: 10, currencyCode: 'USD', unitPrice: 12, baseQuantity: 1 }
]);
assert.equal(mixedCurrency.currencyMismatch, true); assert.equal(mixedCurrency.state, 'UNKNOWN'); assert.equal(mixedCurrency.countedLineCount, 0);

// ── سناریوی کاربر: سفارش منفی؛ کالای دوم با فی بالاتر از کف جبران می‌کند
// کف ۱۰، من ۱۰ واحد را ۳۰ می‌زنم ⇒ +۲۰۰؛ کسری ردیف دیگر −۵۰۰
const scenario = [
  { key: 'neg', comparisonPrice: 1000, currencyCode: 'IRR', unitPrice: 950, baseQuantity: 10, unitsPerCarton: 10 }, // −500
  { key: 'pos', comparisonPrice: 10, currencyCode: 'IRR', unitPrice: 30, baseQuantity: 10, unitsPerCarton: 10 }     // +200
];
const sc = computeOrderBalance(scenario); assert.equal(sc.total, -300);
const sg = suggestLineRecovery(scenario, 'pos');
assert.equal(sg.status, 'AVAILABLE'); assert.equal(sg.orderDeficit, 300);
// دیگر ردیف‌ها −۵۰۰ ⇒ این ردیف باید +۵۰۰ بدهد ⇒ فی = ۱۰ + ⌈۵۰۰/۱۰⌉ = ۶۰
assert.equal(sg.price.unitPrice, 60);
// اعمال پیشنهاد ⇒ تراز کل دقیقاً صفر
assert.equal(computeOrderBalance(scenario.map(l => l.key === 'pos' ? { ...l, unitPrice: 60 } : l)).total, 0);
// تعداد پیشنهادی با همین فی (۳۰): سهم ۵۰۰ ÷ (۳۰−۱۰=۲۰) = ۲۵ واحد ⇒ ⌈۲۵/۱۰⌉ = ۳ کارتن (۱ کارتن فعلی ⇒ ۲ کارتن اضافه)
assert.equal(sg.quantity.baseQuantity, 25); assert.equal(sg.quantity.cartons, 3); assert.equal(sg.quantity.extraCartons, 2); assert.equal(sg.quantity.effectiveBaseQuantity, 30);
assert.ok(computeOrderBalance(scenario.map(l => l.key === 'pos' ? { ...l, baseQuantity: 30 } : l)).total >= 0);
// افزایش تعداد ⇒ فی پیشنهادی همزمان کمتر می‌شود
const more = scenario.map(l => l.key === 'pos' ? { ...l, baseQuantity: 20 } : l);
assert.equal(suggestLineRecovery(more, 'pos').price.unitPrice, 10 + Math.ceil(500 / 20));
assert.ok(suggestLineRecovery(more, 'pos').price.unitPrice < sg.price.unitPrice);

// فی ≤ کف ⇒ افزایش تعداد کمکی نمی‌کند؛ فقط پیشنهاد فی
const flat = suggestLineRecovery([{ key: 'neg', comparisonPrice: 1000, currencyCode: 'IRR', unitPrice: 950, baseQuantity: 10 }], 'neg');
assert.equal(flat.quantity.unavailableReason, 'PRICE_NOT_ABOVE_REFERENCE'); assert.equal(flat.quantity.cartons, null);
assert.equal(flat.price.unitPrice, 1000 + Math.ceil(0 / 10)); // سفارش تک‌ردیفی: رسیدن به کف
// بدون تعداد در کارتن: تعداد به واحد پایه برمی‌گردد و ۱ فرض نمی‌شود
const noUpc = suggestLineRecovery([{ key: 'n', comparisonPrice: 1000, currencyCode: 'IRR', unitPrice: 950, baseQuantity: 10 }, { key: 'p', comparisonPrice: 10, currencyCode: 'IRR', unitPrice: 30, baseQuantity: 10 }], 'p');
assert.equal(noUpc.quantity.cartons, null); assert.equal(noUpc.quantity.baseQuantity, 25);
// تراز مثبت/صفر ⇒ پیشنهادی نیست؛ ردیف نامحاسبه‌پذیر ⇒ پیشنهادی نیست
assert.equal(suggestLineRecovery(mk(10), 'a').reason, 'ORDER_NOT_NEGATIVE');
assert.equal(suggestLineRecovery([{ key: 'u', comparisonPrice: null, currencyCode: 'IRR', unitPrice: 1, baseQuantity: 1 }], 'u').reason, 'LINE_NOT_COMPUTABLE');
// گرد کردن فی به گام (۱۰۰۰ ریال) فقط رو به بالا
assert.equal(suggestLineRecovery(scenario, 'pos', { priceRoundingStep: 100 }).price.unitPrice, 100);
// جبران، هرگز کمتر از صفر نمی‌ماند (دامنهٔ تصادفی قطعی)
let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return 1 + (seed % n); };
for (let i = 0; i < 300; i++) {
  const ls = [0, 1, 2].map(k => ({ key: `k${k}`, comparisonPrice: rnd(5000), currencyCode: 'IRR', unitPrice: rnd(6000), baseQuantity: rnd(40), unitsPerCarton: rnd(12) }));
  const ord = computeOrderBalance(ls);
  if (ord.state !== 'NEGATIVE') continue;
  const s = suggestLineRecovery(ls, 'k0');
  assert.ok(computeOrderBalance(ls.map(l => l.key === 'k0' ? { ...l, unitPrice: s.price.unitPrice } : l)).total >= 0, 'price suggestion must reach zero');
  if (s.quantity?.effectiveBaseQuantity) assert.ok(computeOrderBalance(ls.map(l => l.key === 'k0' ? { ...l, baseQuantity: s.quantity.effectiveBaseQuantity } : l)).total >= 0, 'qty suggestion must reach zero');
}

// ── کلاس‌های قیمت از ERP
assert.deepEqual(PRICE_CLASS_CODES.length, 5);
const n = normalizeErpPriceClasses({ priceClass1: '۱۲۰۰۰', priceClass2: 90000, priceClass3: 0, priceClass4: -5, priceClass5: 1.5, priceClass2Label: 'عمده‌ی ERP' });
assert.equal(n.PRICE_CLASS_1.unitPrice, 12000); assert.deepEqual(Object.keys(n).sort(), ['PRICE_CLASS_1', 'PRICE_CLASS_2']);
assert.equal(n.PRICE_CLASS_2.unitPrice, 90000); assert.equal(n.PRICE_CLASS_2.label, 'عمده‌ی ERP');
assert.equal(n.PRICE_CLASS_3, undefined); assert.equal(n.PRICE_CLASS_5, undefined); // صفر/منفی/اعشاری هرگز نمی‌شود
assert.equal(normalizeErpPriceClasses({ currencyCode: 'USD', priceClass1: 5 }).PRICE_CLASS_1.currencyCode, 'USD'); // کد پول از ERP حفظ می‌شود
assert.equal(normalizeErpPriceClasses({ priceClasses: [{ code: 'PRICE_CLASS_5', unitPrice: 77, label: 'X' }] }).PRICE_CLASS_5.unitPrice, 77);
assert.equal(normalizeErpPriceClasses({ priceClasses: { PRICE_CLASS_1: { unitPrice: 5 } } }).PRICE_CLASS_1.unitPrice, 5);
assert.equal(normalizeErpPriceClasses({ priceClasses: { BAD_CODE: 5 } }).BAD_CODE, undefined);
// ۵ کلاس بدون ERP: دستی ← پیش‌فرض ← «کلاس قیمت ۵» (حدس تجاری ممنوع)
const labels = resolvePriceClassLabels({ PRICE_CLASS_5: 'پنجم من', PRICE_CLASS_2: 'نادیده' }, [{ priceClasses: { PRICE_CLASS_2: { unitPrice: 1, label: 'عمده‌ERP' } } }]);
assert.equal(labels[1].label, 'عمده‌ERP'); assert.equal(labels[1].source, 'ERP');
assert.equal(labels[4].label, 'پنجم من'); assert.equal(labels[4].source, 'MANUAL');
assert.equal(labels[0].source, 'DEFAULT');
assert.equal(resolvePriceClassLabels({}, [])[4].label, 'کلاس قیمت ۵'.replace('۵', '5'));
console.log('floorBalanceEngine OK');
