import { useRef, useState } from 'react';
import { toLatinDigits } from '../../lib/digits';
import { formatDecimalString } from '../../lib/format';
import { formatAppDate } from '../../lib/utils';
import { getActiveDataProvider } from '../../services/dataProvider';
import type { AdvanceDecisionInput, AdvanceForReview } from '../../services/personnelProfile';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { SearchableSelect } from '../ui/SearchableSelect';

const decisions=[{value:'APPROVED',label:'تأیید مبلغ'},{value:'REJECTED',label:'رد درخواست'}];

export function AdvanceReview({entries,highlight,onChanged}:{entries:AdvanceForReview[];highlight:string|null;onChanged:()=>Promise<void>}) {
  const [entry,setEntry]=useState<AdvanceForReview|null>(null);
  const [status,setStatus]=useState<AdvanceDecisionInput['status']>('APPROVED');
  const [amount,setAmount]=useState('');
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const request=useRef<{key:string;id:string}|null>(null);
  const inFlight=useRef(false);

  async function decide() {
    if (!entry || inFlight.current) return;
    const digits=toLatinDigits(amount).replace(/[٬,\s]/g,'');
    if (!reason.trim() || (status==='APPROVED' && !/^[1-9]\d{0,14}$/.test(digits))) {
      setError('علت تصمیم و مبلغ مصوب مثبت را وارد کنید.');return;
    }
    const body={status,amount:status==='APPROVED' ? digits : null,reason:reason.trim()};
    const key=JSON.stringify([entry.id,body]);
    const commandId=request.current?.key===key ? request.current.id : crypto.randomUUID();
    request.current={key,id:commandId};inFlight.current=true;
    setBusy(true);setError('');
    try {
      const result=await getActiveDataProvider().decidePersonnelAdvance(entry.id,{...body,commandId});
      if (result.id!==entry.id.toLowerCase()) throw new Error('رسید تصمیم از سرور دریافت نشد.');
      setEntry(null);request.current=null;
      setNotice(status==='APPROVED' ? 'تأیید مدیر ثبت شد. پرداخت جداگانه پیگیری می‌شود.' : 'رد درخواست در سرور ثبت شد.');
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ثبت تصمیم ممکن نشد.');
    } finally {inFlight.current=false;setBusy(false);}
  }

  return <>
    {entries.length>0 && <section className="space-y-2 border-t border-border pt-3" aria-label="مساعده‌های نیازمند تصمیم">
      <h3 className="text-sm font-bold">مساعده‌های نیازمند تصمیم من</h3>
      <ul className="divide-y divide-border text-caption">{entries.map(row=><li key={row.id}
        className={`flex flex-wrap items-center justify-between gap-2 rounded-lg py-2 ${row.id.toLowerCase()===highlight ? 'bg-primary-soft px-2' : ''}`}>
        <div><p className="font-semibold">{row.employee} · {formatDecimalString(row.requested)} ریال</p><p className="text-text-secondary">{formatAppDate(row.createdAt)}</p></div>
        <Button type="button" size="sm" variant="outline" onClick={()=>{setEntry(row);setStatus('APPROVED');setAmount(row.requested.split('.')[0]);setReason('');setError('');setNotice('');}}>بررسی</Button>
      </li>)}</ul>
    </section>}
    {notice && <p role="status" className="text-caption text-success">{notice}</p>}
    {entry && <Modal isOpen size="sm" title="بررسی درخواست مساعده" onClose={()=>{if(!busy)setEntry(null);}}>
      <form className="space-y-2" onSubmit={event=>{event.preventDefault();void decide();}}>
        <p className="text-sm font-semibold">{entry.employee} · {formatDecimalString(entry.requested)} ریال</p>
        <p className="whitespace-pre-wrap wrap-break-word text-caption text-text-secondary">{entry.reason}</p>
        <SearchableSelect label="تصمیم" options={decisions} value={status} disabled={busy} onChange={value=>setStatus(value as AdvanceDecisionInput['status'])} />
        {status==='APPROVED' && <Input label="مبلغ مصوب به ریال" inputMode="numeric" required maxLength={24} value={amount} disabled={busy} onChange={event=>setAmount(event.target.value)} />}
        <Textarea label="علت تصمیم" rows={3} required maxLength={1000} value={reason} disabled={busy} onChange={event=>setReason(event.target.value)} />
        {error && <p role="alert" className="text-caption text-danger">{error}</p>}
        <Button type="submit" variant={status==='APPROVED' ? 'primary' : 'danger'} loading={busy}>ثبت تصمیم</Button>
      </form>
    </Modal>}
  </>;
}
