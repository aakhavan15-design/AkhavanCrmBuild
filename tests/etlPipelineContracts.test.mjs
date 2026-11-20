import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runEtlBatch, checkpointKey, validateEtlRecord, stablePayloadHash, resolveLedgerAccount, mapJournalLines, reconcileControlTotal } from '../src/lib/etlPipeline.ts';
import { computeLedgerPnl } from '../src/lib/ledgerPnl.ts';
import { DEFAULT_REPORT_BUCKETS } from '../src/lib/accountingMapping.ts';
import { createMemoryPort } from '../src/lib/dataPorts.ts';

const sqlFinalization = readFileSync(new URL('../database/sqlserver/v1/032_finalize_erp_sync_batch.sql', import.meta.url), 'utf8');
assert.match(sqlFinalization, /XACT_STATE\(\)<>1/);
assert.match(sqlFinalization, /@TenantId<>@ContextTenant/);
assert.match(sqlFinalization, /b WITH \(UPDLOCK,HOLDLOCK\)/);
assert.match(sqlFinalization, /@ExistingHash<>@Hash/);
assert.match(sqlFinalization, /INSERT integration.StagingRejection/);
assert.match(sqlFinalization, /@StatusCode='SUCCEEDED' AND @ModeCode<>'REPLAY' AND @WatermarkUtc IS NOT NULL/);
assert.match(sqlFinalization, /WatermarkUtc IS NULL OR WatermarkUtc<@WatermarkUtc/);

const base = { tenantId: 't1', sourceSystemCode: 'erp-a' };
const pay = (id, extra = {}) => ({ ...base, externalId: id, paymentDate: '2026-10-01', amount: 500, sourceModifiedAtUtc: '2026-10-01T08:00:00Z', ...extra });

// hash is key-order independent
assert.equal(stablePayloadHash({ a: 1, b: { x: 1, y: 2 } }), stablePayloadHash({ b: { y: 2, x: 1 }, a: 1 }));
assert.notEqual(stablePayloadHash({ a: 1 }), stablePayloadHash({ a: 2 }));

// validation: never default missing money to 0
assert.deepEqual(validateEtlRecord('PAYMENT', pay('P1')), []);
assert.ok(validateEtlRecord('PAYMENT', pay('P1', { amount: undefined })).some(r => r.ruleCode === 'PAYMENT_AMOUNT_INVALID'));
assert.ok(validateEtlRecord('PRODUCT_COST', { ...base, externalId: 'C1', externalProductId: 'p1', effectiveFrom: '2026-01-01' }).some(r => r.ruleCode === 'COST_VALUE_INVALID'), 'missing cost is rejected, not zero');
assert.ok(validateEtlRecord('JOURNAL_LINE', { ...base, externalId: 'J1', externalAccountCode: '4101', debitAmount: 5, creditAmount: 5 }).some(r => r.ruleCode === 'JOURNAL_BOTH_SIDES'));
assert.ok(validateEtlRecord('CHEQUE', { ...base, externalId: 'Q1', directionCode: 'X', amount: 1, dueDate: '2026-11-01' }).some(r => r.ruleCode === 'CHEQUE_DIRECTION_INVALID'));
assert.ok(validateEtlRecord('DELIVERY_EVENT', { ...base, externalId: 'D1', externalInvoiceId: 'I1', deliveryStatusCode: 'FAILED', latitude: 120 }).some(r => r.ruleCode === 'DELIVERY_COORDINATE_INVALID'));
assert.ok(validateEtlRecord('PAYMENT', { sourceSystemCode: 'x' }).map(r => r.ruleCode).includes('TENANT_MISSING'));

// first run inserts; identical replay changes nothing (idempotent re-run)
let state = { payments: [] };
const r1 = runEtlBatch(state, 'PAYMENT', [pay('P1'), pay('P2'), pay('P3', { amount: -1 })], { now: new Date('2026-11-08T00:00:00Z') });
assert.equal(r1.summary.inserted, 2); assert.equal(r1.summary.rejected, 1); assert.equal(r1.summary.status, 'PARTIAL');
assert.equal(r1.nextState.payments.length, 2); assert.equal(r1.nextState.payments[0].isErpMirror, true);
const ledgerKey = checkpointKey(base, 'PAYMENT');
assert.equal(r1.nextState.etl.checkpoints[ledgerKey], undefined, 'partial batches cannot advance a checkpoint');
const r2 = runEtlBatch(r1.nextState, 'PAYMENT', [pay('P1'), pay('P2')]);
assert.equal(r2.summary.duplicate, 2); assert.equal(r2.summary.inserted + r2.summary.updated, 0);
assert.equal(r2.nextState.payments.length, 2, 'replay creates no duplicate rows');
assert.equal(r2.nextState.etl.checkpoints[ledgerKey].watermarkUtc, '2026-10-01T08:00:00.000Z');
// changed payload updates; older source version is stale
const r3 = runEtlBatch(r2.nextState, 'PAYMENT', [pay('P1', { amount: 700, sourceModifiedAtUtc: '2026-10-02T08:00:00Z' })]);
assert.equal(r3.summary.updated, 1); assert.equal(r3.nextState.payments.find(p => p.externalId === 'P1').amount, 700);
const r4 = runEtlBatch(r3.nextState, 'PAYMENT', [pay('P1', { amount: 100, sourceModifiedAtUtc: '2026-09-01T08:00:00Z' })]);
assert.equal(r4.summary.skippedStale, 1); assert.equal(r4.nextState.payments.find(p => p.externalId === 'P1').amount, 700);
assert.deepEqual(r4.nextState.etl.hashes, r3.nextState.etl.hashes, 'stale payload must not overwrite the accepted hash');
assert.deepEqual(r4.nextState.etl.checkpoints, r3.nextState.etl.checkpoints, 'stale payload must not rewind checkpoint');
const equalTime = runEtlBatch(r4.nextState, 'PAYMENT', [pay('P1', { amount: 900, sourceModifiedAtUtc: '2026-10-02T08:00:00Z' })]);
assert.equal(equalTime.summary.conflicts, 1);
assert.equal(equalTime.rejections[0].ruleCode, 'SOURCE_VERSION_CONFLICT');
assert.equal(equalTime.nextState.payments.find(row => row.externalId === 'P1').amount, 700);
const wrongTenant = runEtlBatch(r4.nextState, 'PAYMENT', [pay('P1', { tenantId: 'other-tenant' })], { feed: base });
assert.equal(wrongTenant.rejections[0].ruleCode, 'FEED_SCOPE_MISMATCH');
assert.deepEqual(wrongTenant.nextState.etl.checkpoints, r4.nextState.etl.checkpoints);
const collision = runEtlBatch({ payments: [] }, 'PAYMENT', [pay('collision', { amount: 22 }), pay('collision', { amount: 99 })]);
assert.equal(collision.summary.status, 'FAILED');
assert.equal(collision.summary.rejected, 2);
assert.equal(collision.rejections[0].ruleCode, 'SOURCE_VERSION_CONFLICT');
assert.deepEqual(collision.nextState.payments, []);
const replay = runEtlBatch(r4.nextState, 'PAYMENT', [pay('new-in-replay', { sourceModifiedAtUtc: '2026-10-09T12:00:00Z' })], { mode: 'REPLAY', feed: base });
assert.equal(replay.summary.inserted, 1);
assert.deepEqual(replay.nextState.etl.checkpoints, r4.nextState.etl.checkpoints);
const missingVersion = runEtlBatch(r4.nextState, 'PAYMENT', [pay('P1', { amount: 900, sourceModifiedAtUtc: undefined })]);
assert.equal(missingVersion.summary.conflicts, 1);
assert.equal(missingVersion.nextState.payments.find(row => row.externalId === 'P1').amount, 700);

// in-batch duplicate keeps the newer source version
const r5 = runEtlBatch({ payments: [] }, 'PAYMENT', [pay('P9', { amount: 1, sourceModifiedAtUtc: '2026-10-01T00:00:00Z' }), pay('P9', { amount: 2, sourceModifiedAtUtc: '2026-10-03T00:00:00Z' })]);
assert.equal(r5.summary.duplicate, 1); assert.equal(r5.nextState.payments[0].amount, 2);
// same external id from another source system is a different record (traceable to its own source)
const r6 = runEtlBatch(r1.nextState, 'PAYMENT', [pay('P1', { sourceSystemCode: 'erp-b' })]);
assert.equal(r6.summary.inserted, 1); assert.equal(r6.nextState.payments.length, 3);
assert.ok(r6.nextState.etl.checkpoints[checkpointKey({ ...base, sourceSystemCode: 'ERP-B' }, 'PAYMENT')]);
assert.equal(r6.nextState.etl.checkpoints[ledgerKey], undefined);
// credit notes keep reconciliation-compatible identity fields
const cn = runEtlBatch({ creditNotes: [] }, 'CREDIT_NOTE', [{ ...base, externalId: 'CN1', externalInvoiceId: 'I1', amount: 10 }]);
assert.equal(cn.nextState.creditNotes[0].externalCreditNoteId, 'CN1'); assert.equal(cn.nextState.creditNotes[0].sourceType, 'ERP_MIRROR');
// chart of accounts reuses coaMirror (no parallel store); both level notations accepted
const coa = runEtlBatch({ coaMirror: [{ id: 'coa-1', code: '1', level: 1 }] }, 'LEDGER_ACCOUNT', [{ ...base, externalId: 'A1', code: '4101', name: 'فروش', level: 3 }, { ...base, externalId: 'A2', accountCode: '4102', levelCode: 'DETAIL' }, { ...base, externalId: 'A3', code: '4103', level: 12 }]);
assert.equal(coa.nextState.coaMirror.length, 3); assert.equal(coa.summary.rejected, 1); assert.equal(coa.nextState.ledgerAccounts, undefined);
// storage-neutral port round-trip
const port = createMemoryPort({ payments: [] }); port.commitState(runEtlBatch(port.readState(), 'PAYMENT', [pay('P1')]).nextState); assert.equal(port.snapshot().payments.length, 1);

// coding map: only MAPPED/APPROVED resolve, effective dating, never guessed
const maps = [{ sourceSystemCode: 'ERP-A', externalAccountCode: '4101', ledgerAccountId: 'L-SALES', mapStatus: 'APPROVED', effectiveFrom: '2026-01-01' },
  { sourceSystemCode: 'ERP-A', externalAccountCode: '5101', ledgerAccountId: 'L-COGS', mapStatus: 'UNMAPPED' },
  { sourceSystemCode: 'ERP-A', externalAccountCode: '6101', ledgerAccountId: 'L-EXP', mapStatus: 'MAPPED', effectiveFrom: '2027-01-01' }];
assert.equal(resolveLedgerAccount('erp-a', '4101', maps, '2026-06-01'), 'L-SALES');
assert.equal(resolveLedgerAccount('erp-a', '5101', maps, '2026-06-01'), null);
assert.equal(resolveLedgerAccount('erp-a', '6101', maps, '2026-06-01'), null, 'not yet effective');
const ml = mapJournalLines([{ sourceSystemCode: 'ERP-A', externalAccountCode: '4101', documentDate: '2026-06-01' }, { sourceSystemCode: 'ERP-A', externalAccountCode: '9999', documentDate: '2026-06-01' }], maps);
assert.deepEqual(ml.unmappedCodes, ['ERP-A:9999']); assert.equal(ml.mappedPct, 50);

// reconciliation: absent source is never "matched"
assert.equal(reconcileControlTotal({ metricCode: 'AR_OUTSTANDING', crmValue: 100, sourceValue: null }).status, 'SOURCE_UNAVAILABLE');
assert.equal(reconcileControlTotal({ metricCode: 'AR_OUTSTANDING', crmValue: 100, sourceValue: 100 }).status, 'MATCHED');
assert.equal(reconcileControlTotal({ metricCode: 'AR_OUTSTANDING', crmValue: 100, sourceValue: 90, tolerance: 5 }).status, 'MISMATCH');
assert.equal(reconcileControlTotal({ metricCode: 'X', crmValue: 100, sourceValue: 100, sameBasis: false }).status, 'NOT_COMPARABLE');

// ledger P&L: unknown stays null (not 0); derived is null if an operand is unknown
const accounts = [{ id: 'L-SALES', accountCode: '4101', titleFa: 'فروش', levelCode: 'GENERAL', levelNo: 2, natureCode: 'CREDIT', reportBucketCode: 'GROSS_SALES' },
  { id: 'L-RET', accountCode: '4201', titleFa: 'برگشت', levelCode: 'GENERAL', levelNo: 2, natureCode: 'DEBIT', reportBucketCode: 'SALES_RETURNS' }];
const lines = [{ ledgerAccountId: 'L-SALES', debitAmount: 0, creditAmount: 1000, documentDate: '2026-10-05', status: 'POSTED' },
  { ledgerAccountId: 'L-RET', debitAmount: 100, creditAmount: 0, documentDate: '2026-10-06', status: 'POSTED' },
  { ledgerAccountId: 'L-SALES', debitAmount: 0, creditAmount: 999, documentDate: '2026-10-07', status: 'POSTED', isVoided: true },
  { ledgerAccountId: null, debitAmount: 50, creditAmount: 0, documentDate: '2026-10-08', status: 'POSTED' }];
const pnl = computeLedgerPnl(lines, accounts, DEFAULT_REPORT_BUCKETS);
assert.equal(pnl.values.GROSS_SALES, 1000); assert.equal(pnl.values.SALES_RETURNS, 100); assert.equal(pnl.values.NET_SALES, 900);
assert.equal(pnl.values.COGS, null, 'no cost posting → unknown, not zero'); assert.equal(pnl.values.GROSS_PROFIT, null); assert.equal(pnl.values.OPERATING_PROFIT, null);
assert.equal(pnl.unmappedLines, 1); assert.equal(pnl.complete, false);
console.log('etlPipelineContracts OK');
