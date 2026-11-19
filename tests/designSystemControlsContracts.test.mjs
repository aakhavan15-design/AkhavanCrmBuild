import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk('src').filter(f => f.endsWith('.tsx'));
const outsideUi = files.filter(f => !f.includes(`components${path.sep}ui${path.sep}`));

// ۱) لیست کشویی و متن چندخطی فقط از کامپوننت‌های مرجع
for (const f of outsideUi) {
  const s = fs.readFileSync(f, 'utf8');
  assert.doesNotMatch(s, /<select\b/, `${f}: raw <select> forbidden; use <Select> from ui/Input`);
  assert.doesNotMatch(s, /type="checkbox"/, `${f}: raw checkbox forbidden; use <Checkbox> from ui/Input`);
  assert.doesNotMatch(s, /<textarea\b/, `${f}: raw <textarea> forbidden; use <Textarea> from ui/Input`);
}

// ۲) کامپوننت‌های مرجع وجود دارند و صادر می‌شوند
const input = fs.readFileSync('src/components/ui/Input.tsx', 'utf8');
for (const n of ['Input', 'Select', 'Textarea', 'InputControl', 'Checkbox', 'Switch']) assert.match(input, new RegExp(`export const ${n}\\b`), `${n} exported`);
assert.match(fs.readFileSync('src/components/ui/index.ts', 'utf8'), /export \* from '\.\/Input'/);

// ۳) هر استفاده از کامپوننت، ایمپورت دارد
for (const f of outsideUi) {
  const s = fs.readFileSync(f, 'utf8');
  for (const n of ['Select', 'Textarea', 'InputControl', 'Checkbox', 'Switch'])
    if (new RegExp(`<${n}\\b`).test(s)) assert.match(s, new RegExp(`import[^;]*\\b${n}\\b[^;]*from`), `${f}: ${n} imported`);
}

// ۴) عنوان رویدادهای کسب‌وکار فارسی است
const events = fs.readFileSync('src/lib/events.ts', 'utf8');
assert.match(events, /getPersianBusinessEventTitle/);
assert.doesNotMatch(events, /title: `\$\{entityType\}: \$\{eventType\}`/);

// ۵) دکمه‌های متنی فارسیِ مستقل (اصلی/خطی/نرم) خام نباشند: باید از Button باشند
const btn = fs.readFileSync('src/components/ui/Button.tsx', 'utf8');
for (const v of ['soft', 'link', 'link-danger', 'soft-success', 'soft-danger', 'soft-warning', 'warning']) assert.ok(btn.includes(v), `Button variant ${v}`);
assert.match(fs.readFileSync('src/components/ui/Tabs.tsx', 'utf8'), /children \?\? <span>\{label\}<\/span>/, 'FilterChip accepts children');

console.log('designSystemControlsContracts: PASS');
