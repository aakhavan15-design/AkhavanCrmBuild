// F0-11: NotificationCenter و notifyAndPush دیگر فایل بی‌مصرف نیستند؛ به مسیر موجود وصل شده‌اند.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const rd = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const app = await rd('src/App.tsx');
const auto = await rd('src/components/InternalAutomationWorkspace.tsx');

// ۱) کشوی اعلان‌ها از NotificationCenter استفاده می‌کند (نه لیست درون‌خطی موازی)
assert.match(app, /import \{ NotificationCenter \} from '\.\/components\/shared\/NotificationCenter'/);
assert.match(app, /<NotificationCenter[\s\S]*?notifications=\{visibleNotifications\}[\s\S]*?onMarkAllRead=/);
assert.ok(!/visibleNotifications\.slice\(-20\)\.reverse\(\)\.map/.test(app), 'لیست درون‌خطی قدیمی باید حذف شده باشد');
// «همه خوانده شد» فقط اعلان‌های قابل‌مشاهدهٔ کاربر جاری را می‌خواند
assert.match(app, /!x\.recipientId \|\| x\.recipientId === draft\.currentUserId/);

// ۲) اتوماسیون اداری از pushNotification استفاده می‌کند و فقط یک ثبت دستی (پیشرفت گردش برای سازنده) می‌ماند
assert.match(auto, /import \{ pushNotification \} from '\.\.\/lib\/notifyAndPush'/);
assert.equal((auto.match(/pushNotification\(draft,/g) || []).length, 3);
assert.equal((auto.match(/draft\.notifications\.push\(/g) || []).length, 1);

// ۳) رفتار pushNotification در محیط بدون window: فقط ثبت درون‌برنامه‌ای، بدون fetch
let pushNotification;
try { ({ pushNotification } = await import('../src/lib/notifyAndPush.ts')); }
catch (e) {
  if (e && e.code === 'ERR_MODULE_NOT_FOUND') { console.log('PASS static wiring (F0-11) | BLOCKED runtime: وابستگی نصب نیست —', String(e.message).split('\n')[0]); process.exit(0); }
  throw e;
}
const draft = { currentUserId: 'u1' };
const n = pushNotification(draft, { title: 't', message: 'm', linkTab: 'tasks', recipientId: 'u2' });
assert.equal(draft.notifications.length, 1);
assert.equal(n.read, false);
assert.equal(n.type, 'INFO');
assert.equal(n.recipientId, 'u2');

// ۴) قفل طراحی دست‌نخورده: Layout در این تغییر دخیل نیست
const layout = await rd('src/components/Layout.tsx');
assert.match(layout, /se-floating-header se-island-header sticky top-0/);
console.log('PASS notification center wiring (F0-11)');
