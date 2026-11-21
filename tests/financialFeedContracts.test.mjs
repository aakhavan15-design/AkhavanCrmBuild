import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { JOURNAL_FEED, REFERENCE_FEED, normalizeJournalFeed, normalizeReferenceFeed } from '../server/financialFeedContract.mjs';

const batch = { companyKey: 'company-42', currencyCode: 'IRR', batchKey: 'run-1', batchRevision: '1',
  previousCursor: null, nextCursor: 'commit-token-1', mode: 'FULL' };
const line = { id: 'j:1', number: 1, accountCode: 'custom-cash', debit: '900719925474099.0001', credit: '0' };
const journal = { id: 'j', revision: '1', number: '23', date: '2026-11-20', periodCode: '1405', type: 'erp-sale',
  status: 'erp-final', voided: false, lines: [line, { ...line, id: 'j:2', number: 2, accountCode: 'custom-sale', debit: '0', credit: line.debit }] };
const control = { documents: 1, lines: 2, debit: line.debit, credit: line.debit };

test('exact amounts, native codes and multiple official references are preserved', () => {
  const link = [{ type: 'SALES_INVOICE', id: 'i-1' }, { type: 'SALES_INVOICE', id: 'i-2' }];
  const result = normalizeJournalFeed({ ...batch, feed: JOURNAL_FEED, control, documents: [{ ...journal, links: link }] });
  assert.deepEqual(result.errors, []);
  assert.equal(result.documents[0].lines[0].debit, line.debit);
  assert.deepEqual(result.documents[0].links.map(item => item.id), ['i-1','i-2']);
});

test('rejects imbalanced journal or a mismatch with independent ERP counts', () => {
  const broken = { ...journal, lines: [line, { ...journal.lines[1], credit: '900719925474099.0002' }] };
  assert.equal(normalizeJournalFeed({ ...batch, feed: JOURNAL_FEED, control, documents: [broken] }).errors[0].ruleCode,'UNBALANCED');
  assert.equal(normalizeJournalFeed({ ...batch, feed: JOURNAL_FEED, control: { ...control, lines: 3 }, documents: [journal] }).errors[0].ruleCode,
    'CONTROL_TOTAL_MISMATCH');
});

test('retains arbitrary native hierarchy and rejects local numeric accounting assumptions', () => {
  const account = { kind: 'ACCOUNT', code: 'AB/77', id: 'native-x', title: 'حساب اصلی', from: '2026-01-01',
    hierarchy: 'native-sublevel-contract', level: 17, active: true, nature: 'DEBIT' };
  const input = { ...batch, feed: REFERENCE_FEED, records: [account], control: { records: 1 } };
  assert.equal(normalizeReferenceFeed(input).records[0].hierarchy, account.hierarchy);
  assert.equal(normalizeReferenceFeed({ ...input, records: [{ ...account, parent: account.code }] }).errors[0].ruleCode,'BAD_ACCOUNT');
});
