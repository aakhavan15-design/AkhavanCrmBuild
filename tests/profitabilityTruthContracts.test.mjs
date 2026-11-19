import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const reports = readFileSync(new URL('../src/components/ReportEnginePanels.tsx', import.meta.url), 'utf8');
const operations = readFileSync(new URL('../src/components/OperationsControlWorkspace.tsx', import.meta.url), 'utf8');
const reportOne = reports.slice(reports.indexOf('{selected === 1 && ('), reports.indexOf('{/* گزارش ۲: عملکرد فروش'));
const profitabilityTab = operations.slice(operations.indexOf("{tab==='profitability' && ("), operations.indexOf("{tab==='policies' && ("));

assert.ok(reports.includes("import { ProfitWaterfallChart } from './charts/ProfitWaterfallChart'"), 'R1 must reuse the existing waterfall chart primitive');
assert.ok(reportOne.includes('<ProfitWaterfallChart steps={profitWaterfallSteps} />'), 'R1 must render a visual profit waterfall');
assert.ok(reportOne.includes('expenseParetoRows') && reportOne.includes('onSegmentClick='), 'R1 expense composition must support category cross-filtering');
assert.ok(reportOne.includes('filteredExpenseRows') && reportOne.includes('حذف فیلتر'), 'R1 category selection must filter detail rows and be clearable');
const ledgerPnl = readFileSync(new URL('../src/lib/ledgerPnl.ts', import.meta.url), 'utf8');
assert.ok(
  reports.includes("ledgerAccountId: line.ledgerAccountId || null") ||
  ledgerPnl.includes("ledgerAccountId: line.ledgerAccountId || null") ||
  ledgerPnl.includes("ledgerAccountId: code ? (byCode.get(code) ?? null) : null"),
  'ledger lines without account mapping must remain unmapped'
);
assert.ok(
  reports.includes("status: String(line.status || 'UNVERIFIED')") ||
  ledgerPnl.includes("status: String(line.status || 'UNVERIFIED')"),
  'journal lines without verified status must not be silently posted'
);
assert.ok(!reports.includes('invoices.forEach(inv => {\n      rawLines.push'), 'invoice mirrors must not be synthetically injected into the official ledger P&L');
assert.ok(!reports.includes('reportExpenses.forEach(exp => {\n      rawLines.push'), 'expense register rows must not be synthetically injected into the official ledger P&L');
assert.ok(reportOne.includes("pnlValues.GROSS_PROFIT == null ? 'نامشخص'"), 'missing ledger values must stay unknown, not be rendered as zero');
assert.ok(!profitabilityTab.includes('25.4٪') && !profitabilityTab.includes('۲۵.۴٪'), 'profitability must not display fabricated average margin');
assert.ok(!profitabilityTab.includes('12500000') && !profitabilityTab.includes('۱۲۵۰۰۰۰۰'), 'profitability must not display fabricated dispatch cost');
assert.ok(!profitabilityTab.includes('profitValues: [8, 10, 11, 13, 12, 14, 16, 17, 19, 21, 23, 26]'), 'profitability trend must not use a hard-coded series');
assert.ok(!profitabilityTab.includes('rev * 0.7'), 'product cost must never be estimated as a fixed 70 percent');
assert.ok(profitabilityTab.includes('hasRevenue') && profitabilityTab.includes('hasExpenses'), 'monthly chart must render only when source data exists');
console.log('profitabilityTruthContracts: PASS');
