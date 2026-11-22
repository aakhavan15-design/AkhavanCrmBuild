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

test('read-only API adapter resumes from the published cursor and rejects redirects', async () => {
  const { readFinancialApiFeed } = await import('../server/financialFeedExtract.mjs');
  const checkpoint = { feed:JOURNAL_FEED,company:'company-42',cursor:'issued-after-45',timeoutMs:5000 };
  const result = await readFinancialApiFeed({ url:'https://erp.example.invalid/read',checkpoint,
    request:async (url,options) => {
      assert.equal(url.searchParams.get('after'),'issued-after-45');
      assert.equal(url.searchParams.get('company'),checkpoint.company);
      assert.equal(options.method,'GET');
      assert.equal(options.redirect,'error');
      return new Response('{"feed":"FINANCIAL_JOURNAL"}',{headers:{'Content-Type':'application/json'}});
    } });
  assert.equal(JSON.parse(result).feed,JOURNAL_FEED);
  await assert.rejects(readFinancialApiFeed({url:'http://erp.example.invalid/read',checkpoint,request:()=>assert.fail()}),
    {code:'ERP_API_ENDPOINT'});
});

test('read-only SQL adapter rejects non-identifier views and ambiguous source cursor pages', async () => {
  const { readFinancialSqlFeed } = await import('../server/financialFeedExtract.mjs');
  const sql = { NVarChar:() => null, Int:null };
  const pool = {request:() => ({input() { return this; },async query() { return {recordset:[{},{}]}; }})};
  const checkpoint = {feed:JOURNAL_FEED,company:'company-42',cursor:null};
  await assert.rejects(readFinancialSqlFeed({sql,pool,view:'erp.journal;DELETE',checkpoint}),{code:'ERP_SQL_VIEW'});
  await assert.rejects(readFinancialSqlFeed({sql,pool,view:'erp.FinanceFeed',checkpoint}),{code:'ERP_SQL_CURSOR_AMBIGUOUS'});
});

test('ERP extraction retries a temporary 429 on the same cursor and respects Retry-After', async () => {
  const { readFinancialApiFeed, retryFinancialFeed } = await import('../server/financialFeedExtract.mjs');
  const checkpoint = { feed:JOURNAL_FEED,company:'company-42',cursor:'confirmed-1',timeoutMs:5000 };
  const waits = [];
  let requests=0;
  const result=await retryFinancialFeed(()=>readFinancialApiFeed({
    url:'https://erp.example.invalid/read',checkpoint,
    request:async url=>{
      assert.equal(url.searchParams.get('after'),checkpoint.cursor);
      requests++;
      return requests===1 ? new Response('too many requests',{status:429,headers:{'Retry-After':'2'}})
        : new Response(null,{status:204});
    },
  }), async delay=>waits.push(delay));
  assert.equal(result,null);
  assert.equal(requests,2);
  assert.deepEqual(waits,[2000]);
});

test('financial feed retries only transient failures and bounds delays', async () => {
  const { retryFinancialFeed } = await import('../server/financialFeedExtract.mjs');
  const attempts = [];
  const waits = [];
  const save = async () => { attempts.push('batch-1'); if (attempts.length<3) throw Object.assign(new Error(),{number:1205}); return {replayed:true}; };
  assert.deepEqual(await retryFinancialFeed(save,async delay=>waits.push(delay)),{replayed:true});
  assert.deepEqual(attempts,['batch-1','batch-1','batch-1']);
  assert.deepEqual(waits,[250,500]);
  for (const failure of [{code:'STALE_CHECKPOINT'}, {code:'ERP_API_RETRYABLE',retryAfterMs:9000}]) {
    await assert.rejects(retryFinancialFeed(async()=>{throw Object.assign(new Error(),failure);},()=>assert.fail()),failure);
  }
});
