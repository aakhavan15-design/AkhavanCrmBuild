import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const marketing = read('src/components/EnterpriseWorkspaces.tsx');
assert.match(marketing, /بازاریابی و مدیریت کمپین‌ها/);
assert.match(marketing, /فروش منتسب، نرخ تبدیل علّی، بودجه مصرف‌شده و ROI نمایش داده نمی‌شود/);
assert.match(marketing, /campaign-audience:/);
assert.match(marketing, /ارزیابی جامعه هدف/);
assert.doesNotMatch(marketing, /ROI برآوردی|5050000000|850000000|CMP-001/);

const onboarding = read('src/components/onboarding/OnboardingAdminWorkspace.tsx');
assert.match(onboarding, /visibleFiles/);
assert.match(onboarding, /SUBMITTED_FOR_REVIEW/);
assert.match(onboarding, /تأیید مدارک، وضعیت استخدام و فعال‌سازی حساب سه مفهوم جدا هستند/);
assert.doesNotMatch(onboarding, /رضا احمدی|سارا محمدی|ONB-1/);

const settings = read('src/components/SettingsWorkspace.tsx');
assert.match(settings, /PERMISSION_LABELS/);
assert.match(settings, /permissionSets/);
assert.match(settings, /ضد‌دستکاری یا غیرقابل‌تغییر نیست/);
assert.doesNotMatch(settings, /آخرین فعالیت.*new Date\(\)/);

const sw = read('public/serviceWorker.js');
assert.match(sw, /isApiPath/);
assert.match(sw, /API\/business data is always network-only|Business\/API\/auth data is always network-only/);
assert.match(sw, /request\.mode === 'navigate'/);
assert.doesNotMatch(sw, /caches\.open\(CACHE_NAME\)\.then\(cache => cache\.put\(event\.request/);
assert.match(sw, /CACHE_NAME = 'akhavan-crm-shell-v[0-9.]+/);

const main = read('src/main.tsx');
assert.match(main, /navigator\.serviceWorker\.register\('\/serviceWorker\.js'\)/);
const manifest = JSON.parse(read('public/manifest.json'));
assert.equal(manifest.dir, 'rtl');
assert.equal(manifest.lang, 'fa-IR');
assert.equal(manifest.theme_color, '#F8FAFC');
for (const icon of manifest.icons) assert.ok(existsSync(new URL(`../public${icon.src}`, import.meta.url)));

const storage = read('src/lib/storage.ts');
const idb = read('src/lib/idb.ts');
assert.match(storage, /const STORAGE_NAME = 'akhavan_app_state'/);
assert.match(idb, /const DB_NAME = 'akhavan_crm_db'/);
assert.doesNotMatch(storage, /akhavan_crm_enterprise_state/);
assert.doesNotMatch(storage, /idb-keyval/);

console.log('B15-B18 truth contracts: PASS');
