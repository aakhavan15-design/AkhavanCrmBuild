/**
 * Anti-regression contracts for minimal multi-chart dashboard redesign.
 * Run: node --test tests/reportsDashboardStyleContracts.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('reports dashboard style contracts', () => {
  it('ExportMenuButton exists', () => {
    assert.ok(existsSync(join(root, 'src/components/ui/ExportMenuButton.tsx')));
  });

  it('KpiCard supports opt-in compact density and data-backed mini charts', () => {
    assert.ok(existsSync(join(root, 'src/components/charts/KpiCard.tsx')));
    assert.ok(existsSync(join(root, 'src/components/charts/ChartCard.tsx')));
    const kpi = read('src/components/charts/KpiCard.tsx');
    assert.ok(kpi.includes("density?: 'comfortable' | 'compact'"));
    assert.ok(kpi.includes('sparkline?: number[]'));
    assert.ok(kpi.includes("density = 'comfortable'"));
    assert.ok(kpi.includes('sparkline && sparkline.length > 1'));
    const hub = read('src/components/ReportsHub.tsx');
    assert.ok(hub.includes('sparkline={metrics.monthlyValues}'));
  });

  it('format.ts provides fa-IR helpers', () => {
    const f = read('src/lib/format.ts');
    assert.ok(f.includes('formatMoneyCompact'));
    assert.ok(f.includes('fa-IR') || f.includes("FA = 'fa-IR'"));
  });

  it('ReportsHub has domain pills not 11 horizontal tabs', () => {
    const hub = read('src/components/ReportsHub.tsx');
    assert.ok(hub.includes('فروش و درآمد'));
    assert.ok(hub.includes('مسیر و توزیع'));
    assert.ok(!hub.includes('گزارش x از') && !hub.includes('گزارش ۱۰ از'));
  });

  it('ReportsWorkspace delegates to ReportsHub', () => {
    const ws = read('src/components/ReportsWorkspace.tsx');
    assert.ok(ws.includes('ReportsHub'));
  });

  it('header/nav tokens defined', () => {
    const css = read('src/theme/colors.css');
    assert.ok(css.includes('--header-h'));
    assert.ok(css.includes('--nav-h'));
  });

  it('ApprovalChain uses Persian role labels via getPersianStatusLabel', () => {
    const panel = read('src/components/settings/ApprovalChainConfigPanel.tsx');
    assert.ok(panel.includes('getPersianStatusLabel'));
    assert.ok(panel.includes('ارسال به سامانه مالی'));
    assert.ok(panel.includes('Switch'));
  });
});
