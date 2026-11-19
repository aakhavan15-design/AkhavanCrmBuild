// ماتریس اکشن‌ها (استاتیک): handlerهای mutating (updateState) را پیدا می‌کند و می‌گوید guard مجوز دارند یا نه.
// اجرا: node scripts/audit-actions.mjs [--md]
import fs from 'node:fs'; import path from 'node:path';
const dir = new URL('../src/components/', import.meta.url).pathname; const rows = []; const preAuthExemptions = [];
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));
for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8'); const lines = src.split('\n');
  const hasHook = /useCan\(/.test(src) || /RBACService/.test(src);
  lines.forEach((l, i) => {
    const m = l.match(/^\s*const\s+((?:handle|toggle|delete|remove|approve|reject|assign|save|create|submit|add|update|confirm|complete|convert)\w*)\s*=\s*(?:async\s*)?\([^;]*\)\s*=>/); if (!m) return;
    // بدنه تابع تا اولین "\n  };" هم‌تراز
    let body = ''; for (let j = i; j < Math.min(lines.length, i + 140); j++) { body += lines[j] + '\n'; if (j > i && /^  \};?\s*$/.test(lines[j])) break; }
    const mutates = /updateState\(|setState\(|useStore|dispatch\(/.test(body);
    const guarded = /\b(guard|can|canOn|rbac|memberIds.includes|canManage\.can\w*|canActOnRecord|denied)\(/.test(body);
    // Login runs before an authenticated principal exists; credentials are validated by AuthService/server,
    // so an application RBAC guard here would be incorrect and would block sign-in.
    if (mutates && f === 'LoginWorkspace.tsx' && m[1] === 'submit') {
      preAuthExemptions.push({ file: f, handler: m[1], line: i + 1, reason: 'pre-authentication credential flow' });
    } else if (mutates) rows.push({ file: f, handler: m[1], line: i + 1, guarded, hookPresent: hasHook });
  });
}
const un = rows.filter(r => !r.guarded);
const report = {
  generatedAt: new Date().toISOString(),
  method: 'static handler scan; login submit is excluded because it is a pre-authentication credential flow',
  mutatingHandlers: rows.length,
  guardedHandlers: rows.length - un.length,
  unguardedHandlers: un.length,
  handlers: rows,
  unguarded: un,
  preAuthExemptions
};
fs.writeFileSync(new URL('../ACTION_AUDIT.json', import.meta.url), JSON.stringify(report, null, 2) + '\\n');
if (process.argv.includes('--md')) {
  console.log('| فایل | handler | خط | guard |\n|---|---|---|---|');
  rows.sort((a, b) => a.file.localeCompare(b.file)).forEach(r => console.log(`| ${r.file} | ${r.handler} | ${r.line} | ${r.guarded ? '✅' : '❌'} |`));
} else { console.log(`handlers(mutating)=${rows.length} guarded=${rows.length - un.length} unguarded=${un.length}`); un.forEach(r => console.log(`  ❌ ${r.file}:${r.line} ${r.handler}`)); preAuthExemptions.forEach(r => console.log(`  ℹ️ ${r.file}:${r.line} ${r.handler} — ${r.reason} (not an RBAC action)`)); }
