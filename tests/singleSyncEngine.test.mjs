// F0-04: دقیقاً یک نمونهٔ StateSyncEngine در سورس برنامه ساخته می‌شود (مالک: DataSyncController).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}
const sites = walk('src').filter(f => /new StateSyncEngine\(/.test(readFileSync(f, 'utf8')));
assert.deepEqual(sites.map(s => s.replaceAll('\\', '/')), ['src/services/dataSyncController.ts'], 'فقط DataSyncController مجاز به ساخت موتور است');

const rt = readFileSync('src/services/stateSyncRuntime.ts', 'utf8');
assert.ok(!/new StateSyncEngine/.test(rt) && /dataSyncController\.getEngine\(\)/.test(rt), 'stateSyncRuntime باید فقط نما باشد');

const app = readFileSync('src/App.tsx', 'utf8');
assert.ok(!/ensureStateSyncStarted\(/.test(app), 'App نباید راه‌اندازی دوم را صدا بزند');
assert.equal((app.match(/dataSyncController\.initialize\(/g) || []).length, 1);

const ctl = readFileSync('src/services/dataSyncController.ts', 'utf8');
assert.ok(/getEngine\(\): StateSyncEngine \| null/.test(ctl) && /if \(this\.engine\) return;/.test(ctl), 'initialize باید idempotent بماند');
console.log('singleSyncEngine: PASS');
