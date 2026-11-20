import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const reference = '6da208a4c985c8785169b7e103ac5999b37a623b';
const existingFailures = new Set([
  'audit2026Contracts', 'atmosphereContracts', 'taskTriageWorkspaceContracts', 'b15_b18_truth_contracts',
  'designSystem2026Contracts', 'workspaceHierarchyContracts', 'navigationHierarchyContracts',
  'agingBucketsContracts', 'persianLocalizationContracts', 'designTokenMigrationContracts',
  'designSystemControlsContracts', 'plannedModulesContracts', 'auditLandingContracts',
].map(name => `tests/${name}.test.mjs`));
const issues = [];
const run = (command, args, options = {}) => spawnSync(command, args, {
  encoding: 'utf8', timeout: 180_000, maxBuffer: 24 * 1024 * 1024, ...options,
});
const output = result => [result.stdout, result.stderr].filter(Boolean).join('\n');
function requireSuccess(result, label) {
  if (result.status !== 0) throw new Error(`${label}\n${output(result)}`);
  return result.stdout;
}

function inspectUiDiff() {
  const diff = requireSuccess(run('git', [
    'diff', '--no-ext-diff', '--unified=0', reference, '--', 'src/components', 'src/index.css', 'index.html',
  ]), 'Could not read UI changes from the reference commit.');
  let file = '';
  let line = 0;
  for (const row of diff.split('\n')) {
    if (row.startsWith('+++ b/')) { file = row.slice(6); continue; }
    const hunk = /^@@ -[\d,]+ \+(\d+)/.exec(row);
    if (hunk) { line = Number(hunk[1]); continue; }
    if (!row.startsWith('+') || !file) continue;
    const text = row.slice(1);
    const fail = message => issues.push(`${file}:${line}: ${message}`);
    if (file === 'index.html' && /name=["']viewport["']/.test(text) && /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:[., "';]|$)/i.test(text)) {
      fail('Viewport must allow pinch zoom.');
    }
    if (file.endsWith('.tsx')) {
      if (/>(?:\s*)(?:CREATOR|MANAGER|SYSTEM|canonical|watermark|local source|DEMO|TEST|Seed)(?:\s*)</i.test(text)) {
        fail('Use the Persian user-facing label for technical statuses.');
      }
      if (/\bclassName\s*=/.test(text) && /\[(?:#[a-f\d]{3,8}|rgba?\([^\]]*\))\]/i.test(text)) {
        fail('Use a semantic color token for a new component utility.');
      }
    }
    line++;
  }
}

function inspectTests() {
  const log = readFileSync(process.argv[2], 'utf8');
  const exitCode = Number(process.argv[3]);
  console.log(log);
  const summary = /=== (\d+) passed, (\d+) failed, (\d+) not in manifest ===/.exec(log);
  if (!summary || !Number(summary[1]) || (exitCode !== 0 && exitCode !== 1)) {
    issues.push('The test runner did not produce a complete result.');
    return;
  }
  if (Number(summary[3])) issues.push('Every new test must be registered in the manifest.');
  const failed = [...log.matchAll(/^FAIL\s+(\S+)/gm)].map(match => match[1]);
  if (failed.length !== Number(summary[2])) issues.push('Test failure summary does not match the reported files.');
  for (const path of failed) {
    if (!existingFailures.has(path)) issues.push(`New failed test: ${path}`);
  }
  for (const path of existingFailures) {
    if (!failed.includes(path) && !log.includes(`PASS  ${path}\n`)) issues.push(`Baseline test missing from the run: ${path}`);
  }
}

function diagnostics(root) {
  const checker = join(root, 'node_modules', '.bin', 'tsc');
  const result = run(checker, ['--noEmit', '--pretty', 'false'], { cwd: root });
  const log = output(result);
  const counts = new Map();
  for (const row of log.split('\n')) {
    if (!/error TS\d+:/.test(row)) continue;
    const key = row.replace(/\(\d+,\d+\)(?=: error TS)/, '');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (result.status !== 0 && !counts.size) throw new Error(`TypeScript did not finish in ${root}.\n${log}`);
  return counts;
}

function inspectTypes() {
  const current = resolve('.');
  const temp = mkdtempSync(join(tmpdir(), 'akhavan-ux-reference-'));
  try {
    const archive = requireSuccess(run('git', ['archive', reference], { encoding: null }), 'Could not archive the type baseline.');
    requireSuccess(run('tar', ['-xf', '-', '-C', temp], { input: archive }), 'Could not unpack the type baseline.');
    symlinkSync(join(current, 'node_modules'), join(temp, 'node_modules'), 'dir');
    const baseline = diagnostics(temp);
    const actual = diagnostics(current);
    let added = 0;
    for (const [message, count] of actual) {
      const difference = count - (baseline.get(message) ?? 0);
      if (difference > 0) { issues.push(`New TypeScript diagnostic ×${difference}: ${message}`); added += difference; }
    }
    const total = counts => [...counts.values()].reduce((a, b) => a + b, 0);
    console.log(`TypeScript baseline ${total(baseline)} · current ${total(actual)} · added ${added}`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

inspectUiDiff();
inspectTests();
inspectTypes();
if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else {
  console.log('PASS: no new UX contract, test, or TypeScript regressions.');
}
