/**
 * Contract tests for stale-response protection in useDataQuery (pure logic).
 */
import { strict as assert } from 'node:assert';
import { shouldApplyRaceResult, createRequestIdAllocator } from '../src/lib/dataQueryRace.ts';

const prev = { data: null, loading: false, error: null };

console.log('dataQueryRaceContracts: start');

{
  const next = shouldApplyRaceResult(1, 1, true, { type: 'loading' }, prev);
  assert.ok(next);
  assert.equal(next.loading, true);
  assert.equal(next.error, null);
}

{
  const next = shouldApplyRaceResult(5, 5, true, { type: 'success', requestId: 5, data: { ok: 1 } }, prev);
  assert.ok(next);
  assert.deepEqual(next.data, { ok: 1 });
  assert.equal(next.loading, false);
  assert.equal(next.error, null);
}

{
  const next = shouldApplyRaceResult(7, 5, true, { type: 'success', requestId: 5, data: { stale: true } }, prev);
  assert.equal(next, null);
}

{
  const next = shouldApplyRaceResult(3, 1, true, { type: 'error', requestId: 1, error: new Error('old') }, prev);
  assert.equal(next, null);
}

{
  const next = shouldApplyRaceResult(2, 2, false, { type: 'success', requestId: 2, data: 42 }, prev);
  assert.equal(next, null);
  const err = shouldApplyRaceResult(2, 2, false, { type: 'error', requestId: 2, error: new Error('x') }, prev);
  assert.equal(err, null);
}

{
  const a = createRequestIdAllocator();
  assert.equal(a.nextId(), 1);
  assert.equal(a.nextId(), 2);
  assert.equal(a.current(), 2);
}

{
  const withData = { data: { keep: true }, loading: true, error: null };
  const next = shouldApplyRaceResult(4, 4, true, { type: 'error', requestId: 4, error: new Error('fail') }, withData);
  assert.ok(next);
  assert.deepEqual(next.data, { keep: true });
  assert.equal(next.loading, false);
  assert.equal(next.error.message, 'fail');
}

console.log('dataQueryRaceContracts: all PASS (7)');
