import { appendTaskActivity } from '../src/services/taskActivity.ts';
import { applyTaskWorkflow } from '../src/services/taskWorkflow.ts';

export const kinds = new Set(['GENERAL','PRICE_INQUIRY','PRICE_PERMISSION','ORDER_APPROVAL','FINANCE','COLLECTION','COMMERCE','HR']);
export const approvals = new Set(['PRICE_PERMISSION','ORDER_APPROVAL']);
export const priorities = new Set(['NORMAL','HIGH','URGENT']);
export const ordinary = new Set(['START','BLOCK','UNBLOCK','COMPLETE','REOPEN','RECORD_RESULT']);
export const terminal = new Set(['COMPLETED','REJECTED','CANCELLED']);
export const uuid = value => typeof value==='string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
export const isRequestId = value => typeof value==='string' && value.startsWith('taskreq-') && uuid(value.slice(8));
const decimal = (value,whole,fraction) => typeof value==='string' && new RegExp(`^\\d{1,${whole}}(?:\\.\\d{1,${fraction}})?$`).test(value) && /[1-9]/.test(value);
export const date = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  value>='1900-01-01' && value<'9999-01-01' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
const str = (value,max) => typeof value==='string' && value.length<=max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) ? value.trim() : null;
const users = (list,max) => Array.isArray(list) && list.length<=max && list.every(uuid) ? [...new Set(list.map(id => id.toLowerCase()))] : null;
const linkKinds = new Set(['ORDER','INVOICE','CHEQUE']);
const version = value => typeof value==='string' && /^[1-9]\d{0,18}$/.test(value);

export function requestInput(body) {
  if (!uuid(body?.requestId) || !kinds.has(body.kind) || !priorities.has(body.priority) || !uuid(body.assigneeId)
    || (body.accountId!=null && !uuid(body.accountId)) || (body.dueDate!=null && !date(body.dueDate))
    || typeof body.confidential!=='boolean') return null;
  const title = str(body.title,160), description = str(body.description,4000), watchers = users(body.watchers ?? [],8);
  const refs = body.links ?? [], items = body.priceItems ?? [];
  if (!title || title.length<3 || description===null || !watchers || !Array.isArray(refs) || refs.length>5 ||
    !refs.every(x => linkKinds.has(x?.type) && uuid(x.id)) || !Array.isArray(items) || items.length>30 ||
    !items.every(x => uuid(x?.productId) && decimal(x.quantity,12,6) && decimal(x.price,15,4))) return null;
  if (['PRICE_INQUIRY','PRICE_PERMISSION','ORDER_APPROVAL','COLLECTION'].includes(body.kind) && !body.accountId) return null;
  const links = refs.map(x => ({type:x.type,id:x.id.toLowerCase()}));
  if (new Set(links.map(x => `${x.type}:${x.id}`)).size!==links.length) return null;
  if ((body.kind==='ORDER_APPROVAL' && links.filter(x => x.type==='ORDER').length!==1)
    || (body.kind==='PRICE_PERMISSION' && (!items.length || new Set(items.map(x => x.productId.toLowerCase())).size!==items.length))
    || (body.kind!=='PRICE_PERMISSION' && items.length)) return null;
  return { requestId:body.requestId.toLowerCase(),kind:body.kind,title,description,priority:body.priority,assigneeId:body.assigneeId.toLowerCase(),
    accountId:body.accountId?.toLowerCase() ?? null,dueDate:body.dueDate ?? null,confidential:body.confidential,watchers,links,
    priceItems:items.map(x => ({productId:x.productId.toLowerCase(),quantity:x.quantity,price:x.price})) };
}

export function policyInput(body) {
  if (!Array.isArray(body?.steps) || !body.steps.length || body.steps.length>6) return null;
  const steps = [];
  const all = new Set();
  for (const step of body.steps) {
    const members = users(step?.members,8);
    if (!members?.length || !Number.isInteger(step.required) || step.required<1 || step.required>members.length
      || members.some(id => all.has(id))) return null;
    for (const id of members) all.add(id);
    steps.push({members,required:step.required});
  }
  if (body.accountingUserId!=null && !uuid(body.accountingUserId)) return null;
  return {steps,accountingUserId:body.accountingUserId?.toLowerCase() ?? null};
}

const actions = {
  COMMENT:['NOTE_ADDED','یادداشت ثبت شد'], VIEW:['VIEWED','درخواست مشاهده شد'], REPLY:['REPLIED','پاسخ ثبت شد'],
  ASK_INFO:['INFORMATION_REQUESTED','اطلاعات بیشتر خواسته شد'], REFER:['REASSIGNED','درخواست ارجاع شد'],
  PRIORITY:['PRIORITY_CHANGED','اهمیت تغییر کرد'], WATCHERS:['WATCHERS_CHANGED','ناظران به‌روز شدند'],
  APPROVE:['APPROVED','تصمیم تأیید ثبت شد'], REJECT:['REJECTED','درخواست رد شد'], CONDITION:['CONDITION_SET','شرط ثبت شد'],
  SATISFY:['CONDITION_SATISFIED','شاهد انجام شرط ثبت شد'], CANCEL:['CANCELLED','درخواست لغو شد'],
  REVISE:['REVISED','نسخهٔ جدید درخواست ثبت شد'], ERP_INVOICE:['ERP_INVOICE_LINKED','فاکتور رسمی ERP با سفارش تطبیق داده شد'],
};

export function commandInput(body) {
  if (!uuid(body?.commandId) || !version(body.version) || !(ordinary.has(body.action) || Object.hasOwn(actions,body.action))) return null;
  const note = str(body.note ?? '',4000), nextAction = str(body.nextAction ?? '',400);
  if (note===null || nextAction===null || (!note && !['VIEW','START'].includes(body.action))) return null;
  if (body.action==='REFER' && !uuid(body.assigneeId)) return null;
  if (body.action==='PRIORITY' && !priorities.has(body.priority)) return null;
  const watchers = body.action==='WATCHERS' ? users(body.watchers,8) : null;
  if (body.action==='WATCHERS' && !watchers) return null;
  const condition = body.action==='CONDITION' ? str(body.condition,600) : null;
  if (body.action==='CONDITION' && !condition) return null;
  const revision = body.action==='REVISE' ? requestInput(body.revision) : null;
  if (body.action==='REVISE' && !revision) return null;
  const priceItems = body.priceItems ?? null;
  if (priceItems!==null && (!Array.isArray(priceItems) || !priceItems.length || priceItems.length>30 ||
    !priceItems.every(x => uuid(x?.productId) && decimal(x.price,15,4)) ||
    new Set(priceItems.map(x => x.productId.toLowerCase())).size!==priceItems.length)) return null;
  const priceClass = str(body.priceClass ?? '',100), paymentTerms = str(body.paymentTerms ?? '',300);
  if (priceClass===null || paymentTerms===null || (body.expiresOn!=null && !date(body.expiresOn))
    || (body.maxUses!=null && (!Number.isInteger(body.maxUses) || body.maxUses<1 || body.maxUses>1000))) return null;
  return {commandId:body.commandId.toLowerCase(),version:body.version,action:body.action,note,nextAction,
    assigneeId:body.assigneeId?.toLowerCase(),priority:body.priority,watchers,condition,revision,
    priceClass,paymentTerms,expiresOn:body.expiresOn ?? null,maxUses:body.maxUses ?? null,
    priceItems:priceItems?.map(x => ({productId:x.productId.toLowerCase(),price:x.price})) ?? null};
}

export function availableActions(task, access, actor) {
  const req = task.managedRequest;
  if (terminal.has(task.status)) {
    return access.isCreator && req.kind!=='ORDER_APPROVAL' && req.kind!=='PRICE_PERMISSION' && task.status==='COMPLETED'
      ? ['REOPEN'] : [];
  }
  const result = [];
  if (access.isCreator || access.isAssignee || (access.isWatcher && access.canNote) || (access.isManager && access.canNote)) result.push('COMMENT');
  if (access.isCreator) result.push('CANCEL');
  if (access.canWatch && (access.isCreator || access.isAssignee || access.isManager)) result.push('WATCHERS');
  if (access.isCreator && ['NEEDS_INFO','BLOCKED','APPROVED','CONDITIONAL','PENDING_APPROVAL'].includes(task.status)) result.push('REVISE');
  if (access.canAct || access.isCreator) {
    result.push('PRIORITY');
    if (task.status==='NEEDS_INFO' && access.isCreator) result.push('REPLY');
  }
  if (access.canAct) {
    if (task.status!=='APPROVED') result.push('REFER');
    if (['OPEN','IN_PROGRESS','BLOCKED'].includes(task.status) && !approvals.has(req.kind)) {
      result.push('ASK_INFO','REPLY','RECORD_RESULT');
      if (task.status==='OPEN') result.push('START');
      if (task.status==='BLOCKED') result.push('UNBLOCK');
      else result.push('BLOCK','COMPLETE');
    }
  }
  if (access.canDecide && req.activeApprovers.includes(actor) && !req.decisions.some(x => x.step===req.step && x.actor===actor)) {
    if (task.status==='PENDING_APPROVAL') result.push('APPROVE','CONDITION','REJECT','ASK_INFO');
  }
  if (task.status==='CONDITIONAL' && req.condition?.actor!==actor && task.createdBy!==actor &&
      ((access.canDecide && req.activeApprovers.includes(actor)) || (access.isAssignee && access.canVerify))) result.push('SATISFY');
  if (task.status==='APPROVED' && req.kind==='ORDER_APPROVAL' && access.isAssignee && req.policy?.accountingUserId===actor) {
    result.push('ERP_INVOICE');
  }
  return result;
}

export function applyRequestCommand(task, access, command, actor, now, context = {}) {
  const req = task.managedRequest;
  const fail = error => ({ok:false,error});
  if (command.action!=='VIEW' && !availableActions(task,access,actor).includes(command.action)) return fail('این اقدام در وضعیت جاری مجاز نیست.');
  let next = {...task,managedRequest:{...req}};
  const data = next.managedRequest;
  const step = req.policy?.steps[req.step];
  const { action,note } = command;
  if (ordinary.has(action)) {
    return applyTaskWorkflow(next,{action,actorId:actor,reason:note,result:note,nextAction:command.nextAction,at:now});
  }
  switch (action) {
    case 'VIEW': data.seenBy = [...new Set([...req.seenBy,actor])]; break;
    case 'PRIORITY': next.priority=command.priority; break;
    case 'WATCHERS': data.watchers=command.watchers; break;
    case 'REFER': next.assigneeId=command.assigneeId; next.assignedTo=command.assigneeId; data.assignedAt=now; data.seenBy=[]; break;
    case 'ASK_INFO': next.status='NEEDS_INFO'; data.responseFrom=actor; break;
    case 'REPLY':
      if (task.status==='NEEDS_INFO') next.status=approvals.has(req.kind) ? 'PENDING_APPROVAL' : 'OPEN';
      else if (req.kind==='PRICE_INQUIRY') {
        data.guidance={ note,priceClass:command.priceClass || null };
        next.status='COMPLETED'; next.completedAt=now; next.result=note;
      } else next.result=note;
      break;
    case 'ERP_INVOICE':
      if (!context.invoice) return fail('سند فاکتور رسمی به‌طور یکتا به سفارش متصل نشده است.');
      data.invoice=context.invoice;
      next.status='COMPLETED';next.completedAt=now;next.nextAction='فاکتور رسمی در ERP تطبیق داده شد';
      break;
    case 'CANCEL': next.status='CANCELLED'; next.completedAt=now; data.authorization=null; break;
    case 'REVISE':
      next={...next,...context.revised};
      break;
    case 'CONDITION':
      data.condition={ text:command.condition,actor,at:now,revision:req.contentRevision,evidence:null };
      next.status='CONDITIONAL'; break;
    case 'SATISFY':
      if (req.condition?.revision!==req.contentRevision) return fail('شرط به نسخهٔ فعلی مرتبط نیست.');
      data.condition={...req.condition,evidence:note,verifiedBy:actor,verifiedAt:now};
      next.status='PENDING_APPROVAL'; break;
    case 'REJECT':
      data.decisions=[...req.decisions,{ step:req.step,actor,decision:'REJECTED',at:now,revision:req.contentRevision,note }];
      next.status='REJECTED'; data.activeApprovers=[]; data.authorization=null; next.completedAt=now; break;
    case 'APPROVE': {
      if (!step) return fail('مرحلهٔ تأیید معتبر نیست.');
      if (req.condition && !req.condition.evidence) return fail('ابتدا شاهد اجرای شرط لازم است.');
      const currentDecision = req.decisions.filter(x => x.step===req.step && x.revision===req.contentRevision);
      const last = currentDecision.length+1>=step.required && req.step+1===req.policy.steps.length;
      let authorization = null;
      if (last && req.kind==='PRICE_PERMISSION') {
        if (!command.expiresOn || command.expiresOn<now.slice(0,10) || command.maxUses===null) return fail('تاریخ اعتبار و سقف دفعات استفاده لازم است.');
        if (command.priceItems?.some(x => !req.priceItems.some(y => y.productId===x.productId))) return fail('قیمت اصلاح‌شده با اقلام درخواست هم‌خوان نیست.');
        authorization={ customer:task.accountId,revision:req.contentRevision,expiresOn:command.expiresOn,maxUses:command.maxUses,
          priceClass:command.priceClass || null,paymentTerms:command.paymentTerms || null,
          items:req.priceItems.map(x => ({...x,price:command.priceItems?.find(y => y.productId===x.productId)?.price ?? x.price})) };
      }
      if (!last && (command.priceItems || command.priceClass || command.expiresOn || command.maxUses!==null || command.paymentTerms)) {
        return fail('حدود نهایی مجوز در آخرین تصمیم تعیین می‌شود.');
      }
      data.decisions=[...req.decisions,{step:req.step,actor,decision:'APPROVED',at:now,revision:req.contentRevision,note}];
      if (currentDecision.length+1>=step.required) {
        data.step=req.step+1;
        data.activeApprovers=req.policy.steps[data.step]?.members ?? [];
        if (last) {
          data.authorization=authorization;
          next.status='APPROVED';
          if (req.kind==='ORDER_APPROVAL') {
            if (!req.policy.accountingUserId || !context.accountingName) return fail('مسئول مالی معتبر برای تحویل سفارش مشخص نیست.');
            next.assigneeId=req.policy.accountingUserId;next.assignedTo=req.policy.accountingUserId;
            data.assigneeName=context.accountingName;data.assignedAt=now;data.seenBy=[];
            next.nextAction='پیگیری صدور ERP و تطبیق فاکتور رسمی';
          }
        }
      }
      break;
    }
  }
  if (command.nextAction) next.nextAction=command.nextAction;
  if (!Object.hasOwn(actions,action)) return fail('اقدام ناشناخته است.');
  const [event,summary] = actions[action];
  return { ok:true,task:appendTaskActivity(next,{id:command.commandId,action:event,actorId:actor,at:now,summary,details:note || command.condition || undefined}) };
}
