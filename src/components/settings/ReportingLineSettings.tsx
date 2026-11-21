import { useRef, useState } from 'react';
import { useDataQuery } from '../../hooks/useDataProvider';
import { getActiveDataProvider } from '../../services/dataProvider';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Textarea } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
import { EmploymentDetails } from '../onboarding/EmploymentDetails';

export function ReportingLineSettings() {
  const {data,loading,error,refetch}=useDataQuery(provider=>provider.getReportingLines());
  const [userId,setUserId]=useState('');
  const employment=useDataQuery(async provider=>userId ? {userId,profile:await provider.getLinkedPersonnelProfile(userId)} : null,[userId,data]);
  const [managerChoice,setManagerChoice]=useState<string|null>(null);
  const [reason,setReason]=useState('');
  const [saving,setSaving]=useState(false);
  const [feedback,setFeedback]=useState<{error:boolean;text:string}|null>(null);
  const pending=useRef<{key:string;id:string}|null>(null);
  const people=error ? [] : data?.items ?? [];
  const selected=people.find(person=>person.id===userId);
  const managerId=managerChoice ?? selected?.managerId ?? '';
  const options=people.map(person=>({value:person.id,label:person.name}));
  const managerOptions=[{value:'',label:'بدون سرپرست مستقیم'},...options.filter(person=>person.value!==userId)];
  if (managerId && !managerOptions.some(option=>option.value===managerId)) {
    managerOptions.push({value:managerId,label:'سرپرست کنونی غیرفعال یا در دسترس نیست'});
  }
  const changed=Boolean(selected && managerId!==(selected.managerId ?? ''));

  async function save() {
    if (!selected || !changed || !reason.trim() || loading || saving) return;
    const input={managerId:managerId || null,expectedManagerId:selected.managerId,reason:reason.trim()};
    const key=JSON.stringify([selected.id,input]);
    const id=pending.current?.key===key ? pending.current.id : crypto.randomUUID();
    pending.current={key,id};
    setSaving(true);
    setFeedback(null);
    try {
      await getActiveDataProvider().changeReportingLine(selected.id,{...input,commandId:id});
      pending.current=null;
      await refetch();
      setManagerChoice(null);
      setReason('');
      setFeedback({error:false,text:'تغییر سرپرستی در سرور ثبت شد.'});
    } catch (cause) {
      setFeedback({error:true,text:cause instanceof Error ? cause.message : 'تغییر سرپرست انجام نشد.'});
      if (cause instanceof Error && 'status' in cause && cause.status===409) await refetch();
    } finally {
      setSaving(false);
    }
  }

  return <Card padding="sm" className="space-y-2">
    <h3 className="font-semibold">سرپرستی و نظارت بر درخواست‌ها</h3>
    <form className="space-y-2" onSubmit={event=>{event.preventDefault();void save();}}>
      <div className="grid gap-2 sm:grid-cols-2">
        <SearchableSelect label="کاربر" value={userId} options={options} loading={loading} error={error?.message}
          disabled={saving} onChange={id=>{setUserId(id);setManagerChoice(null);setReason('');setFeedback(null);}}/>
        <SearchableSelect label="سرپرست مستقیم" value={managerId} options={managerOptions}
          disabled={!selected || saving || loading} onChange={setManagerChoice}/>
      </div>
      {changed && <Textarea label="دلیل تغییر" maxLength={600} rows={2} required disabled={saving}
        value={reason} onChange={event=>setReason(event.target.value)}/>}
      {feedback && <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'text-sm text-danger' : 'text-sm text-success'}>{feedback.text}</p>}
      {error && <Button type="button" variant="ghost" size="sm" onClick={()=>void refetch()}>تلاش دوباره</Button>}
      {changed && <Button type="submit" disabled={saving || loading || !reason.trim()}>{saving ? 'در حال ثبت…' : 'ثبت تغییر سرپرستی'}</Button>}
    </form>
    {selected && <section className="space-y-2 border-t border-border pt-2" aria-label="پروندهٔ استخدامی مرتبط">
      {employment.error ? <p role="status" className="text-caption text-warning">دریافت پروندهٔ استخدامی ممکن نیست.</p>
        : employment.data?.userId===userId && !employment.loading ? <EmploymentDetails profile={employment.data.profile}/>
          : <p role="status" className="text-caption">در حال دریافت پروندهٔ استخدامی…</p>}
    </section>}
  </Card>;
}
