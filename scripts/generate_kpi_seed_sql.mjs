// Generates database/sqlserver/v1/019_kpi_catalog_v2_generated.sql from src/lib/metricRegistry.ts (single source).
// Usage: node --experimental-strip-types scripts/generate_kpi_seed_sql.mjs [--check]
import fs from 'node:fs';
import { METRIC_REGISTRY } from '../src/lib/metricRegistry.ts';
const q = s => String(s).replace(/'/g, "''");
export function buildSeed() {
  const rows = METRIC_REGISTRY.map(m => {
    const test = JSON.stringify({ tests: [{ name: 'definition-only; value tests run in app/CI', status: m.status }] });
    return `IF NOT EXISTS (SELECT 1 FROM analytics.KpiDefinition WHERE KpiCode='${m.code}' AND KpiVersion=${m.version})\nINSERT analytics.KpiDefinition(KpiCode,KpiVersion,NameFa,DefinitionFa,FormulaSqlDescription,GrainCode,SourceObjects,OwnerRoleCode,RefreshExpectation,RequiresCostData,EffectiveFrom,TestCaseJson)\nVALUES('${m.code}',${m.version},N'${q(m.nameFa)}',N'${q(m.definitionFa)}',N'${q(m.formula)}','${m.grain}','${q(m.sources.join(';'))}','${m.owner}','${m.refresh}',${m.requiresCost ? 1 : 0},'2026-01-01',N'${q(test)}');`;
  });
  return `/* GENERATED from src/lib/metricRegistry.ts by scripts/generate_kpi_seed_sql.mjs — do not edit by hand. Definitions only, not computed values. */\nSET XACT_ABORT ON;\nGO\n${rows.join('\n')}\nGO\n`;
}
const target = new URL('../database/sqlserver/v1/019_kpi_catalog_v2_generated.sql', import.meta.url);
if (process.argv[1] && process.argv[1].endsWith('generate_kpi_seed_sql.mjs')) {
  const sql = buildSeed();
  if (process.argv.includes('--check')) { if (fs.readFileSync(target, 'utf8') !== sql) { console.error('019 seed is out of sync with metricRegistry'); process.exit(1); } }
  else fs.writeFileSync(target, sql);
}
