import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const drawer = read('src/components/NavigationDrawer.tsx');
const css = read('src/index.css');
const design = read('docs/DESIGN_SYSTEM_FA.md');
const instructions = read('INSTRUCTIONS.md');

// The lock itself is documented and discoverable.
assert.match(design, /قفل طراحی \(DESIGN LOCK\)/);
assert.match(instructions, /طراحی قفل‌شده/);
assert.ok(fs.existsSync(new URL('../docs/design-reference/menu-reference-light-dark.jpeg', import.meta.url)), 'menu reference image must stay in the repo');

// Glass menu panel.
assert.match(drawer, /se-menu-panel/);
assert.match(drawer, /backdrop-blur-\[12px\]/);
assert.match(css, /\.se-menu-panel\s*\{[\s\S]*?border-radius: 28px/);

// Toolbar: about + light/dark toggle.
assert.match(drawer, /aria-label="درباره نرم‌افزار"/);
assert.match(drawer, /onClick=\{toggleTheme\}/);
assert.match(drawer, /<Sun size=\{15\}/);
assert.match(drawer, /<Moon size=\{15\}/);
assert.match(drawer, /APP_VERSION_LABEL/);

// Profile: role caption above the user name.
assert.ok(drawer.indexOf('currentRole?.name') < drawer.indexOf('currentUser?.name || \'کاربر سیستم\''));

// Bottom dock: exactly four minimal actions with tiny labels, RBAC-gated, wired to real routes.
assert.equal((drawer.match(/<DockButton /g) || []).length, 4);
for (const [label, route] of [
  ['ثبت درخواست سازمانی', "go('/internal_automation?new=1')"],
  ['ثبت تسک', "go('/tasks?new=1')"],
  ['دستور پرداخت', "go('/finance?tab=requests')"],
  ['میز مذاکره', "go('/opportunities')"],
]) {
  assert.ok(drawer.includes(`label="${label}"`), `dock label ${label}`);
  assert.ok(drawer.includes(route), `dock route ${route}`);
}
for (const perm of ["canAccess('internal_automation')", "canAccess('tasks')", "canAccess('finance')", "canAccess('leads')"]) assert.ok(drawer.includes(perm), `dock RBAC ${perm}`);
assert.doesNotMatch(drawer, /ثبت تسک یا پیگیری جدید/, 'old single footer button is retired');
assert.match(css, /\.se-menu-dock\s*\{/);

// Real data only.
assert.match(drawer, /const directContacts = \(state\?\.users \|\| \[\]\)/);
assert.doesNotMatch(drawer, /bg-success|bg-green|online/i, 'no fabricated presence indicators');
console.log('PASS design lock contracts');
