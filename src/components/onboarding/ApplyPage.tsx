import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppState } from '../../types';
import { DynamicFormRenderer } from '../shared/DynamicFormRenderer';
import { DocumentField, type DocFile, RECRUITMENT_DOCUMENT_TYPES } from '../shared/DocumentField';
import { createApplicationFormSchema } from '../../services/dynamicFormEngine';
import { useDataQuery } from '../../hooks/useDataProvider';
import { getActiveDataProvider } from '../../services/dataProvider';
import { ErrorState, LoadingState } from '../ui';
import { getTenantName } from '../../lib/orgPolicy';
import { Button } from '../ui/Button';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

/** صفحه عمومی ثبت‌نام و درخواست همکاری (بدون ورود). لینک این صفحه هیچ دسترسی‌ای به CRM نمی‌دهد. */
export function ApplyPage({ state }: { state: AppState }) {
  const navigate = useNavigate();
  const config = useDataQuery(provider => provider.getPublicRecruitment());
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [docs, setDocs] = useState<Record<string, DocFile | null>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const requestId = useRef<string | null>(null);
  const cfg = config.data;
  const company = cfg?.company || getTenantName(state);
  const back = () => navigate('/login');

  const finish = async () => {
    if (inFlight.current || !cfg) return;
    inFlight.current = true;
    setBusy(true);
    setErrors([]);
    try {
      const id = requestId.current ??= crypto.randomUUID();
      const documents = cfg.requiredDocs.flatMap(({ key }) => {
        const file = docs[key];
        return file ? [{ kind: key, ...file }] : [];
      });
      const receipt = await getActiveDataProvider().submitPublicApplication({ requestId: id, fields: values, documents });
      setDoneId(receipt.id);
      setValues({});
      setDocs({});
    } catch (error) {
      const message = error instanceof Error && 'status' in error && typeof error.status === 'number' && error.status < 500
        ? error.status === 413 ? 'حجم مجموع مدارک بیش از سقف مجاز است.' : error.message
        : 'تأیید ثبت دریافت نشد. اطلاعات شما در این فرم محفوظ است؛ دوباره تلاش کنید.';
      setErrors([message]);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };

  if (config.loading) return <Shell company={company} onBack={back}><LoadingState label="در حال دریافت شرایط پذیرش" /></Shell>;
  if (config.error || !cfg) return <Shell company={company} onBack={back}>
    <ErrorState title="دریافت شرایط پذیرش ممکن نیست" description="اتصال را بررسی کنید یا بعداً دوباره به همین صفحه برگردید."
      onRetry={() => void config.refetch()} />
  </Shell>;
  if (doneId) return (
    <Shell company={company} onBack={back}>
      <div className="space-y-3 text-center" role="status">
        <CheckCircle2 className="mx-auto text-success" size={44} /><h2 className="se-title">درخواست همکاری دریافت شد</h2>
        <p className="se-body">شناسهٔ درخواست <b dir="ltr" className="break-all font-mono">{doneId}</b></p>
        <p className="se-caption">این شناسه را برای پیگیری نزد خود نگه دارید.</p>
        <Button variant="primary" onClick={back}>بازگشت به صفحه ورود</Button>
      </div>
    </Shell>
  );

  const missingDocs = cfg.requiredDocs.filter(d => d.required && !docs[d.key]);
  return (
    <Shell company={company} onBack={back}>
      <ol className="mb-4 flex items-center gap-2 text-caption font-bold" aria-label="مراحل">{['اطلاعات', 'مدارک', 'مرور و ارسال'].map((l, i) => <li key={l} aria-current={step === i ? 'step' : undefined} className={`flex-1 rounded-full py-1.5 text-center ${step === i ? 'bg-primary text-white' : i < step ? 'bg-primary/10 text-primary' : 'bg-canvas text-text-secondary'}`}>{i + 1}. {l}</li>)}</ol>
      {step === 0 && <DynamicFormRenderer schema={createApplicationFormSchema(cfg.desiredRoles, cfg.requireNationalId)} initialValues={values} submitLabel="ادامه: بارگذاری مدارک" onSubmit={v => { setValues(v); setErrors([]); setStep(1); }} />}
      {step === 1 && (
        <div className="space-y-3">
          {cfg.requiredDocs.map(d => <DocumentField allowedTypes={RECRUITMENT_DOCUMENT_TYPES} key={d.key} label={d.label} required={d.required} value={docs[d.key] || null} onChange={f => setDocs(p => ({ ...p, [d.key]: f }))} />)}
          {missingDocs.length > 0 && <p className="se-caption">مدارک الزامی باقی‌مانده: {missingDocs.map(d => d.label).join('، ')}</p>}
          <div className="flex gap-2"><Button variant="ghost" onClick={() => setStep(0)}>مرحله قبل</Button><Button variant="primary" disabled={missingDocs.length > 0} onClick={() => setStep(2)}>مرور و ارسال</Button></div>
        </div>)}
      {step === 2 && (
        <div className="space-y-3 text-xs">
          <dl className="grid grid-cols-2 gap-2 rounded-2xl bg-canvas p-3"><dt className="font-bold">نام</dt><dd>{values.firstName} {values.lastName}</dd><dt className="font-bold">موبایل</dt><dd dir="ltr" className="text-start">{values.mobile}</dd><dt className="font-bold">شغل درخواستی</dt><dd>{values.desiredRole}</dd><dt className="font-bold">مدارک</dt><dd>{Object.values(docs).filter(Boolean).length.toLocaleString('fa-IR')} فایل</dd></dl>
          {errors.length > 0 && <ul role="alert" className="space-y-1 rounded-xl bg-danger-soft p-3 text-danger">{errors.map(e => <li key={e}>• {e}</li>)}</ul>}
          <div className="flex gap-2"><Button variant="ghost" disabled={busy} onClick={() => setStep(1)}>مرحله قبل</Button><Button variant="primary" disabled={busy} onClick={() => void finish()}>{busy ? 'در حال دریافت تأیید…' : 'ثبت درخواست همکاری'}</Button></div>
        </div>)}
    </Shell>
  );
}

function Shell({ company, logo, onBack, children }: { company: string; logo?: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <main dir="rtl" className="min-h-dvh bg-canvas px-4 py-6 font-premium">
      <div className="mx-auto max-w-lg space-y-4">
        <button onClick={onBack} className="se-interactive flex min-h-touch cursor-pointer items-center gap-1 text-xs font-bold text-text-secondary"><ArrowRight size={15} />بازگشت به ورود</button>
        <header className="flex items-center gap-3">{logo ? <img src={logo} alt={company} className="h-12 w-12 rounded-2xl object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-lg font-black text-white shadow-lux">{company.slice(0, 1)}</span>}<div><h1 className="se-title">درخواست همکاری</h1><p className="se-caption">{company}</p></div></header>
        <section className="se-card se-panel-enter p-4 sm:p-5">{children}</section>
      </div>
    </main>
  );
}
