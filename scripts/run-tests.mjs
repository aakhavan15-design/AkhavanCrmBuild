// Resilient test runner: runs EVERY test (a failure never hides later tests), prints a summary, exits 1 on any failure.
// Source of truth: scripts/tests.manifest.json. Test files on disk that are missing from the manifest are reported as failures.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const manifest = JSON.parse(fs.readFileSync(new URL('./tests.manifest.json', import.meta.url), 'utf8'));
const listed = new Set(manifest.map(item => item.file));
const orphans = fs.readdirSync(new URL('../tests/', import.meta.url)).filter(name => name.endsWith('.test.mjs')).map(name => `tests/${name}`).filter(file => !listed.has(file));
const only = process.argv[2];
const failed = []; let passed = 0;
for (const item of manifest) {
  if (only && !item.file.includes(only)) continue;
  const result = spawnSync('node', [...item.flags, item.file], { encoding: 'utf8', timeout: 120000 });
  if (result.status === 0) { passed++; console.log(`PASS  ${item.file}`); }
  else { failed.push(item.file); console.log(`FAIL  ${item.file}\n${(result.stdout + result.stderr).split('\n').slice(-12).join('\n')}`); }
}
console.log(`\n=== ${passed} passed, ${failed.length} failed, ${orphans.length} not in manifest ===`);
if (failed.length) console.log('Failed:\n  ' + failed.join('\n  '));
if (orphans.length) console.log('Add to scripts/tests.manifest.json:\n  ' + orphans.join('\n  '));
process.exit(failed.length || orphans.length ? 1 : 0);
