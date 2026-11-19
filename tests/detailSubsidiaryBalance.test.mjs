// F0-13: مانده تفکیکی تفصیلی × معین (قانون اساسی §C)
import assert from 'node:assert/strict';
import test from 'node:test';
import { computeDetailSubsidiaryBalances, computeCustomerLedgerBalances, balanceNature } from '../src/lib/receivableReconciliation.ts';

const L = (d, m, dr, cr, extra = {}) => ({ externalDetailCode: d, externalAccountCode: m, debitAmount: dr, creditAmount: cr, status: 'POSTED', ...extra });

test('one detail in two subsidiaries keeps two independent balances (no netting across subsidiaries)', () => {
  const r = computeDetailSubsidiaryBalances([
    L('P1', '1103-advance', 500, 0), L('P1', '1103-advance', 0, 100),
    L('P1', '2105-salary', 0, 900),
  ]);
  const p = r.get('P1');
  const adv = p.subsidiaries.find(s => s.subsidiaryCode === '1103-advance');
  const sal = p.subsidiaries.find(s => s.subsidiaryCode === '2105-salary');
  assert.equal(adv.balance, 400); assert.equal(adv.nature, 'DEBIT');
  assert.equal(sal.balance, -900); assert.equal(sal.nature, 'CREDIT');
  assert.equal(p.subsidiaries.length, 2);
  // جمع شخص = تجمیع تفکیکی‌ها، نه جایگزین آن‌ها
  assert.equal(p.total.balance, 400 - 900); assert.equal(p.total.nature, 'CREDIT');
  assert.equal(p.total.balance, p.subsidiaries.reduce((a, s) => a + s.balance, 0));
  assert.equal(p.status, 'COMPLETE');
});

test('zero balance in a subsidiary is SETTLED; nature helper', () => {
  const r = computeDetailSubsidiaryBalances([L('B1', 'bank', 10, 0), L('B1', 'bank', 0, 10)]);
  assert.equal(r.get('B1').subsidiaries[0].nature, 'SETTLED');
  assert.equal(balanceNature(1), 'DEBIT'); assert.equal(balanceNature(-1), 'CREDIT'); assert.equal(balanceNature(0), 'SETTLED');
});

test('line without subsidiary code is NOT merged into any subsidiary: separate null bucket + HAS_UNMAPPED', () => {
  const r = computeDetailSubsidiaryBalances([L('C1', '1101', 100, 0), L('C1', undefined, 50, 0)]);
  const c = r.get('C1');
  assert.equal(c.status, 'HAS_UNMAPPED');
  assert.equal(c.subsidiaries.find(s => s.subsidiaryCode === '1101').balance, 100);
  assert.equal(c.subsidiaries.find(s => s.subsidiaryCode === null).balance, 50);
});

test('voided/deleted/non-posted lines are ignored; detail without lines is absent (unknown, not zero)', () => {
  const r = computeDetailSubsidiaryBalances([
    L('X', 'm1', 100, 0, { isVoided: true }), L('X', 'm1', 100, 0, { status: 'DRAFT' }), L('X', 'm1', 100, 0, { deletedAt: '2026-01-01' }),
  ]);
  assert.equal(r.has('X'), false);
  assert.equal(computeDetailSubsidiaryBalances(undefined).size, 0);
});

test('byPeriod splits the same (detail, subsidiary) by fiscal period; default merges periods', () => {
  const lines = [L('D', 'm1', 10, 0, { fiscalPeriodCode: '1405' }), L('D', 'm1', 5, 0, { fiscalPeriodCode: '1404' })];
  assert.equal(computeDetailSubsidiaryBalances(lines).get('D').subsidiaries.length, 1);
  const bp = computeDetailSubsidiaryBalances(lines, { byPeriod: true }).get('D').subsidiaries;
  assert.equal(bp.length, 2); assert.deepEqual(bp.map(s => s.periodCode).sort(), ['1404', '1405']);
});

test('legacy customer-level total is unchanged', () => {
  const m = computeCustomerLedgerBalances([{ accountId: 'a1', debitAmount: 10, creditAmount: 3, status: 'POSTED' }]);
  assert.equal(m.get('a1').balance, 7);
});

import fs from 'node:fs';
import { queryJournalLines, buildDetailBalancesResult } from '../src/lib/receivableReconciliation.ts';

test('F0-14: queryJournalLines filters by detail/subsidiary and paginates', () => {
  const lines = [L('A', 'm1', 1, 0), L('A', 'm2', 2, 0), L('B', 'm1', 3, 0)];
  assert.equal(queryJournalLines(lines, { detailKey: 'A' }).total, 2);
  assert.equal(queryJournalLines(lines, { detailKey: 'A', subsidiaryCode: 'm2' }).items.length, 1);
  const pg = queryJournalLines(lines, {}, { page: 2, pageSize: 2 });
  assert.equal(pg.items.length, 1); assert.equal(pg.totalPages, 2);
  assert.equal(queryJournalLines(undefined).total, 0);
});

test('F0-14: balances result is EMPTY (not zero) without lines, LIVE otherwise', () => {
  assert.equal(buildDetailBalancesResult([], 'CLIENT_INDEXEDDB').status, 'EMPTY');
  const r = buildDetailBalancesResult([L('A', 'm1', 5, 0)], 'CLIENT_INDEXEDDB', { detailKey: 'A' });
  assert.equal(r.status, 'LIVE'); assert.equal(r.balances[0].total.balance, 5);
});

test('F0-14: DataProvider contract exposes ledger API; HTTP provider has no local fallback for it', () => {
  const src = fs.readFileSync(new URL('../src/services/dataProvider.ts', import.meta.url), 'utf8');
  assert.ok(/getJournalLines\(filter\?: JournalLineFilter/.test(src) && /getDetailSubsidiaryBalances\(options/.test(src));
  const http = src.slice(src.indexOf('class HttpBackendDataProvider'));
  const seg = http.slice(http.indexOf('async getJournalLines'), http.indexOf('REST list endpoints'));
  assert.ok(seg.length > 100 && !/ClientStorageDataProvider/.test(seg), 'no local fallback in ledger methods');
  assert.ok(/status: 'UNAVAILABLE'/.test(seg));
});
