// اجرا: node --experimental-strip-types --import ./scripts/register-ts-resolver.mjs tests/financialIntelligence.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
const fi = await import('../src/lib/financialIntelligence.ts');
const { buildApprovalContext, buildFinancial360, resolveAccountingMapping, decideAdvanceWithContext, snapshotRequestDecision, enqueueAccountingExport, applyAccountingAcknowledgement, leaveDays, fnv1a } = fi;
let n = 0; const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; }; const ok = (v, m) => { assert.ok(v, m); n++; };
const NOW = new Date('2026-11-12T08:00:00Z'); const ALL = { userId: 'mgr', finance: true, hr: true, sales: true, internal: true };
const f = (ctx, key) => ctx.sections.flatMap(s => s.facts).find(x => x.key === key);

const base = () => ({
  users: [{ id: 'mgr', name: 'مدیر' }, { id: 'u1', name: 'علی رضایی', managerId: 'mgr' }, { id: 'u2', name: 'سارا', managerId: 'mgr' }],
  accounts: [{ id: 'c1', name: 'پخش نمونه', creditLimit: 500e6 }], currentUserId: 'mgr',
  advanceRequests: [
    { id: 'a0', userId: 'u1', requestedAmountRials: 18e6, approvedAmountRials: 18e6, status: 'APPROVED', reason: 'قبلی', createdAt: '2026-10-01' },
    { id: 'a-old', userId: 'u1', requestedAmountRials: 5e6, status: 'SETTLED', reason: 'قدیمی', createdAt: '2026-08-01' },
    { id: 'a1', userId: 'u1', requestedAmountRials: 30e6, status: 'REQUESTED', reason: 'نیاز', targetMonth: '2026-11', createdAt: '2026-11-10' },
  ],
  invoices: [
    { id: 'i1', ownerId: 'u1', customerId: 'c1', accountId: 'c1', totalAmount: 100e6, paidAmount: 100e6, balance: 0, status: 'PAID', date: '2026-10-01', dueDate: '2026-10-31' },
    { id: 'i2', ownerId: 'u1', customerId: 'c1', accountId: 'c1', totalAmount: 300e6, paidAmount: 300e6, balance: 0, status: 'PAID', date: '2026-10-05', dueDate: '2026-11-04' },
    { id: 'i3', ownerId: 'u1', customerId: 'c1', accountId: 'c1', totalAmount: 400e6, paidAmount: 0, balance: 400e6, status: 'UNPAID', date: '2026-11-02', dueDate: '2026-11-05' },
    { id: 'i4', ownerId: 'u1', customerId: 'c1', accountId: 'c1', totalAmount: 50e6, paidAmount: 50e6, balance: 0, status: 'PAID', date: '2026-09-01', dueDate: '2026-09-30' },
  ],
  payments: [{ id: 'p1', accountId: 'c1', customerId: 'c1', amount: 100e6, date: '2026-10-11', status: 'CLEARED' }, { id: 'p2', accountId: 'c1', customerId: 'c1', amount: 300e6, date: '2026-11-20', status: 'CLEARED' }],
  paymentAllocations: [{ id: 'al1', paymentId: 'p1', invoiceId: 'i1', amount: 100e6, createdAt: '2026-10-11' }, { id: 'al2', paymentId: 'p2', invoiceId: 'i2', amount: 300e6, createdAt: '2026-11-20' }],
  cheques: [{ id: 'q1', customerId: 'c1', amount: 20e6, status: 'BOUNCED', direction: 'RECEIVABLE', chequeNumber: '1' }, { id: 'q2', customerId: 'c1', amount: 5e6, status: 'BOUNCED', direction: 'PAYABLE' }],
  salesTargets: [{ id: 't1', userId: 'u1', periodMonth: '2026-11', revenueTargetRials: 500e6 }],
});

// ───── مساعده ─────
const st = base();
let ctx = buildApprovalContext(st, { kind: 'ADVANCE_REQUEST', id: 'a1' }, { now: NOW, viewer: ALL });
eq(f(ctx, 'advance.outstanding').value, 18e6, 'مانده مساعده قبلی (درخواست جاری کسر/شمرده نمی‌شود)');
eq(f(ctx, 'advance.totalSettled').value, 5e6, 'تسویه‌شده');
eq(f(ctx, 'debt.personnel').value, null, 'بدهی پرسنلی بدون منبع = null نه صفر'); eq(f(ctx, 'debt.personnel').quality, 'UNAVAILABLE', 'کیفیت نامشخص');
eq(f(ctx, 'sales.realized').value, 400e6, 'فروش دوره ۲۰۲۶-۱۱ (فقط فاکتور همان ماه)');
eq(f(ctx, 'sales.achievement').value, 80, 'درصد تحقق'); eq(f(ctx, 'sales.gap').value, 20, 'فاصله تا هدف');
ok(f(ctx, 'advance.outstanding').docRefs.some(d => d.id === 'a0'), 'Drill-down اسناد');
ok(ctx.policyNotes.join('').includes('سیاست'), 'یادداشت سیاست: فروش بالا ≠ استحقاق');
st.personnelLedgerEntries = [{ id: 'l1', userId: 'u1', amountRials: 22e6, date: '2026-10-15', sourceSystem: 'ERP', lastSyncedAt: '2026-11-12T06:00:00Z' }];
ctx = buildApprovalContext(st, { kind: 'ADVANCE_REQUEST', id: 'a1' }, { now: NOW, viewer: ALL });
eq([f(ctx, 'debt.personnel').value, f(ctx, 'debt.personnel').quality, f(ctx, 'debt.personnel').asOf], [22e6, 'ERP_MIRROR', '2026-11-12T06:00:00Z'], 'بدهی از ERP با زمان همگام‌سازی');
// دسترسی
ctx = buildApprovalContext(st, { kind: 'ADVANCE_REQUEST', id: 'a1' }, { now: NOW, viewer: { finance: false, hr: false, sales: true, internal: false, userId: 'sm' } });
eq(f(ctx, 'employee.restricted').quality, 'RESTRICTED', 'مدیر فروش جزئیات پرسنلی را نمی‌بیند');
ctx = buildApprovalContext(st, { kind: 'ADVANCE_REQUEST', id: 'a1' }, { now: NOW, viewer: ALL, hiddenCollections: ['advanceRequests'] });
eq(f(ctx, 'advance.outstanding').quality, 'RESTRICTED', 'کالکشن مخفی‌شده توسط سرور');
eq(buildApprovalContext(st, { kind: 'ADVANCE_REQUEST', id: 'a1' }, { now: NOW }).sections[0].facts[0].quality, 'RESTRICTED', 'پیش‌فرض بدون viewer = محدود');
// تصمیم
const d = base(); d.personnelLedgerEntries = st.personnelLedgerEntries;
eq(decideAdvanceWithContext(d, 'a1', { decision: 'APPROVED', approvedAmountRials: 20e6, note: '', actorId: 'mgr' }, NOW, { viewer: ALL }).ok, false, 'مبلغ کمتر بدون یادداشت');
eq(decideAdvanceWithContext(d, 'a1', { decision: 'APPROVED', approvedAmountRials: 40e6, note: 'x', actorId: 'mgr' }, NOW, { viewer: ALL }).ok, false, 'بیشتر از درخواست');
eq(decideAdvanceWithContext(d, 'a1', { decision: 'APPROVED', approvedAmountRials: 20e6, note: 'x', actorId: 'u1' }, NOW, { viewer: ALL }).ok, false, 'خودتأییدی');
eq(decideAdvanceWithContext(d, 'a1', { decision: 'REJECTED', note: '', actorId: 'mgr' }, NOW, { viewer: ALL }).ok, false, 'رد بدون یادداشت');
const r1 = decideAdvanceWithContext(d, 'a1', { decision: 'APPROVED', approvedAmountRials: 20e6, note: 'طبق سیاست', actorId: 'mgr' }, NOW, { viewer: ALL });
eq(r1.ok, true, 'تأیید با مبلغ پیشنهادی'); eq([d.advanceRequests[2].status, d.advanceRequests[2].approvedAmountRials], ['APPROVED', 20e6], 'مبلغ مصوب');
const snap = d.approvalSnapshots[0];
eq([snap.requestedAmountRials, snap.decidedAmountRials, snap.decision], [30e6, 20e6, 'APPROVED'], 'Snapshot تصمیم');
ok(snap.facts.length > 5 && snap.facts.every(x => 'source' in x && 'asOf' in x), 'Snapshot شامل منبع و زمان'); eq(snap.contentHash.length, 8, 'هش محتوا'); eq(snap.calcVersion, 'fi-1.0.0', 'نسخه محاسبه');
eq(decideAdvanceWithContext(d, 'a1', { decision: 'REJECTED', note: 'x', actorId: 'mgr' }, NOW, { viewer: ALL }).ok, false, 'تصمیم مجدد');
eq(d.approvalSnapshots.length, 1, 'فقط یک Snapshot');

// ───── اعتبار مشتری ─────
const c360 = buildFinancial360(base(), { kind: 'CUSTOMER', id: 'c1' }, { now: NOW, viewer: ALL });
// مانده فقط از گردش مالی (Seed فقط در تست): دو معین برای یک تفصیلی؛ فاکتور هیچ نقشی ندارد
eq(f(c360, 'credit.balance').value, null, 'بدون گردش مالی مانده نامشخص (حتی با فاکتور باز)');
const ledger = [
  { id: 'j1', detailAccountId: 'c1', subsidiaryCode: '1101', debitAmount: 700e6, creditAmount: 0, status: 'POSTED' },
  { id: 'j2', detailAccountId: 'c1', subsidiaryCode: '1101', debitAmount: 0, creditAmount: 200e6, status: 'POSTED' },
  { id: 'j3', detailAccountId: 'c1', subsidiaryCode: '2101', debitAmount: 0, creditAmount: 50e6, status: 'POSTED' },
  { id: 'j4', detailAccountId: 'sup1', subsidiaryCode: '2101', debitAmount: 10e6, creditAmount: 90e6, status: 'POSTED' },
];
const cL = buildFinancial360({ ...base(), journalLines: ledger }, { kind: 'CUSTOMER', id: 'c1' }, { now: NOW, viewer: ALL });
eq(f(cL, 'credit.balance').value, 450e6, 'مانده = Σبدهکار − Σبستانکار همهٔ معین‌ها');
eq(/بدهکار/.test(f(cL, 'credit.balance').basis), true, 'ماهیت بدهکار در توضیح');
eq(f(cL, 'credit.overdue').value, null, 'سررسیدگذشته از فاکتور ساخته نمی‌شود'); eq(f(cL, 'credit.notDue').value, null, 'سررسیدنرسیده از فاکتور ساخته نمی‌شود');
const sL = buildFinancial360({ ...base(), journalLines: ledger, suppliers: [{ id: 'sup1', name: 'تأمین' }], supplierBills: [{ id: 'b1', supplierId: 'sup1', totalAmount: 999e6 }] }, { kind: 'SUPPLIER', id: 'sup1' }, { now: NOW, viewer: ALL });
eq(f(sL, 'supplier.balance').value, -80e6, 'مانده تأمین‌کننده از گردش مالی (بستانکار=منفی)، نه از صورتحساب');
// i1: ۱۰ روز؛ i2: ۴۶ روز؛ i4 بدون تخصیص → کنار گذاشته می‌شود؛ i3 باز → خارج
eq(f(c360, 'credit.avgDays').value, 28, 'میانگین ساده: (10+46)/2'); eq(f(c360, 'credit.avgDays').quality, 'PARTIAL', 'ناقص چون i4 تاریخ تسویه ندارد');
const w = buildFinancial360(base(), { kind: 'CUSTOMER', id: 'c1' }, { now: NOW, viewer: ALL, avgMethod: 'WEIGHTED' });
eq(f(w, 'credit.avgDays').value, Math.round(((10 * 100 + 46 * 300) / 400) * 10) / 10, 'میانگین موزون بر مبلغ');
eq(f(c360, 'credit.settledPct').value, 75, '۳ از ۴ فاکتور تسویه‌شده');
eq(f(c360, 'credit.onTime').value, 50, 'خوش‌حسابی: i1 به‌موقع، i2 دیرکرد');
eq(f(c360, 'credit.bounced').value, 1, 'برگشتی فقط دریافتنی'); eq(f(c360, 'credit.priorRequests').value, null, 'درخواست اعتبار قبلی بدون منبع = null');
eq(f(buildFinancial360({ ...base(), invoices: [] }, { kind: 'CUSTOMER', id: 'c1' }, { now: NOW, viewer: ALL }), 'credit.balance').value, null, 'بدون گردش مالی مانده نامشخص نه صفر');

// ───── مرخصی ─────
eq(leaveDays('2026-11-15', '2026-11-17'), 3, 'روزهای مرخصی'); eq(leaveDays('2026-11-17', '2026-11-15'), null, 'بازه معکوس');
const lv = base();
lv.internalRequests = [
  { id: 'L1', type: 'LEAVE', creatorId: 'u1', status: 'IN_REVIEW', title: 'م', data: { startDate: '2026-11-15', endDate: '2026-11-17' }, createdAt: '2026-11-10' },
  { id: 'L0', type: 'LEAVE', creatorId: 'u1', status: 'APPROVED', title: 'م', data: { startDate: '2026-03-01', endDate: '2026-03-02' }, createdAt: '2026-02-20' },
  { id: 'L2', type: 'LEAVE', creatorId: 'u1', status: 'IN_REVIEW', title: 'م', data: { startDate: '2026-12-01', endDate: '2026-12-02' }, createdAt: '2026-11-11' },
  { id: 'L3', type: 'LEAVE', creatorId: 'u2', status: 'APPROVED', title: 'م', data: { startDate: '2026-11-16', endDate: '2026-11-16' }, createdAt: '2026-11-01' },
];
let lc = buildApprovalContext(lv, { kind: 'INTERNAL_REQUEST', id: 'L1' }, { now: NOW, viewer: ALL });
eq(f(lc, 'leave.quota').value, null, 'سهمیه نامشخص'); eq(f(lc, 'leave.usable').value, null, 'مانده نامشخص بدون سهمیه');
eq(f(lc, 'leave.pending').value, 2, 'در انتظارها (به‌جز خود درخواست)'); eq(f(lc, 'leave.approvedUncounted').value, 2, 'تأییدشده لحاظ‌نشده');
eq(f(lc, 'leave.teamOverlap').value, 1, 'تداخل با هم‌تیمی'); eq(lc.amountRials, 3, 'مبلغ=تعداد روز');
lv.leaveEntitlements = [{ id: 'e1', userId: 'u1', year: 2026, annualDays: 26, consumedDays: 10 }];
lc = buildApprovalContext(lv, { kind: 'INTERNAL_REQUEST', id: 'L1' }, { now: NOW, viewer: ALL });
eq(f(lc, 'leave.usable').value, 14, '۲۶−۱۰−۲ (در انتظار کسر نمی‌شود)'); eq(f(lc, 'leave.plannable').value, 12, 'ظرفیت قابل برنامه‌ریزی');
lv.internalRequests[1].data.balanceAppliedAt = '2026-03-03';
lc = buildApprovalContext(lv, { kind: 'INTERNAL_REQUEST', id: 'L1' }, { now: NOW, viewer: ALL });
eq(f(lc, 'leave.usable').value, 16, 'تأییدشده‌ای که در مانده لحاظ شده دوباره کسر نمی‌شود');

// ───── بودجه ─────
const bd = base();
bd.expenseBudgets = [{ id: 'b1', scopeType: 'CATEGORY', scopeId: 'حمل', periodStart: '2026-11-01', periodEnd: '2026-11-30', approvedAmountRials: 100e6, perRequestLimitRials: 20e6 }];
bd.expenses = [
  { id: 'e1', category: 'حمل', amount: 40e6, date: '2026-11-03', status: 'PAID', title: 'کرایه' },
  { id: 'e2', category: 'حمل', amount: 25e6, date: '2026-11-05', dueDate: '2026-11-20', status: 'DUE', title: 'آتی' },
  { id: 'e3', category: 'سایر', amount: 99e6, date: '2026-11-05', status: 'PAID' },
];
bd.internalRequests = [
  { id: 'R1', type: 'EXPENSE', creatorId: 'u1', status: 'IN_REVIEW', title: 'هزینه', data: { amount: 15e6, category: 'حمل' }, createdAt: '2026-11-11' },
  { id: 'R2', type: 'EXPENSE', creatorId: 'u2', status: 'APPROVED', title: 'تأییدشده', data: { amount: 10e6, category: 'حمل' }, createdAt: '2026-11-08' },
  { id: 'R3', type: 'EXPENSE', creatorId: 'u2', status: 'APPROVED', title: 'لینک‌شده', data: { amount: 7e6, category: 'حمل', linkedExpenseId: 'e2' }, createdAt: '2026-11-08' },
];
const bc = buildApprovalContext(bd, { kind: 'INTERNAL_REQUEST', id: 'R1' }, { now: NOW, viewer: ALL });
eq([f(bc, 'budget.approved').value, f(bc, 'budget.final').value, f(bc, 'budget.committed').value, f(bc, 'budget.request').value], [100e6, 40e6, 35e6, 15e6], 'سه عدد جدا: قطعی/تعهد/درخواست؛ لینک‌شده شمرده نمی‌شود');
eq(f(bc, 'budget.remaining').value, 25e6, 'باقی‌مانده'); ok(!f(bc, 'budget.limit').note, 'درخواست ۱۵م ≤ سقف ۲۰م');
eq(f(buildApprovalContext(base(), { kind: 'INTERNAL_REQUEST', id: 'x' }, { now: NOW, viewer: ALL }) ?? { sections: [{ facts: [{ key: 'budget.approved', value: 'NA' }] }] }, 'budget.approved').value, 'NA', 'درخواست ناموجود null');
const nb = buildApprovalContext({ ...bd, expenseBudgets: [] }, { kind: 'INTERNAL_REQUEST', id: 'R1' }, { now: NOW, viewer: ALL });
eq([f(nb, 'budget.approved').value, f(nb, 'budget.final').value], [null, null], 'بدون بودجه مصوب: اعداد نامشخص (نه صفر)');

// ───── طبقه‌بندی و نگاشت ─────
const coa = [
  { code: '1', name: 'دارایی‌ها', level: 1, parentCode: null, isActive: true }, { code: '11', name: 'دارایی‌های جاری', level: 2, parentCode: '1', isActive: true },
  { code: '110301', name: 'حساب‌های دریافتنی کارکنان', level: 4, parentCode: '11', isActive: true }, { code: '5', name: 'هزینه‌ها', level: 1, parentCode: null, isActive: true },
  { code: '5201', name: 'هزینه حمل', level: 3, parentCode: '5', isActive: true }, { code: '5202', name: 'هزینه حمل شعبه', level: 3, parentCode: '5', isActive: false },
];
const S = { coaMirror: coa, paymentNatureMappings: [] };
const adv = { nature: 'PERSONNEL_ADVANCE', fields: { employeeId: 'u1' }, at: NOW.toISOString() };
eq(resolveAccountingMapping(S, { nature: 'Z' }).status, 'UNKNOWN_NATURE', 'ماهیت نامعتبر');
eq(resolveAccountingMapping(S, { nature: 'PERSONNEL_ADVANCE', fields: {} }).status, 'INCOMPLETE', 'کارمند انتخاب نشده');
eq(resolveAccountingMapping(S, { nature: 'FUEL', fields: {} }).status, 'INCOMPLETE', 'یکی از خودرو/واحد/مرکز هزینه');
eq(resolveAccountingMapping(S, { nature: 'FUEL', fields: { unitId: 'u' } }).status, 'UNMAPPED', 'کامل ولی بدون نگاشت → مسدود');
eq(resolveAccountingMapping(S, adv).blocking, true, 'بدون نگاشت مسدود');
const M = (o) => ({ id: 'm' + Math.random(), nature: 'PERSONNEL_ADVANCE', version: 1, status: 'ACTIVE', effectiveFrom: '2026-01-01', debitAccountCode: '110301', detailField: 'employeeId', ...o });
let r = resolveAccountingMapping({ ...S, paymentNatureMappings: [M({ id: 'mA' })] }, adv);
eq([r.status, r.blocking, r.groupName, r.accountName, r.detail], ['MAPPED', false, 'دارایی‌ها', 'حساب‌های دریافتنی کارکنان', { field: 'employeeId', id: 'u1' }], 'نگاشت مساعده: دارایی/دریافتنی کارکنان/تفصیلی کارمند (مساعده ≠ هزینه)');
eq(resolveAccountingMapping({ ...S, paymentNatureMappings: [M({ effectiveTo: '2026-06-30' })] }, adv).status, 'UNMAPPED', 'نگاشت منقضی');
eq(resolveAccountingMapping({ ...S, paymentNatureMappings: [M({ status: 'DRAFT' })] }, adv).status, 'UNMAPPED', 'نگاشت پیش‌نویس');
eq(resolveAccountingMapping({ ...S, paymentNatureMappings: [M({ debitAccountCode: '9999' })] }, adv).status, 'INVALID_ACCOUNT', 'حساب ناموجود');
eq(resolveAccountingMapping({ ...S, paymentNatureMappings: [M({ nature: 'OPERATING_EXPENSE', debitAccountCode: '5202' })] }, { nature: 'OPERATING_EXPENSE', fields: { expenseType: 'حمل', costCenterId: 'cc' } }).status, 'INVALID_ACCOUNT', 'حساب غیرفعال');
eq(resolveAccountingMapping({ ...S, paymentNatureMappings: [M({ id: 'x' }), M({ id: 'y', debitAccountCode: '5201' })] }, adv).status, 'AMBIGUOUS', 'دو نگاشت هم‌اولویت متفاوت');
r = resolveAccountingMapping({ ...S, paymentNatureMappings: [M({ id: 'gen' }), M({ id: 'br', debitAccountCode: '5201', scope: { branchId: 'b1' } })] }, { ...adv, scope: { branchId: 'b1' } });
eq([r.status, r.mappingId], ['MAPPED', 'br'], 'نگاشت اختصاصی شعبه مقدم است');
r = resolveAccountingMapping({ ...S, paymentNatureMappings: [M({ id: 'v1' }), M({ id: 'v2', version: 2 })] }, adv); eq(r.mappingVersion, 2, 'آخرین نسخه');
eq(resolveAccountingMapping({ ...S, paymentNatureMappings: [M({ id: 'br', scope: { branchId: 'b1' } })] }, { ...adv, scope: { branchId: 'b2' } }).status, 'UNMAPPED', 'خارج از محدوده شعبه');
eq(resolveAccountingMapping({ ...S, paymentNatureMappings: [] }, { nature: 'SUPPLIER_PAYMENT', fields: { supplierId: 's' } }).recommendedMissing, ['invoiceRef'], 'فاکتور توصیه‌شده');

// ───── دستور پرداخت: مسدودسازی تأیید ─────
const { decideFinanceRequest, buildFinanceRequest } = await import('../src/lib/financeRequests.ts');
const fs1 = { accounts: [], financeRequests: [], coaMirror: coa, paymentNatureMappings: [] };
const rec = buildFinanceRequest({ kind: 'PAYMENT_ORDER', payeeName: 'علی', amount: 20e6, reason: 'مساعده', requestedBy: 'u1', nature: 'PERSONNEL_ADVANCE', classificationFields: { employeeId: 'u1' } }, 'f1', NOW);
fi.classifyFinanceRequestRecord(fs1, rec, NOW); fs1.financeRequests.push(rec);
eq(rec.accounting.blocking, true, 'بدون نگاشت blocking');
eq(decideFinanceRequest(fs1, 'f1', 'APPROVE', '', 'acct', NOW).ok, false, 'تأیید نهایی مسدود');
eq(decideFinanceRequest(fs1, 'f1', 'REJECT', 'نگاشت ندارد', 'acct', NOW).ok, true, 'رد همچنان ممکن');
const fs2 = { ...fs1, financeRequests: [], paymentNatureMappings: [M({ id: 'mA' })] };
const rec2 = buildFinanceRequest({ kind: 'PAYMENT_ORDER', payeeName: 'علی', amount: 20e6, reason: 'مساعده', requestedBy: 'u1', nature: 'PERSONNEL_ADVANCE', classificationFields: { employeeId: 'u1' } }, 'f2', NOW);
fi.classifyFinanceRequestRecord(fs2, rec2, NOW); fs2.financeRequests.push(rec2);
eq(decideFinanceRequest(fs2, 'f2', 'APPROVE', '', 'acct', NOW).ok, true, 'با نگاشت معتبر تأیید می‌شود');
const legacy = buildFinanceRequest({ kind: 'PAYMENT_ORDER', payeeName: 'x', amount: 1, reason: 'y', requestedBy: 'u1' }, 'f3', NOW); eq('accounting' in legacy, false, 'رکورد قدیمی بدون تغییر');

// ───── صف و تطبیق حسابداری ─────
const ex = { ...fs2, outbox: [], accountingExportLogs: [] };
const res = resolveAccountingMapping(ex, adv);
eq(enqueueAccountingExport(ex, { sourceType: 'FINANCE_REQUEST', sourceId: 'f2', amountRials: 20e6, resolution: resolveAccountingMapping(S, adv), classification: adv }, NOW).ok, false, 'بدون نگاشت ارسال نمی‌شود');
const q1 = enqueueAccountingExport(ex, { sourceType: 'FINANCE_REQUEST', sourceId: 'f2', amountRials: 20e6, resolution: res, classification: adv, actorId: 'acct' }, NOW);
eq([q1.ok, q1.log.status, q1.log.erpStatus, q1.log.erpDocumentId], [true, 'QUEUED', 'NOT_CONFIGURED', null], 'در صف؛ هنوز سند ERP ندارد (SENT جعلی نداریم)');
eq(enqueueAccountingExport(ex, { sourceType: 'FINANCE_REQUEST', sourceId: 'f2', amountRials: 20e6, resolution: res, classification: adv }, NOW).log.id, q1.log.id, 'ضدتکرار');
eq([ex.outbox.length, ex.accountingExportLogs.length, ex.outbox[0].status], [1, 1, 'PENDING'], 'Outbox موجود استفاده شد');
eq(applyAccountingAcknowledgement(ex, q1.log.id, { outcome: 'ACCEPTED' }, NOW).ok, false, 'پذیرش بدون شناسه سند');
eq(applyAccountingAcknowledgement(ex, q1.log.id, { outcome: 'ACCEPTED', erpDocumentId: 'D-1', erpAmountRials: 19e6 }, NOW).ok, true, 'پذیرش');
eq([ex.accountingExportLogs[0].status, ex.accountingExportLogs[0].reconciliation, ex.outbox[0].status], ['ACKNOWLEDGED', 'MISMATCH', 'SENT'], 'مغایرت مبلغ ثبت می‌شود');
eq(applyAccountingAcknowledgement(ex, q1.log.id, { outcome: 'REJECTED' }, NOW).ok, false, 'پاسخ دوم رد می‌شود');
const ex2 = { ...fs2, outbox: [], accountingExportLogs: [] }; const q2 = enqueueAccountingExport(ex2, { sourceType: 'FINANCE_REQUEST', sourceId: 'f9', amountRials: 5e6, resolution: res, classification: adv }, NOW);
applyAccountingAcknowledgement(ex2, q2.log.id, { outcome: 'REJECTED', errors: ['حساب بسته'] }, NOW); eq([ex2.accountingExportLogs[0].status, ex2.accountingExportLogs[0].errors], ['REJECTED', ['حساب بسته']], 'رد ERP');
const ex3 = { ...fs2, outbox: [], accountingExportLogs: [] }; const q3 = enqueueAccountingExport(ex3, { sourceType: 'FINANCE_REQUEST', sourceId: 'f8', amountRials: 5e6, resolution: res, classification: adv }, NOW);
applyAccountingAcknowledgement(ex3, q3.log.id, { outcome: 'ACCEPTED', erpDocumentId: 'D-2', erpAmountRials: 5e6 }, NOW); eq(ex3.accountingExportLogs[0].reconciliation, 'RECONCILED', 'تطبیق موفق');

// ───── Snapshot سایر درخواست‌ها ─────
const sn = base(); sn.internalRequests = lv.internalRequests;
ok(snapshotRequestDecision(sn, { kind: 'INTERNAL_REQUEST', id: 'L1' }, 'REJECT', 'mgr', undefined, NOW, { viewer: ALL }), 'Snapshot مرخصی'); eq(sn.approvalSnapshots.length, 1, 'ثبت');
eq(snapshotRequestDecision(sn, { kind: 'INTERNAL_REQUEST', id: 'none' }, 'REJECT', 'mgr', undefined, NOW, { viewer: ALL }), null, 'درخواست ناموجود');
eq(fnv1a('a'), fnv1a('a'), 'هش قطعی'); ok(fnv1a('a') !== fnv1a('b'), 'هش متفاوت');

// ───── قراردادهای سیم‌کشی (ایستا) ─────
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const dp = read('src/services/dataProvider.ts');
for (const m of ['getApprovalContext', 'getFinancial360', 'previewAccountingMapping', 'recordApprovalSnapshot']) ok((dp.match(new RegExp(`async ${m}\\(`, 'g')) || []).length === 2, `${m} در هر دو Provider`);
ok(/interface DataProvider[\s\S]*getApprovalContext/.test(dp), 'اینترفیس DataProvider');
const reg = JSON.parse(read('src/config/stateCollections.json')).collections;
for (const k of ['approvalSnapshots', 'paymentNatureMappings', 'accountingExportLogs', 'expenseBudgets', 'personnelLedgerEntries', 'creditLimitRequests', 'leaveEntitlements']) ok(reg[k], `کالکشن ${k} در رجیستری SQL-first`);
ok(read('src/components/InternalAutomationWorkspace.tsx').includes('FinancialContextPanel'), 'کارتابل درخواست‌ها');
ok(read('src/components/onboarding/OnboardingAdminWorkspace.tsx').includes('AdvanceDecisionPanel'), 'تأیید مساعده');
ok(read('src/components/FinanceWorkspace.tsx').includes('FinancialContextPanel'), 'دستور پرداخت');
ok(read('src/components/Customer360.tsx').includes('FinancialContextPanel'), 'Customer 360');
ok(!/from '\.\/storage|useAppStore|localStorage/.test(read('src/lib/financialIntelligence.ts')), 'موتور وابسته به ذخیره‌ساز نیست');
console.log(`PASS: ${n} assertions (financial intelligence)`);
