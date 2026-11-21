import React, { useMemo, useRef, useState } from 'react';
import type { AppState, AdvanceRequest, Attachment } from '../../types';
import { Textarea } from '../ui';
import { DynamicFormRenderer } from '../shared/DynamicFormRenderer';
import { DocumentField, DocFile } from '../shared/DocumentField';
import { PERSONNEL_IDENTITY_SCHEMA, PERSONNEL_BANK_SCHEMA, PERSONNEL_ADDRESS_SCHEMA } from '../../services/dynamicFormEngine';
import { computeMissing, ensurePersonnelFile, FILE_STATUS_LABEL, getOnboardingConfig, savePersonnelStep, setPersonnelDocument, submitPersonnelFile, type PersonnelFile } from '../../lib/onboarding';
import { generateId, formatCurrency } from '../../lib/utils';
import { Button } from '../ui/Button';
import { CheckCircle2, CircleAlert, Wallet, FileText, ArrowUpRight, Plus, HelpCircle } from 'lucide-react';
import { InputControl } from '../ui/Input';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { EmptyState } from '../ui/EmptyState';
import { EmploymentDetails } from './EmploymentDetails';
import { useDataQuery } from '../../hooks/useDataProvider';
import { getActiveDataProvider } from '../../services/dataProvider';
import { toLatinDigits, toPersianDigits } from '../../lib/digits';
import { formatDecimalString } from '../../lib/format';

type Step = 'identity' | 'documents' | 'bank' | 'address' | 'payroll';
const STEPS: { id: Step; label: string }[] = [
  { id: 'identity', label: 'هویت' },
  { id: 'documents', label: 'مدارک' },
  { id: 'bank', label: 'بانکی' },
  { id: 'address', label: 'نشانی' },
  { id: 'payroll', label: 'حقوق و مساعده' }
];
const advanceStatuses:Record<string,string>={REQUESTED:'در انتظار بررسی',APPROVED:'تأییدشده',REJECTED:'ردشده',SETTLED:'تسویه‌شده',CANCELLED:'لغوشده'};

export function PersonnelFilePage({ state, updateState }: { state: AppState; updateState: (u: (d: AppState) => AppState | void) => void }) {
  const me = state.currentUserId || ''; 
  const cfg = getOnboardingConfig(state); 
  const [step, setStep] = useState<Step>('identity'); 
  const [msg, setMsg] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceReason, setAdvanceReason] = useState('');
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceError,setAdvanceError]=useState('');
  const [advanceBusy,setAdvanceBusy]=useState(false);
  const advanceInFlight=useRef(false);
  const advanceAttempt=useRef<{key:string;id:string}|null>(null);
  const remote=getActiveDataProvider().name==='SQLSERVER_BACKEND';
  const employmentQuery=useDataQuery(async provider=>remote && me ? {viewer:me,profile:await provider.getOwnPersonnelProfile()} : null,[me,remote]);
  const profile=employmentQuery.data?.viewer===me && !employmentQuery.error ? employmentQuery.data.profile : null;
  const eligible=profile?.employment && ['ACTIVE','PROBATION'].includes(profile.employment.employmentStatus);

  const file = (state.personnelFiles as PersonnelFile[] | undefined)?.find(item => item.userId === me);
  const eff: Pick<PersonnelFile, 'identity' | 'bank' | 'address' | 'documents' | 'status' | 'reviewNote'> = file ?? {
    identity: { fullName: state.users?.find(user => user.id === me)?.name || '' },
    bank: {}, address: {}, documents: {}, status: 'INCOMPLETE',
  };
  const missing = useMemo(() => computeMissing(eff, cfg), [eff, cfg]);
  const locked = eff.status === 'SUBMITTED_FOR_REVIEW';

  const userPayslips = (state.payslips || []).filter(p => p.userId === me);
  const latestPayslip = userPayslips[userPayslips.length - 1];
  const userAdvances = (state.advanceRequests || []).filter(a => a.userId === me);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 5000); };
  
  const saveStep = (s: 'identity' | 'bank' | 'address') => (v: Record<string, unknown>) => {
    let r: { ok: boolean; reason?: string } = { ok: false }; 
    updateState(d => { r = savePersonnelStep(d, me, s, v, new Date()); }); 
    flash(r.ok ? 'ذخیره موقت انجام شد.' : r.reason || 'ذخیره نشد.');
  };

  const putDoc = (kind: string, document: DocFile | null) => {
    if (!me || locked) return;
    const attId = document ? generateId() : null;
    let r: { ok: boolean; reason?: string } = { ok: false };
    updateState(d => { 
      r = setPersonnelDocument(d, me, kind, attId, new Date()); 
      if (r.ok && attId && document) {
        (d.attachments ??= []).push({
          ...document, id: attId, entityId: me, entityType: 'PERSONNEL_FILE',
          uploadedAt: new Date().toISOString(), uploadedBy: me, docKind: kind,
        });
      }
    });
    if (!r.ok) flash(r.reason || 'مدرک تغییر نکرد.');
  };

  const attachments: Attachment[] = state.attachments || [];
  const attOf = (id?: string) => id ? attachments.find(attachment =>
    attachment.id === id && attachment.entityId === me && attachment.entityType === 'PERSONNEL_FILE'
  ) : undefined;

  const submit = () => { 
    let r: { ok: boolean; missing: { label: string }[] } = { ok: false, missing: [] }; 
    updateState(d => { 
      ensurePersonnelFile(d, me, new Date()); 
      r = submitPersonnelFile(d, me, new Date()); 
    }); 
    flash(r.ok ? (remote ? 'پرونده در صف همگام‌سازی برای بررسی قرار گرفت.' : 'درخواست بررسی در دادهٔ محلی ذخیره شد.')
      : `موارد ناقص: ${r.missing.map(item => item.label).join('، ')}`);
  };

  const handleRequestAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (advanceInFlight.current) return;
    setAdvanceError('');
    const digits = toLatinDigits(advanceAmount).replace(/[٬,\s]/g,'');
    const reason=advanceReason.trim();
    if (!/^[1-9]\d{0,14}$/.test(digits) || !reason || reason.length>500) {
      setAdvanceError('مبلغ صحیح مثبت و علت حداکثر ۵۰۰ نویسه الزامی است.');
      return;
    }
    if (remote) {
      const key=JSON.stringify([me,digits,reason]);
      const id=advanceAttempt.current?.key===key ? advanceAttempt.current.id : crypto.randomUUID();
      advanceAttempt.current={key,id};
      advanceInFlight.current=true;
      setAdvanceBusy(true);
      try {
        const receipt=await getActiveDataProvider().requestPersonnelAdvance({id,amount:digits,reason});
        if (receipt.id!==id || !receipt.number) throw new Error('رسید ثبت درخواست از سرور دریافت نشد.');
        advanceAttempt.current=null;
        setShowAdvanceModal(false);setAdvanceAmount('');setAdvanceReason('');
        flash('درخواست در سرور ثبت شد و در انتظار بررسی است.');
        await employmentQuery.refetch();
      } catch (error) {
        setAdvanceError(error instanceof Error ? error.message : 'ثبت درخواست مساعده ممکن نشد.');
      } finally {
        advanceInFlight.current=false;setAdvanceBusy(false);
      }
      return;
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    const newReq: AdvanceRequest = {
      id: generateId(),
      requestNumber: `ADV-${Date.now().toString().slice(-4)}`,
      userId: me,
      requestedAmountRials: Number(digits),
      reason,
      targetMonth: currentMonth,
      status: 'REQUESTED',
      createdAt: new Date().toISOString()
    };

    updateState(d => {
      if (!d.advanceRequests) d.advanceRequests = [];
      d.advanceRequests.unshift(newReq);
    });

    setShowAdvanceModal(false);
    setAdvanceAmount('');
    setAdvanceReason('');
    flash('درخواست مساعده در دادهٔ محلی ذخیره شد.');
  };

  return (
    <div className="mx-auto max-w-2xl space-y-3.5 p-3 sm:p-4 pb-24" dir="rtl">
      <header className="space-y-0.5">
        <h1 data-tour-heading className="text-base font-bold text-text-main">پرونده پرسنلی و امور رفاهی من</h1>
        <p className="text-xs text-text-secondary">
          وضعیت مدارک: <b className="text-primary">{FILE_STATUS_LABEL[eff.status]}</b>
          {missing.length > 0 && ` · ${missing.length.toLocaleString('fa-IR')} مورد نیازمند تکمیل`}
        </p>
      </header>
      {remote && <Card padding="sm" className="space-y-2">
        <h2 className="text-sm font-bold">هویت و وضعیت استخدام</h2>
        {employmentQuery.error ? <EmptyState surface="personnel_profile" title="دریافت پرونده از سرور ممکن نیست"
          compact actionLabel="تلاش دوباره" onAction={()=>void employmentQuery.refetch()}/> : profile ? <EmploymentDetails profile={profile}/>
          : <p role="status" className="text-caption">در حال دریافت پرونده…</p>}
      </Card>}

      {eff.status === 'NEEDS_CORRECTION' && eff.reviewNote && (
        <p role="alert" className="rounded-xl bg-danger-soft p-2.5 text-xs text-danger font-medium">
          درخواست اصلاح مدیر: {eff.reviewNote}
        </p>
      )}

      {eff.status === 'APPROVED' && (
        <p className="rounded-xl bg-success-soft p-2.5 text-xs text-success flex items-center gap-1.5 font-medium">
          <CheckCircle2 size={14} className="shrink-0" />
          <span>مدارک هویتی و پرسنلی شما مورد تأیید قرار گرفته است.</span>
        </p>
      )}

      {/* تب‌های ناوبری مراحل پرونده */}
      <nav id="personnel-nav" data-tour-actions className="flex gap-1 overflow-x-auto no-scrollbar" aria-label="مراحل پرونده">
        {STEPS.map(s => { 
          const bad = missing.some(m => m.key.startsWith(s.id === 'documents' ? 'doc.' : s.id + '.')); 
          return (
            <button 
              key={s.id} 
              onClick={() => setStep(s.id)} 
              aria-current={step === s.id ? 'step' : undefined} 
              className={`h-9 px-3 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer transition-all flex items-center gap-1 ${
                step === s.id 
                  ? 'bg-primary text-on-primary shadow-xs' 
                  : 'bg-surface border border-border text-text-secondary hover:text-text-main'
              }`}
            >
              <span>{s.label}</span>
              {bad && <CircleAlert size={12} className="text-danger" aria-label="ناقص" />}
            </button>
          ); 
        })}
      </nav>

      {/* محتوای هر مرحله */}
      <section className="bg-surface border border-border rounded-xl p-3.5 space-y-3">
        {locked && (
          <p className="rounded-lg bg-warning-soft p-2 text-caption text-warning">
            پرونده در حال حاضر در انتظار بررسی مدیر بوده و موقتاً قفل است.
          </p>
        )}

        {step === 'identity' && <DynamicFormRenderer schema={PERSONNEL_IDENTITY_SCHEMA} initialValues={eff.identity} onSubmit={saveStep('identity')} submitLabel="ذخیره موقت" isSubmitting={locked} />}
        {step === 'bank' && <DynamicFormRenderer schema={PERSONNEL_BANK_SCHEMA} initialValues={eff.bank} onSubmit={saveStep('bank')} submitLabel="ذخیره موقت" isSubmitting={locked} />}
        {step === 'address' && <DynamicFormRenderer schema={PERSONNEL_ADDRESS_SCHEMA} initialValues={eff.address} onSubmit={saveStep('address')} submitLabel="ذخیره موقت" isSubmitting={locked} />}
        
        {step === 'documents' && (
          <div className="space-y-2.5">
            {cfg.requiredDocs.map(d => { 
              const a = attOf(eff.documents?.[d.key]);
              return (
                <DocumentField 
                  key={d.key} 
                  label={d.label} 
                  required={d.required} 
                  value={a ? { fileName: a.fileName, fileType: a.fileType, fileSize: a.fileSize, base64Data: a.base64Data } : null} 
                  onChange={file => putDoc(d.key, file)}
                  readOnly={locked}
                  hint={a ? 'بارگذاری شده' : undefined} 
                />
              ); 
            })}
          </div>
        )}

        {step==='payroll' && remote && <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold">سوابق حقوق و مساعده</h3>
            <Button type="button" size="sm" variant="soft" disabled={!eligible} onClick={()=>{setAdvanceError('');setShowAdvanceModal(true);}}>درخواست مساعده</Button>
          </div>
          {!profile ? <p className="text-caption">سوابق فیش و مساعده در دسترس نیست.</p> : <>
            {profile.payslips.length ? <details open className="rounded-xl border border-border p-2">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">فیش‌های حقوقی</summary>
              <ul className="divide-y divide-border text-caption">{profile.payslips.map(slip=><li key={slip.id} className="space-y-1 py-2">
                <p className="font-semibold">دورهٔ میلادی <bdi>{toPersianDigits(slip.period)}</bdi> · خالص فیش {formatDecimalString(slip.net)} ریال</p>
                <p className="text-text-secondary">ناخالص {formatDecimalString(slip.gross)} · کسورات {formatDecimalString(slip.deductions)} ریال</p>
              </li>)}</ul>
            </details> : <p className="text-caption">فیش قابل نمایش در دفتر حقوق مشاهده نشد.</p>}
            {profile.advances.length ? <ul aria-label="درخواست‌های مساعده" className="divide-y divide-border text-caption">
              {profile.advances.map(advance=><li key={advance.id} className="space-y-1 py-2">
                <p className="font-semibold">{formatDecimalString(advance.requested)} ریال · {advanceStatuses[advance.status] ?? 'وضعیت نامشخص'}</p>
                <p className="text-text-secondary"><bdi>{advance.number}</bdi>{advance.approved!==null && <> · مبلغ مصوب {formatDecimalString(advance.approved)} ریال</>}</p>
              </li>)}
            </ul> : <p className="text-caption">درخواست مساعده‌ای در پایگاه مرکزی مشاهده نشد.</p>}
          </>}
        </div>}
        {step === 'payroll' && !remote && (
          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center border-b border-border/60 pb-2">
              <span className="font-bold text-text-main flex items-center gap-1.5">
                <Wallet size={14} className="text-primary" />
                <span>فیش حقوقی ماه جاری</span>
              </span>
              <Button variant="soft" size="xs" type="button" onClick={() => setShowAdvanceModal(true)} >
                <Plus size={12} />
                <span>درخواست مساعده</span>
              </Button>
            </div>

            {latestPayslip ? (
              <div className="p-3 bg-canvas rounded-xl border border-border space-y-2">
                <div className="flex justify-between items-center text-caption text-text-secondary">
                  <span>دوره مالی: <b className="text-text-main font-mono">{latestPayslip.month}</b></span>
                  <span>کارکرد: <b className="text-text-main font-mono">{latestPayslip.workedDays} روز</b></span>
                </div>

                <div className="divide-y divide-border/60 pt-1">
                  {latestPayslip.lines.map(line => (
                    <div key={line.id} className="py-1.5 flex justify-between items-center text-xs">
                      <span className="text-text-secondary">{line.title}</span>
                      <span className={`font-mono font-bold ${line.isCredit ? 'text-success' : 'text-danger'}`}>
                        {line.isCredit ? '+' : '-'}{formatCurrency(line.amountRials)} ریال
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-border flex justify-between items-center font-bold text-sm text-text-main">
                  <span>خالص دریافتی قابل واریز:</span>
                  <span className="font-mono text-primary text-base">{formatCurrency(latestPayslip.netPayableRials)} ریال</span>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-text-secondary border border-dashed border-border rounded-xl">
                هنوز فیش حقوقی برای شما در این دوره صادر نشده است.
              </div>
            )}

            {/* سوابق مساعده‌های پرسنلی */}
            {userAdvances.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <span className="font-bold text-text-main block">سوابق درخواست‌های مساعده:</span>
                {userAdvances.map(a => (
                  <div key={a.id} className="p-2.5 bg-canvas rounded-lg border border-border flex justify-between items-center text-xs">
                    <div>
                      <strong className="block text-text-main">{formatCurrency(a.requestedAmountRials)} ریال</strong>
                      <span className="text-micro text-text-secondary mt-0.5 block">{a.reason}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-micro font-bold ${
                      a.status === 'APPROVED' ? 'bg-success-soft text-success' :
                      a.status === 'REJECTED' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'
                    }`}>
                      {a.status === 'APPROVED' ? 'تأییدشده' : a.status === 'REJECTED' ? 'ردشده' : 'در انتظار بررسی'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {msg && <p role="status" className="rounded-xl bg-primary/10 p-2.5 text-xs font-bold text-primary">{msg}</p>}

      {step !== 'payroll' && (
        <Button 
          variant="primary" 
          disabled={locked || eff.status === 'APPROVED'} 
          onClick={submit}
          className="w-full"
        >
          ارسال پرونده برای بررسی مدیر
        </Button>
      )}

      <Modal isOpen={showAdvanceModal} size="sm" title="درخواست مساعده"
        onClose={()=>{if (!advanceBusy) setShowAdvanceModal(false);}}>
        <form id="personnel-form" onSubmit={handleRequestAdvance} className="space-y-3">
          <label className="block space-y-1 text-caption">مبلغ درخواستی به ریال
            <InputControl type="text" inputMode="numeric" required maxLength={24} disabled={advanceBusy}
              value={advanceAmount} onChange={event=>setAdvanceAmount(event.target.value)} />
          </label>
          <Textarea label="علت درخواست" required rows={3} maxLength={500} disabled={advanceBusy}
            value={advanceReason} onChange={event=>setAdvanceReason(event.target.value)} />
          {advanceError && <p role="alert" className="text-sm text-danger">{advanceError}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" disabled={advanceBusy} onClick={()=>setShowAdvanceModal(false)}>انصراف</Button>
            <Button type="submit" loading={advanceBusy}>ثبت درخواست</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
