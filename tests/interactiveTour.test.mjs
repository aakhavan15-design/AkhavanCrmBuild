import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_TOUR_STEPS,
  WHATS_NEW_ITEMS,
  getStepsForModuleAndRole,
  getAvailableModules
} from '../src/services/tourEngine.ts';

test('Tour Engine: ALL_TOUR_STEPS has valid step structure and non-empty content', () => {
  assert.ok(ALL_TOUR_STEPS.length >= 7, `Expected at least 7 steps, found ${ALL_TOUR_STEPS.length}`);
  ALL_TOUR_STEPS.forEach(step => {
    assert.ok(step.id, 'Step must have an id');
    assert.ok(step.module, 'Step must specify a module');
    assert.ok(step.title, 'Step must have a title');
    assert.ok(step.content, 'Step must have content');
  });
});

test('Tour Engine: role-based step filtering returns appropriate steps for admin vs sales vs finance', () => {
  const adminSteps = getStepsForModuleAndRole('global', 'مدیر سیستم');
  assert.ok(adminSteps.length >= 3, 'Admin should have access to global steps');

  const financeSteps = getStepsForModuleAndRole('finance', 'کارشناس مالی و خزانه‌داری');
  assert.ok(financeSteps.length >= 1, 'Finance user should receive finance steps');
  assert.ok(financeSteps.every(s => s.module === 'finance'), 'All returned steps must belong to finance');

  const salesAccountSteps = getStepsForModuleAndRole('accounts', 'کارشناس فروش');
  assert.ok(salesAccountSteps.some(s => s.id === 'acc-churn-prediction'), 'Sales user should see Churn Prediction step');
});

test('Tour Engine: release notes link to the restored churn settings', () => {
  assert.ok(WHATS_NEW_ITEMS.length >= 2);
  const churnItem = WHATS_NEW_ITEMS.find(i => i.id === 'wn-churn-engine');
  assert.ok(churnItem, 'What\'s new must highlight Churn Prediction engine');
  assert.equal(churnItem.tag, 'IMPROVED');
  assert.equal(churnItem.module, 'settings');
  assert.equal(churnItem.route, '/settings?tab=org');
  assert.ok(churnItem.description.includes('ریزش'));
});

test('Tour Engine: getAvailableModules covers the 7 original modules plus every other app section', () => {
  const modules = getAvailableModules();
  assert.ok(modules.length >= 24, `expected all sections, got ${modules.length}`);
  const ids = modules.map(m => m.id);
  for (const id of ['global','dashboard','accounts','finance','operations','quotes','tasks']) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length, 'module ids must be unique');
});
