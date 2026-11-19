import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const layout = await readFile(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const header = layout.slice(layout.indexOf('Floating island header'), layout.indexOf('{/* Local-First Offline Sync status */}'));

// Floating island header: transparent, zero-height sticky host so content flows underneath.
assert.match(layout, /se-floating-header se-island-header sticky top-0/);
assert.match(layout, /data-scrolled=\{headerScrolled \? 'true' : 'false'\}/);
assert.match(css, /\.se-floating-header\.se-island-header\s*\{[\s\S]*?height: 0 !important/);
assert.match(css, /\.se-island-clearance\s*\{\s*padding-top:/);
assert.match(layout, /se-island-clearance/);

// Right: double capsule with menu + the single create entry.
const capsule = header.slice(header.indexOf('se-island se-island-capsule'), header.indexOf('se-island-title'));
assert.match(capsule, /id="mb0"/);
assert.match(capsule, /<Plus size=\{20\}/);
assert.doesNotMatch(capsule, /<Bell|<MessageCircle/);

// Left: two separate islands, notification and chat, each opening a minimal drop-down.
assert.match(header, /<Bell size=\{19\}/);
assert.match(header, /<MessageCircle size=\{19\}/);
assert.equal((header.match(/se-island se-island-btn/g) || []).length, 2);
assert.match(header, /setPanel\(value => \(value === 'notifications'/);
assert.match(header, /setPanel\(value => \(value === 'chat'/);
assert.match(header, /ورود به صفحه چت/);
assert.match(header, /ورود به صفحه اعلان‌ها/);
assert.match(header, /onNotificationClick\?\.\(n\)/);
assert.match(header, /onOpenNotifications\?\.\(\)/);
assert.match(css, /\.se-island-panel\s*\{/);

// No profile avatar in the header, and no fabricated chat preview text.
assert.doesNotMatch(header, /پروفایل کاربر|navigate\('\/profile'\)/);
assert.doesNotMatch(layout, /پیام جدید در گفتگوهای سازمانی دریافت شد/);

// App feeds the drop-down with the real, recipient-filtered notifications.
assert.match(app, /notifications=\{visibleNotifications\}/);
assert.match(app, /onNotificationClick=\{handleNotificationClick\}/);
assert.match(css, /\.se-header-create\s*\{\s*color: var\(--c-header-accent/);
console.log('PASS floating island header contracts');
