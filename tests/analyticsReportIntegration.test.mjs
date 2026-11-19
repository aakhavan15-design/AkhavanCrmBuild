import assert from 'node:assert/strict';
import test from 'node:test';
import { 
  pareto, 
  topPercentShare, 
  targetAchievement, 
  growthBridge, 
  shares 
} from '../src/lib/reportAnalytics.ts';
import { buildAgingBuckets, normalizeAgingBounds } from '../src/services/agingBuckets.ts';

test('Analytics Reports - Pareto 80/20 & Cumulative Share Logic', () => {
  const items = [
    { key: 'مشتری الف', value: 100_000_000 },
    { key: 'مشتری ب', value: 50_000_000 },
    { key: 'مشتری ج', value: 30_000_000 },
    { key: 'مشتری د', value: 20_000_000 }
  ];

  const result = pareto(items);
  assert.equal(result.total, 200_000_000);
  assert.equal(result.rows[0].share, 0.5); // 100 / 200 = 50%
  assert.equal(result.rows[0].cumulativeShare, 0.5);
  assert.equal(result.rows[1].cumulativeShare, 0.75); // (100 + 50) / 200 = 75%
  assert.equal(result.rows[3].cumulativeShare, 1.0);
});

test('Analytics Reports - Sales Target Achievement & Gap Calculation', () => {
  const kpi = targetAchievement(850_000_000, 1_000_000_000);
  assert.equal(kpi.achievementPct, 85);
  assert.equal(kpi.gap, 150_000_000);

  // هدف تعریف‌نشده یا صفر -> مقادیر نامشخص (null) بدون پرتاب خطا
  const invalid = targetAchievement(500_000_000, null);
  assert.equal(invalid.achievementPct, null);
  assert.equal(invalid.gap, null);
});

test('Analytics Reports - AR Aging Buckets Balanced Checksum', () => {
  const items = [
    { days: -5, amount: 40_000_000 }, // جاری / سررسیدنشده
    { days: 10, amount: 30_000_000 }, // ۱ تا ۳۰ روز
    { days: 45, amount: 20_000_000 }, // ۳۱ تا ۶۰ روز
    { days: 75, amount: 10_000_000 }  // بیش از ۶۰ روز
  ];

  const aging = buildAgingBuckets(items, [30, 60]);
  assert.equal(aging.total, 100_000_000);
  assert.equal(aging.bucketSum, 100_000_000);
  assert.equal(aging.balanced, true);
  assert.equal(aging.buckets[0].amount, 40_000_000); // جاری
});
