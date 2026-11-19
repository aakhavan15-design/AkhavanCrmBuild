// F0-07: ثبت مشتری محلی = پیش‌نویس + پیشنهاد به ERP؛ تطبیق تکراری؛ قرارداد با server/index.mjs.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { matchExistingCustomers } from '../src/lib/enterprise.ts';
import { proposalStatusOf, buildCustomerProposalRequest, customerProposalIdempotencyKey, readCustomerProposalReceipt, CUSTOMER_PROPOSAL_STATUS_LABEL } from '../src/lib/customerProposal.ts';

const accounts = [
  { id: 'a1', name: 'شرکت كاشی ایران', nationalCode: '۱۲۳۴۵۶۷۸۹۰', phone: '09121234567', code: 'C-100', origin: 'ERP' },
  { id: 'a2', name: 'فروشگاه نور', economicCode: '411111111111', phone: '021-5551234' },
  { id: 'a3', name: 'حذف‌شده', nationalCode: '9999999999', deletedAt: '2026-01-01' },
];
// کد ملی با ارقام فارسی/لاتین = قطعی
const m1 = matchExistingCustomers(accounts, { name: 'x', nationalCode: '1234567890' });
assert.equal(m1.length, 1); assert.equal(m1[0].reason, 'NATIONAL_CODE'); assert.equal(m1[0].hard, true);
// کد اقتصادی قطعی
assert.equal(matchExistingCustomers(accounts, { name: 'y', economicCode: '411111111111' })[0].hard, true);
// نام با ي/ك عربی و فاصلهٔ اضافه = هشدار نرم
const m2 = matchExistingCustomers(accounts, { name: 'شرکت  کاشی ایران' });
assert.equal(m2[0].reason, 'NAME'); assert.equal(m2[0].hard, false);
// تلفن نرم؛ رکورد حذف‌شده نادیده؛ ورودی کوتاه/خالی تطبیق نمی‌دهد
assert.equal(matchExistingCustomers(accounts, { name: 'z', phone: '۰۹۱۲۱۲۳۴۵۶۷' })[0].reason, 'PHONE');
assert.equal(matchExistingCustomers(accounts, { name: 'q', nationalCode: '9999999999' }).length, 0);
assert.equal(matchExistingCustomers(accounts, { name: 'ab', nationalCode: '123' }).length, 0);

// وضعیت پیشنهاد: بدون کد رسمی ERP هرگز «تأییدشده» نیست
assert.equal(proposalStatusOf({ id: 'n', origin: 'CRM_LOCAL', isLocalDraft: true, code: 'FAKE-1' }), 'LOCAL_DRAFT');
assert.equal(proposalStatusOf({ id: 'n', origin: 'CRM_LOCAL', isLocalDraft: true, erpProposalStatus: 'PENDING_ERP_REVIEW' }), 'PENDING_ERP_REVIEW');
assert.equal(proposalStatusOf({ id: 'e', code: 'C-1', origin: 'ERP' }), 'ERP_CONFIRMED');
assert.equal(proposalStatusOf({ id: 'u' }), null);
assert.equal(proposalStatusOf({ id: 'u', code: 'LOCAL-CODE' }), null);
assert.ok(CUSTOMER_PROPOSAL_STATUS_LABEL.LOCAL_DRAFT.includes('ERP'));

// بدنهٔ پیشنهاد مطابق قرارداد سرور
const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const receipt = { data: { proposalId: uuid }, operation: { eventId: uuid, status: 'WAITING_FOR_ERP_REVIEW', canonicalRecordCreated: false } };
assert.deepEqual(readCustomerProposalReceipt(receipt), { proposalId: uuid, eventId: uuid });
assert.equal(readCustomerProposalReceipt({ ...receipt, operation: { ...receipt.operation, canonicalRecordCreated: true } }), null);
assert.equal(readCustomerProposalReceipt({ ...receipt, operation: { ...receipt.operation, eventId: 'pending' } }), null);
const r = buildCustomerProposalRequest({ id: 'abc123xyz', name: ' مشتری ', phone: '0912', email: 'bad', ownerId: uuid });
assert.deepEqual(r.body, { name: 'مشتری', accountCode: null, phone: '0912', email: null, ownerUserId: uuid });
assert.equal(buildCustomerProposalRequest({ id: 'x', name: '  ' }), null);
assert.equal(buildCustomerProposalRequest({ id: 'x', name: 'n', ownerId: 'not-uuid' }).body.ownerUserId, null);
for (const id of ['a', 'id with space/و', generateLong()]) assert.match(customerProposalIdempotencyKey(id), /^[A-Za-z0-9._:-]{8,128}$/);
assert.equal(customerProposalIdempotencyKey('k1'), customerProposalIdempotencyKey('k1'));
function generateLong() { return 'z'.repeat(300); }

// سیم‌کشی UI + سرور
const ui = readFileSync('src/components/CustomersWorkspace.tsx', 'utf8');
assert.ok(/matchExistingCustomers\(/.test(ui) && /hard\.reason/.test(ui), 'تطبیق تکراری قبل از ثبت');
assert.ok(/erpProposalStatus: 'LOCAL_DRAFT'/.test(ui));
assert.ok(!/با موفقیت در سامانه ایجاد شد/.test(ui), 'ادعای ساخت مشتری رسمی نباید بماند');
assert.ok(/proposalStatusOf\(a\)/.test(ui), 'نشان پیش‌نویس در فهرست');
const server = readFileSync('server/index.mjs', 'utf8');
assert.ok(server.includes("'/api/v1/accounts'") && server.includes('canonicalRecordCreated: false') && /\{8,128\}/.test(server), 'قرارداد سرور');
assert.match(server, /app\.post\('\/api\/v1\/accounts\/proposals', authenticate, requirePermission\('accounts\.CREATE'\)/);
assert.match(server, /TenantId=@tenantId AND CollectionName=N'accounts' AND EntityId=@draftId[\s\S]+?JSON_VALUE\(JsonDoc, '\$\.ownerId'\)/);
const record = readFileSync('src/components/Customer360.tsx', 'utf8');
assert.match(record, /submitCustomerProposal\(customer\.id\)[\s\S]+?erpProposalStatus = 'PENDING_ERP_REVIEW'/);
assert.match(record, /proposalStatus === 'LOCAL_DRAFT' && customer\.ownerId === state\.currentUserId/);
console.log('customerProposalContract: PASS');
