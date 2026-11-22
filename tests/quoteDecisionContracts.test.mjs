import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createQuoteDecisions, quoteDecisionInput } from '../server/quoteDecisions.mjs';
import { quoteDecisionBasis } from '../src/lib/quoteDecisionBasis.mjs';

const id='quote-874';
const commandId='d439a170-e4c0-4f22-a43d-324ae6647c65';
const auth={userId:'d57f8fca-9fa6-4d9d-b043-3f8f3eefb478',tenantId:'2bbaa45b-dd4b-4565-a064-e186bedb8eb9'};
const quote={id,status:'PENDING_APPROVAL',createdAt:'2026-11-22T15:00:00.000Z',ownerId:auth.userId,lines:[{id:'one'}],totalAmount:3000};
const expectedBasis=await quoteDecisionBasis(quote);
const input=quoteDecisionInput({commandId,action:'APPROVE',expectedAt:quote.createdAt,expectedBasis});

function createHarness(responses) {
  const calls=[];
  class Request {
    params={};
    input(name,_type,value) { this.params[name]=value; return this; }
    async query(text) {
      calls.push({text,params:this.params});
      assert.ok(responses.length);
      return {recordset:responses.shift()};
    }
  }
  const decide=createQuoteDecisions({sql:{Request,NVarChar:()=>'',UniqueIdentifier:'uuid',Bit:'bit'},run:(_,execute)=>execute({})});
  return {calls,decide};
}
const stored=value=>({JsonDoc:JSON.stringify(value)});

test('decision input accepts known workflow actions with an ISO revision',()=>{
  assert.ok(input);
  assert.equal(quoteDecisionInput({...input,action:'HANDOFF'}),null);
  assert.equal(quoteDecisionInput({...input,expectedAt:'11/22/2026'}),null);
});

test('decision uses canonical read and approval grants, records status and audit, and limits recipient notification',async()=>{
  const {calls,decide}=createHarness([[stored(quote)],[],[]]);
  const result=await decide(auth,id,input);
  assert.equal(calls[0].params.grant,'quotes.approve');
  assert.match(calls[0].text,/WITH\(UPDLOCK,HOLDLOCK\)/);
  assert.match(calls[0].text,/N'quotes.view',q.JsonDoc/);
  assert.equal(result.quote.status,'APPROVED');
  assert.equal(result.quote.totalAmount,3000);
  assert.equal(JSON.parse(calls[2].params.json).status,'APPROVED');
  assert.match(calls[2].text,/QUOTE_DECISION/);
  assert.match(calls[2].text,/N'accounts.view'.*a.OwnerUserId/);
  assert.match(calls[2].text,/N'quotes.approve'/);
  assert.match(calls[2].text,/AS recipientId/);
});

test('decisions reject inaccessible, stale or empty proposals and safely replay the same command',async()=>{
  assert.equal((await createHarness([[]]).decide(auth,id,input)).status,404);
  assert.equal((await createHarness([[stored({...quote,updatedAt:'later'})],[]]).decide(auth,id,input)).status,409);
  assert.equal((await createHarness([[stored({...quote,totalAmount:3001})],[]]).decide(auth,id,input)).status,409);
  const empty={...quote,lines:[]};
  assert.equal((await createHarness([[stored(empty)],[]]).decide(auth,id,{...input,expectedBasis:await quoteDecisionBasis(empty)})).status,422);
  const fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const recorded={actor:auth.userId,fingerprint};
  const existing=stored({...quote,status:'APPROVED'});
  const retry=createHarness([[existing],[recorded]]);
  assert.equal((await retry.decide(auth,id,input)).replayed,true);
  assert.equal(retry.calls.length,2);
  assert.equal((await createHarness([[existing],[recorded]]).decide(auth,id,{...input,action:'REJECT'})).status,409);
});

test('shared sync cannot create an approved quote or change a stored decision',()=>{
  const store=readFileSync(new URL('../server/entityStore.mjs',import.meta.url),'utf8');
  const scoped=store.slice(store.indexOf("const scoped = chunk.flatMap"),store.indexOf("const personnelWrites ="));
  assert.match(scoped,/previous.EntityId IS NULL AND incoming.IsDelete=0 AND JSON_VALUE\(incoming.JsonDoc,'\$.status'\) IN\(N'DRAFT',N'PENDING_APPROVAL'\)/);
  assert.match(scoped,/JSON_VALUE\(incoming.JsonDoc,'\$.status'\)=JSON_VALUE\(previous.JsonDoc,'\$.status'\)/);
  assert.match(scoped,/JSON_QUERY\(previous.JsonDoc,'\$.lines'\)/);
  const server=readFileSync(new URL('../server/index.mjs',import.meta.url),'utf8');
  assert.match(server,/quotes\/:id\/decision',authenticate,requireSignedSession/);
  const workspace=readFileSync(new URL('../src/components/QuotesWorkspace.tsx',import.meta.url),'utf8');
  assert.match(workspace,/await provider.decideQuote[\s\S]*?receipt.quote\?\.id[\s\S]*?acknowledgeRecord\('quotes',receipt.quote,activeQuote\)/);
});
