import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDataQuery } from '../../hooks/useDataProvider';
import { formatCount, formatDecimalString } from '../../lib/format';
import { formatAppDate } from '../../lib/utils';
import { resolveCustomerBalanceView } from '../../lib/receivableReconciliation';
import { toLatinDigits } from '../../lib/digits';
import { getActiveDataProvider } from '../../services/dataProvider';
import { requestKinds, requestPriorities, requestStatusLabels, taskDocumentLabels, type RequestPriority, type TaskRequestCommand,
  type TaskRequestInput, type TaskRequestRecord, type TaskRequestView } from '../../services/taskRequests';
import type { Account } from '../../types';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { EmptyState } from '../ui/EmptyState';
import { Input, Textarea } from '../ui/Input';
import { LoadingState } from '../ui/LoadingState';
import { SearchableSelect } from '../ui/SearchableSelect';
import { TaskRequestFiles } from './TaskRequestFiles';
import { QuickTaskRequest, RequestPeople } from './QuickTaskRequest';

const views = [
  {value:'ALL',label:'همهٔ درخواست‌های مجاز'}, {value:'MINE',label:'اقدام یا تصمیم من'},
  {value:'CREATED',label:'ارجاع‌شده توسط من'}, {value:'WATCHING',label:'تحت نظارت من'},
  {value:'TEAM',label:'نظارت مدیریتی'}, {value:'WAITING',label:'منتظر پاسخ یا تأیید'},
  {value:'OVERDUE',label:'تأخیردار'}, {value:'CLOSED',label:'پایان‌یافته'},
];
const actionLabels:Record<string,string> = {
  COMMENT:'یادداشت',START:'شروع رسیدگی',BLOCK:'ثبت مانع',UNBLOCK:'رفع مانع',COMPLETE:'تکمیل با ثبت نتیجه',
  REOPEN:'بازگشایی',RECORD_RESULT:'ثبت نتیجه',REPLY:'پاسخ',ASK_INFO:'درخواست اطلاعات بیشتر',REFER:'ارجاع',
  PRIORITY:'تغییر اهمیت',WATCHERS:'مدیریت ناظران',APPROVE:'تأیید',REJECT:'رد با توضیح',CONDITION:'ثبت شرط',
  SATISFY:'تأیید مستقل اجرای شرط',ERP_INVOICE:'تطبیق فاکتور رسمی',CANCEL:'لغو',REVISE:'بازبینی نسخه',
};
const kindLabel=(kind:string)=>requestKinds.find(item=>item.value===kind)?.label ?? 'درخواست کاری';
const time = new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',hour:'2-digit',minute:'2-digit'});
const eventDate=(at:string)=> Number.isFinite(Date.parse(at)) ? `${formatAppDate(at)} · ${time.format(new Date(at))}` : 'زمان نامشخص';
const priorityLabel=(priority:string)=>requestPriorities.find(item=>item.value===priority)?.label ?? 'عادی';

export function TaskRequestsPanel({viewer,search,refresh,onOpen}:{
  viewer:string;search:string;refresh:number;onOpen:(id:string)=>void;
}) {
  const [view,setView]=useState<TaskRequestView>('ALL');
  const [page,setPage]=useState(1);
  useEffect(()=>setPage(1),[search]);
  const key=JSON.stringify([viewer,view,search,page,refresh]);
  const {data,loading,error,refetch}=useDataQuery(async provider=>({key,
    result:await provider.listTaskRequests(view,search.slice(0,100),page),
  }),[key]);
  const result=data?.key===key ? data.result : null;

  return <div className="space-y-2" dir="rtl">
    <div className="max-w-sm"><SearchableSelect label="نمای کارتابل" value={view} options={views} onChange={value=>{
      setView(value as TaskRequestView);setPage(1);
    }}/></div>
    {result?.metrics && <dl className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-surface p-2 text-caption sm:grid-cols-4">
      <div><dt className="text-text-secondary">باز</dt><dd className="font-bold">{formatCount(Number(result.metrics.openCount))}</dd></div>
      <div><dt className="text-text-secondary">منتظر پاسخ یا تصمیم</dt><dd className="font-bold">{formatCount(Number(result.metrics.waitingCount))}</dd></div>
      <div><dt className="text-text-secondary">تأخیر مهم</dt><dd className="font-bold">{formatCount(Number(result.metrics.importantLate))}</dd></div>
      <div><dt className="text-text-secondary">میانگین رسیدگی</dt><dd className="font-bold">
        {result.metrics.meanMinutes===null?'نامشخص':`${formatCount(result.metrics.meanMinutes)} دقیقه`}</dd></div>
    </dl>}
    {error ? <EmptyState surface="task_requests" title="دریافت درخواست‌ها ممکن نیست" description={error.message}
      actionLabel="تلاش دوباره" onAction={()=>void refetch()} compact/> : loading || !result ? <LoadingState label="در حال دریافت درخواست‌ها" />
      : !result.items.length ? <EmptyState surface="task_requests" title="درخواستی در این نما یافت نشد" compact />
      : <ul className="grid gap-2 sm:grid-cols-2">
        {result.items.map(item=><li key={item.id}>
          <button type="button" className="h-full min-h-11 w-full rounded-2xl border border-border bg-surface p-3 text-start hover:bg-hover"
            onClick={()=>onOpen(item.id)}>
            <span className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
              <span className="font-bold wrap-break-word">{item.title}</span>
              <span className={`text-caption ${item.priority==='URGENT' ? 'text-danger' : item.priority==='HIGH' ? 'text-warning' : 'text-text-secondary'}`}>{priorityLabel(item.priority)}</span>
            </span>
            <span className="mt-1 block text-caption text-text-secondary">{kindLabel(item.kind)} · {requestStatusLabels[item.status] ?? item.status}
              {item.canDecide && ' · نیازمند تصمیم شما'}{item.watching && ' · تحت نظارت شما'}</span>
            <span className="mt-1 block text-caption">مسئول {item.assignee || 'نامشخص'}{item.dueDate && ` · مهلت ${formatAppDate(item.dueDate)}`}
              {item.seen ? ' · مشاهده کرده' : ' · مشاهده ثبت نشده'}</span>
            {item.nextAction && <span className="mt-1 block text-caption text-text-secondary">{item.nextAction}</span>}
          </button>
        </li>)}
      </ul>}
    {result && (page>1 || result.hasMore) && <nav className="flex justify-between gap-2" aria-label="صفحه‌بندی درخواست‌ها">
      <Button type="button" variant="ghost" disabled={page<=1 || loading} onClick={()=>setPage(page-1)}>قبلی</Button>
      <span className="text-caption">صفحهٔ {formatCount(page)}</span>
      <Button type="button" variant="ghost" disabled={!result.hasMore || loading} onClick={()=>setPage(page+1)}>بعدی</Button>
    </nav>}
  </div>;
}

function CustomerRequestContext({record}: {record:TaskRequestRecord}) {
  const [open,setOpen]=useState(false);
  const context=record.customer;
  const accountId=record.account?.id ?? '';
  const source=record.order?.source ?? undefined;
  const read=useDataQuery(async provider=>open && context?.finance && accountId ? {
    accountId,source,result:await provider.getDetailSubsidiaryBalances({source,role:'RECEIVABLE'}),
  } : null,[open,accountId,source,Boolean(context?.finance)]);
  if (!context || !record.account) return null;
  const current=read.data?.accountId===accountId && read.data.source===source ? read.data.result : null;
  const ledger=resolveCustomerBalanceView(current,{id:accountId});
  return <details className="rounded-xl border border-border p-2" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer content-center font-semibold">زمینهٔ تصمیم مشتری</summary>
    {open && <div className="space-y-2 text-caption">
      {context.finance && <dl className="grid grid-cols-2 gap-2">
        <div><dt>سقف اعتبار ثبت‌شده</dt><dd>{context.finance.creditLimit===null?'نامشخص':
          `${formatDecimalString(context.finance.creditLimit)} ${context.finance.currency==='IRR'?'ریال':context.finance.currency}`}</dd></div>
        <div><dt>ماندهٔ دفتر مطالبات</dt><dd>{read.loading?'در حال دریافت…':ledger.kind==='OK' && !ledger.incomplete ?
          `${formatDecimalString(String(ledger.total))} ریال`:'نامشخص'}</dd></div>
      </dl>}
      {context.orders.length>0 && <section><h4 className="font-bold">سفارش‌های اخیر</h4>
        <ul>{context.orders.map(item=><li key={item.number}><bdi>{item.number}</bdi> · {formatAppDate(item.date)} · {formatDecimalString(item.amount)}
          {' '}{item.currency==='IRR'?'ریال':item.currency}</li>)}</ul></section>}
      {context.cheques.length>0 && <section><h4 className="font-bold">چک‌های دریافتی اخیر</h4>
        <ul>{context.cheques.map((item,index)=><li key={`${item.number}:${index}`}>
          <bdi>{item.number}</bdi> · سررسید {formatAppDate(item.dueDate)} · {item.bounced?'برگشتی':item.sourceState==='OPEN'?'باز در ERP':
            item.sourceState==='CLOSED'?'بسته در ERP':'وضعیت نامشخص'}</li>)}</ul></section>}
      {context.promises.length>0 && <section><h4 className="font-bold">وعده‌های ثبت‌شدهٔ پیگیری</h4>
        <ul>{context.promises.map((item,index)=><li key={index}>{formatAppDate(item.dueDate ?? undefined)} · {item.status==='PENDING'?'در انتظار بررسی':'سابقهٔ پیگیری'}</li>)}</ul></section>}
      {!context.finance && !context.orders.length && <p className="text-text-secondary">اطلاعات زمینه‌ای مجاز در دسترس نیست.</p>}
    </div>}
  </details>;
}

export function TaskRequestSheet({id,viewer,accounts,onClose,onChanged}:{
  id:string;viewer:string;accounts:Account[];onClose:()=>void;onChanged:()=>void;
}) {
  const [action,setAction]=useState('');
  const [note,setNote]=useState('');
  const [condition,setCondition]=useState('');
  const [assignee,setAssignee]=useState<string[]>([]);
  const [priority,setPriority]=useState<RequestPriority>('NORMAL');
  const [watchers,setWatchers]=useState<string[]>([]);
  const [validUntil,setValidUntil]=useState('');
  const [maxUses,setMaxUses]=useState('1');
  const [paymentTerms,setPaymentTerms]=useState('');
  const [priceClass,setPriceClass]=useState('');
  const [nextAction,setNextAction]=useState('');
  const [rates,setRates]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [actionError,setActionError]=useState('');
  const pending=useRef<{key:string;id:string}|null>(null);

  const {data,loading,error,refetch}=useDataQuery(async provider=>{
    const record=await provider.getTaskRequest(id);
    if (!record.task.managedRequest.seenBy.includes(viewer)) {
      await provider.changeTaskRequest(id,{commandId:crypto.randomUUID(),version:record.version,action:'VIEW',note:''}).catch(()=>null);
      return provider.getTaskRequest(id);
    }
    return record;
  },[id,viewer]);
  const record:TaskRequestRecord|null=data?.task.id===id ? data : null;
  const task=record?.task;
  const req=task?.managedRequest;
  const finalPrice=Boolean(action==='APPROVE' && req?.kind==='PRICE_PERMISSION' && record?.approval
    && record.approval.index===record.approval.total && record.approval.received+1>=record.approval.required);

  async function submit(revision?:TaskRequestInput) {
    if (!record || !task || busy) return;
    const command:Omit<TaskRequestCommand,'commandId'>={version:record.version,action,
      note:revision ? revision.description.trim() || 'بازبینی درخواست و ثبت نسخهٔ جدید' : note,nextAction:nextAction || undefined};
    if (!['START'].includes(action) && !command.note.trim()) {setActionError('توضیح اقدام را وارد کنید.');return;}
    if (revision) command.revision=revision;
    if (action==='REFER') command.assigneeId=assignee[0];
    if (action==='PRIORITY') command.priority=priority;
    if (action==='WATCHERS') command.watchers=watchers;
    if (action==='CONDITION') command.condition=condition;
    if (action==='REPLY' && req?.kind==='PRICE_INQUIRY' && task.status!=='NEEDS_INFO') command.priceClass=priceClass;
    if (finalPrice) {
      if (!validUntil || !/^\d{1,4}$/.test(maxUses) || Number(maxUses)<1 || Number(maxUses)>1000) {
        setActionError('تاریخ اعتبار و تعداد دفعات استفاده را مشخص کنید.');return;
      }
      command.expiresOn=validUntil; command.maxUses=Number(maxUses); command.paymentTerms=paymentTerms; command.priceClass=priceClass;
      const items=Object.entries(rates).filter(([,price])=>Boolean(price)).map(([productId,price])=>({productId,price}));
      if (items.length) command.priceItems=items;
    }
    const key=JSON.stringify(command);
    const commandId=pending.current?.key===key ? pending.current.id : crypto.randomUUID();
    pending.current={key,id:commandId};
    setBusy(true);setActionError('');
    try {
      const saved=await getActiveDataProvider().changeTaskRequest(id,{...command,commandId});
      pending.current=null;
      onChanged();
      if (!saved.task) {onClose();return;}
      setAction('');setNote('');setNextAction('');setCondition('');setPaymentTerms('');setPriceClass('');setRates({});
      await refetch();
    } catch (reason) {
      const message=reason instanceof Error ? reason.message : 'ثبت اقدام انجام نشد.';
      setActionError(message);
      if (reason instanceof Error && 'status' in reason && reason.status===409) await refetch();
      if (revision) throw new Error(message);
    } finally {setBusy(false);}
  }

  if (action==='REVISE' && task && req) return <QuickTaskRequest open viewer={viewer} accounts={accounts} onClose={()=>setAction('')}
    onSaved={()=>{}} initial={{kind:req.kind,title:task.title,description:task.description,priority:task.priority,accountId:task.accountId,
      assigneeId:task.assigneeId,watchers:req.watchers,links:req.links,priceAuthorizationId:req.priceAuthorizationId,priceItems:req.priceItems,dueDate:task.dueDate,confidential:req.confidential}}
    initialLinkLabels={Object.fromEntries([...(record?.linkedDocuments ?? []).map(item=>[`${item.type}:${item.id}`,item.title]),
      ...(record?.order ? [[`ORDER:${record.order.id}`,record.order.number]] : [])])}
    submitRevision={input=>submit(input)}/>;

  const choose=(value:string)=>{
    setAction(value);setActionError('');setPriority(task?.priority ?? 'NORMAL');setWatchers(req?.watchers ?? []);
  };
  const available=record?.permissions.actions.filter(value=>!record.stale || !['APPROVE','CONDITION','SATISFY'].includes(value)) ?? [];
  return <BottomSheet isOpen onClose={()=>{if(!busy)onClose();}} title={task?.title ?? 'پروندهٔ درخواست'}
    subtitle={task && req ? `${kindLabel(req.kind)} · ${requestStatusLabels[task.status] ?? task.status}` : undefined}>
    {error ? <EmptyState surface="task_request_detail" title="دریافت پرونده ممکن نیست" description={error.message}
      actionLabel="تلاش دوباره" onAction={()=>void refetch()} compact/> : loading && !record || !task || !req || !record
      ? <LoadingState label="در حال دریافت پرونده" /> : <div className="space-y-3">
        <Card padding="sm" className="space-y-1 text-caption">
          <p>درخواست‌کننده {record.creator || 'نامشخص'} · مسئول {record.assignee || 'نامشخص'} · {priorityLabel(task.priority)}</p>
          <p>ارجاع آخر {formatAppDate(req.assignedAt)}{task.dueDate && ` · مهلت ${formatAppDate(task.dueDate)}`}</p>
          {record.account && <Link to={`/accounts/${encodeURIComponent(record.account.id)}`} className="inline-flex min-h-11 items-center text-primary">
            پروندهٔ مشتری {record.account.name}</Link>}
          {req.watchers.length>0 && <p>ناظران {req.watchers.map(id=>record.participants?.[id] || 'ناظر').join('، ')}
            {record.permissions.isWatcher && ' · شما ناظر این درخواست هستید'}</p>}
          {req.activeApprovers.length>0 && <p>تصمیم‌گیران مرحلهٔ جاری {req.activeApprovers.map(id=>record.participants?.[id] || 'عضو مجاز').join('، ')}</p>}
          {task.nextAction && <p className="font-semibold">اقدام بعدی {task.nextAction}</p>}
        </Card>
        {task.description && <p className="whitespace-pre-wrap wrap-break-word text-sm leading-7">{task.description}</p>}
        {req.condition && <Card padding="sm" className="space-y-1"><p className="text-sm font-semibold">شرط ثبت‌شده</p>
          <p className="wrap-break-word text-sm">{req.condition.text}</p>
          <p className="text-caption">{req.condition.evidence || 'در انتظار شاهد و بررسی مستقل'}</p></Card>}
        {record.approval && <p className="text-caption">مرحلهٔ {formatCount(record.approval.index)} از {formatCount(record.approval.total)}
          {' · '}{formatCount(record.approval.received)} تصمیم از {formatCount(record.approval.required)} تصمیم لازم</p>}
        {req.invoice && <p className="text-caption">فاکتور رسمی ERP <bdi>{req.invoice.number}</bdi> · {formatAppDate(req.invoice.date)}</p>}
        {record.stale && !req.invoice && <p role="status" className="rounded-xl bg-warning-soft p-2 text-caption text-warning">سفارش پس از ثبت این نسخه تغییر کرده است؛ تصمیم جدید به بازبینی نیاز دارد.</p>}
        {record.order && <details className="rounded-xl border border-border p-2">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">سفارش {record.order.number} · {formatDecimalString(record.order.total)} {record.order.currency==='IRR' ? 'ریال' : record.order.currency}</summary>
          <ul className="divide-y divide-border text-caption">
            {record.order.lines.map(line=><li key={line.number} className="space-y-1 py-2">
              <p className="font-semibold wrap-break-word">{line.title} · <bdi>{line.product}</bdi></p>
              <p>{formatDecimalString(line.quantity)} {line.unit} · فی {formatDecimalString(line.price)} · تخفیف {formatDecimalString(line.discount)}
                {' · '}مبلغ {formatDecimalString(line.total)}</p>
              {line.cost!=null && <p>بهای تمام‌شده {formatDecimalString(line.cost)} · حاشیهٔ مبلغی {formatDecimalString(line.margin)}</p>}
            </li>)}
          </ul>
        </details>}
        {req.links.some(link=>link.type!=='ORDER') && <details className="rounded-xl border border-border p-2">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">اسناد مالی مرتبط</summary>
          <ul className="divide-y divide-border text-caption">
            {(record.linkedDocuments ?? []).map(item=><li key={`${item.type}:${item.id}`} className="py-2">
              {taskDocumentLabels[item.type]} <bdi>{item.title}</bdi> · {item.type==='CHEQUE' ? 'سررسید' : 'تاریخ سند'} {formatAppDate(item.date)}
              {item.voided && ' · ابطال‌شده در ERP'}
            </li>)}
          </ul>
          {(record.linkedDocuments?.length ?? 0)<req.links.filter(link=>link.type!=='ORDER').length &&
            <p className="text-caption">اطلاعات یک یا چند سند پیوندخورده در دسترس نیست.</p>}
        </details>}
        {req.priceItems.length>0 && <details className="rounded-xl border border-border p-2">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">اقلام و حدود قیمت</summary>
          <ul className="divide-y divide-border text-caption">{(req.authorization?.items ?? req.priceItems).map(item=>
            <li key={item.productId} className="py-2">{item.title || 'کالا'} · {formatDecimalString(item.quantity)} {item.unit} · فی {formatDecimalString(item.price)} ریال</li>)}</ul>
          {req.authorization && <p className="text-caption">اعتبار تا {formatAppDate(req.authorization.expiresOn)} · سقف {formatCount(req.authorization.maxUses)} بار · مصرف‌شده {formatCount(req.authorization.usedOrders?.length ?? 0)} بار</p>}
        </details>}
        <CustomerRequestContext record={record}/>
        {record.permissions.canFiles && <TaskRequestFiles id={id} canUpload={Boolean(record.permissions.canUpload)}
          onChanged={()=>{onChanged();void refetch();}}/>}
        <section aria-label="تاریخچهٔ درخواست">
          <h3 className="mb-1 text-sm font-bold">گفت‌وگو و گردش درخواست</h3>
          <ol className="divide-y divide-border">
            {task.activityHistory.map(event=><li key={event.id} className="space-y-1 py-2 text-caption">
              <p className="font-semibold">{event.summary} · {eventDate(event.at)} · {event.actorId===viewer ? 'شما' : record.participants?.[event.actorId] || 'مشارکت‌کننده'}</p>
              {event.details && <p className="whitespace-pre-wrap wrap-break-word text-text-secondary">{event.details}</p>}
            </li>)}
          </ol>
        </section>
        {available.length>0 && <SearchableSelect label="اقدام" value={action} options={available.map(value=>({value,label:actionLabels[value] ?? value}))} onChange={choose} />}
        {action && action!=='REVISE' && <form className="space-y-2" onSubmit={event=>{event.preventDefault();void submit();}}>
          {action==='REFER' && <RequestPeople viewer={viewer} label="مسئول جدید" values={assignee} onChange={setAssignee}/>}
          {action==='PRIORITY' && <SearchableSelect label="اهمیت جدید" value={priority} options={requestPriorities.map(item=>({...item}))}
            onChange={value=>setPriority(value as RequestPriority)}/>}
          {action==='WATCHERS' && <RequestPeople viewer={viewer} label="ناظران مجاز" values={watchers} multiple onChange={setWatchers}/>}
          {action==='CONDITION' && <Textarea label="شرط اجرایی موردنیاز" rows={2} required maxLength={600} value={condition} onChange={event=>setCondition(event.target.value)}/>}
          {((action==='REPLY' && req.kind==='PRICE_INQUIRY' && task.status!=='NEEDS_INFO') || finalPrice) &&
            <Input label="کلاس قیمت (اختیاری)" maxLength={100} value={priceClass} onChange={event=>setPriceClass(event.target.value)} />}
          {finalPrice && <fieldset className="space-y-2 rounded-xl border border-border p-2">
            <legend className="text-caption">حدود نهایی مجوز</legend>
            <fieldset><legend className="text-caption">پایان اعتبار</legend><CustomDatePicker value={validUntil} onChange={setValidUntil}/></fieldset>
            <Input label="سقف دفعات استفاده" inputMode="numeric" value={maxUses} onChange={event=>setMaxUses(toLatinDigits(event.target.value))}/>
            <Input label="شرایط تسویه (اختیاری)" maxLength={300} value={paymentTerms} onChange={event=>setPaymentTerms(event.target.value)}/>
            {req.priceItems.map(item=><Input key={item.productId} label={`فی جایگزین ${item.title || 'کالا'} (اختیاری)`} inputMode="decimal"
              value={rates[item.productId] || ''} onChange={event=>setRates(current=>({...current,[item.productId]:toLatinDigits(event.target.value).replace('٫','.')}))}/>)}
          </fieldset>}
          <Textarea label="شرح آزاد اقدام" maxLength={4000} required={action!=='START'} rows={3}
            value={note} onChange={event=>setNote(event.target.value)} />
          <Input label="اقدام بعدی (اختیاری)" maxLength={400} value={nextAction} onChange={event=>setNextAction(event.target.value)}/>
          {actionError && <p role="alert" className="text-danger text-caption">{actionError}</p>}
          <Button type="submit" disabled={busy}>{busy ? 'در حال ثبت…' : actionLabels[action]}</Button>
        </form>}
      </div>}
  </BottomSheet>;
}
