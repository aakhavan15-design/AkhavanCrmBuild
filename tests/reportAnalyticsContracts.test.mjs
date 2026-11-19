import assert from 'node:assert/strict';
import * as R from '../src/lib/reportAnalytics.ts';
import * as N from '../src/lib/negotiationErpLifecycle.ts';

// ---- Pareto / shares (shared by reports 1,5,10,11)
const p = R.pareto([{ key: 'a', value: 50 }, { key: 'b', value: 30 }, { key: 'c', value: 20 }, { key: 'x', value: -9 }, { key: 'y', value: NaN }]);
assert.equal(p.total, 100); assert.deepEqual(p.rows.map(r => r.key), ['a', 'b', 'c']);
assert.deepEqual(p.rows.map(r => r.cumulativeShare), [0.5, 0.8, 1]);
assert.equal(R.topPercentShare([{ key: 'a', value: 50 }, { key: 'b', value: 30 }, { key: 'c', value: 10 }, { key: 'd', value: 5 }, { key: 'e', value: 5 }], 20), 0.5);
assert.equal(R.topPercentShare([]), null);
assert.ok(Math.abs(R.shares([{ key: 'a', value: 1 }, { key: 'b', value: 3 }]).reduce((a, s) => a + s.share, 0) - 1) < 1e-12);

// ---- target (report 2): no target => null, not 0
assert.equal(R.targetAchievement(80, null).achievementPct, null);
assert.equal(R.targetAchievement(null, 100).achievementPct, null);
const t = R.targetAchievement(80, 100); assert.equal(t.achievementPct, 80); assert.equal(t.gap, 20);
assert.equal(R.targetAchievement(120, 100).gap, 0);
assert.equal(R.projectPeriodEnd(300, 10, 30), 900); assert.equal(R.projectPeriodEnd(300, 0, 30), null);
const g = R.growthBridge({ a: 100, b: 50 }, { a: 80, b: 70, c: 30 });
assert.equal(g.start, 150); assert.equal(g.end, 180); assert.ok(g.balanced); assert.equal(g.steps[0].key, 'c');

// ---- customer cycle / lifecycle / RFM / cohort (report 4,5)
const inv = (c, d, a = 100) => ({ customerId: c, date: d, amount: a });
const data = [inv('A', '2026-01-01'), inv('A', '2026-01-11'), inv('A', '2026-01-21'), inv('A', '2026-02-01'), // cycle ~10
  inv('B', '2026-01-05'), inv('B', '2026-03-05'), inv('B', '2026-05-05'),                                      // cycle 60
  inv('C', '2026-06-20'),                                                                                      // new, 1 purchase
  { ...inv('D', '2026-02-01', 999), isVoided: true }];
const cyc = R.purchaseCycle(data);
assert.equal(cyc.get('A').cycleDays, 10); assert.equal(cyc.get('B').cycleDays, 60); assert.equal(cyc.get('C').cycleDays, null); assert.ok(!cyc.has('D'), 'voided invoices ignored');
const seg = R.lifecycleSegments(data, '2026-07-01').segments;
assert.equal(seg.A, 'LOST', 'A: 150 days since last vs own 10-day cycle');
assert.equal(seg.B, 'ACTIVE', 'B: 57 days vs own 60-day cycle — a global fixed threshold would misjudge');
assert.equal(seg.C, 'NEW'); assert.equal(seg.D, undefined);
const rf = R.rfm(data, '2026-07-01'); assert.equal(rf.length, 3);
for (const r of rf) for (const k of ['rScore', 'fScore', 'mScore']) assert.ok(r[k] >= 1 && r[k] <= 5);
assert.ok(rf.find(r => r.customerId === 'C').rScore >= rf.find(r => r.customerId === 'A').rScore);
const co = R.cohortRetention([inv('A', '2026-01-10'), inv('A', '2026-02-10'), inv('B', '2026-01-20'), inv('C', '2026-02-05')]);
assert.deepEqual(co.map(c => c.cohort), ['2026-01', '2026-02']); assert.deepEqual(co[0].retention, [1, 0.5]); assert.equal(co[0].size, 2);
assert.equal(R.opportunityQuadrant([{ key: 'u', value: 10, growth: null }])[0].quadrant, 'UNCLASSIFIED');

// ---- visits (report 6)
const vf = R.visitFunnel([{ planned: true, checkInAt: 't', locationSource: 'GPS', hasOrder: true }, { planned: true, checkInAt: 't', locationSource: 'MANUAL' }, { planned: true }, { planned: false, checkInAt: 't', locationSource: 'APPROX', hasOrder: true }]);
assert.equal(vf.planned, 3); assert.equal(vf.actual, 3); assert.equal(vf.visitToOrderRate, 2 / 3); assert.equal(vf.unplannedVisits, 1); assert.equal(vf.gpsVerifiedShare, 1 / 3);
assert.equal(R.visitFunnel([]).visitToOrderRate, null);

// ---- delivery (report 10)
const d = R.deliveryPerformance([
  { loaded: true, shipped: true, delivered: 'FULL', promisedAt: '2026-05-02', deliveredAt: '2026-05-01', vehicleLoad: 8, vehicleCapacity: 10 },
  { loaded: true, shipped: true, delivered: 'PARTIAL', promisedAt: '2026-05-02', deliveredAt: '2026-05-04', exceptionReason: 'کسری', vehicleLoad: 2, vehicleCapacity: 10 },
  { loaded: true, shipped: false, delivered: null, exceptionReason: 'کسری' }, { delivered: 'FAILED', exceptionReason: 'عدم حضور' }]);
assert.equal(d.onTimeRate, 0.5); assert.equal(d.onTimeBasis, 2, 'rows without promised time are not counted');
assert.equal(d.capacityUtilization, 0.5); assert.equal(d.exceptions.rows[0].key, 'کسری'); assert.equal(d.funnel.ready, 4);
assert.equal(R.deliveryPerformance([{ loaded: true }]).onTimeRate, null);

// ---- returns (report 11): amount vs quantity never mixed; unknown base => null
const rr = R.returnsAnalytics([{ amount: 100, quantity: 2, reason: 'شکستگی' }, { amount: 50, quantity: 1, reason: 'اشتباه' }, { amount: 500, quantity: 9, reason: 'x', effective: false }], 1000, 40);
assert.equal(rr.returnedAmount, 150); assert.equal(rr.amountRate, 0.15); assert.equal(rr.quantityRate, 3 / 40); assert.equal(rr.reasons.rows[0].key, 'شکستگی');
assert.equal(R.returnsAnalytics([{ amount: 10, quantity: 1 }], null, null).amountRate, null);
assert.equal(R.returnsAnalytics([], 1000, 10).returnedAmount, null);

// ---- negotiation ↔ ERP lifecycle (report 9)
let r = N.createNegotiation({ id: 'n1', orderRef: 'ORD-1', baseAmount: 1000, proposedAmount: 1200, now: '2026-05-01' });
assert.throws(() => N.createNegotiation({ id: 'x', orderRef: '', baseAmount: 1, proposedAmount: 1, now: 't' }));
assert.equal(N.sendToErp(r, 't').ok, false, 'cannot skip approval');
r = N.submitForApproval(r, '2026-05-01', 'u').record; r = N.approve(r, '2026-05-02', 'mgr').record; assert.equal(r.approvedAmount, 1200);
const sent = N.sendToErp(r, '2026-05-03'); assert.ok(sent.ok); r = sent.record;
assert.equal(r.status, 'SENT_TO_ERP'); assert.equal(r.erpAppliedAmount, null, 'SENT_TO_ERP is not success');
assert.equal(N.sendToErp(sent.record, 't').ok, false);
assert.equal(N.recordErpResponse({ ...r, status: 'APPROVED' }, { outcome: 'ACCEPTED', code: '200', at: 't', appliedAmount: 1 }).ok, false, 'no fabricated ERP success');
assert.equal(N.recordErpResponse(r, { outcome: 'ACCEPTED', code: '200', at: 't' }).ok, false, 'accepted needs applied amount');
const acc = N.recordErpResponse(r, { outcome: 'ACCEPTED', code: '200', at: '2026-05-04', appliedAmount: 1150 }); assert.ok(acc.ok); assert.equal(acc.record.erpAppliedAmount, 1150);
const err = N.recordErpResponse(r, { outcome: 'ERROR', code: '503', at: 't', message: 'timeout' }).record; assert.equal(err.erpAppliedAmount, null);
assert.equal(N.sendToErp(err, 't2').record.erpRequestKey, r.erpRequestKey, 'retry keeps idempotency key');
const closed = N.closeOnInvoice(acc.record, '2026-05-06', { ref: 'INV-9', amount: 1150 }).record; assert.equal(closed.status, 'CLOSED'); assert.equal(N.canTransition('CLOSED', 'DRAFT'), false);
let rej = N.createNegotiation({ id: 'n2', orderRef: 'ORD-2', baseAmount: 500, proposedAmount: 600, now: 't' });
rej = N.sendToErp(N.approve(N.submitForApproval(rej, 't').record, 't', 'm').record, 't').record; rej = N.recordErpResponse(rej, { outcome: 'REJECTED', code: '409', at: 't', message: 'قیمت مجاز نیست' }).record;
const m = N.negotiationEffectiveness([closed, rej, N.createNegotiation({ id: 'n3', orderRef: 'O3', baseAmount: null, proposedAmount: null, now: 't' })]);
assert.equal(m.successRate, 0.5); assert.equal(m.rejectionRate, 0.5); assert.equal(m.erpAppliedAmount, 1150); assert.equal(m.uplift, 150);
assert.equal(m.funnel.sentToErp, 2); assert.equal(m.funnel.invoiced, 1); assert.equal(m.failureReasons[0][0], 'قیمت مجاز نیست');
assert.equal(N.negotiationEffectiveness([]).successRate, null); assert.equal(N.negotiationEffectiveness([]).erpAppliedAmount, null);
console.log('reportAnalyticsContracts OK');
// registry ↔ engine honesty + generated docs in sync
import fs from 'node:fs';
import { METRIC_REGISTRY, validateMetricRegistry } from '../src/lib/metricRegistry.ts';
import { buildDoc } from '../scripts/generate_metric_doc.mjs';
assert.deepEqual(validateMetricRegistry(), []);
assert.equal(fs.readFileSync(new URL('../docs/17_METRIC_FORMULAS_DATA_SOURCES_FA.md', import.meta.url), 'utf8'), buildDoc(), 'metric doc out of sync — run scripts/generate_metric_doc.mjs');
for (const code of ['SALES_TARGET_ACHIEVEMENT', 'ON_TIME_DELIVERY_RATE', 'NEGOTIATION_ERP_APPLIED_AMOUNT']) assert.equal(METRIC_REGISTRY.find(x => x.code === code).status, 'IMPLEMENTED_APP');
console.log('registry/doc sync OK');
