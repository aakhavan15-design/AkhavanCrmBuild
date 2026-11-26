import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BUSINESS_TIME_ZONE, calendarDayKey, calculateDaysOverdue } from '../src/services/collectionDateUtils.ts';
import { generateSecureId } from '../src/lib/secureId.ts';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const demo = read('src/components/DemoDataPanel.tsx');
assert.ok(!/\|\|\s*true\b/.test(demo.replace(/\/\/.*$/gm, '')), 'demo panel must not have unconditional access');
assert.match(demo, /allowed = canManage && demoContext/);
assert.match(demo, /if \(!canManage\) return/);

const server = read('server/index.mjs');
assert.match(server, /x-content-type-options/);
assert.match(server, /passwordMatches\(password, DUMMY_SALT_HEX, DUMMY_HASH_HEX\)/);
assert.match(server, /timingSafeEqual/);

const ids = read('src/lib/utils.ts');
assert.match(read('src/lib/secureId.ts'), /cryptoApi\.getRandomValues/);
assert.ok(!read('src/lib/secureId.ts').includes('Math.random('));
const secureIds = [generateSecureId('test'), generateSecureId('test')];
assert.ok(secureIds.every(id => /^test_[0-9a-f]{32}$/.test(id)));
assert.notEqual(secureIds[0], secureIds[1]);
for (const file of [
  'src/lib/events.ts','src/lib/accountingMapping.ts',
  'src/components/OperationsSupplementalTabs.tsx','src/components/OperationsControlWorkspace.tsx'
]) assert.match(read(file), /generateSecureId/);
assert.match(read('src/lib/offline.ts'), /generateSecureId\('offline'\)/);
assert.match(read('src/services/churnPredictionService.ts'), /generateSecureId\('id'\)/);

const finance = read('src/components/FinanceWorkspace.tsx');
assert.match(finance, /const today = toLocalDateISO\(\)/);
assert.ok(!/toISOString\(\)\.slice\(0, 10\)/.test(finance));

const customers = read('src/components/CustomersWorkspace.tsx');
assert.doesNotMatch(customers, /متصل به سامانه مالی|اتصال سامانه مالی|وضعیت اتصال نامشخص/);
assert.match(customers, /selectable renderDetail/);
assert.match(customers, /canOn\('accounts', 'VIEW'/);
assert.match(customers, /searchSuggestions/);
assert.match(customers, /resolveCustomerBalanceView\(detailBalances, account\)/);
assert.doesNotMatch(customers, /invoice\.balance/, 'customer receivable view must use scoped ledger evidence, not invoice mirror balances');
const modal = read('src/components/ui/Modal.tsx');
assert.match(modal, /key === 'Escape'/);
assert.match(modal, /z-\(--z-modal\)/);
assert.match(read('src/theme/colors.css'), /--z-modal: 100;/);
assert.match(modal, /safe-area-inset-bottom/);
const nav = read('src/components/BottomNav.tsx');
assert.match(nav, /canAccess \? NAV_ITEMS\.filter/);
assert.match(nav, /text-primary/);
assert.ok(!nav.includes('#12151E'), 'bottom nav uses theme tokens rather than hard-coded dark colors');
assert.match(read('src/index.css'), /\.se-bottom-nav/);

assert.equal(calculateDaysOverdue('bad', new Date('2026-11-06T12:00:00Z')), 0);
assert.equal(calculateDaysOverdue('2026-11-05', new Date('2026-11-06T12:00:00Z')), 1);
const tehranReference = new Date('2026-11-05T22:00:00.000Z'); // 01:30 next day in Tehran
assert.equal(calendarDayKey(tehranReference, BUSINESS_TIME_ZONE), '2026-11-06');
assert.equal(calculateDaysOverdue('2026-11-05', tehranReference, BUSINESS_TIME_ZONE), 1);
assert.equal(calculateDaysOverdue('2026-11-05', tehranReference), 0, 'default UTC contract is unchanged');
console.log('audit2026Contracts.test.mjs: all assertions passed');
