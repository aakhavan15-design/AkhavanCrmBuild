import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/components/charts/ReportPrimitives.tsx', import.meta.url), 'utf8');
const index = readFileSync(new URL('../src/components/charts/index.ts', import.meta.url), 'utf8');
test('exports all reusable report primitives through existing chart kit', () => { for (const name of ['SectionHeader','StatusChip','RankList','FilterChips','SegmentedTabs','ReportTimeline','ReportSkeleton','ReportEmptyState']) assert.match(source, new RegExp(`export function ${name}\\(`)); assert.match(index, /ReportPrimitives/); });
test('rank values are finite, nonnegative and accessible', () => { assert.match(source, /Number\.isFinite/); assert.match(source, /role="meter"/); assert.match(source, /aria-valuenow/); });
test('filter state is controlled and options can be disabled', () => { assert.match(source, /aria-pressed/); assert.match(source, /disabled=\{option\.disabled\}/); assert.match(source, /onChange\(selected\.includes/); });
test('segmented tabs have keyboard navigation', () => { assert.match(source, /role="tablist"/); assert.match(source, /ArrowLeft/); assert.match(source, /ArrowRight/); assert.match(source, /aria-selected/); });
test('timeline, loading and missing data are explicit', () => { assert.match(source, /رویدادی ثبت نشده است/); assert.match(source, /aria-busy="true"/); assert.match(source, /داده‌ای در دسترس نیست/); });

const bar=readFileSync(new URL('../src/components/charts/BarChart.tsx',import.meta.url),'utf8');
const report=readFileSync(new URL('../src/components/ReportEnginePanels.tsx',import.meta.url),'utf8');
const lifo=readFileSync(new URL('../src/components/reports/ReceivablesLifoPanel.tsx',import.meta.url),'utf8');
const donut=readFileSync(new URL('../src/components/charts/DonutChart.tsx',import.meta.url),'utf8');
const dash=readFileSync(new URL('../src/components/DashboardWorkspace.tsx',import.meta.url),'utf8');
test('interactive chart selection preserves other data and supports keyboard reset',()=>{
 assert.match(bar,/aria-pressed=\{selectedIndex===k\}/);
 assert.match(bar,/event\.key==='Escape'/);
 assert.match(bar,/opacity=\{active===undefined\|\|k===active\?1:0\.32\}/);
 assert.match(bar,/data\.map\(/);
 assert.match(donut,/activeSegment/);
 assert.match(donut,/compact\?: boolean/);
});
test('report rank cards retain avatars, signed values and real source guard',()=>{
 assert.match(source,/<Avatar name=\{item\.label\} src=\{item\.avatar\}/);
 assert.match(source,/allowSigned=false/);
 assert.match(report,/sellerNetSales\.status === 'AVAILABLE'/);
 assert.match(report,/RankList items=\{rows\}[^\n]*allowSigned/);
 assert.match(report,/activeSegment=\{sellerChartSegments\.find/);
 assert.match(report,/sellerMonthlyAchievement\(sellerNetSales\.rows/);
 assert.match(lifo,/buildReceivableLifoReport\(ledgerBalances, accounts, invoices/);
 assert.match(lifo,/report\.rows\.filter\(r=>r\.sellerKey===activeSeller\)/);
 assert.match(lifo,/order="asc"/);
 assert.match(lifo,/overAllowedAmount!=null&&s\.overAllowedAmount>0/);
});
test('dashboard keeps one shell-owned floating header and scrollable controls',()=>{
 const layout=readFileSync(new URL('../src/components/Layout.tsx',import.meta.url),'utf8');
 assert.equal((layout.match(/<FloatingHeader\b/g)||[]).length,1);
 assert.doesNotMatch(dash,/<FloatingHeader\b|<Avatar name=\{currentUser/);
 assert.match(dash,/aria-label="کنترل‌های داشبورد"/);
 assert.match(dash,/id="dash-kpis"[^\n]*grid-cols-2 lg:grid-cols-4/);
});
