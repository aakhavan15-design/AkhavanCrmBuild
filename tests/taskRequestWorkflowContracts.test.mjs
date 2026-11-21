import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyRequestCommand, availableActions, commandInput, policyInput, requestInput, validateOrderPriceAuthorization } from '../server/taskRequestContract.mjs';

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


test('price authorization checks item, unit, expiry, discount and remaining uses before the final decision',()=>{
  const order={id:manager,source:'erp',accountId:creator,currency:'IRR',discount:'0',
    lines:[{product:'product-1',quantity:'1.25',price:'4000.1250',unit:'EA',discount:'0'}]};
  const grant={source:'erp',customer:creator,expiresOn:'2026-11-22',maxUses:1,usedOrders:[],
    items:[{externalId:'product-1',quantity:'2.0000',price:'4000.125',unit:'EA'}]};
  assert.equal(validateOrderPriceAuthorization(order,grant,'2026-11-21'),null);
  assert.equal(validateOrderPriceAuthorization(order,{...grant,usedOrders:[manager]},'2026-11-21'),null);
  assert.match(validateOrderPriceAuthorization(order,{...grant,usedOrders:[second]},'2026-11-21'),/سقف/);
  assert.match(validateOrderPriceAuthorization({...order,discount:'10'},grant,'2026-11-21'),/تخفیف/);
  assert.match(validateOrderPriceAuthorization(order,grant,'2026-11-23'),/اعتبار/);
  assert.match(validateOrderPriceAuthorization(order,{...grant,paymentTerms:'چک یک‌ماهه'},'2026-11-21'),/تسویه/);
});


test('action-specific inputs cannot change an unrelated command or terminate parsing',()=>{
  assert.equal(command('COMMENT',{assigneeId:{id:manager},priority:'URGENT'}).assigneeId,undefined);
  assert.equal(command('COMMENT',{priority:'URGENT'}).priority,undefined);
  assert.equal(command('REFER',{assigneeId:{id:manager}}),null);
});

test('a deadline update requires a changed or removed date and preserves approval history',()=>{
  const task={...basis,dueDate:'2026-11-25'};
  assert.equal(command('DUE_DATE',{dueDate:'2026-02-30'}),null);
  assert.equal(applyRequestCommand(task,{isWatcher:true},command('DUE_DATE',{dueDate:null}),second,now).ok,false);
  assert.equal(applyRequestCommand(task,{isCreator:true},command('DUE_DATE',{dueDate:task.dueDate}),creator,now).ok,false);
  const updated=applyRequestCommand(task,{isCreator:true},command('DUE_DATE',{dueDate:null}),creator,now).task;
  assert.equal(updated.dueDate,null);
  assert.equal(updated.managedRequest.contentRevision,2);
  assert.equal(updated.status,'PENDING_APPROVAL');
});

test('information goes back to the requester and an authorized assignee can close or decline routine pricing',()=>{
  const inquiry={...basis,status:'OPEN',managedRequest:{...basis.managedRequest,kind:'PRICE_INQUIRY',policy:null,activeApprovers:[]}};
  const waiting=applyRequestCommand(inquiry,{canAct:true},command('ASK_INFO'),finance,now).task;
  assert.equal(waiting.status,'NEEDS_INFO');
  assert.match(waiting.nextAction,/درخواست‌کننده/);
  const ready=applyRequestCommand(waiting,{isCreator:true},command('REPLY'),creator,now).task;
  assert.equal(ready.status,'OPEN');
  assert.equal(applyRequestCommand(ready,{isWatcher:true},command('DECLINE_INQUIRY'),second,now).ok,false);
  assert.equal(applyRequestCommand(ready,{canAct:true},command('DECLINE_INQUIRY'),finance,now).task.status,'REJECTED');
  const replied=applyRequestCommand(ready,{canAct:true},command('REPLY',{priceClass:'RETAIL'}),finance,now).task;
  assert.equal(replied.status,'COMPLETED');
  assert.equal(replied.managedRequest.guidance.priceClass,'RETAIL');
  assert.equal(replied.managedRequest.authorization,undefined);
});
