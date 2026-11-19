import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const read = f => readFileSync(resolve(root, f), 'utf8');

// analytics
const an = read('src/lib/analytics.ts');
for (const k of ['PAGE_VIEW', 'EMPTY_STATE_ACTION', 'ERROR_BOUNDARY', 'THEME_CHANGE', 'EXPORT', 'COMMAND_PALETTE', 'LOGIN_SUCCESS', 'LOGOUT'])
  assert.match(an, new RegExp(`${k}:`), `event ${k}`);
assert.match(an, /export function track/);

// Toast mounted exactly once at the root and exported from the barrel
assert.match(read('src/App.tsx'), /<ToastProvider \/>/);
assert.match(read('src/components/ui/index.ts'), /ToastProvider, toast/);
assert.doesNotMatch(read('src/components/ui/Toast.tsx'), /createRoot/);

// legacy compatibility kept
assert.match(read('src/components/ui/LoadingState.tsx'), /export default LoadingState/);
assert.match(read('src/components/ui/EmptyState.tsx'), /export const CardSkeleton/);

// every EmptyState usage declares a surface
const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : []; });
for (const f of walk(resolve(root, 'src'))) {
  if (f.endsWith('ui/EmptyState.tsx')) continue;
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/<EmptyState\b([\s\S]{0,40})/g)) assert.match(m[1], /surface=/, `${f} EmptyState without surface`);
}

// funnel wiring
assert.match(read('src/App.tsx'), /AnalyticsEvents\.PAGE_VIEW/);
assert.match(read('src/App.tsx'), /AnalyticsEvents\.LOGOUT/);
assert.match(read('src/components/LoginWorkspace.tsx'), /AnalyticsEvents\.LOGIN_SUCCESS/);
assert.match(read('src/components/ui/ExportMenuButton.tsx'), /AnalyticsEvents\.EXPORT/);
assert.match(read('src/components/CommandPalette.tsx'), /AnalyticsEvents\.COMMAND_PALETTE/);
console.log('PASS: UX audit patch contracts');
