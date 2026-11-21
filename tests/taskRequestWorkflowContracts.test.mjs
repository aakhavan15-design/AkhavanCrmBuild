import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyRequestCommand, availableActions, commandInput, policyInput, requestInput } from '../server/taskRequestContract.mjs';

const creator='11111111-1111-4111-8111-111111111111';
const manager='22222222-2222-4222-8222-222222222222';
const second='33333333-3333-4333-8333-333333333333';
const finance='44444444-4444-4444-8444-444444444444';
const now='2026-11-21T20:00:00.000Z';
const command=(action,extra={})=>commandInput({action,version:'2',commandId:crypto.randomUUID(),note:'شرح تصمیم',...extra});
const basis={ id:'taskreq-123',createdBy:creator,assigneeId:finance,accountId:creator,status:'PENDING_APPROVAL',activityHistory:[],
  managedRequest:{kind:'ORDER_APPROVAL',contentRevision:2,watchers:[],policy:{steps:[{members:[manager,second],required:2}],accountingUserId:finance},
    step:0,activeApprovers:[manager,second],decisions:[],seenBy:[],priceItems:[]} };
const canDecide={canDecide:true};

test('a watcher does not obtain a decision even with managerial notes',()=>{
  const action=availableActions(basis,{isWatcher:true,canNote:true},second);
  assert.deepEqual(action,['COMMENT']);
  assert.equal(applyRequestCommand(basis,{isWatcher:true,canNote:true},command('APPROVE'),second,now).ok,false);
});

test('confirmed decisions meet quorum and are tied to the content revision',()=>{
  const first=applyRequestCommand(basis,canDecide,command('APPROVE'),manager,now);
  assert.equal(first.task.status,'PENDING_APPROVAL');
  assert.equal(first.task.managedRequest.decisions[0].revision,2);
  assert.equal(applyRequestCommand(first.task,canDecide,command('APPROVE'),manager,now).ok,false);
  assert.equal(applyRequestCommand(first.task,canDecide,command('APPROVE'),second,now).ok,false);
  const confirmed=applyRequestCommand(first.task,canDecide,command('APPROVE'),second,now,{accountingName:'مسئول مالی'});
  assert.equal(confirmed.task.assigneeId,finance);
  assert.equal(confirmed.task.status,'APPROVED');
  assert.equal(applyRequestCommand(confirmed.task,{isAssignee:true},command('ERP_INVOICE'),finance,now).ok,false);
  assert.equal(applyRequestCommand(confirmed.task,{isAssignee:true},command('ERP_INVOICE'),finance,now,{invoice:{id:'verified'}}).task.status,'COMPLETED');
});

test('the condition author cannot witness its fulfilment',()=>{
  const placed=applyRequestCommand(basis,canDecide,command('CONDITION',{condition:'بررسی رسید'}),manager,now);
  assert.equal(placed.task.status,'CONDITIONAL');
  assert.equal(applyRequestCommand(placed.task,canDecide,command('SATISFY'),manager,now).ok,false);
  const audited=applyRequestCommand(placed.task,{isAssignee:true,canVerify:true},command('SATISFY'),finance,now);
  assert.equal(audited.task.managedRequest.condition.verifiedBy,finance);
  assert.equal(audited.task.status,'PENDING_APPROVAL');
});

test('permits three importance levels and rejects incomplete exception prices or duplicate approvers',()=>{
  const input={requestId:creator,accountId:creator,kind:'PRICE_PERMISSION',title:'مجوز قیمت',description:'اقلام منتخب',
    priority:'URGENT',assigneeId:manager,confidential:false,priceItems:[{productId:second,quantity:'5',price:'1000.01'}]};
  assert.equal(requestInput(input).priority,'URGENT');
  assert.equal(requestInput({...input,priceItems:[]}),null);
  assert.equal(policyInput({steps:[{members:[manager],required:1},{members:[manager],required:1}]}),null);
});
