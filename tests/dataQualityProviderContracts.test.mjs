import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const helperSrc = fs.readFileSync(new URL('../src/lib/dataQualityInput.ts', import.meta.url), 'utf8');
const panel = fs.readFileSync(new URL('../src/components/DataQualityPanel.tsx', import.meta.url), 'utf8');
const mod = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(helperSrc)).toString('base64'));

test('panel reads via DataProvider snapshot, not spread of state', () => {
  assert.ok(panel.includes('provider.getStateSnapshot()'));
  assert.equal(panel.includes('...(state as unknown as Record<string, unknown>)'), false);
  assert.ok(panel.includes('buildQualityAuditInput'));
});

test('panel surfaces loading and error and never treats error as clean', () => {
  assert.ok(panel.includes('در حال دریافت داده از DataProvider'));
  assert.ok(panel.includes('تلقی نمی‌شود'));
  assert.ok(panel.includes('تلاش مجدد'));
});

test('snapshot collections feed the audit; missing ones become empty arrays', () => {
  const snap = { collections: { accounts: [{ id: 'a' }], geoZones: [{ id: 'z' }] }, singletons: { settings: { x: 1 } } };
  const { input, restricted } = mod.buildQualityAuditInput(snap, { canFinance: true, canAccounts: true });
  assert.deepEqual(input.accounts, [{ id: 'a' }]);
  assert.deepEqual(input.journalLines, []);
  assert.deepEqual(input.settings, { x: 1 });
  assert.deepEqual(restricted, []);
});

test('permission and provider-hidden collections are blocked and reported', () => {
  const snap = { collections: { accounts: [{ id: 'a' }], coaMirror: [{ id: 'c' }], journalLines: [{ id: 'j' }], externalProducts: [{ id: 'p' }] }, hiddenCollections: ['externalProducts'] };
  const { input, restricted } = mod.buildQualityAuditInput(snap, { canFinance: false, canAccounts: true });
  assert.deepEqual(input.coaMirror, []);
  assert.deepEqual(input.journalLines, []);
  assert.deepEqual(input.externalProducts, []);
  assert.deepEqual(input.accounts, [{ id: 'a' }]);
  assert.deepEqual(restricted.sort(), ['coaMirror', 'externalProducts', 'journalLines']);
});

test('null snapshot yields empty input without throwing', () => {
  const { input } = mod.buildQualityAuditInput(null, { canFinance: true, canAccounts: true });
  assert.deepEqual(input.accounts, []);
});
