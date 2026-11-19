// Anti-regression: Neo-Slate / Electric Indigo tokens are the single source of colour and type size.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = new URL('../', import.meta.url).pathname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const walk = (dir, out = []) => { for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) { const rel = path.join(dir, e.name); if (e.isDirectory()) walk(rel, out); else out.push(rel); } return out; };

const colors = read('src/theme/colors.css');
const light = colors.slice(0, colors.indexOf('[data-theme="dark"]'));
const dark = colors.slice(colors.indexOf('[data-theme="dark"]'));
// Light roles from DESIGN_SYSTEM_FA.md §1
for (const re of [/--c-canvas: #F8FAFC/, /--c-surface: #FFFFFF/, /--c-border: #E2E8F0/, /--c-ink-main: #0F172A/, /--c-ink-secondary: #334155/, /--c-cobalt: #4F46E5/, /--c-cobalt-dark: #4338CA/, /--c-info: #0EA5E9/]) assert.match(light, re, String(re));
// Dark roles
for (const re of [/--c-canvas: #090D16/, /--c-surface: #111827/, /--c-surface-raised: #1E293B/, /--c-ink-main: #F8FAFC/, /--c-ink-secondary: #CBD5E1/, /--c-cobalt: #6366F1/, /--c-primary-hover: #818CF8/, /--c-info: #38BDF8/]) assert.match(dark, re, String(re));
// Chart palette
for (const hex of ['#4F46E5', '#10B981', '#06B6D4', '#F59E0B', '#F43F5E']) assert.ok(light.includes(`--chart-`) && light.includes(hex), `chart colour ${hex}`);
// Legacy Graphite/Jade values must be gone
assert.doesNotMatch(colors, /#12915F|#0B6B47|#F3F1EA|#2FD08F/i);
// Type-size tokens exist and are wired into Tailwind
for (const t of ['--font-size-micro: 10px', '--font-size-caption: 11px', '--font-size-small: 12px', '--font-size-compact: 13px']) assert.ok(colors.includes(t), t);
const css = read('src/index.css');
for (const t of ['--text-micro', '--text-caption', '--text-small', '--text-compact']) assert.ok(css.includes(t), t);

// No hard-coded hex in component/lib code (seed avatars are data, not UI)
const hexAllowed = new Set(['src/lib/seed.ts']);
for (const f of walk('src').filter((f) => /\.(ts|tsx)$/.test(f) && !hexAllowed.has(f))) {
  assert.doesNotMatch(read(f), /#[0-9a-fA-F]{6}\b/, `${f} contains a hard-coded hex colour`);
}
// No arbitrary text-size utilities outside the locked header/menu files
const locked = new Set(['src/components/Layout.tsx', 'src/components/NavigationDrawer.tsx', 'src/components/BottomNav.tsx', 'src/components/DesktopSidebar.tsx']);
for (const f of walk('src').filter((f) => f.endsWith('.tsx') && !locked.has(f))) {
  assert.doesNotMatch(read(f), /(?<![\w\[-])text-\[(?:9|9\.5|1[0-3]|1[0-3]\.5)px\]/, `${f} uses arbitrary text-[Npx]; use text-nano/tiny/micro/mini/caption/label/small/body/compact`);
}
for (const f of walk('src').filter((f) => f.endsWith('.tsx') && !locked.has(f))) {
  assert.doesNotMatch(read(f), /(?<![\w\[-])(?:min-h|h|min-w|w)-\[(?:44|40|36)px\]|(?<![\w\[-])rounded-\[16px\]/, `${f} uses arbitrary touch/control size or 16px radius; use *-touch/-control/-control-sm or rounded-lg`);
  assert.doesNotMatch(read(f), /(?<![\w-])-(?:touch|control|control-sm)(?![\w-])/, `${f} has a size token without its property`);
}
for (const t of ['--size-touch: 44px', '--size-control: 40px', '--size-control-sm: 36px', '--font-size-nano: 9px', '--font-size-tiny: 9.5px', '--font-size-mini: 10.5px', '--font-size-label: 11.5px']) assert.ok(colors.includes(t), t);
// Every numeric arbitrary utility (w-[280px], z-[100], scale-[.97] …) must go through a central token
for (const f of walk('src').filter((f) => f.endsWith('.tsx') && !locked.has(f))) {
  const m = read(f).match(/(?<![\w\[-])(?:[a-z0-9]+:)*-?[a-z][a-z-]*-\[-?[0-9.]+(?:px|vh|dvh|vw|%)?\]/);
  assert.equal(m, null, `${f} has arbitrary numeric utility ${m && m[0]}; add a token in src/theme/colors.css`);
}
// Every --var referenced via the Tailwind (--x) shorthand is defined centrally
const defined = new Set([...colors.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]).concat([...css.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1])));
for (const f of walk('src').filter((f) => f.endsWith('.tsx'))) {
  for (const m of read(f).matchAll(/-\((?:length:)?(--[a-z0-9-]+)\)/g)) assert.ok(defined.has(m[1]), `${f}: ${m[1]} is not defined in colors.css/index.css`);
}
// index.css: outside locked header/menu rules and keyframes, no raw font-size / radius / z-index
const lockSel = /se-island|se-header|se-menu|se-bottom-nav|se-floating-header|se-drawer|se-nav|se-dock/;
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  if (lockSel.test(m[1]) || m[1].trim().startsWith('@keyframes')) continue;
  assert.doesNotMatch(m[2], /font-size:\s*[0-9.]+px|border-radius:\s*(?!999)[0-9]+px|z-index:\s*[0-9]+/, `index.css rule "${m[1].trim().slice(0, 60)}" has a raw font-size/radius/z-index; use tokens`);
}
for (const f of walk('src').filter((f) => f.endsWith('.tsx') && !locked.has(f))) {
  assert.doesNotMatch(read(f), /fontSize:\s*['"]?\d|borderRadius:\s*['"]?\d|zIndex:\s*\d|(?:width|height|minHeight|maxWidth):\s*['"]?\d+px/, `${f} has a raw inline size; use var(--token)`);
}
console.log('designTokenMigrationContracts.test.mjs: PASS');
