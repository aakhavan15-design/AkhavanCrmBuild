// Locks semantic palette usage and the current approved target; migration completion is tracked separately in the checklist.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = new URL('../', import.meta.url).pathname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const walk = (dir, out = []) => { for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) { const rel = path.join(dir, e.name); if (e.isDirectory()) { if (!['node_modules', 'dist', '.data'].includes(e.name)) walk(rel, out); } else out.push(rel); } return out; };
const textFiles = [...walk('src'), ...walk('docs'), ...walk('public').filter(f => /\.(json|js)$/.test(f)), 'index.html', 'scripts/release.sh', 'tailwind.config.js', 'vite.config.ts'].filter(f => /\.(ts|tsx|css|md|json|js|html|sh)$/.test(f));
const legacy = [/Solar\s*Ember/i, /SolarEmber/i, /#71364B/i, /#F7F0E7/i, /#9C5573/i, /Warm Ivory/i, /\b(?:bg|text|border|ring|fill|stroke)-coral\b/, /--color-coral/];
const hits = [];
for (const f of textFiles) {
  if (f === 'docs/CHECKLIST_FA.md') continue; // historical checklist items mention the retired name on purpose
  const text = read(f);
  for (const re of legacy) if (re.test(text)) hits.push(`${f}: ${re}`);
}
assert.deepEqual(hits, [], 'legacy Solar Ember palette must not return');

const colors = read('src/theme/colors.css');
assert.match(colors, /--c-primary: var\(--c-cobalt\)/, 'components consume semantic primary token');
const design = read('docs/DESIGN_SYSTEM_FA.md');
assert.match(design, /Neo-Slate \+ Electric Indigo/);
assert.match(design, /#4F46E5/);
assert.match(design, /NOT IMPLEMENTED \/ NOT VERIFIED/);
assert.match(colors, /--c-header-accent: #4F46E5/);

const manifest = JSON.parse(read('public/manifest.json'));
assert.ok(manifest.theme_color && manifest.background_color, 'PWA theme colors are declared');
assert.match(read('index.html'), /theme-color/);

// PWA icon assets must exist; palette visual verification remains an explicit checklist item.
for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(root, 'public', icon.src)), icon.src);
console.log('paletteLockContracts: PASS');
