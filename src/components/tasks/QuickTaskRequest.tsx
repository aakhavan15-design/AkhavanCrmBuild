import { useCallback, useState } from 'react';
import { useDataQuery } from '../../hooks/useDataProvider';
import { toLatinDigits } from '../../lib/digits';
import { getActiveDataProvider } from '../../services/dataProvider';
import { requestKinds, requestPriorities, taskDocumentLabels, type RequestPriority, type TaskFinancialReference, type TaskRequestInput, type TaskRequestKind, type TaskRequestRecord, type TaskRequestResource } from '../../services/taskRequests';
import type { Account } from '../../types';
import { BottomSheet } from '../ui/BottomSheet';
import { Button } from '../ui/Button';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { Input, Textarea } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
import { RequestFilePicker, type QueuedRequestFile } from './TaskRequestFiles';

type Option = {value:string;label:string};
const financialTypes: TaskFinancialReference[] = ['INVOICE','CHEQUE'];
const allowsDocuments = (kind: TaskRequestKind) => ['FINANCE','COLLECTION','ORDER_APPROVAL'].includes(kind);

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

function ResourceControl({type,accountId,value,chosenLabel,onSelect,label,excluded=[]}:{
  type:TaskRequestResource; accountId:string; value:string; chosenLabel?:string;
  onSelect:(id:string,label:string)=>void; label:string; excluded?:string[];
}) {
  const [search,setSearch]=useState('');
  const onSearch=useCallback((value:string)=>setSearch(toLatinDigits(value).slice(0,80)),[]);
  const {data,loading,error}=useDataQuery(async provider => accountId ? {
    accountId,items:(await provider.getTaskRequestResources(type,accountId,search)).items,
  } : null,[accountId,type,search]);
  const options=(data?.accountId===accountId ? data.items : []).filter(item=>!excluded.includes(item.id))
    .map(item=>({value:item.id,label:item.sku ? `${item.title} · ${item.sku}` : item.title}));
  if (type==='PRICE_AUTHORIZATION') options.unshift({value:'',label:'بدون مجوز ویژهٔ مرتبط'});
  if (value && chosenLabel && !options.some(option=>option.value===value)) options.push({value,label:chosenLabel});
  return <SearchableSelect label={label} value={value} options={options} loading={loading} error={error?.message} onSearch={onSearch} minQueryLength={0}
    onChange={id=>onSelect(id,options.find(item=>item.value===id)?.label ?? '')} />;
}

export function QuickTaskRequest({open,viewer,accounts,onClose,onSaved,initial,initialLinkLabels,submitRevision}:{
  open:boolean;viewer:string;accounts:Account[];onClose:()=>void;onSaved:(id:string,record:TaskRequestRecord)=>void;initial?:Partial<TaskRequestInput>;
  initialLinkLabels?:Record<string,string>;
  submitRevision?:(input:TaskRequestInput)=>Promise<void>;
}) {
  const empty=():TaskRequestInput=>({requestId:crypto.randomUUID(),kind:'GENERAL',title:'',description:'',priority:'NORMAL',
    accountId:null,assigneeId:viewer,dueDate:null,confidential:false,watchers:[],links:[],priceItems:[],...initial});
  const [draft,setDraft]=useState<TaskRequestInput>(empty);
  const [linkLabels,setLinkLabels]=useState(initialLinkLabels ?? {});
  const [showDocuments,setShowDocuments]=useState(Boolean(initial?.links?.some(item=>item.type!=='ORDER')));
  const [files,setFiles]=useState<QueuedRequestFile[]>([]);
  const [savedRequest,setSavedRequest]=useState<TaskRequestRecord|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [more,setMore]=useState(Boolean(initial?.watchers?.length || initial?.dueDate || initial?.confidential));
  const set=<K extends keyof TaskRequestInput,>(key:K,value:TaskRequestInput[K])=>setDraft(current=>({...current,[key]:value}));
  const locked=Boolean(submitRevision);
  const needsAccount=['PRICE_INQUIRY','PRICE_PERMISSION','ORDER_APPROVAL','COLLECTION'].includes(draft.kind);
  const updateKind=(kind:TaskRequestKind)=>setDraft(current=>current.kind===kind ? current : {...current,kind,
    links:current.links.filter(item=>item.type==='ORDER' ? kind==='ORDER_APPROVAL' : allowsDocuments(kind)),priceAuthorizationId:null,priceItems:[]});
  const selectAccount=(accountId:string)=>setDraft(current=>current.accountId===(accountId || null) ? current :
    {...current,accountId:accountId || null,links:[],priceAuthorizationId:null,priceItems:[]});
  const order=draft.links.find(item=>item.type==='ORDER');
  const documents=draft.links.flatMap(({type,id})=>type==='ORDER' ? [] : [{type,id}]);

  function addDocument(type:TaskFinancialReference,id:string,label:string) {
    setDraft(current=>{
      const limit=current.kind==='ORDER_APPROVAL' ? 4 : 5;
      if (current.links.filter(link=>link.type!=='ORDER').length>=limit || current.links.some(link=>link.type===type && link.id===id)) return current;
      return {...current,links:[...current.links,{type,id}]};
    });
    setLinkLabels(previous=>({...previous,[`${type}:${id}`]:label}));
  }

  async function submit() {
    if (busy) return;
    setError('');
    if (draft.title.trim().length<3 || !draft.assigneeId || (needsAccount && !draft.accountId)) {
      setError('عنوان، مسئول و مشتری موردنیاز را مشخص کنید.'); return;
    }
    if (draft.kind==='ORDER_APPROVAL' && !order) {setError('سفارش مرتبط را انتخاب کنید.');return;}
    if (draft.links.length>5) {setError('حداکثر پنج پیوند، شامل سفارش مرتبط، می‌توان ثبت کرد.');return;}
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
        setDraft(empty());setLinkLabels(initialLinkLabels ?? {});setSavedRequest(null);
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
      {draft.kind==='ORDER_APPROVAL' && draft.accountId && <ResourceControl key={`order:${draft.accountId}`} type="ORDER" accountId={draft.accountId} label="سفارش مرتبط" value={order?.id ?? ''}
        chosenLabel={order ? linkLabels[`ORDER:${order.id}`] || 'سفارش پیوندخورده' : undefined}
        onSelect={(id,label)=>{setLinkLabels(previous=>({...previous,[`ORDER:${id}`]:label}));set('links',[...documents,{type:'ORDER',id}]);}} />}
      {draft.kind==='ORDER_APPROVAL' && draft.accountId && <ResourceControl type="PRICE_AUTHORIZATION" accountId={draft.accountId}
        label="مجوز قیمت ویژهٔ مرتبط (اختیاری)" value={draft.priceAuthorizationId ?? ''} chosenLabel="مجوز انتخاب‌شده"
        onSelect={id=>set('priceAuthorizationId',id || null)}/>}
      {draft.accountId && allowsDocuments(draft.kind) && <div className="space-y-2">
        <Button type="button" variant="ghost" size="sm" aria-expanded={showDocuments} onClick={()=>setShowDocuments(previous=>!previous)}>
          اسناد مالی مرتبط
        </Button>
        {showDocuments && <>
          {documents.length>0 && <ul className="space-y-1 text-sm">{documents.map(({type,id})=>{
            const label=linkLabels[`${type}:${id}`] || 'سند پیوندخورده';
            return <li key={`${type}:${id}`} className="flex items-center justify-between gap-2">
              <span>{taskDocumentLabels[type]} · <bdi>{label}</bdi></span>
              <Button type="button" variant="ghost" size="sm" aria-label={`حذف پیوند ${label}`}
                onClick={()=>set('links',draft.links.filter(link=>link.id!==id || link.type!==type))}>حذف</Button>
            </li>;
          })}</ul>}
          {documents.length<(draft.kind==='ORDER_APPROVAL' ? 4 : 5) && <div className="grid gap-2 sm:grid-cols-2">
            {financialTypes.map(type=><ResourceControl key={`${type}:${draft.accountId}`} type={type} accountId={draft.accountId!} value=""
              label={`افزودن ${taskDocumentLabels[type]}`} excluded={documents.filter(link=>link.type===type).map(link=>link.id)}
              onSelect={(id,label)=>addDocument(type,id,label)} />)}
          </div>}
        </>}
      </div>}
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
