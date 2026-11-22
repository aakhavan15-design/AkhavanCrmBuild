import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDataQuery } from '../../hooks/useDataProvider';
import { APPLICATION_STATUS_LABEL, type InterviewResult } from '../../lib/onboarding';
import { formatAppDate } from '../../lib/utils';
import { formatCount } from '../../lib/format';
import { getActiveDataProvider } from '../../services/dataProvider';
import type { RecruitmentAction, RecruitmentReviewInput, RecruitmentReviewRow } from '../../services/recruitmentReview';
import { requestPriorities, type RequestPriority } from '../../services/taskRequests';
import type { Attachment } from '../../types';
import { RequestPeople } from '../tasks/QuickTaskRequest';
import { Button } from '../ui/Button';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { EmptyState } from '../ui/EmptyState';
import { Input, Textarea } from '../ui/Input';
import { LoadingState } from '../ui/LoadingState';
import { Modal } from '../ui/Modal';
import { SearchableSelect } from '../ui/SearchableSelect';

const statusOptions=[{value:'',label:'همهٔ وضعیت‌ها'},...Object.entries(APPLICATION_STATUS_LABEL).map(([value,label])=>({value,label}))];
const names:Record<RecruitmentAction,string>={REVIEW:'شروع بررسی',NEEDS_INFORMATION:'درخواست اطلاعات تکمیلی',SCHEDULE:'تعیین مصاحبه',
  INTERVIEW_RESULT:'ثبت نتیجهٔ مصاحبه',ACCEPT:'پذیرش',REJECT:'رد درخواست',CREATE_EMPLOYEE:'تشکیل پروندهٔ استخدامی',LINK_USER:'اتصال حساب موجود'};
const interviewOptions=[{value:'ACCEPT',label:'مناسب برای پذیرش'},{value:'REJECT',label:'نامناسب'},{value:'FOLLOW_UP',label:'مصاحبهٔ تکمیلی'}];

function availableActions(row:RecruitmentReviewRow):RecruitmentAction[] {
  if (row.status==='ACCEPTED') return row.employmentId ? (row.userLinked ? [] : ['LINK_USER']) : ['CREATE_EMPLOYEE'];
  if (row.status==='REJECTED') return [];
  const actions:RecruitmentAction[]=[];
  if (row.status!=='UNDER_REVIEW') actions.push('REVIEW');
  if (row.status!=='NEEDS_INFORMATION') actions.push('NEEDS_INFORMATION');
  if (!row.interview || row.interview.result==='FOLLOW_UP') actions.push('SCHEDULE');
  if (row.interview && !row.interview.result && row.status==='UNDER_REVIEW') actions.push('INTERVIEW_RESULT');
  if (row.interview?.result==='ACCEPT' && row.status!=='NEEDS_INFORMATION') actions.push('ACCEPT');
  return [...actions,'REJECT'];
}

function ReviewDetails({row,attachments,viewer,canEdit,onSaved,onClose}:{row:RecruitmentReviewRow;attachments:Attachment[];viewer:string;
  canEdit:boolean;onSaved:(row:RecruitmentReviewRow)=>void;onClose:()=>void}) {
  const [action,setAction]=useState<RecruitmentAction|''>('');
  const [note,setNote]=useState('');
  const [day,setDay]=useState('');
  const [time,setTime]=useState('');
  const [address,setAddress]=useState('');
  const [interviewer,setInterviewer]=useState<string[]>([]);
  const [priority,setPriority]=useState<RequestPriority>('NORMAL');
  const [result,setResult]=useState<InterviewResult>('FOLLOW_UP');
  const [employeeCode,setEmployeeCode]=useState('');
  const [username,setUsername]=useState('');
  const [identityConfirmed,setIdentityConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const pending=useRef<{key:string;id:string}|null>(null);
  const sending=useRef(false);
  const options=canEdit ? availableActions(row).map(value=>({value,label:names[value]})) : [];
  const files=attachments.filter(file=>file.entityType==='APPLICATION' && file.entityId===row.id && row.documents.some(doc=>doc.attachmentId===file.id));

  async function save() {
    if (!action || sending.current) return;
    const data:Omit<RecruitmentReviewInput,'commandId'>={action,version:row.version,note};
    if (action==='SCHEDULE') Object.assign(data,{date:day,time,address,interviewerId:interviewer[0],priority});
    if (action==='INTERVIEW_RESULT') data.result=result;
    if (action==='CREATE_EMPLOYEE') Object.assign(data,{employeeCode,hireDate:day});
    if (action==='LINK_USER') Object.assign(data,{username,identityConfirmed});
    const key=JSON.stringify(data);
    const commandId=pending.current?.key===key ? pending.current.id : crypto.randomUUID();
    pending.current={key,id:commandId};sending.current=true;setBusy(true);setError('');
    try {
      const saved=await getActiveDataProvider().reviewRecruitmentApplication(row.id,{...data,commandId});
      if (saved.application?.id!==row.id) throw new Error('رسید ذخیرهٔ پرونده دریافت نشد.');
      pending.current=null;
      onSaved(saved.application);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت اقدام ممکن نشد.');
    } finally { sending.current=false;setBusy(false); }
  }

  return <Modal isOpen title={`${row.firstName} ${row.lastName}`} subtitle={APPLICATION_STATUS_LABEL[row.status]} onClose={()=>{if(!busy)onClose();}}>
    <div className="space-y-3 text-sm">
      <p>{row.desiredRole} · <bdi>{row.mobile}</bdi></p>
      {row.notes && <p className="whitespace-pre-wrap wrap-break-word">{row.notes}</p>}
      {row.documents.length>0 && <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">مدارک پیوست</summary>
        <ul className="space-y-1 text-caption">{files.map(file=><li key={file.id}>
          {/^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,/.test(file.base64Data ?? '') ?
            <a className="inline-flex min-h-11 items-center text-primary" href={file.base64Data} download={file.fileName}>{file.fileName}</a> : <span>{file.fileName}</span>}
        </li>)}</ul>
        {files.length<row.documents.length && <p className="text-caption text-text-secondary">برخی مدارک در دسترس این نشست نیستند.</p>}
      </details>}
      {row.interview && <div className="rounded-xl border border-border p-2 text-caption">
        <p>مصاحبه {formatAppDate(row.interview.date)} · <bdi>{row.interview.time}</bdi> · {row.interview.address}</p>
        {row.interview.priority && <p>اهمیت {requestPriorities.find(item=>item.value===row.interview?.priority)?.label}</p>}
        {row.interview.result && <p>{interviewOptions.find(item=>item.value===row.interview?.result)?.label} · {row.interview.resultNote}</p>}
        {row.interview.taskId.startsWith('taskreq-') && <Link to={`/tasks?request=${encodeURIComponent(row.interview.taskId)}`} className="inline-flex min-h-11 items-center text-primary">مشاهدهٔ تسک مصاحبه</Link>}
      </div>}
      {row.employmentId && <p className="text-caption text-success">{row.userLinked ? 'پروندهٔ استخدامی به حساب کاربری موجود متصل شد.' : 'پروندهٔ استخدامی تشکیل شده است و منتظر اتصال به حساب کاربری است.'}</p>}
      {row.history.length>0 && <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">تاریخچهٔ تصمیم‌ها</summary>
        <ul className="divide-y divide-border text-caption">{row.history.map((event,index)=><li key={`${event.at}:${index}`} className="py-2">
          {formatAppDate(event.at)} · {APPLICATION_STATUS_LABEL[event.status]}{event.note && <p className="whitespace-pre-wrap wrap-break-word">{event.note}</p>}
        </li>)}</ul></details>}

      {options.length>0 && <form className="space-y-2 border-t border-border pt-3" onSubmit={event=>{event.preventDefault();void save();}}>
        <SearchableSelect label="اقدام" options={options} value={action} disabled={busy} onChange={value=>{setAction(value as RecruitmentAction);setError('');}}/>
        {(action==='SCHEDULE' || action==='CREATE_EMPLOYEE') && <fieldset><legend className="text-caption">{action==='SCHEDULE'?'تاریخ مصاحبه':'تاریخ شروع همکاری'}</legend><CustomDatePicker value={day} onChange={setDay}/></fieldset>}
        {action==='SCHEDULE' && <>
          <Input label="ساعت مصاحبه" type="time" value={time} required disabled={busy} onChange={event=>setTime(event.target.value)} />
          <Input label="نشانی یا محل مصاحبه" value={address} maxLength={450} required disabled={busy} onChange={event=>setAddress(event.target.value)} />
          <RequestPeople viewer={viewer} label="مصاحبه‌کننده" context="recruitment" values={interviewer} onChange={setInterviewer}/>
          <SearchableSelect label="اهمیت پیگیری" value={priority} options={requestPriorities} disabled={busy}
            onChange={value=>setPriority(value as RequestPriority)}/>
        </>}
        {action==='INTERVIEW_RESULT' && <SearchableSelect label="نتیجهٔ مصاحبه" value={result} options={interviewOptions} disabled={busy}
          onChange={value=>setResult(value as InterviewResult)}/>}
        {action==='CREATE_EMPLOYEE' && <Input label="کد پرسنلی" value={employeeCode} maxLength={32} required disabled={busy} onChange={event=>setEmployeeCode(event.target.value)} />}
        {action==='LINK_USER' && <>
          <Input label="نام کاربری حساب موجود" value={username} maxLength={100} required disabled={busy} onChange={event=>setUsername(event.target.value)} />
          <label className="flex min-h-11 items-start gap-2 text-caption">
            <input type="checkbox" required checked={identityConfirmed} disabled={busy} onChange={event=>setIdentityConfirmed(event.target.checked)} />
            هویت متقاضی و تعلق حساب به او را از روی مدارک بررسی کرده‌ام.
          </label>
          <p className="text-caption text-text-secondary">مرجع نام کاربری، سیاست سازمان است. نقش و مجوز حساب با اتصال پرونده تغییر نمی‌کند.</p>
        </>}
        {action && <Textarea label="توضیح اقدام" value={note} rows={3} maxLength={750} disabled={busy} required={!['SCHEDULE','REVIEW'].includes(action)} onChange={event=>setNote(event.target.value)} />}
        {error && <p role="alert" className="text-caption text-danger">{error}</p>}
        {action && <Button type="submit" variant={action==='REJECT'?'danger':'primary'} loading={busy}>ثبت {names[action]}</Button>}
      </form>}
    </div>
  </Modal>;
}

export function RecruitmentReviewPanel({search,viewer,canEdit,attachments}:{search:string;viewer:string;canEdit:boolean;attachments:Attachment[]}) {
  const [status,setStatus]=useState('');
  const [page,setPage]=useState(1);
  const [query,setQuery]=useState(search.trim());
  const [row,setRow]=useState<RecruitmentReviewRow|null>(null);
  const [notice,setNotice]=useState('');
  useEffect(()=>{const timer=window.setTimeout(()=>{setQuery(search.trim());setPage(1);},250);return()=>window.clearTimeout(timer);},[search]);
  const key=JSON.stringify([query,viewer,status,page]);
  const {data,loading,error,refetch}=useDataQuery(async provider=>({key,result:await provider.listRecruitmentApplications(query.slice(0,100),status,page)}),[key]);
  const result=data?.key===key ? data.result : null;
  return <div className="space-y-2">
    <SearchableSelect label="وضعیت پرونده" options={statusOptions} value={status} onChange={value=>{setStatus(value);setPage(1);}} />
    {notice && <p role="status" className="text-caption text-success">{notice}</p>}
    {error ? <EmptyState surface="recruitment_review" title="دریافت پرونده‌ها ممکن نیست" description={error.message} compact actionLabel="تلاش دوباره" onAction={()=>void refetch()}/>
      : loading || !result ? <LoadingState label="در حال دریافت درخواست‌های همکاری"/> : <>
        {result.items.length ? <ul className="divide-y divide-border">{result.items.map(item=><li key={item.id}>
          <Button type="button" className="w-full justify-between rounded-none" variant="ghost" onClick={()=>{setRow(item);setNotice('');}}>
            <span className="min-w-0 text-start"><strong className="block wrap-break-word">{item.firstName} {item.lastName}</strong><span className="block text-caption">{item.desiredRole}</span></span>
            <span className="shrink-0 text-caption text-text-secondary">{APPLICATION_STATUS_LABEL[item.status]}</span>
          </Button>
        </li>)}</ul> : <EmptyState surface="recruitment_review" title="درخواست منطبق یافت نشد" compact/>}
        {(page>1 || result.hasMore) && <nav aria-label="صفحه‌بندی استخدام" className="flex justify-between">
          <Button type="button" size="sm" variant="ghost" disabled={page===1} onClick={()=>setPage(current=>current-1)}>قبلی</Button>
          <span className="text-caption">صفحهٔ {formatCount(page)}</span>
          <Button type="button" size="sm" variant="ghost" disabled={!result.hasMore} onClick={()=>setPage(current=>current+1)}>بعدی</Button>
        </nav>}
      </>}
    {row && <ReviewDetails key={row.id} row={row} attachments={attachments} viewer={viewer} canEdit={canEdit} onClose={()=>{setRow(null);void refetch();}}
      onSaved={()=>{setRow(null);setNotice('اقدام در پرونده ثبت شد.');void refetch();}}/>}
  </div>;
}
