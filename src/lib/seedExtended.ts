// Extended demo pack (additive, deterministic, idempotent): 12 months of sales documents, purchasing (بازرگانی),
// treasury (خزانه: cashboxes + banks + running balances), categorised expenses with accounting codes + suspicious items,
// stock movements, and a visitor/supervisor/manager hierarchy with their own customer routes and visits.
// Rules: ids are demo-x-*, only appends, never touches real rows, purgeDemoData() removes it (demo- prefix).
import type { AppState } from '../types.ts';
import { DEMO_PREFIX, generateAvatarSvg, type DemoSeedReport } from './seed.ts';

const P = `${DEMO_PREFIX}x-`;
function prng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const M = ['علی', 'محمد', 'حسین', 'رضا', 'مهدی', 'امیر', 'سعید', 'پیمان', 'کامران', 'بهروز', 'ناصر', 'وحید'];
const F = ['سارا', 'مریم', 'زهرا', 'نگار', 'الهام', 'فاطمه', 'نیلوفر', 'شیما', 'پریسا', 'مینا'];
const LAST = ['رضایی', 'کریمی', 'حسینی', 'احمدی', 'موسوی', 'جعفری', 'صادقی', 'کاظمی', 'نوری', 'طاهری', 'فرهادی', 'سلیمانی', 'اکبری', 'باقری', 'رحیمی', 'یزدانی', 'مرادی', 'قاسمی'];
const SHOP = ['فروشگاه', 'سوپرمارکت', 'هایپرمارکت', 'قنادی', 'رستوران', 'عمده‌فروشی', 'سلف‌سرویس', 'میوه و تره‌بار', 'مینی‌مارکت', 'کافه'];
const NAME = ['آفتاب', 'گلبرگ', 'نیلوفر', 'پارسیان', 'آریا', 'مهر', 'سپیدار', 'بهار', 'ستاره', 'کوروش', 'رضوان', 'نگین', 'ایرانیان', 'فجر', 'سروش', 'پیمان', 'ماهان', 'نارنج', 'دنا', 'کیان', 'طوبی', 'شمیم', 'آرمان', 'ترنج', 'الوند', 'زاگرس', 'یاس', 'سبلان'];
const STREET = ['بلوار آزادی', 'خیابان مطهری', 'میدان فاطمی', 'بلوار کشاورز', 'خیابان شریعتی', 'بلوار امام رضا', 'خیابان ولیعصر', 'جاده مخصوص', 'خیابان انقلاب', 'بلوار ارم'];
const CITY: [string, number, number][] = [['تهران', 35.70, 51.40], ['کرج', 35.83, 50.99], ['قم', 34.64, 50.88], ['اصفهان', 32.65, 51.67], ['شیراز', 29.59, 52.58], ['مشهد', 36.30, 59.60], ['تبریز', 38.08, 46.29], ['ساوه', 35.02, 50.36]];
const BANKS = ['بانک ملت', 'بانک ملی', 'بانک سامان', 'بانک پاسارگاد', 'بانک تجارت', 'بانک صادرات'];
// [نام پایه, دسته, واحد, قیمت واحد (ریال), نسبت بها]
const PROD: [string, string, string, number, number][] = [
  ['روغن جامد ۴ کیلویی', 'روغن و چربی', 'کارتن', 8900000, 0.87], ['روغن زیتون ۵۰۰ میلی', 'روغن و چربی', 'کارتن', 14500000, 0.82], ['برنج پاکستانی ۱۰ کیلویی', 'برنج و غلات', 'کیسه', 8600000, 0.9],
  ['برنج ایرانی هاشمی ۵ کیلویی', 'برنج و غلات', 'کیسه', 6900000, 0.88], ['آرد گندم ۱۰ کیلویی', 'برنج و غلات', 'کیسه', 2100000, 0.93], ['ماکارونی لازانیا ۵۰۰ گرمی', 'ماکارونی', 'کارتن', 2300000, 0.86],
  ['سس کچاپ ۳۸۰ گرمی', 'کنسرو و رب', 'کارتن', 3600000, 0.84], ['کنسرو لوبیا ۴۲۰ گرمی', 'کنسرو و رب', 'کارتن', 4200000, 0.85], ['نخودفرنگی کنسروی', 'کنسرو و رب', 'کارتن', 3800000, 0.85],
  ['نوشابه کولا ۲ لیتری', 'نوشیدنی', 'پک', 2900000, 0.81], ['دوغ ۱٫۵ لیتری', 'نوشیدنی', 'پک', 2400000, 0.83], ['آبمیوه پرتقال ۱ لیتری', 'نوشیدنی', 'پک', 3300000, 0.82],
  ['ماست پرچرب ۹۰۰ گرمی', 'لبنیات', 'کارتن', 3900000, 0.88], ['کره ۱۰۰ گرمی', 'لبنیات', 'کارتن', 5200000, 0.86], ['خامه صبحانه ۲۰۰ گرمی', 'لبنیات', 'کارتن', 4700000, 0.87],
  ['چیپس ساده ۱۰۰ گرمی', 'تنقلات', 'کارتن', 3100000, 0.8], ['شکلات صبحانه ۳۰۰ گرمی', 'تنقلات', 'کارتن', 5800000, 0.83], ['کیک تک‌نفره', 'تنقلات', 'کارتن', 2600000, 0.82],
  ['پودر ماشین لباسشویی ۳ کیلویی', 'بهداشتی', 'کارتن', 7400000, 0.84], ['مایع دستشویی ۴ لیتری', 'بهداشتی', 'کارتن', 5100000, 0.83], ['شامپو ۴۰۰ میلی', 'بهداشتی', 'کارتن', 6200000, 0.8],
  ['خمیردندان ۱۰۰ گرمی', 'بهداشتی', 'کارتن', 4800000, 0.81], ['زعفران ۱ گرمی', 'ادویه', 'کارتن', 9600000, 0.86], ['فلفل سیاه ۱۰۰ گرمی', 'ادویه', 'کارتن', 2900000, 0.85],
  ['عسل ۵۰۰ گرمی', 'شیرین‌کننده', 'کارتن', 11800000, 0.84], ['مربا آلبالو ۳۸۰ گرمی', 'شیرین‌کننده', 'کارتن', 4400000, 0.85], ['خرما مضافتی ۶۰۰ گرمی', 'خشکبار', 'کارتن', 7900000, 0.87], ['پسته خندان ۵۰۰ گرمی', 'خشکبار', 'کارتن', 19800000, 0.89],
];
const SUP = ['شرکت پخش البرز', 'صنایع غذایی زرین', 'بازرگانی سپهر', 'تعاونی کشاورزی دشت', 'شرکت بهداشتی پاک‌آور', 'پخش سراسری هدیه'];
// [عنوان, دسته, کد کل, کد معین, حداقل، حداکثر (میلیون ریال)]
const EXP: [string, string, string, string, number, number][] = [
  ['اجاره انبار', 'ثابت', '6101', '610101', 140, 140], ['سوخت و حمل‌ونقل', 'عملیاتی', '6201', '620101', 40, 120], ['تعمیر و نگهداری خودرو', 'عملیاتی', '6201', '620102', 15, 95],
  ['تبلیغات و بازاریابی', 'بازاریابی', '6301', '630101', 20, 140], ['قبوض آب، برق و گاز', 'ثابت', '6102', '610201', 12, 40], ['اینترنت و تلفن', 'ثابت', '6102', '610202', 5, 14],
  ['بیمه و عوارض', 'ثابت', '6103', '610301', 10, 60], ['ملزومات اداری', 'اداری', '6401', '640101', 3, 25], ['پذیرایی و تشریفات', 'اداری', '6401', '640102', 2, 18],
  ['هزینه بسته‌بندی و پالت', 'عملیاتی', '6202', '620201', 8, 50], ['کارمزد و خدمات بانکی', 'مالی', '6501', '650101', 1, 6], ['حق‌الزحمه حسابرسی و مشاوره', 'اداری', '6402', '640201', 20, 80],
];

export function applyDemoSeedExtended(draft: AppState, now: Date = new Date()): DemoSeedReport {
  const r = prng(20260711);
  const rnd = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const day = (off: number) => new Date(now.getTime() + off * 86400000);
  const ymd = (off: number) => day(off).toISOString().split('T')[0];
  const iso = (off: number, hour = 10) => { const d = day(off); d.setHours(hour, rnd(0, 59), 0, 0); return d.toISOString(); };
  const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
  const created: Record<string, number> = {}; let skipped = 0;
  const add = (key: string, rows: Array<Record<string, unknown>>) => {
    const list: Array<Record<string, unknown>> = ((draft as Record<string, unknown>)[key] ||= []);
    const ids = new Set(list.map(x => x.id));
    rows.forEach(row => { if (ids.has(row.id)) { skipped++; return; } list.push(row); ids.add(row.id); created[key] = (created[key] || 0) + 1; });
  };

  /* ---------- 1) کاربران: ویزیتور، سرپرست، مدیرکل، خزانه، بازرگانی، انبار ---------- */
  const plan: { title: string; role: string; perm: string; female: boolean; cost: number }[] = [
    { title: 'مدیر کل', role: 'role-sales', perm: 'perm-admin', female: false, cost: 420000000 },
    { title: 'سرپرست فروش', role: 'role-sales', perm: 'perm-sales', female: false, cost: 240000000 },
    { title: 'سرپرست فروش', role: 'role-sales', perm: 'perm-sales', female: true, cost: 240000000 },
    ...Array.from({ length: 8 }, (_, i) => ({ title: 'ویزیتور بازاریاب', role: 'role-sales', perm: 'perm-sales', female: i % 4 === 1, cost: rnd(105, 175) * 1000000 })),
    { title: 'مسئول خزانه', role: 'role-finance', perm: 'perm-admin', female: true, cost: 190000000 },
    { title: 'مدیر بازرگانی', role: 'role-finance', perm: 'perm-admin', female: false, cost: 260000000 },
    { title: 'انباردار', role: 'role-sales', perm: 'perm-sales', female: false, cost: 120000000 },
  ];
  const staff = plan.map((p, i) => ({
    id: `${P}user-${i + 1}`, name: `${p.female ? pick(F) : pick(M)} ${pick(LAST)}`, username: `demo.x${i + 1}`, phone: `0912${rnd(1000000, 9999999)}`,
    roleId: p.role, permissionSetId: p.perm, branchId: 'branch-tehran', jobTitle: p.title, monthlyCost: p.cost, isActive: true, active: true, onboardingCompleted: true,
    avatar: generateAvatarSvg(31000 + i * 53, p.female), managerId: '' as string,
  }));
  const gm = staff[0], sups = [staff[1], staff[2]], visitors = staff.filter(s => s.jobTitle === 'ویزیتور بازاریاب');
  sups.forEach(s => { s.managerId = gm.id; });
  visitors.forEach((v, i) => { v.managerId = sups[i % 2].id; });
  const treasurer = staff.find(s => s.jobTitle === 'مسئول خزانه')!, buyer = staff.find(s => s.jobTitle === 'مدیر بازرگانی')!;
  add('users', staff);
  add('groups', sups.map((s, i) => ({ id: `${P}group-team-${i + 1}`, name: `تیم فروش ${i + 1}`, description: 'ویزیتورهای زیرمجموعه سرپرست', managerId: s.id, memberIds: visitors.filter(v => v.managerId === s.id).map(v => v.id), active: true })));

  /* ---------- 2) مشتریان مسیرها (هر ویزیتور مسیر و مشتریان خودش) ---------- */
  const customers = Array.from({ length: 140 }, (_, i) => {
    const v = visitors[i % visitors.length]; const city = CITY[i % 3 === 0 ? rnd(1, CITY.length - 1) : 0];
    return {
      id: `${P}cust-${i + 1}`, code: `C-1405-${String(400 + i)}`, name: `${SHOP[i % SHOP.length]} ${NAME[i % NAME.length]}`, company: `${NAME[(i * 3) % NAME.length]} ${pick(LAST)}`,
      phone: `021${rnd(20000000, 89999999)}`, email: `demox${i + 1}@example.ir`, address: `${city[0]}، ${pick(STREET)}، پلاک ${rnd(2, 190)}`, city: city[0],
      lat: +(city[1] + (r() - 0.5) * 0.14).toFixed(5), lng: +(city[2] + (r() - 0.5) * 0.14).toFixed(5), ownerId: v.id, routeId: `${P}route-${visitors.indexOf(v) + 1}`, supervisorId: v.managerId,
      branchId: 'branch-tehran', status: i % 13 === 12 ? 'INACTIVE' : 'ACTIVE', creditLimit: rnd(20, 250) * 100000000, balance: 0, totalRevenue: 0,
      paymentBehavior: pick(['GOOD', 'GOOD', 'AVERAGE', 'AVERAGE', 'POOR']), tags: [pick(['VIP', 'عمده', 'خرده', 'پرسود']), pick(['نقدی', 'اعتباری'])], createdAt: iso(-rnd(200, 700)),
      contacts: [{ id: `${P}con-${i + 1}`, name: `${pick([...M, ...F])} ${pick(LAST)}`, title: pick(['مدیر خرید', 'مدیر فروشگاه', 'صاحب فروشگاه', 'مسئول مالی']), phone: `0935${rnd(1000000, 9999999)}` }],
    };
  });
  add('accounts', customers.map(c => ({ ...c }))); add('customers', customers.map(c => ({ ...c })));

  /* ---------- 3) کالا و تأمین‌کننده ---------- */
  const suppliers = SUP.map((n, i) => ({ id: `${P}sup-${i + 1}`, name: n, city: pick(['تهران', 'کرج', 'اصفهان', 'قزوین', 'قم']), phone: `021${rnd(30000000, 89999999)}`, paymentTermDays: pick([15, 30, 45, 60]), contact: `${pick(M)} ${pick(LAST)}`, source: 'LOCAL_TEST' }));
  add('suppliers', suppliers);
  const products = PROD.map(([name, category, unit, price, ratio], i) => ({
    id: `${P}prod-${i + 1}`, name, code: `PX-${300 + i}`, sku: `PX-${300 + i}`, category, unit, unitPrice: price, basePrice: price, costPrice: Math.round(price * ratio),
    supplierId: suppliers[i % suppliers.length].id, stock: 0, minStock: rnd(40, 120), leadTimeDays: rnd(2, 9), weightKgPerUnit: unit === 'کیسه' ? 10 : unit === 'کارتن' ? 6 : 2, source: 'LOCAL_TEST',
  }));

  /* ---------- 4) حساب‌های خزانه ---------- */
  const treasury = [
    { id: `${P}tre-cash-main`, name: 'صندوق مرکزی', type: 'CASHBOX', erp: '1101-01', collectorUserId: treasurer.id },
    { id: `${P}tre-cash-pos`, name: 'صندوق کارتخوان', type: 'CASHBOX', erp: '1101-02', collectorUserId: treasurer.id },
    { id: `${P}tre-bank-1`, name: 'حساب جاری ملت', type: 'BANK', bankName: 'بانک ملت', erp: '1102-01' },
    { id: `${P}tre-bank-2`, name: 'حساب جاری ملی', type: 'BANK', bankName: 'بانک ملی', erp: '1102-02' },
    { id: `${P}tre-bank-3`, name: 'حساب جاری سامان', type: 'BANK', bankName: 'بانک سامان', erp: '1102-03' },
  ].map(a => ({ ...a, accountNumber: a.type === 'BANK' ? String(rnd(1000000000, 9999999999)) : undefined, iban: a.type === 'BANK' ? `IR${rnd(10, 99)}${rnd(10000000, 99999999)}${rnd(10000000, 99999999)}${rnd(100000, 999999)}` : undefined, currency: 'IRR', openingBalance: 0, isActive: true, source: 'LOCAL_TEST' }));
  const banks = treasury.filter(t => t.type === 'BANK'), cashMain = treasury[0], cashPos = treasury[1];
  const txs: Array<Record<string, unknown>> = [];
  const tx = (o: { id: string; accountId: string; date: string; direction: 'IN' | 'OUT'; amount: number; category: string; description: string; ref?: Record<string, string> }) => { if (o.date <= ymd(0)) txs.push({ ...o, currency: 'IRR', source: 'LOCAL_TEST' }); };

  /* ---------- 5) بازرگانی: سفارش خرید، رسید کالا، فاکتور خرید، پرداخت به تأمین‌کننده ---------- */
  const movements: Array<Record<string, unknown>> = [];
  const mv = (o: { id: string; productId: string; date: string; qty: number; type: 'RECEIPT' | 'SALE' | 'RETURN_IN'; ref: string }) => movements.push({ ...o, source: 'LOCAL_TEST' });
  const pos: Array<Record<string, unknown>> = [], receipts: Array<Record<string, unknown>> = [], bills: Array<Record<string, unknown>> = [], supPays: Array<Record<string, unknown>> = [], payableCheques: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 70; i++) {
    const sup = suppliers[i % suppliers.length], off = -rnd(5, 360);
    const items = products.filter(p => p.supplierId === sup.id); const lines = Array.from({ length: rnd(2, 5) }, (_, k) => { const p = pick(items); const q = rnd(80, 600); return { id: `${P}pol-${i + 1}-${k + 1}`, productId: p.id, productName: p.name, quantity: q, unitCost: p.costPrice, lineTotal: q * p.costPrice }; });
    const total = sum(lines.map(l => l.lineTotal)); const state = r() < 0.08 ? 'CANCELLED' : off > -12 ? pick(['OPEN', 'PARTIAL']) : 'RECEIVED';
    const po = { id: `${P}po-${i + 1}`, poNumber: `PO-1405-${700 + i}`, supplierId: sup.id, buyerId: buyer.id, date: ymd(off), expectedDate: ymd(off + rnd(3, 12)), status: state, totalAmount: total, lines, source: 'LOCAL_TEST' };
    pos.push(po);
    if (state === 'CANCELLED' || state === 'OPEN') continue;
    const frac = state === 'PARTIAL' ? 0.5 : 1; const rDate = ymd(off + rnd(3, 10));
    const rl = lines.map(l => ({ ...l, receivedQty: Math.round(l.quantity * frac), lineTotal: Math.round(l.quantity * frac) * l.unitCost }));
    receipts.push({ id: `${P}gr-${i + 1}`, poId: po.id, supplierId: sup.id, date: rDate, receivedBy: staff[staff.length - 1].id, lines: rl, totalAmount: sum(rl.map(l => l.lineTotal)), source: 'LOCAL_TEST' });
    rl.forEach(l => mv({ id: `${P}mv-in-${i + 1}-${l.id.split('-').pop()}`, productId: l.productId, date: rDate, qty: l.receivedQty, type: 'RECEIPT', ref: `${P}gr-${i + 1}` }));
    const amount = sum(rl.map(l => l.lineTotal)); const due = ymd(off + 6 + sup.paymentTermDays);
    const paidFrac = due < ymd(-5) ? (r() < 0.9 ? 1 : 0.5) : 0; const paid = Math.round(amount * paidFrac);
    const bill = { id: `${P}bill-${i + 1}`, billNumber: `SB-1405-${800 + i}`, supplierId: sup.id, poId: po.id, date: rDate, dueDate: due, amount, paidAmount: paid, status: paid >= amount ? 'PAID' : paid > 0 ? 'PARTIAL' : (due < ymd(0) ? 'OVERDUE' : 'UNPAID'), source: 'LOCAL_TEST' };
    bills.push(bill);
    if (paid > 0) {
      const viaCheque = r() < 0.5; const bank = pick(banks); const pDate = ymd(Math.min(-1, off + 6 + sup.paymentTermDays - rnd(0, 4)));
      supPays.push({ id: `${P}spay-${i + 1}`, billId: bill.id, supplierId: sup.id, amount: paid, date: pDate, method: viaCheque ? 'CHEQUE' : 'TRANSFER', accountId: bank.id, source: 'LOCAL_TEST' });
      if (viaCheque) payableCheques.push({ id: `${P}chq-out-${i + 1}`, direction: 'PAYABLE', chequeNumber: String(rnd(100000000000, 999999999999)), bankName: bank.bankName, amount: paid, dueDate: pDate, status: 'CLEARED', supplierId: sup.id, billId: bill.id, source: 'LOCAL_TEST', isGuarantee: false });
      tx({ id: `${P}tx-sp-${i + 1}`, accountId: bank.id, date: pDate, direction: 'OUT', amount: paid, category: 'SUPPLIER_PAYMENT', description: `پرداخت به ${sup.name}`, ref: { billId: bill.id } });
    } else if (due >= ymd(0) && r() < 0.6) {
      payableCheques.push({ id: `${P}chq-out-${i + 1}`, direction: 'PAYABLE', chequeNumber: String(rnd(100000000000, 999999999999)), bankName: pick(banks).bankName, amount: amount, dueDate: due, status: 'PENDING', supplierId: sup.id, billId: bill.id, source: 'LOCAL_TEST', isGuarantee: false });
    }
  }
  add('purchaseOrders', pos); add('goodsReceipts', receipts); add('supplierBills', bills); add('supplierPayments', supPays); add('cheques', payableCheques);
  add('purchaseRequests', Array.from({ length: 20 }, (_, i) => { const p = pick(products); return { id: `${P}pr-${i + 1}`, productId: p.id, supplierId: p.supplierId, quantity: rnd(100, 500), status: pick(['PENDING', 'APPROVED', 'ORDERED', 'REJECTED']), requestedBy: buyer.id, createdAt: iso(-rnd(1, 90)), reason: pick(['موجودی زیر حداقل', 'سفارش عمده مشتری', 'فصل پرمصرف']), source: 'LOCAL_TEST' }; }));

  /* ---------- 6) فروش: پیش‌فاکتور → فاکتور → وصول (روابط معتبر، ۱۲ ماه) ---------- */
  const quotes: Array<Record<string, unknown>> = [], invoices: Array<Record<string, unknown>> = [], payments: Array<Record<string, unknown>> = [], allocs: Array<Record<string, unknown>> = [], recCheques: Array<Record<string, unknown>> = [], returns: Array<Record<string, unknown>> = [], credits: Array<Record<string, unknown>> = [], orders: Array<Record<string, unknown>> = [];
  const stat = ['ACCEPTED', 'ACCEPTED', 'ACCEPTED', 'ACCEPTED', 'ACCEPTED', 'APPROVED', 'SENT', 'SENT', 'DRAFT', 'REJECTED', 'PENDING_APPROVAL'];
  for (let i = 0; i < 420; i++) {
    const c = customers[(i * 7 + rnd(0, 6)) % customers.length]; const off = -rnd(2, 364);
    const lines = Array.from({ length: rnd(1, 5) }, (_, k) => { const p = pick(products); const q = rnd(20, 300); const up = Math.round(p.basePrice * (0.96 + r() * 0.08)); return { id: `${P}ql-${i + 1}-${k + 1}`, productId: p.id, productName: p.name, quantity: q, unitPrice: up, costPrice: p.costPrice, lineTotal: q * up }; });
    const total = sum(lines.map(l => l.lineTotal)), cost = sum(lines.map(l => l.costPrice * l.quantity)); const st = pick(stat);
    const q = { id: `${P}quote-${i + 1}`, quoteNumber: `Q-1405-${1000 + i}`, accountId: c.id, customerId: c.id, ownerId: c.ownerId, createdBy: c.ownerId, totalAmount: total, marginPercent: Math.round(((total - cost) / total) * 100), status: st, lines, createdAt: iso(off, 11), validUntil: ymd(off + 14), source: 'LOCAL_TEST' };
    quotes.push(q);
    if (st !== 'ACCEPTED' && st !== 'APPROVED') continue;
    const invOff = off + rnd(0, 3); if (invOff > -1) continue;
    const date = ymd(invOff); const dueDate = ymd(invOff + pick([15, 30, 45, 60]));
    const inv: unknown = { id: `${P}inv-${invoices.length + 1}`, invoiceNumber: `INV-1405-${2000 + invoices.length}`, accountId: c.id, customerId: c.id, quoteId: q.id, ownerId: c.ownerId, date, dueDate, totalAmount: total, costAmount: cost, lines: lines.map(l => ({ ...l, id: l.id.replace('ql', 'il') })), paidAmount: 0, balance: total, status: 'UNPAID', source: 'LOCAL_TEST' };
    invoices.push(inv);
    orders.push({ id: `${P}ord-${invoices.length}`, orderNumber: `SO-1405-${3000 + invoices.length}`, customerId: c.id, ownerId: c.ownerId, invoiceId: inv.id, status: 'DELIVERED', totalAmount: total, costAmount: cost, costKnown: true, lines: lines.map(l => ({ ...l })), createdAt: iso(invOff, 12), source: 'LOCAL_TEST' });
    inv.lines.forEach((l: unknown, k: number) => mv({ id: `${P}mv-out-${invoices.length}-${k + 1}`, productId: l.productId, date, qty: -l.quantity, type: 'SALE', ref: inv.id }));
    const mode = r(); const behavior = c.paymentBehavior;
    const payFrac = mode < (behavior === 'GOOD' ? 0.85 : behavior === 'AVERAGE' ? 0.65 : 0.35) ? 1 : mode < 0.9 ? 0.3 + r() * 0.4 : 0;
    if (payFrac > 0) {
      const amount = Math.round(total * payFrac); const pOff = invOff + rnd(0, behavior === 'POOR' ? 80 : 40);
      if (pOff <= -1) {
        const method = pick(['TRANSFER', 'TRANSFER', 'CASH', 'POS', 'CHEQUE', 'CHEQUE']) as string; const payId = `${P}pay-${payments.length + 1}`;
        const chqDue = pOff + rnd(10, 90); const bank = pick(banks);
        const bounced = method === 'CHEQUE' && chqDue < -1 && r() < 0.07;
        const cleared = method !== 'CHEQUE' ? true : (chqDue < -1 && !bounced);
        payments.push({ id: payId, accountId: c.id, customerId: c.id, amount, date: ymd(pOff), method, reference: method === 'TRANSFER' ? `TR-${rnd(100000, 999999)}` : undefined, bankName: method === 'CHEQUE' ? bank.bankName : undefined, chequeDueDate: method === 'CHEQUE' ? ymd(chqDue) : undefined, status: bounced ? 'BOUNCED' : cleared ? 'CLEARED' : 'PENDING', notes: 'وصول فاکتور', source: 'LOCAL_TEST' });
        if (method === 'CHEQUE') recCheques.push({ id: `${P}chq-in-${payments.length}`, direction: 'RECEIVABLE', chequeNumber: String(rnd(100000000000, 999999999999)), bankName: bank.bankName, amount, dueDate: ymd(chqDue), status: bounced ? 'BOUNCED' : chqDue < -1 ? 'CLEARED' : pick(['PENDING', 'RECEIVED', 'DEPOSITED']), customerId: c.id, accountId: c.id, paymentId: payId, source: 'LOCAL_TEST' });
        if (cleared) {
          allocs.push({ id: `${P}alloc-${allocs.length + 1}`, paymentId: payId, invoiceId: inv.id, amount, createdAt: iso(Math.max(pOff, chqDue < 0 && method === 'CHEQUE' ? chqDue : pOff)), source: 'LOCAL_TEST' });
          inv.paidAmount = amount; inv.balance = total - amount;
          const inDate = method === 'CHEQUE' ? ymd(chqDue) : ymd(pOff);
          tx({ id: `${P}tx-in-${payments.length}`, accountId: method === 'CASH' ? cashMain.id : method === 'POS' ? cashPos.id : bank.id, date: inDate, direction: 'IN', amount, category: 'CUSTOMER_RECEIPT', description: `وصول ${inv.invoiceNumber}`, ref: { invoiceId: inv.id, paymentId: payId } });
        } else if (bounced) {
          tx({ id: `${P}tx-fee-${payments.length}`, accountId: bank.id, date: ymd(chqDue), direction: 'OUT', amount: 450000, category: 'BANK_FEE', description: 'کارمزد برگشت چک', ref: { paymentId: payId } });
        }
      }
    }
    inv.status = inv.balance <= 0 ? 'PAID' : inv.paidAmount > 0 ? 'PARTIAL' : (dueDate < ymd(0) ? 'OVERDUE' : 'UNPAID');
    if (r() < 0.06) {
      const l = inv.lines[0]; const qty = Math.max(1, Math.round(l.quantity * (0.05 + r() * 0.2))); const amount = qty * l.unitPrice; const rDate = ymd(Math.min(-1, invOff + rnd(2, 15)));
      returns.push({ id: `${P}ret-${returns.length + 1}`, orderId: `${P}ord-${invoices.length}`, customerId: c.id, invoiceId: inv.id, productId: l.productId, productName: l.productName, quantity: qty, amount, reasonCode: pick(['CUSTOMER_REJECTED', 'DAMAGED_LOGISTICS', 'EXPIRED_SHELF_LIFE', 'INCORRECT_ORDER']), reason: 'برگشت از فروش', financialDocumentConfirmed: r() < 0.7, date: rDate, source: 'LOCAL_TEST' });
      credits.push({ id: `${P}cn-${credits.length + 1}`, customerId: c.id, accountId: c.id, invoiceId: inv.id, amount, date: rDate, status: pick(['ISSUED', 'APPLIED']), source: 'LOCAL_TEST' });
      mv({ id: `${P}mv-ret-${returns.length}`, productId: l.productId, date: rDate, qty, type: 'RETURN_IN', ref: `${P}ret-${returns.length}` });
    }
  }
  add('quotes', quotes); add('invoices', invoices); add('payments', payments); add('paymentAllocations', allocs); add('cheques', recCheques);
  add('salesOrders', orders); add('salesReturns', returns); add('creditNotes', credits);

  /* ---------- 7) هزینه‌ها: ۱۲ ماه، کد حسابداری، موارد مشکوک ---------- */
  const expenses: Array<Record<string, unknown>> = [];
  for (let m = 0; m < 12; m++) {
    EXP.forEach(([title, cat, gl, sub, lo, hi], k) => {
      const amount = rnd(lo, hi) * 1000000; const date = ymd(-30 * m - rnd(1, 22));
      const payer = amount > 25000000 ? pick(banks) : r() < 0.5 ? cashMain : pick(banks);
      expenses.push({ id: `${P}exp-${m}-${k}`, title, category: cat, amount, date, dueDate: date, status: 'PAID', accountCode: gl, subAccountCode: sub, payAccountId: payer.id, vendor: pick(['شرکت پارس', 'خدمات آریا', 'پیمانکار نوین', 'فروشگاه مرکزی']), source: 'LOCAL_TEST' });
    });
    staff.forEach(s => expenses.push({ id: `${P}exp-sal-${m}-${s.id}`, title: `حقوق ${s.name}`, category: 'حقوق و دستمزد', amount: s.monthlyCost, date: ymd(-30 * m - 2), dueDate: ymd(-30 * m - 2), status: 'PAID', staffId: s.id, accountCode: '6001', subAccountCode: '600101', payAccountId: banks[0].id, source: 'LOCAL_TEST' }));
  }
  // سررسیدهای آتی (برای هشدار «چند روز دیگر نقدینگی لازم است»)
  EXP.slice(0, 6).forEach(([title, cat, gl, sub, lo, hi], k) => expenses.push({ id: `${P}exp-due-${k}`, title: `${title} (سررسید آتی)`, category: cat, amount: rnd(lo, hi) * 1000000, date: ymd(0), dueDate: ymd(k * 2 + 2), status: 'DUE', accountCode: gl, subAccountCode: sub, source: 'LOCAL_TEST' }));
  // هزینه‌های مشکوک: پرت مبلغی، تکراری، بدون کد حسابداری
  const suspicious: Array<Record<string, unknown>> = [];
  [[0, 3], [2, 4], [3, 5], [5, 4]].forEach(([k, mult], i) => { const base = expenses.find(e => e.id === `${P}exp-${i + 1}-${k}`)!; suspicious.push({ ...base, id: `${P}exp-sus-out-${i + 1}`, amount: base.amount * mult, title: `${base.title} (مبلغ غیرعادی)`, suspicious: true, suspicionCode: 'AMOUNT_OUTLIER', suspicionReason: `مبلغ ${mult} برابر معمول این دسته است`, status: 'PENDING_APPROVAL' }); });
  [0, 1].forEach(i => { const base = expenses.find(e => e.id === `${P}exp-${i + 2}-1`)!; suspicious.push({ ...base, id: `${P}exp-sus-dup-${i + 1}`, title: `${base.title}`, suspicious: true, suspicionCode: 'DUPLICATE', suspicionReason: 'هزینه با همان مبلغ، تاریخ و شرح قبلاً ثبت شده است', status: 'PENDING_APPROVAL' }); });
  [3, 4].forEach(i => suspicious.push({ id: `${P}exp-sus-nocode-${i}`, title: 'هزینه متفرقه بدون سند', category: 'اداری', amount: rnd(30, 90) * 1000000, date: ymd(-rnd(3, 40)), dueDate: ymd(-rnd(3, 40)), status: 'PENDING_APPROVAL', suspicious: true, suspicionCode: 'MISSING_ACCOUNT_CODE', suspicionReason: 'کد حسابداری و سند پیوست ندارد', source: 'LOCAL_TEST' }));
  add('expenses', [...expenses, ...suspicious]);
  expenses.filter(e => e.status === 'PAID').forEach(e => tx({ id: `${P}tx-${e.id.slice(P.length)}`, accountId: e.payAccountId, date: e.date, direction: 'OUT', amount: e.amount, category: e.staffId ? 'PAYROLL' : 'EXPENSE', description: e.title, ref: { expenseId: e.id } }));

  /* ---------- 8) خزانه: واریز صندوق به بانک، مانده‌های جاری معتبر ---------- */
  for (let m = 0; m < 12; m++) {
    const amount = rnd(200, 600) * 1000000; const d = ymd(-30 * m - 5);
    tx({ id: `${P}tx-dep-out-${m}`, accountId: cashMain.id, date: d, direction: 'OUT', amount, category: 'TRANSFER_OUT', description: 'واریز نقدی به بانک', ref: { transferId: `${P}tr-${m}` } });
    tx({ id: `${P}tx-dep-in-${m}`, accountId: banks[m % 3].id, date: d, direction: 'IN', amount, category: 'TRANSFER_IN', description: 'دریافت واریز از صندوق', ref: { transferId: `${P}tr-${m}` } });
    const pos = rnd(100, 300) * 1000000; tx({ id: `${P}tx-pos-out-${m}`, accountId: cashPos.id, date: ymd(-30 * m - 3), direction: 'OUT', amount: pos, category: 'TRANSFER_OUT', description: 'تسویه POS به بانک', ref: { transferId: `${P}trp-${m}` } });
    tx({ id: `${P}tx-pos-in-${m}`, accountId: banks[0].id, date: ymd(-30 * m - 3), direction: 'IN', amount: pos, category: 'TRANSFER_IN', description: 'تسویه کارتخوان', ref: { transferId: `${P}trp-${m}` } });
  }
  const byAcc = new Map<string, Array<Record<string, unknown>>>(); txs.forEach(t => (byAcc.get(t.accountId) || byAcc.set(t.accountId, []).get(t.accountId)!).push(t));
  treasury.forEach(a => {
    const list = (byAcc.get(a.id) || []).sort((x, y) => x.date.localeCompare(y.date) || x.id.localeCompare(y.id));
    let cum = 0, min = 0; list.forEach(t => { cum += t.direction === 'IN' ? t.amount : -t.amount; min = Math.min(min, cum); });
    (a as Record<string, unknown>).openingBalance = Math.ceil((-min + rnd(80, 400) * 1000000) / 1000000) * 1000000;
    let bal = (a as Record<string, unknown>).openingBalance; list.forEach(t => { bal += t.direction === 'IN' ? t.amount : -t.amount; t.balanceAfter = bal; });
    (a as Record<string, unknown>).currentBalance = bal;
  });
  add('treasuryAccounts', treasury); add('treasuryTransactions', txs);
  add('bankMaps', banks.map(b => ({ id: `${P}bm-${b.id.slice(-1)}`, bankName: b.bankName, accountNumber: b.accountNumber, erpAccountCode: b.erp, isActive: true })));
  add('cashboxMaps', [cashMain, cashPos].map(c => ({ id: `${P}cm-${c.id.slice(-4)}`, cashboxName: c.name, collectorUserId: treasurer.id, erpAccountCode: c.erp, isActive: true })));

  /* ---------- 9) موجودی کالا از حرکت‌ها (هیچ‌وقت منفی نمی‌شود) ---------- */
  const net = new Map<string, number>(); movements.forEach(mo => net.set(mo.productId, (net.get(mo.productId) || 0) + mo.qty));
  products.forEach(p => {
    const n = net.get(p.id) || 0; const opening = Math.max(0, -n) + rnd(20, 260);
    movements.push({ id: `${P}mv-open-${p.id.slice(P.length)}`, productId: p.id, date: ymd(-365), qty: opening, type: 'OPENING', ref: 'OPENING', source: 'LOCAL_TEST' });
    p.stock = opening + n;
  });
  add('externalProducts', products); add('stockMovements', movements);

  /* ---------- 10) بروزرسانی مانده و گردش مشتریان این بسته ---------- */
  ['customers', 'accounts'].forEach(key => ((draft as Record<string, unknown>)[key] || []).forEach((c: Record<string, unknown>) => {
    if (!c.id.startsWith(P)) return;
    const mine = invoices.filter(i => i.customerId === c.id); c.balance = sum(mine.map(i => i.balance)); c.totalRevenue = sum(mine.map(i => i.totalAmount));
  }));

  /* ---------- 11) ویزیت، فعالیت، وظیفه و فرصت‌های ویزیتورها ---------- */
  const visits = Array.from({ length: 720 }, (_, i) => {
    const c = customers[i % customers.length]; const off = -rnd(0, 180); const st = off === 0 ? 'PLANNED' : r() < 0.09 ? 'MISSED' : 'COMPLETED';
    const ordered = st === 'COMPLETED' && r() < 0.42;
    return { id: `${P}visit-${i + 1}`, accountId: c.id, repId: c.ownerId, status: st, plannedAt: iso(off, 9), checkInAt: st === 'COMPLETED' ? iso(off, 10) : undefined, durationMin: st === 'COMPLETED' ? rnd(12, 60) : undefined, gps: st === 'COMPLETED' ? { lat: c.lat, lng: c.lng, accuracy: rnd(6, 45) } : undefined, outcome: st === 'COMPLETED' ? (ordered ? 'ORDER_TAKEN' : pick(['NO_NEED', 'FOLLOW_UP', 'PRICE_OBJECTION', 'COLLECTION'])) : undefined, orderValue: ordered ? rnd(8, 120) * 1000000 : undefined, notes: pick(['سفارش ثبت شد', 'نیاز به تخفیف دارد', 'قفسه خالی از کالا', 'پیگیری چک', 'بدون نیاز فعلی', 'رقیب قیمت پایین‌تر داده']), source: 'LOCAL_TEST' };
  });
  add('visits', visits);
  add('tasks', Array.from({ length: 160 }, (_, i) => {
    const c = pick(customers); const off = -rnd(0, 120); const done = off < -7 ? r() < 0.8 : r() < 0.2; const owner = c.ownerId;
    return { id: `${P}task-${i + 1}`, title: `${pick(['پیگیری وصول مطالبات', 'ارسال پیش‌فاکتور', 'ویزیت حضوری', 'هماهنگی تحویل', 'تماس پیگیری رضایت', 'بررسی قیمت رقبا'])} ${c.name}`, status: done ? 'DONE' : pick(['OPEN', 'IN_PROGRESS']), priority: pick(['LOW', 'NORMAL', 'HIGH']), dueDate: ymd(off + rnd(1, 10)), ownerId: owner, assigneeType: 'USER', assigneeId: owner, accountId: c.id, customerId: c.id, createdBy: c.supervisorId, createdAt: iso(off), completedAt: done ? iso(Math.min(0, off + rnd(1, 6))) : undefined, source: 'LOCAL_TEST' };
  }));
  add('opportunities', Array.from({ length: 40 }, (_, i) => { const c = pick(customers); return { id: `${P}opp-${i + 1}`, accountId: c.id, title: `${pick(['قرارداد تأمین ماهانه', 'سفارش عمده', 'توسعه تنوع کالا'])} - ${c.name}`, amount: rnd(5, 80) * 100000000, stage: pick(['DISCOVERY', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']), expectedCloseDate: ymd(rnd(-10, 60)), ownerId: c.ownerId, createdAt: iso(-rnd(5, 120)) }; }));

  const total = Object.values(created).reduce((s, n) => s + n, 0);
  return { created, skipped, total };
}
