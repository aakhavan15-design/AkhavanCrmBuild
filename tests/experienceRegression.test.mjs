import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('lamp pull interaction cannot toggle twice after pointer release', () => {
  const lamp = read('src/components/auth/AnimatedLamp3D.tsx');
  assert.match(lamp, /suppressClickRef\.current = true/);
  assert.match(lamp, /if \(suppressClickRef\.current\)\s*\{\s*suppressClickRef\.current = false;/);
  assert.match(lamp, /onPointerCancel=\{handlePointerCancel\}/);
  assert.match(lamp, /aria-pressed=\{isLightOn\}/);
});

test('tour re-resolves spotlight targets after route navigation and workspace mount', () => {
  const tour = read('src/components/InteractiveTour.tsx');
  assert.match(tour, /\[currentStep, tourState\.isPaused, location\.pathname\]/);
  assert.match(tour, /new MutationObserver\(scheduleUpdate\)/);
  assert.match(tour, /mutationObserver\.disconnect\(\)/);
  assert.match(tour, /new ResizeObserver\(scheduleUpdate\)/);
  assert.match(tour, /prefers-reduced-motion:\s*reduce/);
  assert.match(tour, /setTargetRect\(null\);\s*\n\s*persist\(/);
  assert.match(tour, /function findSemanticTourTarget\(step: TourStep\)/);
  assert.match(tour, /if \(part === '#tour-page'\) continue/);
  assert.match(tour, /data-tour-heading/);
});

test('profitability report uses ledger-only 12 month trend and previous period comparison', () => {
  const reports = read('src/components/ReportEnginePanels.tsx');
  assert.match(reports, /computeLedgerPnl\(ledgerInputs\.rawLines, ledgerInputs\.accounts/);
  assert.match(reports, /const previousPnlReport = useMemo/);
  assert.match(reports, /const monthlyPnlRows = useMemo/);
  assert.match(reports, /FinanceTrendChart rows=\{monthlyPnlRows\}/);
  assert.match(reports, /تغییر با دوره قبل/);
  assert.match(reports, /فقط خطوط ثبت‌شده \/ تأییدشده \/ نهایی/);
});

test('profitability expense cross-filter is reflected in the URL and can be cleared', () => {
  const reports = read('src/components/ReportEnginePanels.tsx');
  assert.match(reports, /useSearchParams/);
  assert.match(reports, /next\.set\('expenseCategory', selectedExpenseCategory\)/);
  assert.match(reports, /next\.delete\('expenseCategory'\)/);
  assert.match(reports, /حذف فیلتر/);
});


test('floating header keeps a page-specific title with date and organization kicker', () => {
  const layout = read('src/components/Layout.tsx');
  assert.match(layout, /se-floating-header/);
  assert.match(layout, /todayDateStr.*state\?\.settings\?\.companyName/);
  assert.match(layout, /activePageLabel/);
  assert.match(layout, /id="ttl"/);
});
