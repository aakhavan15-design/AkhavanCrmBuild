import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load = relative => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');
const [layout, app, css, header, drawer, actions] = await Promise.all([
  load('src/components/Layout.tsx'), load('src/App.tsx'), load('src/index.css'),
  load('src/components/header/FloatingHeader.tsx'), load('src/components/NavigationDrawer.tsx'),
  load('src/lib/headerQuickActions.ts'),
]);

assert.equal((layout.match(/<FloatingHeader\b/g) || []).length, 1);
assert.match(layout, /se-island-clearance/);
assert.match(css, /\.se-floating-header\.se-island-header\s*\{[^}]*height: 0 !important/);
assert.match(css, /\.se-island-clearance\s*\{\s*padding-top:/);
assert.match(header, /data-scrolled=\{scrolled\}/);

const capsule = header.slice(header.indexOf('se-island se-island-capsule'), header.indexOf('se-island-title'));
assert.match(capsule, /id="mb0"/);
assert.equal((capsule.match(/<Plus\b/g) || []).length, 1);
assert.match(capsule, /quickAction\.path/);
assert.doesNotMatch(capsule, /<Avatar|<Bell|<MessageCircle/);
assert.match(drawer, /id="main-navigation-drawer"/);
assert.match(drawer, /useOverlayDialog\(isOpen, dialogRef, onClose\)/);

for (const kind of ['account', 'notifications', 'chat']) {
  assert.ok(header.includes(`show('${kind}', event.currentTarget)`));
}
assert.equal((header.match(/className="se-island se-island-btn\b/g) || []).length, 3);
assert.match(header, /headerPreview: target/);
assert.match(header, /navigate\(-1\)/);
assert.match(header, /se-header-dismiss[\s\S]*?onClick=\{close\}/);
assert.match(header, /aria-labelledby="header-preview-title"/);
assert.match(header, /group\.memberIds\?\.includes\(me\)/);
assert.match(header, /message\.readBy\?\.includes\(me\)/);
assert.match(header, /مشاهده همه اعلان‌ها/);
assert.match(header, /ورود به چت/);
assert.match(app, /notifications=\{visibleNotifications\}/);
assert.match(actions, /create-conversation.*\/groups\?new=1/);
assert.match(css, /\.se-island-panel\s*\{[^}]*--app-viewport-height/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
console.log('PASS floating header contracts');
