import { useState } from 'react';
import { useDataQuery } from '../../hooks/useDataProvider';
import { formatCount } from '../../lib/format';
import { toLatinDigits } from '../../lib/digits';
import { getActiveDataProvider } from '../../services/dataProvider';
import type { TaskRequestApprovalPolicy, TaskRequestPolicyKind } from '../../services/taskRequests';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Checkbox, Input } from '../ui/Input';
import { LoadingState } from '../ui/LoadingState';
import { SearchableSelect } from '../ui/SearchableSelect';
import { RequestPeople } from './QuickTaskRequest';

const initial:TaskRequestApprovalPolicy={version:0,enabled:false,steps:[{members:[],required:1}]};
const types=[{value:'PRICE_PERMISSION',label:'مجوز قیمت ویژه'},{value:'ORDER_APPROVAL',label:'تأیید سفارش'}];

function PolicyForm({viewer,kind,saved,onSaved}:{
  viewer:string;kind:TaskRequestPolicyKind;saved:TaskRequestApprovalPolicy;onSaved:()=>void;
}) {
  const [draft,setDraft]=useState(saved);
  const [feedback,setFeedback]=useState<{ok:boolean;text:string}|null>(null);
  const [busy,setBusy]=useState(false);
  async function submit(){
    setFeedback(null);setBusy(true);
    try {
      const updated=await getActiveDataProvider().saveTaskRequestPolicy(kind,draft);
      setDraft(updated);setFeedback({ok:true,text:'سیاست تأیید ذخیره شد.'});onSaved();
    } catch (error) {
      setFeedback({ok:false,text:error instanceof Error ? error.message : 'ثبت سیاست انجام نشد.'});
    } finally {setBusy(false);}
  }
  const update=(index:number,change:Partial<TaskRequestApprovalPolicy['steps'][number]>)=>setDraft(value=>({...value,
    steps:value.steps.map((step,i)=>i===index ? {...step,...change}:step),
  }));
  return <form className="space-y-2" onSubmit={event=>{event.preventDefault();if(!busy)void submit();}}>
    <p className="text-caption text-text-secondary">مرحله‌ها به‌ترتیب اجرا می‌شوند. در هر مرحله می‌توان تأیید یک یا چند عضو مستقل را الزامی کرد.</p>
    {draft.steps.map((step,index)=><fieldset key={index} className="space-y-2 rounded-xl border border-border p-2">
      <legend className="px-1 font-semibold">مرحلهٔ {formatCount(index+1)}</legend>
      <RequestPeople label="اعضای مجاز تصمیم" viewer={viewer} values={step.members} multiple onChange={members=>update(index,{members})}/>
      <Input label="حداقل تعداد تأیید مستقل" inputMode="numeric" value={step.required || ''}
        onChange={event=>update(index,{required:Number(toLatinDigits(event.target.value)) || 0})}/>
      {draft.steps.length>1 && <Button type="button" variant="ghost" size="sm"
        onClick={()=>setDraft(value=>({...value,steps:value.steps.filter((_,i)=>i!==index)}))}>حذف مرحله</Button>}
    </fieldset>)}
    <Button type="button" size="sm" variant="outline" disabled={draft.steps.length>=6}
      onClick={()=>setDraft(value=>({...value,steps:[...value.steps,{members:[],required:1}]}))}>افزودن مرحله</Button>
    <label className="flex min-h-11 items-center gap-2 text-sm"><Checkbox checked={draft.enabled}
      onChange={event=>setDraft({...draft,enabled:event.target.checked})}/> سیاست فعال باشد</label>
    {feedback && <p role={feedback.ok ? 'status':'alert'} className={feedback.ok ? 'text-success':'text-danger'}>{feedback.text}</p>}
    <Button type="submit" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ سیاست'}</Button>
  </form>;
}

export function TaskRequestPolicyEditor({onClose,viewer}:{onClose:()=>void;viewer:string}) {
  const [kind,setKind]=useState<TaskRequestPolicyKind>('PRICE_PERMISSION');
  const {data,error,loading,refetch}=useDataQuery(provider=>provider.getTaskRequestPolicies(),[viewer]);
  const saved=data?.items.find(row=>row.kind===kind) ?? initial;
  return <BottomSheet isOpen onClose={onClose} title="سیاست تأیید درخواست">
    {error ? <EmptyState surface="task_request_policy" title="تنظیمات تأیید در دسترس نیست" description={error.message}
      actionLabel="تلاش دوباره" onAction={()=>void refetch()} compact/>
      : loading ? <LoadingState label="در حال دریافت سیاست" /> : <div className="space-y-3">
        <SearchableSelect label="نوع درخواست" options={types} value={kind} onChange={value=>setKind(value as TaskRequestPolicyKind)}/>
        <PolicyForm key={kind} viewer={viewer} kind={kind} saved={saved} onSaved={()=>void refetch()}/>
      </div>}
  </BottomSheet>;
}
