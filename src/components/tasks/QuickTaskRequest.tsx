import { useCallback, useState } from 'react';
import { useDataQuery } from '../../hooks/useDataProvider';
import { toLatinDigits } from '../../lib/digits';
import { getActiveDataProvider } from '../../services/dataProvider';
import { requestKinds, requestPriorities, type RequestPriority, type TaskRequestInput, type TaskRequestKind, type TaskRequestRecord } from '../../services/taskRequests';
import type { Account } from '../../types';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { Input, Textarea } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
import { RequestFilePicker, type QueuedRequestFile } from './TaskRequestFiles';

type Option = {value:string;label:string};

export function RequestPeople({viewer,values,onChange,label,multiple=false}:{
  viewer:string; values:string[]; onChange:(values:string[])=>void; label:string; multiple?:boolean;
}) {
  const [search,setSearch]=useState('');
  const [picked,setPicked]=useState<Option[]>([]);
  const onSearch=useCallback((value:string)=>setSearch(value.slice(0,80)),[]);
  const {data,loading,error}=useDataQuery(async provider => ({
    viewer,items:(await provider.getTaskRequestDirectory(search)).items,
  }),[search,viewer]);
  const options=[...new Map([...picked,...(data?.viewer===viewer ? data.items : []).map(user => ({value:user.id,label:user.name}))].map(option => [option.value,option])).values()];
  return <div className="space-y-1">
    <SearchableSelect label={label} value={multiple ? '' : values[0] ?? ''} options={options.filter(option => !multiple || !values.includes(option.value))}
      onSearch={onSearch} loading={loading} error={error?.message}
      onChange={id=>{
        const option=options.find(item=>item.value===id);
        if (!option) return;
        setPicked(previous=>[...new Map([...previous,option].map(item=>[item.value,item])).values()]);
        if (multiple && values.length<8) onChange([...new Set([...values,id])]);
        if (!multiple) onChange([id]);
      }}/>
    {multiple && values.length>0 && <ul className="flex flex-wrap gap-1">
      {values.map(id=><li key={id}><Button type="button" variant="ghost" size="sm"
        aria-label={`حذف ناظر ${options.find(option=>option.value===id)?.label ?? 'انتخاب‌شده'}`}
        onClick={()=>onChange(values.filter(value=>value!==id))}>{options.find(option=>option.value===id)?.label ?? 'ناظر انتخاب‌شده'} ×</Button></li>)}
    </ul>}
  </div>;
}

function ResourceControl({type,accountId,value,chosenLabel,onSelect,label}:{
  type:'ORDER'|'PRODUCT'; accountId:string; value:string; chosenLabel?:string;
  onSelect:(id:string,label:string)=>void; label:string;
}) {
  const [search,setSearch]=useState('');
  const onSearch=useCallback((value:string)=>setSearch(value.slice(0,80)),[]);
  const {data,loading,error}=useDataQuery(async provider => accountId ? {
    accountId,items:(await provider.getTaskRequestResources(type,accountId,search)).items,
  } : null,[accountId,type,search]);
  const options=(data?.accountId===accountId ? data.items : []).map(item=>({value:item.id,label:item.sku ? `${item.title} · ${item.sku}` : item.title}));
  if (value && chosenLabel && !options.some(option=>option.value===value)) options.push({value,label:chosenLabel});
  return <SearchableSelect label={label} value={value} options={options} loading={loading} error={error?.message} onSearch={onSearch}
    onChange={id=>onSelect(id,options.find(item=>item.value===id)?.label ?? '')} />;
}

export function QuickTaskRequest({open,viewer,accounts,onClose,onSaved,initial,submitRevision}:{
  open:boolean;viewer:string;accounts:Account[];onClose:()=>void;onSaved:(id:string,record:TaskRequestRecord)=>void;initial?:Partial<TaskRequestInput>;
  submitRevision?:(input:TaskRequestInput)=>Promise<void>;
}) {
  const empty=():TaskRequestInput=>({requestId:crypto.randomUUID(),kind:'GENERAL',title:'',description:'',priority:'NORMAL',
    accountId:null,assigneeId:viewer,dueDate:null,confidential:false,watchers:[],links:[],priceItems:[],...initial});
  const [draft,setDraft]=useState<TaskRequestInput>(empty);
  const [orderLabel,setOrderLabel]=useState('');
  const [files,setFiles]=useState<QueuedRequestFile[]>([]);
  const [savedRequest,setSavedRequest]=useState<TaskRequestRecord|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [more,setMore]=useState(Boolean(initial?.watchers?.length || initial?.dueDate || initial?.confidential));
  const set=<K extends keyof TaskRequestInput,>(key:K,value:TaskRequestInput[K])=>setDraft(current=>({...current,[key]:value}));
  const locked=Boolean(submitRevision);
  const needsAccount=['PRICE_INQUIRY','PRICE_PERMISSION','ORDER_APPROVAL','COLLECTION'].includes(draft.kind);
  const updateKind=(kind:TaskRequestKind)=>setDraft(current=>({...current,kind,links:[],priceItems:[]}));
  const selectAccount=(accountId:string)=>setDraft(current=>({...current,accountId:accountId || null,links:[],priceItems:[]}));
  const order=draft.links.find(item=>item.type==='ORDER');

  async function submit() {
    if (busy) return;
    setError('');
    if (draft.title.trim().length<3 || !draft.assigneeId || (needsAccount && !draft.accountId)) {
      setError('عنوان، مسئول و مشتری موردنیاز را مشخص کنید.'); return;
    }
    if (draft.kind==='ORDER_APPROVAL' && !order) {setError('سفارش مرتبط را انتخاب کنید.');return;}
    if (draft.kind==='PRICE_PERMISSION' && (!draft.priceItems.length || draft.priceItems.some(item=>!item.productId || !item.price || !item.quantity))) {
      setError('کالا، مقدار و فی پیشنهادی هر قلم را وارد کنید.');return;
    }
    setBusy(true);
    try {
      if (submitRevision) {
        await submitRevision(draft);
      } else {
        const provider=getActiveDataProvider();
        const saved=savedRequest ?? await provider.submitTaskRequest(draft);
        if (!saved.task?.id) throw new Error('سرور ثبت درخواست را تأیید نکرد.');
        setSavedRequest(saved);
        for (const item of files) {
          await provider.uploadTaskRequestFile(saved.task.id,item.file,item.id);
          setFiles(current=>current.filter(file=>file.id!==item.id));
        }
        setDraft(empty());setSavedRequest(null);
        onSaved(saved.task.id,saved);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ثبت درخواست انجام نشد.');
    } finally {setBusy(false);}
  }

  if (savedRequest) return <BottomSheet isOpen={open} title="مدارک درخواست ثبت‌شده" onClose={()=>{if (!busy) onClose();}}>
    <div className="space-y-2">
      <p className="text-sm">درخواست در سرور ثبت شد. پیوست‌های باقی‌مانده را بررسی کنید.</p>
      <RequestFilePicker files={files} setFiles={setFiles} disabled={busy}/>
      {error && <p role="alert" className="text-caption text-danger">{error}</p>}
      <Button type="button" disabled={busy} onClick={()=>void submit()}>{busy?'در حال ارسال…':files.length?'تلاش برای ارسال پیوست‌ها':'باز کردن درخواست'}</Button>
    </div>
  </BottomSheet>;

  return <BottomSheet isOpen={open} onClose={()=>{if(!busy)onClose();}} title={locked ? 'بازبینی نسخهٔ درخواست' : 'درخواست جدید'}
    subtitle={locked ? 'تصمیم‌ها برای نسخهٔ جدید دوباره بررسی می‌شوند.' : undefined}>
    <form className="space-y-3" onSubmit={event=>{event.preventDefault();void submit();}}>
      <div className="grid gap-2 sm:grid-cols-2">
        <SearchableSelect label="نوع درخواست" value={draft.kind} options={requestKinds.map(item=>({...item}))} disabled={locked}
          onChange={value=>updateKind(value as TaskRequestKind)} />
        <SearchableSelect label="سطح اهمیت" value={draft.priority} options={requestPriorities.map(item=>({...item}))}
          onChange={value=>set('priority',value as RequestPriority)} />
      </div>
      <Input label="عنوان کوتاه" required maxLength={160} value={draft.title} onChange={event=>set('title',event.target.value)} />
      <Textarea label="شرح آزاد" rows={4} maxLength={4000} value={draft.description} onChange={event=>set('description',event.target.value)}
        placeholder={draft.kind==='PRICE_INQUIRY' ? 'مثلاً شرایط توافق و قیمتی که نیاز به بررسی دارد…' : 'آنچه مسئول برای اقدام باید بداند…'} />
      <div className="grid gap-2 sm:grid-cols-2">
        <SearchableSelect label={needsAccount ? 'مشتری' : 'مشتری مرتبط (اختیاری)'} value={draft.accountId ?? ''} disabled={locked}
          options={[{value:'',label:'انتخاب مشتری'},...accounts.map(account=>({value:account.id,label:account.name}))]}
          onChange={selectAccount} />
        <RequestPeople viewer={viewer} label="مسئول رسیدگی" values={[draft.assigneeId]} onChange={values=>set('assigneeId',values[0])} />
      </div>
      {draft.kind==='ORDER_APPROVAL' && draft.accountId && <ResourceControl type="ORDER" accountId={draft.accountId} label="سفارش مرتبط" value={order?.id ?? ''} chosenLabel={orderLabel}
        onSelect={(id,label)=>{setOrderLabel(label);set('links',[...draft.links.filter(item=>item.type!=='ORDER'),{type:'ORDER',id}]);}} />}
      {draft.kind==='PRICE_PERMISSION' && draft.accountId && <fieldset className="space-y-2 rounded-xl border border-border p-2">
        <legend className="px-1 font-semibold">اقلام مجوز قیمت</legend>
        {draft.priceItems.map((item,index)=><div key={index} className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-2">
          <ResourceControl type="PRODUCT" accountId={draft.accountId!} label="کالا" value={item.productId} chosenLabel={item.title}
            onSelect={(productId,title)=>set('priceItems',draft.priceItems.map((row,i)=>i===index ? {...row,productId,title}:row))} />
          <Input label="مقدار مجاز" inputMode="decimal" value={item.quantity}
            onChange={event=>set('priceItems',draft.priceItems.map((row,i)=>i===index ? {...row,quantity:toLatinDigits(event.target.value).replace('٫','.')}:row))} />
          <Input label="فی پیشنهادی به ریال" inputMode="decimal" value={item.price}
            onChange={event=>set('priceItems',draft.priceItems.map((row,i)=>i===index ? {...row,price:toLatinDigits(event.target.value).replace('٫','.')}:row))} />
          <Button type="button" variant="ghost" size="sm" onClick={()=>set('priceItems',draft.priceItems.filter((_,i)=>i!==index))}>حذف قلم</Button>
        </div>)}
        <Button type="button" variant="outline" disabled={draft.priceItems.length>=30}
          onClick={()=>set('priceItems',[...draft.priceItems,{productId:'',price:'',quantity:'1'}])}>افزودن کالا</Button>
      </fieldset>}
      <Button type="button" variant="ghost" size="sm" aria-expanded={more} onClick={()=>setMore(!more)}>مهلت و ناظران</Button>
      {more && <div className="space-y-2">
        <fieldset><legend className="text-caption">مهلت پیگیری (اختیاری)</legend><CustomDatePicker value={draft.dueDate ?? ''} onChange={value=>set('dueDate',value || null)} /></fieldset>
        <RequestPeople viewer={viewer} label="افزودن ناظر (با مجوز)" multiple values={draft.watchers} onChange={values=>set('watchers',values)} />
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.confidential}
          onChange={event=>set('confidential',event.target.checked)} /> محرمانگی ویژه</label>
      </div>}
      {!locked && <RequestFilePicker files={files} setFiles={setFiles} disabled={busy}/>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={busy}>{busy ? 'در حال ثبت…' : locked ? 'ثبت نسخهٔ جدید' : 'ثبت و ارجاع'}</Button>
    </form>
  </BottomSheet>;
}
