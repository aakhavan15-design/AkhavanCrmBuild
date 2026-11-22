import assert from 'node:assert/strict';
import test from 'node:test';
import { runEtlBatch, validateEtlRecord, checkpointKey } from '../src/lib/etlPipeline.ts';

const base = { tenantId: 'TENANT', sourceSystemCode: 'ERP-ISFAHAN' };
const stamp = '2026-11-21T09:00:00Z';
const route = (overrides = {}) => ({ ...base, externalId: 'R-01', routeCode: '101', routeName: 'مسیر مرکزی', sourceModifiedAtUtc: stamp, ...overrides });
const tour = (overrides = {}) => ({
  ...base, externalId: 'T-01', tourDate: '2026-11-22', routeExternalId: 'R-01', salesRepExternalId: 'REP-07',
  sourceModifiedAtUtc: stamp,
  stops: [{ externalCustomerId: 'C-02', stopSequence: 2 }, { externalCustomerId: 'C-01', stopSequence: 1 }],
  ...overrides,
});
test('ERP is the only source of visit routes and dated tour records', () => {
  assert.deepEqual(validateEtlRecord('VISIT_ROUTE', route()), []);
  assert.deepEqual(validateEtlRecord('VISIT_TOUR', tour()), []);
  assert.ok(validateEtlRecord('VISIT_ROUTE', route({ routeCode: '' })).some(r => r.ruleCode === 'VISIT_ROUTE_CODE_MISSING'));
  assert.ok(validateEtlRecord('VISIT_TOUR', tour({ routeExternalId: '' })).some(r => r.ruleCode === 'VISIT_TOUR_ROUTE_MISSING'));
  assert.ok(validateEtlRecord('VISIT_TOUR', tour({ stops: [] })).some(r => r.ruleCode === 'VISIT_TOUR_STOPS_MISSING'));
  assert.ok(validateEtlRecord('VISIT_TOUR', tour({ stops: [{ externalCustomerId: 'C-1', stopSequence: 1 }, { externalCustomerId: 'C-2', stopSequence: 1 }] })).some(r => r.ruleCode === 'VISIT_TOUR_STOP_DUPLICATE'));
  assert.ok(validateEtlRecord('VISIT_TOUR', tour({ stops: [{ externalCustomerId: '', stopSequence: 1 }] })).some(r => r.ruleCode === 'VISIT_TOUR_STOP_INVALID'));
  const importedRoute = runEtlBatch({}, 'VISIT_ROUTE', [route()], { feed: base });
  assert.equal(importedRoute.summary.inserted, 1);
  assert.equal(importedRoute.nextState.erpVisitRoutes[0].routeName, 'مسیر مرکزی');
  assert.equal(importedRoute.nextState.erpVisitRoutes[0].readOnlySource, 'ERP');
  const importedTour = runEtlBatch(importedRoute.nextState, 'VISIT_TOUR', [tour()], { feed: base });
  assert.equal(importedTour.summary.inserted, 1);
  assert.equal(importedTour.nextState.erpVisitTours[0].stops[0].stopSequence, 2, 'ERP sequence is preserved, never reoptimized');
  const duplicate = runEtlBatch(importedTour.nextState, 'VISIT_TOUR', [tour()]);
  assert.equal(duplicate.summary.duplicate, 1);
  assert.equal(duplicate.nextState.erpVisitTours.length, 1);
  assert.ok(duplicate.nextState.etl.checkpoints[checkpointKey(base, 'VISIT_TOUR')]);
  const stale = runEtlBatch(importedTour.nextState, 'VISIT_TOUR', [tour({ sourceModifiedAtUtc: '2026-11-20T09:00:00Z', statusCode: 'CANCELLED' })]);
  assert.equal(stale.summary.skippedStale, 1);
  assert.equal(stale.nextState.erpVisitTours[0].statusCode, undefined);
  const foreign = runEtlBatch(importedTour.nextState, 'VISIT_TOUR', [tour({ tenantId: 'OTHER', externalId: 'T-02' })], { feed: base });
  assert.ok(foreign.rejections.some(r => r.ruleCode === 'FEED_SCOPE_MISMATCH'));
});
