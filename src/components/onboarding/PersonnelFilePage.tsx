import React, { useMemo, useState } from 'react';
import { AppState, AdvanceRequest } from '../../types';
import { Textarea } from '../ui';
import { DynamicFormRenderer } from '../shared/DynamicFormRenderer';
import { DocumentField, DocFile } from '../shared/DocumentField';
import { PERSONNEL_IDENTITY_SCHEMA, PERSONNEL_BANK_SCHEMA, PERSONNEL_ADDRESS_SCHEMA } from '../../services/dynamicFormEngine';
import { computeMissing, ensurePersonnelFile, FILE_STATUS_LABEL, getOnboardingConfig, savePersonnelStep, setPersonnelDocument, submitPersonnelFile } from '../../lib/onboarding';
import { generateId, formatCurrency } from '../../lib/utils';
import { Button } from '../ui/Button';
import { CheckCircle2, CircleAlert, Wallet, FileText, ArrowUpRight, Plus, HelpCircle } from 'lucide-react';
import { InputControl } from '../ui/Input';

type Step = 'identity' | 'documents' | 'bank' | 'address' | 'payroll';
const STEPS: { id: Step; label: string }[] = [
  { id: 'identity', label: 'هویت' },
  { id: 'documents', label: 'مدارک' },
  { id: 'bank', label: 'بانکی' },
  { id: 'address', label: 'نشانی' },
  { id: 'payroll', label: 'حقوق و مساعده' }
];

export function PersonnelFilePage({ state, updateState }: { state: AppState; updateState: (u: (d: AppState) => AppState | void) => void }) {
  const me = state.currentUserId || ''; 
  const cfg = getOnboardingConfig(state); 
  const [step, setStep] = useState<Step>('identity'); 
  const [msg, setMsg] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceReason, setAdvanceReason] = useState('');
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);

  const file: unknown = (state.personnelFiles || []).find((f: Record<string, unknown>) => f.userId === me);
  const eff = file || { identity: { fullName: state.users?.find(u => u.id === me)?.name || '' }, bank: {}, address: {}, documents: {}, status: 'INCOMPLETE' };
  const missing = useMemo(() => computeMissing(eff, cfg), [eff, cfg]);
  const locked = eff.status === 'SUBMITTED_FOR_REVIEW';

  const userPayslips = (state.payslips || []).filter(p => p.userId === me);
  const latestPayslip = userPayslips[userPayslips.length - 1];
  const userAdvances = (state.advanceRequests || []).filter(a => a.userId === me);

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 5000); };
  
  const saveStep = (s: 'identity' | 'bank' | 'address') => (v: Record<string, unknown>) => {
    let r: { ok: boolean; reason?: string } = { ok: false }; 
    updateState(d => { r = savePersonnelStep(d, me, s, v, new Date()); }); 
    flash((r as Record<string, unknown>).ok ? 'ذخیره موقت انجام شد.' : (r as Record<string, unknown>).reason || 'ذخیره نشد.');
  };

  const putDoc = (kind: string, f: DocFile | null) => {
    if (!f) return; 
    const attId = generateId(); 
    let r: { ok: boolean; reason?: string } = { ok: false };
    updateState(d => { 
      r = setPersonnelDocument(d, me, kind, attId, new Date()); 
      if ((r as Record<string, unknown>).ok) { 
        if (!d.attachments) d.attachments = []; 
        d.attachments.push({ id: attId, entityId: me, entityType: 'PERSONNEL_FILE', fileName: f.fileName, fileType: f.fileType, fileSize: f.fileSize, base64Data: f.base64Data, uploadedAt: new Date().toISOString(), uploadedBy: me, docKind: kind } as Record<string, unknown>); 
      } 
    });
    if (!(r as Record<string, unknown>).ok) flash((r as Record<string, unknown>).reason || 'بارگذاری نشد.');
  };

  const attOf = (id?: string) => (state.attachments || []).find((a: Record<string, unknown>) => a.id === id) as Record<string, unknown>;

  const submit = () => { 
    let r: { ok: boolean; missing: { label: string }[] } = { ok: false, missing: [] }; 
    updateState(d => { 
      ensurePersonnelFile(d, me, new Date()); 
      r = submitPersonnelFile(d, me, new Date()); 
    }); 
    flash((r as Record<string, unknown>).ok ? 'پرونده برای بررسی مدیر ارسال شد.' : `موارد ناقص: ${(r as Record<string, unknown>).missing.map((m: Record<string, unknown>) => m.label).join('، ')}`); 
  };

  const handleRequestAdvance = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(advanceAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !advanceReason.trim()) {
      flash('مبلغ مثبت و علت مساعده الزامی است.');
      return;
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    const newReq: AdvanceRequest = {
      id: generateId(),
      requestNumber: `ADV-${Date.now().toString().slice(-4)}`,
      userId: me,
      requestedAmountRials: amount,
      reason: advanceReason.trim(),
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
    flash('درخواست مساعده برای بررسی مدیر ثبت شد.');
  };

  return (
    <div className="mx-auto max-w-2xl space-y-3.5 p-3 sm:p-4 pb-24" dir="rtl">
      <header className="space-y-0.5">
        <h1 data-tour-heading className="text-base font-bold text-text-main">پرونده پرسنلی و امور رفاهی من</h1>
        <p className="text-xs text-text-secondary">
          وضعیت مدارک: <b className="text-primary">{FILE_STATUS_LABEL[eff.status as keyof typeof FILE_STATUS_LABEL]}</b>
          {missing.length > 0 && ` · ${missing.length.toLocaleString('fa-IR')} مورد نیازمند تکمیل`}
        </p>
      </header>

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
              const a = att(eff.documents[d.key]); 
              return (
                <DocumentField 
                  key={d.key} 
                  label={d.label} 
                  required={d.required} 
                  value={a ? { fileName: a.fileName, fileType: a.fileType, fileSize: a.fileSize, base64Data: a.base64Data } : null} 
                  onChange={f => { if (f && !locked) putDoc(d.key, f); }} 
                  hint={a ? 'بارگذاری شده' : undefined} 
                />
              ); 
            })}
          </div>
        )}

        {step === 'payroll' && (
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

      {/* مودال ثبت درخواست مساعده */}
      {showAdvanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/40 backdrop-blur-xs font-sans" dir="rtl">
          <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-4 shadow-xl space-y-3">
            <h3 className="text-sm font-bold text-text-main">ثبت درخواست مساعده مالی</h3>
            <form id="personnel-form" onSubmit={handleRequestAdvance} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">مبلغ درخواستی (ریال) *</label>
                <InputControl 
                  type="number"
                  required
                  value={advanceAmount}
                  onChange={e => setAdvanceAmount(e.target.value)}
                  placeholder="مثال: ۳۰,۰۰۰,۰۰۰"
                  className="font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">علت و ضرورت درخواست *</label>
                <Textarea 
                  required
                  rows={2}
                  value={advanceReason}
                  onChange={e => setAdvanceReason(e.target.value)}
                  placeholder="شرح مختصر دلیل درخواست مساعده..."
                  
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAdvanceModal(false)}
                  className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-main cursor-pointer"
                >
                  انصراف
                </button>
                <Button type="submit" variant="primary" size="sm">
                  ثبت درخواست
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
