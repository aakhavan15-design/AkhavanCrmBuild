// Generates docs/17_METRIC_FORMULAS_DATA_SOURCES_FA.md from src/lib/metricRegistry.ts (single source). --check verifies sync.
import fs from 'node:fs';
import { METRIC_REGISTRY } from '../src/lib/metricRegistry.ts';
const st = { IMPLEMENTED_APP: 'موتور اپ + تست', DEFINED_SQL: 'تعریف SQL (اجرا نشده)', NOT_IMPLEMENTED: 'فقط تعریف' };
export function buildDoc() {
  const out = ['# مستند فرمول و منبع داده شاخص‌ها (تولیدشده از `metricRegistry.ts` — دستی ویرایش نشود)', '', '> وضعیت هر شاخص صادقانه است: «موتور اپ + تست» یعنی محاسبه با داده کنترل‌شده تست شده، نه اینکه با داده واقعی ERP تأیید شده باشد.', ''];
  for (let r = 1; r <= 11; r++) {
    const ms = METRIC_REGISTRY.filter(m => m.reports.includes(r)); if (!ms.length) continue;
    out.push(`## گزارش ${r}`, '', '| کد | نام | فرمول | منبع داده | واحد | نیاز به بها | وضعیت | موتور/SQL |', '|---|---|---|---|---|---|---|---|');
    for (const m of ms) out.push(`| ${m.code} | ${m.nameFa} | ${m.formula.replace(/\|/g, '/')} | ${m.sources.join('، ')} | ${m.unit} | ${m.requiresCost ? 'بله' : 'خیر'} | ${st[m.status]} | ${[m.engine, m.sqlObject].filter(Boolean).join(' / ') || '—'} |`);
    out.push('');
  }
  return out.join('\n') + '\n';
}
const target = new URL('../docs/17_METRIC_FORMULAS_DATA_SOURCES_FA.md', import.meta.url);
if (process.argv[1]?.endsWith('generate_metric_doc.mjs')) {
  const d = buildDoc();
  if (process.argv.includes('--check')) { if (fs.readFileSync(target, 'utf8') !== d) { console.error('metric doc out of sync'); process.exit(1); } } else fs.writeFileSync(target, d);
}
