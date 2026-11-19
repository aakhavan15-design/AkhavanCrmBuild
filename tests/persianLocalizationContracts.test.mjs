// Regression guard for the Persian localization audit (docs/DESIGN_SYSTEM_FA.md §۸).
// Static check: user-visible strings that contain Persian text must not carry English product/technical terms,
// and the visible-label helpers must keep covering raw enum codes. Internal identifiers, keys and comments are ignored.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const FA = /[\u0600-\u06FF]/;
// Terms that must never appear inside Persian UI strings (use the glossary in the audit doc instead).
const BANNED = ['ERP', 'CRM', 'SQL', 'CPQ', 'SLA', 'OCR', 'PDF', 'GPS', 'CSV', 'DEMO', 'KPI', 'RBAC', 'SKU', 'Heatmap', 'Snapshot', 'snapshot', 'handoff', 'Handoff', 'watermark', 'Webhook', 'Gemini', 'AKHAVAN', 'LOCAL_TEST', 'P&L', 'Recharts', 'Widget', 'FMCG'];
const bannedRe = new RegExp(`(?<![A-Za-z0-9_])(${BANNED.join('|')})(?![A-Za-z0-9_])`);
// Parenthetical English gloss, e.g. «پیشخوان (Dashboard)».
const glossRe = /[\u0600-\u06FF][^()\n]*\(\s*[A-Za-z][A-Za-z0-9 &\-\/'.,:+]*\)/;

const files = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(p) && !/\.d\.ts$/.test(p)) files.push(p);
  }
})('src');

const offenders = [];
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    if (/^\s*(import |\/\/|\*|\/\*)/.test(line) || /keywords|aliases|searchTerms|console\.(info|warn|error|log)/.test(line)) return;
    const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
    let m;
    while ((m = re.exec(line))) {
      const body = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, ' ');
      if (!FA.test(body)) continue;
      if (bannedRe.test(body) || glossRe.test(body)) offenders.push(`${file}:${index + 1}: ${body.slice(0, 80)}`);
    }
    for (const j of line.matchAll(/>([^<>{}=]*[\u0600-\u06FF][^<>{}]*)</g)) {
      if (bannedRe.test(j[1]) || glossRe.test(j[1])) offenders.push(`${file}:${index + 1}: ${j[1].trim().slice(0, 80)}`);
    }
  });
}
assert.deepEqual(offenders, [], `English terms leaked into Persian UI strings:\n${offenders.slice(0, 25).join('\n')}`);

// Pure-English visible labels that used to leak.
const read = f => fs.readFileSync(f, 'utf8');
assert.doesNotMatch(read('src/components/shared/DataLineageBadge.tsx'), /label: '(ERP|CRM)'/);
assert.doesNotMatch(read('src/components/shared/FinancialContextPanel.tsx'), /label: '(ERP|CRM)'/);
assert.doesNotMatch(read('src/components/NavigationDrawer.tsx'), />AKHAVAN CRM</);
assert.doesNotMatch(read('src/components/header/SyncProgressIndicator.tsx'), />SQL Server</);

// Spoken greeting must be Persian, never English.
const voice = read('src/lib/cinematicVoiceGreeting.ts');
assert.match(voice, /utterance\.lang = 'fa-IR'/);
assert.doesNotMatch(voice, /text: '(Welcome|System online|Your intelligent)/);

// Raw enum codes must go through the central Persian label helper.
const labels = read('src/lib/labels.ts');
for (const code of ['CREATOR', 'MANAGER', 'FINANCE', 'UNSCHEDULED', 'INVOICE', 'QUOTE', 'LOCAL', 'HYBRID']) assert.match(labels, new RegExp(`${code}:`), `label missing for ${code}`);
assert.match(read('src/components/settings/ApprovalChainConfigPanel.tsx'), /getPersianStatusLabel\(r\)/);
assert.match(read('src/components/shared/DrilldownSheet.tsx'), /getPersianStatusLabel\(row\.status\)/);
assert.match(read('src/components/shared/FollowUpInbox.tsx'), /getPersianStatusLabel\(sla\.state\)/);
assert.match(read('src/components/FinanceWorkspace.tsx'), /getPersianStatusLabel\(c\.status\)/, 'cheque status uses the central Persian label helper');
assert.match(read('src/components/FinanceWorkspace.tsx'), /getPersianStatusLabel\(exp\.status\)/, 'expense status uses the central Persian label helper');
assert.match(read('src/components/SettingsWorkspace.tsx'), /getPersianStatusLabel\(log\.status\)/, 'messaging log fallback uses the central Persian label helper');

console.log('persianLocalizationContracts OK');
